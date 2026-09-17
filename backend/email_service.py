"""
The contact form's notification email.

This is the only module in the project that knows SMTP exists.
Nothing imports smtplib anywhere else, and nothing else reads
the SMTP_* variables - so the day the notification moves to a
different transport, this file is the whole change.

WHAT THIS IS NOT: it is not how a contact message is stored.
POST /contact writes the row and commits before this function
is ever queued, and the request has already succeeded by then.
Everything here is a convenience on top of a record that
already exists, which is why nothing in here raises.
"""

import logging
import os
import smtplib

from email.message import EmailMessage
from uuid import UUID

from .database import SessionLocal
from .models import ContactMessage


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


def _setting(name: str, default: str = "") -> str:
    """
    One environment variable, trimmed.

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

    return (os.getenv(name) or "").strip()


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
        # The unconfigured state is a supported state, not a
        # failure. The whole feature has to work - the form
        # submits, the row is stored, the student is told the
        # message was received - before the owner has set up an
        # App Password. So this returns quietly, leaving
        # email_sent False and email_error null: nothing was
        # attempted, so nothing failed.
        #
        # CONTACT_EMAIL_TO is checked alongside the two the
        # spec names. Without a recipient the send would fail
        # with "no recipients" and land in email_error, which
        # would file a configuration gap under delivery
        # failures - the one column that is supposed to mean
        # something went wrong.

        smtp_host = _setting("SMTP_HOST", "smtp.gmail.com")
        smtp_password = _setting("SMTP_PASSWORD")
        contact_email_to = _setting("CONTACT_EMAIL_TO")

        if (
            not smtp_host
            or not smtp_password
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

        smtp_user = _setting("SMTP_USER")
        smtp_from = _setting("SMTP_FROM") or smtp_user

        # int() on a value the owner typed, so a nonsense port
        # is a configuration problem reported once rather than
        # a crash inside the send below.
        try:
            smtp_port = int(_setting("SMTP_PORT", "587") or "587")

        except ValueError:

            logger.warning(
                "SMTP_PORT is not a number; falling back to 587.",
            )

            smtp_port = 587

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
        #
        # Port 587 with STARTTLS, which is Gmail's submission
        # port. The timeout is on the constructor, so it covers
        # the connect as well as every command after it - a
        # timeout passed to nothing is the usual way this call
        # ends up able to hang forever.

        with smtplib.SMTP(
            smtp_host,
            smtp_port,
            timeout=SMTP_TIMEOUT_SECONDS,
        ) as server:

            server.starttls()

            server.login(
                smtp_user,
                smtp_password,
            )

            server.send_message(email)

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
