"""
The two emails this app sends: the contact form's notification
to the owner, and the verification code to a new student.

This is the only module in the project that knows SMTP exists.
Nothing imports smtplib anywhere else, and nothing else reads
the SMTP_* variables - so the day either message moves to a
different transport, this file is the whole change.

WHAT THIS IS NOT: it is not how a contact message is stored,
and it is not what decides whether an address is verified.
POST /contact writes its row and commits before send_contact_email
is ever queued, and POST /auth/register writes the code's row and
commits before send_verification_email is queued. Both requests
have already succeeded by then. Everything here is a delivery
attempt on top of a record that already exists, which is why
nothing in here raises.

ONE QUESTION IS ASKED FROM OUTSIDE: smtp_is_configured(), below.
main.py asks it because a verification code that cannot be
delivered locks an account out permanently, so the feature turns
itself off rather than let that happen. That answer has to be the
same answer this module acts on, which is why it is one function
and not a second copy of the same three getenv calls.
"""

import logging
import os
import smtplib

from email.message import EmailMessage
from uuid import UUID

from .database import SessionLocal
from .models import ContactMessage, User


logger = logging.getLogger(__name__)


# =========================================================
# SETTINGS
# =========================================================

# How long to wait on the SMTP conversation before giving up.
#
# Not a measured number: there is nothing here to measure
# against, because the owner has no App Password yet and this
# path has never run for real. It is chosen to be far longer
# than a healthy submission handshake to smtp.gmail.com - TCP,
# STARTTLS and AUTH together are a second or two on a normal
# connection - and short enough that a host which is simply not
# answering releases the worker thread within half a minute
# rather than holding it until the OS gives up, which on
# Windows is around two minutes.
SMTP_TIMEOUT_SECONDS = 20

# The most of an exception's text that is kept in email_error.
#
# The column is Text and could hold all of it, but the point of
# the column is that somebody reads it. An smtplib failure says
# what went wrong in its first line; a few thousand characters
# of server chatter after that turns a readable table into one
# that has to be scrolled sideways.
MAX_ERROR_LENGTH = 2000

# How long a verification code is worth anything.
#
# Fifteen minutes is long enough that a student who goes to find
# their phone, or whose mail takes a few minutes to arrive, comes
# back to a code that still works - and short enough that a code
# sitting in an inbox somebody else can read stops being useful
# quickly.
#
# It lives here rather than in main.py because this is where the
# number is said out loud to the student. main.py imports it for
# the expires_at it writes, so the sentence in the email and the
# timestamp in the database can never drift apart.
VERIFICATION_CODE_MINUTES = 15


def _setting(name: str, default: str = "") -> str:
    """
    One environment variable, trimmed, or the default when it is
    not set at all.

    Read here rather than at import, because the owner fills
    these in by hand in .env and an import-time read would mean
    the process has to be restarted before a correction takes
    effect - and would also freeze the unconfigured state into
    a module that was imported before load_dotenv ran.

    The trim matters more than it looks: a value pasted out of
    an email arrives with a trailing space often enough, and a
    password with a space on the end fails authentication while
    looking correct in the file.
    """

    # `or default` on the trimmed value, so that a variable which
    # is present but blank falls back the same way a missing one
    # does - a line left as "SMTP_PORT=" in .env is not a port.
    #
    # This used to be dropped on the floor: the parameter was
    # accepted and never applied, so every caller that passed one
    # got "" instead. Nothing depended on the broken behaviour -
    # the one caller that mattered wrote `or "587"` after the
    # call - and the call sites below now say what they mean.
    return (os.getenv(name) or "").strip() or default


# =========================================================
# IS EMAIL CONFIGURED AT ALL?
# =========================================================

def smtp_is_configured() -> bool:
    """
    Whether this app can send mail right now.

    The unconfigured state is a supported state, not a failure.
    Both features that use email have to work before the owner
    has set up an App Password: the contact form stores its row
    and tells the student the message was received, and
    registration goes through without asking for a code.

    THE HOST HAS NO DEFAULT ON PURPOSE. Falling back to
    smtp.gmail.com would mean an empty SMTP_HOST silently
    reconnects a mail path the owner had blanked out in order to
    turn it off - and, worse, would let email verification
    consider itself deliverable on a machine where nothing has
    been set up at all. A blank host means off, which is the
    behaviour this check has always had.

    Called from main.py as well as from this module, and that is
    the point: verification switches itself off when this is
    False, and it has to be the same answer the send path acts
    on. Two copies of this question would eventually disagree,
    and the shape of that disagreement is an account asked for a
    code that nothing ever sent.
    """

    return bool(_setting("SMTP_HOST")) and bool(_setting("SMTP_PASSWORD"))


# =========================================================
# SENDING
# =========================================================

def send_contact_email(message_id: UUID) -> None:
    """
    Email the owner about one stored contact message, and
    record on that message's row whether it went out.

    Takes the id and nothing else, and opens its own session -
    the same shape as process_document_background, and for the
    same reason: this runs after the response has been returned
    and the request's session has been closed.

    Never raises. It runs inside a BackgroundTask, where an
    exception is written to the log by Starlette and reaches
    nobody who can act on it. A failure is recorded on the row
    instead, which is a place somebody can actually look.
    """

    db = SessionLocal()

    try:

        # -------------------------------------------------
        # The message, and who sent it
        # -------------------------------------------------
        #
        # The name and the address are read off the user row
        # through the relationship rather than out of this
        # table, because this table does not have them.

        contact_message = (
            db.query(ContactMessage)
            .filter(
                ContactMessage.id == message_id
            )
            .first()
        )

        if not contact_message:

            # Not an error worth raising: the only ways to get
            # here are a message deleted between the commit and
            # this task running, or the account being deleted
            # underneath it. Both are fine, and neither leaves
            # anything to send.
            logger.warning(
                "Contact message %s no longer exists; "
                "no notification sent.",
                message_id,
            )

            return

        student = contact_message.user

        # -------------------------------------------------
        # Is email configured at all?
        # -------------------------------------------------
        #
        # smtp_is_configured() answers the transport half - can
        # this app send mail at all - and is the same question
        # main.py asks before it requires a verification code.
        # If it returns quietly here, email_sent stays False and
        # email_error stays null: nothing was attempted, so
        # nothing failed.
        #
        # CONTACT_EMAIL_TO is checked alongside it, and only
        # here, because it is this message's recipient and not
        # part of being able to send mail - the verification
        # email goes to the student and needs no such setting.
        # Without a recipient the send would fail with "no
        # recipients" and land in email_error, which would file a
        # configuration gap under delivery failures - the one
        # column that is supposed to mean something went wrong.

        contact_email_to = _setting("CONTACT_EMAIL_TO")

        if (
            not smtp_is_configured()
            or not contact_email_to
        ):

            logger.warning(
                "Contact message %s was stored but no email was "
                "sent: SMTP is not configured. Set "
                "CONTACT_EMAIL_TO, SMTP_HOST and SMTP_PASSWORD "
                "in .env to enable the notification.",
                contact_message.id,
            )

            return

        smtp_from = _setting("SMTP_FROM") or _setting("SMTP_USER")

        # -------------------------------------------------
        # Build the message
        # -------------------------------------------------

        email = EmailMessage()

        # From: is us, because Gmail will not let us claim to be
        # anybody else and a forged From: is what gets a message
        # filed as spam.
        email["From"] = smtp_from
        email["To"] = contact_email_to

        # The header that carries most of this feature's value.
        #
        # From: has to be our own sending address, so pressing
        # reply in the university inbox would otherwise answer
        # ourselves. Reply-To: is the student, so reply answers
        # the student - which is the entire point of collecting
        # a message from a signed-in account whose address we
        # already know to be real.
        email["Reply-To"] = student.email

        # The name is in the subject so a full inbox sorts and
        # searches by sender without being opened, and the app
        # is named so it is obvious which of the owner's
        # projects this came from.
        email["Subject"] = (
            f"StudyMate contact form - {student.full_name}"
        )

        # The id is in the body so a message in the inbox can be
        # found again in the table, and the other way round.
        # Without it the only handle on a row is its timestamp.
        email.set_content(
            f"Name: {student.full_name}\n"
            f"Email: {student.email}\n"
            f"Sent: {contact_message.created_at}\n"
            f"Message id: {contact_message.id}\n"
            f"\n"
            f"{contact_message.message}\n"
        )

        # -------------------------------------------------
        # Send it
        # -------------------------------------------------

        _deliver(email)

        contact_message.email_sent = True
        contact_message.email_error = None

        db.commit()

        logger.info(
            "Contact message %s was emailed to the contact address.",
            contact_message.id,
        )

    except Exception as error:

        # Broad on purpose. Anything at all that goes wrong here
        # has to end up on the row rather than in the void, and
        # the list of exceptions smtplib, ssl and socket can
        # raise between them is long enough that catching them
        # by name would eventually miss one.
        _record_failure(
            db,
            message_id,
            error,
        )

    finally:
        db.close()


def send_verification_email(
    user_id: UUID,
    code: str,
) -> None:
    """
    Email one new account the six-digit code that proves the
    address belongs to whoever typed it.

    The same shape as send_contact_email above: it takes ids and
    opens its own session, because it runs inside a
    BackgroundTask after the response has gone out and the
    request's session has been closed. Registration must never
    wait on an SMTP handshake - a student would otherwise watch a
    spinner for a round trip to Gmail that has no bearing on
    whether their account was created.

    Never raises, for the same reason nothing else here does: an
    exception inside a BackgroundTask is written to the log by
    Starlette and reaches nobody who can act on it.

    THE CODE IS PASSED IN, not read from the database. The row
    holds only a hash, which is the point of hashing it - by the
    time this runs the plain code exists in exactly two places,
    the argument below and the student's inbox.

    NO Reply-To HERE, unlike the contact notification. That
    header exists so the owner can answer a student; this message
    goes the other way and there is nobody to reply to. A
    Reply-To on it would invite an answer into an inbox nobody
    reads.
    """

    # -----------------------------------------------------
    # Is email configured at all?
    # -----------------------------------------------------
    #
    # Checked before the session is opened, because there is
    # nothing to look up if nothing can be sent.
    #
    # Reaching here with SMTP unconfigured means the code was
    # issued anyway, which main.py does not allow: it treats
    # verification as off when this is False. The warning is
    # therefore about a real contradiction - the feature asked
    # for a code to be delivered by a machine that cannot
    # deliver one - and says what it would take to fix it.

    if not smtp_is_configured():

        logger.warning(
            "A verification code was issued for user %s but no "
            "email was sent: SMTP is not configured. Set "
            "SMTP_HOST and SMTP_PASSWORD in .env, or leave "
            "REQUIRE_EMAIL_VERIFICATION off - a code that cannot "
            "be delivered locks the account out.",
            user_id,
        )

        return

    db = SessionLocal()

    try:

        # -------------------------------------------------
        # Who it goes to
        # -------------------------------------------------
        #
        # Read off the user row rather than passed in, so the
        # address the code is sent to is the address the account
        # actually has. An address in an argument could be one
        # the caller mistyped.

        student = (
            db.query(User)
            .filter(
                User.id == user_id
            )
            .first()
        )

        if not student:

            # The account was deleted between the commit and this
            # task running. Nothing to send, and nothing wrong.
            logger.warning(
                "User %s no longer exists; no verification "
                "email sent.",
                user_id,
            )

            return

        # -------------------------------------------------
        # Build the message
        # -------------------------------------------------

        email = EmailMessage()

        email["From"] = _setting("SMTP_FROM") or _setting("SMTP_USER")
        email["To"] = student.email

        # The app is named in the subject so that a code sitting
        # in a crowded inbox is recognisable without being
        # opened - a bare "Your verification code" from an
        # unfamiliar address is what people delete.
        email["Subject"] = "Your StudyMate verification code"

        # The code on a line of its own, because that is the line
        # somebody is going to select and copy on a phone.
        #
        # The validity is spelled out for the student who comes
        # back to this message an hour later and cannot see why
        # the code is refused. The number comes from the constant
        # main.py writes expires_at with, so the sentence cannot
        # promise a window the database does not honour.
        email.set_content(
            f"Hello {student.full_name},\n"
            f"\n"
            f"Your StudyMate verification code is:\n"
            f"\n"
            f"{code}\n"
            f"\n"
            f"Enter it on the verification screen to finish "
            f"creating your account. The code is valid for "
            f"{VERIFICATION_CODE_MINUTES} minutes.\n"
            f"\n"
            f"If you did not create a StudyMate account, you can "
            f"ignore this message.\n"
        )

        # -------------------------------------------------
        # Send it
        # -------------------------------------------------

        _deliver(email)

        logger.info(
            "A verification code was emailed to user %s.",
            user_id,
        )

    except Exception as error:

        # Broad for the same reason the contact send is, and
        # with one difference that matters: there is no row to
        # write the failure onto. A verification code has no
        # email_sent column, because a code whose email failed is
        # not a record worth keeping - the student presses
        # Resend and a new one is issued. So the log is the whole
        # trail, and the password is stripped out of it exactly
        # as it is on its way to the database.
        logger.warning(
            "Could not email the verification code for user "
            "%s: %s",
            user_id,
            _safe_error_text(error),
        )

    finally:
        db.close()


# =========================================================
# THE SMTP CONVERSATION ITSELF
# =========================================================

def _deliver(email: EmailMessage) -> None:
    """
    Connect, authenticate, hand the message over.

    One copy, shared by both messages above. Raises whatever
    smtplib, ssl or socket raise - the two callers catch it,
    because what they do about a failure differs: the contact
    notification writes it onto its row, the verification code
    has no row and writes it to the log.

    Port 587 with STARTTLS, which is Gmail's submission port. The
    timeout is on the constructor, so it covers the connect as
    well as every command after it - a timeout passed to nothing
    is the usual way this call ends up able to hang forever.
    """

    # int() on a value the owner typed, so a nonsense port is a
    # configuration problem reported once rather than a crash in
    # the middle of the send.
    try:
        smtp_port = int(_setting("SMTP_PORT", "587"))

    except ValueError:

        logger.warning(
            "SMTP_PORT is not a number; falling back to 587.",
        )

        smtp_port = 587

    with smtplib.SMTP(
        _setting("SMTP_HOST"),
        smtp_port,
        timeout=SMTP_TIMEOUT_SECONDS,
    ) as server:

        server.starttls()

        server.login(
            _setting("SMTP_USER"),
            _setting("SMTP_PASSWORD"),
        )

        server.send_message(email)


# =========================================================
# RECORDING A FAILURE
# =========================================================

def _record_failure(
    db,
    message_id: UUID,
    error: Exception,
) -> None:
    """
    Write the exception text onto the message row.

    Kept apart from the send so that it can fail on its own
    terms: the session may be in a bad state by the time we get
    here, and a rollback is needed before anything can be
    written through it.
    """

    try:

        db.rollback()

        contact_message = (
            db.query(ContactMessage)
            .filter(
                ContactMessage.id == message_id
            )
            .first()
        )

        if not contact_message:
            return

        contact_message.email_sent = False
        contact_message.email_error = _safe_error_text(error)

        db.commit()

        logger.warning(
            "Contact message %s was stored but could not be "
            "emailed: %s",
            message_id,
            contact_message.email_error,
        )

    except Exception:

        # The row could not be updated either. There is nothing
        # further to try, and raising from here would reach the
        # same nobody the original exception would have.
        logger.exception(
            "Could not record the email failure for contact "
            "message %s.",
            message_id,
        )


def _safe_error_text(error: Exception) -> str:
    """
    The exception as a string, with the App Password removed
    and the length capped.

    smtplib puts the server's own reply into the exception, and
    an authentication failure is exactly the case where the
    credentials were in play. Nothing observed has ever echoed
    the password back - but email_error is a column somebody
    will read, paste into a message and screenshot, and the
    cost of being wrong about that once is a leaked password.
    So it is removed by search rather than trusted not to be
    there.
    """

    text = f"{type(error).__name__}: {error}"

    password = _setting("SMTP_PASSWORD")

    if password:
        text = text.replace(password, "[redacted]")

    if len(text) > MAX_ERROR_LENGTH:
        text = text[:MAX_ERROR_LENGTH] + "..."

    return text
