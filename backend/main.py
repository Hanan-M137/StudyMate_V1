import logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("sentence_transformers").setLevel(logging.WARNING)
logger = logging.getLogger(__name__)
import os
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from dotenv import load_dotenv

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
    Response,
)

from contextlib import asynccontextmanager

from fastapi.security import OAuth2PasswordRequestForm

from sqlalchemy import delete, func

from sqlalchemy.orm import Session

from pydantic import BaseModel, ConfigDict, EmailStr

from concurrent.futures import ThreadPoolExecutor

from .database import (
    init_db,
    get_db,
)

from .models import (
    User,
    Document,
    Chunk,
    Conversation,
    Message,
    Quiz,
    QuizQuestion,
    QuizAttempt,
    ContactMessage,
    EmailVerification,
)

from .email_service import (
    VERIFICATION_CODE_MINUTES,
    send_contact_email,
    send_verification_email,
    smtp_is_configured,
)

from .auth import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    get_current_user,
)

#port number problem
from fastapi.middleware.cors import CORSMiddleware


# =========================================================
# AI / RAG
# =========================================================

from ai.service import (
    process_document_background,
    generate_quiz,
    grade_short_answer,
    QUESTION_TYPES,
)

from ai.rag_service import answer_question


# =========================================================
# OFFICE DOCUMENT CONVERSION
# =========================================================
#
# The whole feature lives in ai/convert.py. Only the three questions
# below are asked here, and nothing in this file knows that the answer
# involves LibreOffice.

from ai.convert import (
    find_soffice,
    is_supported,
    needs_conversion,
)


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# FASTAPI APPLICATION
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()

    # Said once, loudly, at the only moment somebody is watching
    # the console: the owner asked for verification and this
    # machine cannot deliver a code, so the feature has turned
    # itself off. Without this the app would look exactly like a
    # server with the switch set to false, and the reason would
    # only surface the day somebody wondered why no code arrived.
    #
    # It is a warning and not a refusal to start. Refusing would
    # take the whole app down over a feature that is allowed to
    # be off, which is the opposite of what this guard is for.
    if _verification_is_switched_on() and not smtp_is_configured():

        logger.warning(
            "REQUIRE_EMAIL_VERIFICATION is on but SMTP is not "
            "configured, so email verification is DISABLED. "
            "Registration and login behave as they did before "
            "the feature existed. Set SMTP_HOST and "
            "SMTP_PASSWORD in .env to enable it.",
        )

    yield


app = FastAPI(
    title="StudyMate API",
    description="AI Study Assistant for University Students",
    version="1.0.0",
    lifespan=lifespan,
)

##port number problem
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================================================
# CHAT SETTINGS
# =========================================================

# Number of previous messages that will be sent to Claude
# as conversation history.
CHAT_HISTORY_LIMIT = 50


# =========================================================
# PASSWORD RULES
# =========================================================


# The one place a password length is decided. Registration
# and the password change below both read it, so the two can
# never drift apart and accept different passwords.
#
# 8 is the number the registration form has always shown the
# student ("Use at least 8 characters."); until now nothing
# enforced it, so the form was making a promise the API did
# not keep.
MIN_PASSWORD_LENGTH = 8


def validate_password(password: str) -> None:
    """
    Refuse a password that does not meet the account rules:
    at least MIN_PASSWORD_LENGTH characters, at least one
    letter, and at least one digit.

    Raises HTTPException(400) naming every rule the password
    misses. Returns None when the password is acceptable.

    Deliberately a plain function rather than a Field
    constraint or a field_validator. Pydantic answers bad
    input with a 422 and a nested error body, while the rest
    of this API answers it with a 400 and one sentence the
    student can read (see the duration_seconds range check on
    the attempt endpoint). Splitting password errors across
    both shapes would mean the browser needs two ways to show
    the same kind of mistake.

    Only registration and the password change call this.
    Login never does: the rule is about the passwords we are
    willing to store from now on, not about the accounts that
    already exist, and applying it at login would lock out
    every student who registered before it.
    """

    # -----------------------------------------------------
    # Collect every failure, not just the first
    # -----------------------------------------------------
    #
    # Reporting one rule at a time turns a single mistake
    # into a guessing game: the student fixes the length,
    # submits, and only then learns about the digit. All
    # three are known here, so all three are said here.

    problems: list[str] = []

    if len(password) < MIN_PASSWORD_LENGTH:
        problems.append(
            f"be at least {MIN_PASSWORD_LENGTH} characters long"
        )

    # str.isalpha() and str.isdigit(), not a regex over
    # [a-zA-Z] and [0-9]. This app's students write Arabic,
    # and a Latin-only character class would decide that a
    # perfectly good Arabic password contains no letters at
    # all and refuse it.
    if not any(character.isalpha() for character in password):
        problems.append("contain at least one letter")

    if not any(character.isdigit() for character in password):
        problems.append("contain at least one digit")

    if not problems:
        return

    # -----------------------------------------------------
    # One readable sentence
    # -----------------------------------------------------

    if len(problems) == 1:
        requirements = problems[0]

    else:
        requirements = (
            ", ".join(problems[:-1])
            + " and "
            + problems[-1]
        )

    raise HTTPException(
        status_code=400,
        detail=f"Password must {requirements}.",
    )


# =========================================================
# EMAIL VERIFICATION RULES
# =========================================================


def _verification_is_switched_on() -> bool:
    """
    What REQUIRE_EMAIL_VERIFICATION says, and nothing else.

    Read from the environment on every call rather than once at
    import, which is the whole reason this is a function. The
    switch has to be something the owner can throw in seconds:
    edit one line in .env, restart, and the door is open again.
    An import-time read would still need the restart, but it
    would also freeze the value into a module that may have been
    imported before load_dotenv ran - and a switch that does not
    always mean what the file says is not a switch anybody can
    rely on at the moment they need it.

    Anything that is not a recognisable "yes" counts as off, the
    same way ENABLE_FILE_CONVERSION reads its own value: a typo
    leaves the feature off rather than turning one on that the
    owner never asked for.
    """

    return (
        os.environ.get("REQUIRE_EMAIL_VERIFICATION", "false")
        .strip()
        .lower()
        in {"true", "1", "yes", "on"}
    )


def email_verification_is_active() -> bool:
    """
    Whether this request should require a verified address.

    THIS IS THE GUARD THAT MATTERS. Requiring a code that cannot
    be delivered locks every new account out permanently, with no
    way back in from inside the app - so the feature refuses to
    be on unless mail can actually be sent, whatever the switch
    says. There is no state this app can be left in where a
    student is asked for a code nothing ever sent.

    smtp_is_configured() is email_service.py's own check, the one
    the send path acts on, imported rather than rewritten. A
    second copy of it here would eventually disagree with the
    first, and the shape of that disagreement is exactly the
    lock-out this guard exists to prevent.
    """

    if not _verification_is_switched_on():
        return False

    if not smtp_is_configured():

        # Logged at every registration, not only at startup. A
        # server that has been up for a week is the case where
        # the startup line has long scrolled away, and this is
        # the line that explains why an account that should have
        # been asked for a code was not.
        logger.warning(
            "REQUIRE_EMAIL_VERIFICATION is on but SMTP is not "
            "configured; treating email verification as off. "
            "A code that cannot be delivered would lock the "
            "account out permanently.",
        )

        return False

    return True


# How many times one code may be offered before it is dead.
#
# A six-digit code is one guess in a million, which is only long
# odds while the number of guesses is bounded - unbounded, a
# script walks the whole range in an afternoon. Five is far more
# than a student who is reading the code off their own screen
# will ever need, and far fewer than a guess is worth.
MAX_VERIFICATION_ATTEMPTS = 5

# How many codes one account may be sent in an hour.
#
# Four, counted the way the contact form counts its messages: a
# COUNT over the rows already in the table, not a counter held in
# memory that a restart resets and that is wrong the moment the
# app runs as more than one process.
#
# Four rather than three because registration itself issues one,
# and it is the same kind of row. Three would mean a student
# whose first code never arrived got two resends instead of the
# three they were promised - and the student whose code did not
# arrive is precisely the person this endpoint exists for.
MAX_VERIFICATION_CODES_PER_HOUR = 4

VERIFICATION_RATE_LIMIT_WINDOW = timedelta(hours=1)

# Arabic-Indic and extended Arabic-Indic digits, mapped onto the
# Latin ones the code is generated in.
#
# The code is emailed as 0-9 and compared as 0-9, but this app's
# students write Arabic, and an Arabic keyboard set to Arabic
# numerals types ٠١٢ where the email says 012. Those are the same
# code as far as the student is concerned, and refusing one of
# them would be refusing a correct answer over a keyboard layout.
#
# Written out rather than reached through unicodedata, because
# these two ranges are the only ones a student of this app will
# type and a twenty-character table is easier to check by eye
# than a call whose behaviour has to be looked up.
VERIFICATION_DIGIT_TRANSLATION = str.maketrans(
    "٠١٢٣٤٥٦٧٨٩" "۰۱۲۳۴۵۶۷۸۹",
    "0123456789" "0123456789",
)


def issue_verification_code(
    db: Session,
    user: User,
) -> str:
    """
    Write a fresh code's row for this account and hand the plain
    code back to the caller, who is the only other place it will
    ever exist.

    Does NOT commit. Registration commits it alongside the user
    row it belongs to, so an account can never exist with no way
    to claim it; the resend endpoint commits it alongside the
    invalidation of the code it replaces.

    Does not queue the email either. The email is a background
    task, and a background task must never be queued before the
    row it talks about is committed.
    """

    # secrets.randbelow and not random.randrange: this is a
    # credential, briefly, and the difference between the two is
    # whether the next code can be predicted from the last one.
    #
    # Zero-padded to six characters, so 42 is "000042" and every
    # code the student is asked for looks the same length as
    # every other. A code that is sometimes five digits would
    # make the field's own rule a lie.
    code = f"{secrets.randbelow(1_000_000):06d}"

    verification = EmailVerification(
        user_id=user.id,
        # The same hashing the password uses. The code is short
        # lived and low value, but a database dump should not
        # hand out working codes for accounts nobody has claimed
        # yet, and the helper was already here.
        code_hash=hash_password(code),
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(minutes=VERIFICATION_CODE_MINUTES)
        ),
    )

    db.add(verification)

    return code


def newest_live_verification(
    db: Session,
    user: User,
) -> EmailVerification | None:
    """
    The one code that is currently worth anything for this
    account: the newest that has not been used and has not
    expired.

    Newest and not "any", because a resend is meant to replace
    the code before it. The replaced rows are invalidated when
    the new one is issued, so this ordinarily has one candidate -
    the ordering is what keeps that true if one ever slips
    through, rather than letting an older code outlive the one
    the student is actually looking at.
    """

    return (
        db.query(EmailVerification)
        .filter(
            EmailVerification.user_id == user.id,
            EmailVerification.used_at.is_(None),
            EmailVerification.expires_at > datetime.now(timezone.utc),
        )
        .order_by(
            EmailVerification.created_at.desc()
        )
        .first()
    )


# =========================================================
# PYDANTIC SCHEMAS
# =========================================================


class RegisterRequest(BaseModel):
    email: EmailStr
    # No min_length here on purpose: the length is one of the
    # three rules validate_password applies, so that it can
    # answer with a 400 like every other rule.
    password: str
    full_name: str


class UserResponse(BaseModel):
    """
    Who the session belongs to.

    Returned by GET and PATCH /auth/me alike, so the browser
    reads one shape whichever of the two it called.
    """

    id: UUID
    email: EmailStr
    full_name: str


class ProfileUpdateRequest(BaseModel):
    """
    The one part of the account the student can edit.

    The email is not here: it is the login identifier and is
    unique across the table, so changing it is a different job
    with different failure modes.
    """

    full_name: str


class ChangePasswordRequest(BaseModel):
    """
    The current password is required as well as the new one.

    An access token alone is not enough to change a password:
    a borrowed token would otherwise be enough to take the
    account, and knowing the current password is the only
    thing that separates the owner from whoever is holding the
    token.
    """

    current_password: str
    new_password: str


class AccountDeleteRequest(BaseModel):
    """
    The password, again, before the account is destroyed.

    Same reasoning as ChangePasswordRequest above, and more of
    it. An access token proves that this browser was signed in
    at some point, which an unlocked laptop also proves. The
    password is the only thing in the request that separates
    the account's owner from whoever is sitting at it, and
    this is the one endpoint where being wrong about that
    cannot be put right afterwards.

    A plain `str` with no Field constraints, like every other
    request model in this file: a Field constraint answers with
    a 422 and a nested error body, and this API answers bad
    input with a 400 and one sentence a student can read.
    """

    current_password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str


class RefreshRequest(BaseModel):
    refresh_token: str


class RegisteredResponse(BaseModel):
    """
    What registration answers with while verification is on.

    Deliberately NOT a TokenResponse. An account that has not
    proved it owns its address is not a session yet, and handing
    back tokens here would make the verification screen a
    formality the student could simply navigate past.

    email is echoed back because the verification screen needs it
    for the two calls that follow - verify and resend both take
    an address - and reading it out of the response is better
    than the browser remembering what it typed into a form it has
    already left.
    """

    message: str
    user_id: str
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    """
    The address and the code that was emailed to it.

    No token: this call is what creates the session, so there is
    nothing to authenticate it with yet. The code is the
    credential, which is why it is bounded to
    MAX_VERIFICATION_ATTEMPTS guesses.

    `code` is a plain str rather than a constrained field, the
    same decision RegisterRequest documents: a Field constraint
    answers with a 422 and a nested error body, while this API
    answers bad input with a 400 and one sentence.
    """

    email: EmailStr
    code: str


class ResendVerificationRequest(BaseModel):
    """
    Just the address. Whoever is asking is not signed in - that
    is the situation this endpoint exists for.
    """

    email: EmailStr


class DocumentResponse(BaseModel):
    id: UUID
    title: str
    filename: str
    status: str

    model_config = ConfigDict(from_attributes=True)


class DocumentUpdateRequest(BaseModel):
    title: str

class ChatRequest(BaseModel):
    document_id: UUID
    message: str
    conversation_id: UUID | None = None


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    sources: list


# =========================================================
# QUIZ SCHEMAS
# =========================================================


class QuizCreateRequest(BaseModel):
    document_id: UUID
    title: str

    # Number of questions generated by AI
    num_questions: int = 10

    # Which kinds of question to generate. Omitted or empty
    # means all three, which is what this endpoint did before
    # the choice existed.
    #
    # This replaces the old singular `question_type`, which was
    # accepted and then ignored - the quiz was always a mixture
    # whatever was sent.
    question_types: list[str] | None = None

    # Free text from the student: what the quiz should
    # concentrate on. It steers generation and is then
    # discarded - it is not stored with the quiz.
    description: str | None = None

    # Restrict generation to part of the document. These are the
    # PDF's own page numbers, counted from the first physical
    # page of the file, which is often not the number printed on
    # the page. Both or neither: half a range is a mistake, not
    # an open end, and is rejected rather than guessed at.
    start_page: int | None = None
    end_page: int | None = None


class QuizUpdateRequest(BaseModel):
    """
    The editable parts of a saved quiz: its title and whether it
    is pinned.

    The questions, the document behind them and every recorded
    attempt stay exactly as they are.

    Both fields are optional because a rename and a pin arrive
    separately - the pin control does not know or resend the
    title. Sending neither is refused rather than treated as a
    no-op; see update_quiz.
    """

    title: str | None = None
    is_pinned: bool | None = None


class ConversationUpdateRequest(BaseModel):
    """
    The editable parts of a conversation, in the same shape as
    QuizUpdateRequest so the two endpoints behave alike.

    A conversation's title starts as the first question the
    student asked, which is why it is worth being able to change.
    """

    title: str | None = None
    is_pinned: bool | None = None


# The widest duration an attempt is allowed to report, in
# seconds: 24 hours. Not a judgement about how long a quiz
# should take - it is the point past which the number is
# obviously not a sitting, but a tab left open overnight or a
# clock that was changed underneath the page.
MAX_ATTEMPT_DURATION_SECONDS = 86400


class QuizAttemptRequest(BaseModel):
    """
    Example:

    {
        "answers": {
            "question_uuid_1": "A",
            "question_uuid_2": "B",
            "question_uuid_3": "C"
        },
        "duration_seconds": 245
    }
    """

    answers: dict

    # Optional, and it stays optional: the browser measures
    # this, so a client that does not send it - an older one,
    # or a page whose stored start time was cleared - must
    # still be able to submit a perfectly good attempt.
    duration_seconds: int | None = None


class QuizQuestionResponse(BaseModel):
    id: UUID
    question_text: str
    question_type: str
    options: dict | list | None
    source_page: int | None

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# CONTACT RULES
# =========================================================

# The shortest message worth sending on.
#
# 10 characters after trimming. Below that there is nothing to
# reply to - "hi", "test", a stray keypress on a form somebody
# tabbed into - and every one of those costs the owner an
# email she has to open before she can see there is nothing in
# it. It is deliberately low enough that a real short message
# in either language gets through: "لا يعمل" is 7 and would be
# refused, "الرفع لا يعمل" is 13 and is not, which is about
# where the line belongs.
MIN_CONTACT_MESSAGE_LENGTH = 10

# The longest.
#
# 5000 characters is several screens of writing and far past
# anything a form like this receives. It is here so that the
# column, the email body and the owner's inbox all have a bound
# somebody chose, rather than whatever a paste of a whole PDF
# happens to be.
MAX_CONTACT_MESSAGE_LENGTH = 5000

# How many messages one account may send in an hour.
#
# This guards against a double-clicked Send button and against
# somebody angry enough to press it twenty times - not against
# an attacker, who would simply register more accounts. It does
# not need to: every sender here is a real signed-in account,
# which is what makes the form safe without any spam machinery.
#
# 5 an hour is generous for the honest case. A student writing
# about one problem sends one message, and needing a second and
# a third because they remembered something is normal; needing
# a sixth within the hour is not.
MAX_CONTACT_MESSAGES_PER_HOUR = 5

CONTACT_RATE_LIMIT_WINDOW = timedelta(hours=1)


# =========================================================
# CONTACT SCHEMAS
# =========================================================


class ContactRequest(BaseModel):
    """
    The one field the student fills in.

    The name and the email are not here, and a client that
    sends them anyway is ignored: they are read off
    current_user, so neither can be forged and the message can
    never claim to come from an account it did not come from.

    No min_length or max_length on purpose, the same decision
    RegisterRequest documents. Those are Field constraints, and
    a Field constraint answers with a 422 and a nested error
    body while the rest of this API answers bad input with a
    400 and one sentence the student can read.
    """

    message: str


class ContactResponse(BaseModel):
    """
    The id of the stored message, and nothing else.

    Deliberately not email_sent. Whether the notification went
    out is not the student's problem and not something they can
    do anything about - their message was received the moment
    the row was committed, and telling them otherwise would be
    reporting our delivery trouble as their failure. The two
    email columns are for the owner, who reads them with the
    query in the feature's notes.
    """

    id: UUID

    model_config = ConfigDict(from_attributes=True)


# =========================================================
# ROOT
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to StudyMate API"
    }


# =========================================================
# AUTHENTICATION - REGISTER
# =========================================================

@app.post("/auth/register")
def register(
    user_data: RegisterRequest,
    background_tasks: BackgroundTasks,
    response: Response,
    db: Session = Depends(get_db),
):
    """
    Register a new user.

    TWO ENDINGS, decided by email_verification_is_active():

      off - unchanged from before this feature existed. The row
            is written, the confirmation goes back, and the
            browser signs in with the password it already has.

      on  - the row is written with email_verified False, a
            six-digit code is stored hashed and emailed, and the
            answer is 201 with NO TOKENS. The account exists and
            cannot be used until the code comes back.

    "Off" includes the case where the owner asked for
    verification but SMTP cannot send - see
    email_verification_is_active. A code nobody can deliver would
    lock the account out for good, so the feature stands down
    instead.
    """

    # First, before the table is touched at all: a password
    # that will be refused should cost nothing, and the
    # student should hear about the password itself rather
    # than about the email being taken.
    validate_password(user_data.password)

    existing_user = (
        db.query(User)
        .filter(
            User.email == user_data.email
        )
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    password_hash = hash_password(
        user_data.password
    )

    # Asked once and held, rather than asked again further down.
    # The switch is read from the environment on every call, and
    # an .env edited between two reads inside one request would
    # be enough to create an account that is neither verified nor
    # asked to be.
    verification_required = email_verification_is_active()

    user = User(
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name,

        # True when the feature is not active, and this is
        # deliberate rather than an oversight.
        #
        # An account created while verification is off was never
        # asked to prove anything, exactly like every account
        # that existed before this column did - and those are
        # marked true by the UPDATE that ships with the ALTER,
        # for exactly that reason. Leaving these false instead
        # would mean that switching the feature on later, or
        # simply fixing SMTP after an outage, silently locked out
        # every account created in between. That is the failure
        # this whole feature is built to avoid, so it is not
        # reintroduced here.
        #
        # Nothing observable changes while the feature is off:
        # login does not read this column then, and the
        # registration response is the same one it has always
        # been.
        email_verified=not verification_required,
    )

    db.add(user)

    if not verification_required:

        # -------------------------------------------------
        # The unchanged ending
        # -------------------------------------------------
        #
        # Byte for byte what this endpoint has always answered:
        # a message and an id, no tokens. Register.jsx signs in
        # with the password it already has straight afterwards,
        # and that is still true.

        db.commit()
        db.refresh(user)

        return {
            "message": "User registered successfully",
            "user_id": str(user.id),
        }

    # -----------------------------------------------------
    # The code
    # -----------------------------------------------------
    #
    # flush() and not commit(): the user row needs its id before
    # the verification row can point at it, and the two belong in
    # one transaction. An account committed without its code
    # would be an account nobody could ever claim.

    db.flush()

    code = issue_verification_code(db, user)

    db.commit()
    db.refresh(user)

    # -----------------------------------------------------
    # Then send it
    # -----------------------------------------------------
    #
    # Queued after the commit, like the contact notification and
    # for the same reason: the task opens its own session and
    # must never look for a row that is still inside an open
    # transaction. Registration does not wait on SMTP - the
    # student is already looking at the code field by the time
    # Gmail is answering.

    background_tasks.add_task(
        send_verification_email,
        user.id,
        code,
    )

    # 201 rather than the 200 the unchanged ending returns.
    # The two answers are different things: one hands back an
    # account that is ready to use, the other reports that
    # something was created and is waiting on the student.
    response.status_code = 201

    return RegisteredResponse(
        message=(
            "Account created. Check your email for the "
            "verification code."
        ),
        user_id=str(user.id),
        email=user.email,
    )


# =========================================================
# AUTHENTICATION - LOGIN
# =========================================================

@app.post(
    "/auth/login",
    response_model=TokenResponse,
)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    Login using email and password.

    Swagger OAuth2 uses:

        username = email
        password = password
    """

    user = (
        db.query(User)
        .filter(
            User.email == form_data.username
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if not verify_password(
        form_data.password,
        user.password_hash,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    # -----------------------------------------------------
    # Has this address been proved to be real?
    # -----------------------------------------------------
    #
    # AFTER the password check and never before it. Asked first,
    # this branch would tell anybody who typed an address whether
    # it has an account here and whether that account has been
    # claimed - a question the 401 above is deliberately careful
    # not to answer.
    #
    # 403 rather than 401: the credentials were right. What is
    # missing is not proof of who they are but proof that the
    # address reaches them, and the browser needs to tell those
    # two apart - one leads to the password field, the other to
    # the code field.
    #
    # Nothing else about this endpoint changed. The password
    # check above, the tokens below and token_version are exactly
    # as they were.
    if (
        email_verification_is_active()
        and not user.email_verified
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                "This email address has not been verified yet. "
                "Enter the code we sent you, or ask for a new one."
            ),
        )

    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    refresh_token = create_refresh_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }

# =========================================================
# AUTHENTICATION - VERIFY EMAIL
# =========================================================

@app.post(
    "/auth/verify-email",
    response_model=TokenResponse,
)
def verify_email(
    verification_data: VerifyEmailRequest,
    db: Session = Depends(get_db),
):
    """
    Exchange a six-digit code for a signed-in session.

    Returns the same token pair login returns, which is the whole
    point: the student typed a code because they were in the
    middle of creating an account, and finishing that should put
    them inside the app rather than back at a sign-in form asking
    for the password they entered ninety seconds ago.

    EVERY FAILURE IS THE SAME 400 AND THE SAME SENTENCE - wrong
    code, expired code, spent code, too many guesses, no account
    at that address at all. Telling them apart would be telling
    whoever is asking which addresses have accounts here, and
    telling a guesser whether the code they are working on is
    still alive.
    """

    # One object, raised from five places. Written once so the
    # five can never drift into five slightly different
    # sentences, which is how a "do not reveal" rule quietly
    # stops holding.
    refused = HTTPException(
        status_code=400,
        detail=(
            "That code is not valid. Ask for a new one and try "
            "again."
        ),
    )

    user = (
        db.query(User)
        .filter(
            User.email == verification_data.email
        )
        .first()
    )

    if not user:
        raise refused

    # Trimmed, because a code copied out of an email arrives with
    # a space on one end often enough, and translated out of
    # Arabic-Indic digits, because a student typing on an Arabic
    # keyboard is typing the same code the email showed them.
    code = (
        verification_data.code
        .strip()
        .translate(VERIFICATION_DIGIT_TRANSLATION)
    )

    verification = newest_live_verification(db, user)

    if not verification:
        raise refused

    # -----------------------------------------------------
    # Count the guess before judging it
    # -----------------------------------------------------
    #
    # Incremented and COMMITTED before the comparison, so that a
    # guess costs an attempt whatever happens next. Counting
    # afterwards would mean a client that hangs up mid-request,
    # or a process that dies, hands back a free guess - and free
    # guesses are the only thing standing between a six-digit
    # code and a script.

    verification.attempts += 1

    db.commit()

    if verification.attempts > MAX_VERIFICATION_ATTEMPTS:

        # The code is dead from here on, not merely refused. A
        # row that stays alive after the limit would let somebody
        # keep guessing at a code whose attempt counter no longer
        # protects it, and would let the right code still work
        # after we decided this row was being attacked.
        #
        # used_at rather than a delete: the row is evidence that
        # somebody sat and guessed, and a resend issues a fresh
        # one anyway.
        verification.used_at = datetime.now(timezone.utc)

        db.commit()

        logger.warning(
            "Verification code for user %s was abandoned after "
            "too many wrong attempts.",
            user.id,
        )

        raise refused

    # bcrypt, because that is what the code was hashed with. The
    # comparison is constant time for the same reason the
    # password's is.
    if not verify_password(
        code,
        verification.code_hash,
    ):
        raise refused

    # -----------------------------------------------------
    # It was right
    # -----------------------------------------------------
    #
    # Both writes in one commit. The address is verified and the
    # code is spent together, so there is no instant in which a
    # code that has already worked could work again.

    user.email_verified = True
    verification.used_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(user)

    # The same pair login issues, written out here rather than
    # shared with it. Login's token issuing is deliberately left
    # untouched by this feature - it is the path every existing
    # account uses every day, and it is not worth refactoring to
    # save twelve lines.
    access_token = create_access_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    refresh_token = create_refresh_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# =========================================================
# AUTHENTICATION - RESEND VERIFICATION CODE
# =========================================================

@app.post("/auth/resend-verification")
def resend_verification(
    resend_data: ResendVerificationRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Issue a fresh code and invalidate the one before it.

    ALWAYS ANSWERS 200, whether the address has an account, has
    no account, or has one that is already verified. Nobody is
    signed in when this is called, so the only thing a different
    answer could do is tell a stranger which addresses are
    registered here - which would turn a convenience for a
    student whose code went missing into a way to harvest the
    user table.

    The one exception is the rate limit, which answers 429. That
    is a deliberate trade and it is not free: it tells somebody
    who asks four times in an hour that there is an account
    behind the address. It is accepted because the alternative -
    pretending to send while refusing - would leave a student
    pressing Resend and being told a code is on its way when
    none is.
    """

    # The same sentence whatever happened, for the reason in the
    # docstring. It promises nothing about an account existing.
    accepted = {
        "message": (
            "If that address needs verifying, a new code is on "
            "its way."
        )
    }

    # Nothing to verify while the feature is off. No row, no
    # email, and the same answer as every other case - a
    # different one here would report the state of the switch to
    # anyone who asked.
    if not email_verification_is_active():
        return accepted

    user = (
        db.query(User)
        .filter(
            User.email == resend_data.email
        )
        .first()
    )

    if not user:
        return accepted

    if user.email_verified:
        return accepted

    # -----------------------------------------------------
    # The rate limit
    # -----------------------------------------------------
    #
    # A COUNT over this account's rows in the last hour, exactly
    # as the contact form counts its messages: no package, and no
    # counter in memory that a restart resets and that is wrong
    # the moment the app runs as more than one process.
    #
    # Checked BEFORE anything is invalidated. A refused resend
    # must leave the student holding the code they already have -
    # killing it first and then refusing to send a replacement
    # would be the one outcome worse than not resending at all.

    window_start = (
        datetime.now(timezone.utc)
        - VERIFICATION_RATE_LIMIT_WINDOW
    )

    recent_code_count = (
        db.query(func.count(EmailVerification.id))
        .filter(
            EmailVerification.user_id == user.id,
            EmailVerification.created_at >= window_start,
        )
        .scalar()
    )

    if recent_code_count >= MAX_VERIFICATION_CODES_PER_HOUR:

        # No number in the sentence, the same decision the
        # contact form's 429 documents: the student needs to know
        # to wait, not where the line is, and a number written
        # here would be a second place for the constant to live.
        raise HTTPException(
            status_code=429,
            detail=(
                "Too many codes have been requested for this "
                "account. Please wait a while before asking for "
                "another."
            ),
        )

    # -----------------------------------------------------
    # Out with the old, in with the new
    # -----------------------------------------------------
    #
    # Every outstanding code is spent, not deleted, and then one
    # replaces them. Two live codes at once would mean the older
    # one - the one in the email the student has already decided
    # is missing - still opened the account.
    #
    # One UPDATE rather than a loop, because the rows are only
    # touched to be marked and there is nothing to read back.

    (
        db.query(EmailVerification)
        .filter(
            EmailVerification.user_id == user.id,
            EmailVerification.used_at.is_(None),
        )
        .update(
            {
                EmailVerification.used_at: datetime.now(timezone.utc),
            },
            synchronize_session=False,
        )
    )

    code = issue_verification_code(db, user)

    db.commit()

    background_tasks.add_task(
        send_verification_email,
        user.id,
        code,
    )

    return accepted


# =========================================================
# AUTHENTICATION - REFRESH TOKEN
# =========================================================

@app.post(
    "/auth/refresh",
    response_model=TokenResponse,
)
def refresh_access_token(
    request_data: RefreshRequest,
    db: Session = Depends(get_db),
):
    """
    Exchange a valid refresh token for a new access token
    (and a new refresh token, rotated for extra safety).
    """

    user_id, token_version = decode_refresh_token(
        request_data.refresh_token
    )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    # A refresh token issued before the user signed out is
    # refused here too, otherwise signing out would only close
    # the door the access token walks through.
    if token_version != user.token_version:

        raise HTTPException(
            status_code=401,
            detail="Invalid or expired refresh token",
        )

    new_access_token = create_access_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    new_refresh_token = create_refresh_token(
        data={
            "sub": str(user.id),
            "ver": user.token_version,
        }
    )

    return {
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
    }

# =========================================================
# LOGOUT
# =========================================================

@app.post(
    "/auth/logout"
)
def logout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Sign out everywhere.

    A JWT cannot be taken back once handed out: it is valid
    because it is correctly signed and not yet expired, and the
    server keeps no record of it to delete. Clearing it from the
    browser hides it, but a copy taken beforehand would keep
    working until it expired on its own.

    Raising token_version is what actually revokes it. Every
    token carries the version it was issued with, and
    get_current_user refuses any token whose version no longer
    matches the user's - so one write here kills every token
    this user holds, on every device, immediately.

    That breadth is the honest cost of the simplest design: it
    signs out the phone as well as the laptop. Per-device
    revocation would need a stored id per token.
    """

    current_user.token_version += 1

    db.commit()

    return {
        "message": "Signed out successfully"
    }


# =========================================================
# CURRENT USER - READ
# =========================================================

@app.get(
    "/auth/me",
    response_model=UserResponse,
)
def read_current_user(
    current_user: User = Depends(get_current_user),
):
    """
    The account behind the access token.

    This exists because the browser had no way to learn the
    student's name. It was written down at registration and
    kept in local storage, so the first sign-out lost it and
    the sidebar fell back to showing the email twice. A name
    the server can be asked for survives sign-out, a new
    browser and a second device.
    """

    return current_user


# =========================================================
# CURRENT USER - UPDATE NAME
# =========================================================

@app.patch(
    "/auth/me",
    response_model=UserResponse,
)
def update_current_user(
    profile_data: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rename the account holder.

    Returns the same shape as GET /auth/me, so the caller can
    put the response straight back into whatever it was
    displaying rather than re-fetching.
    """

    full_name = profile_data.full_name.strip()

    # A name of spaces is an empty name. Trimming first means
    # "   " is refused here rather than stored and then shown
    # as a blank line in the sidebar.
    if not full_name:

        raise HTTPException(
            status_code=400,
            detail="Name cannot be empty",
        )

    # 255 is the width of users.full_name. Refusing here gives
    # the student a sentence they can act on, instead of the
    # database raising a driver error further down.
    if len(full_name) > 255:

        raise HTTPException(
            status_code=400,
            detail="Name cannot be longer than 255 characters",
        )

    current_user.full_name = full_name

    db.commit()
    db.refresh(current_user)

    return current_user


# =========================================================
# CURRENT USER - CHANGE PASSWORD
# =========================================================

@app.post(
    "/auth/change-password",
    response_model=TokenResponse,
)
def change_password(
    password_data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Replace the account password.

    Changing a password is also a way of saying "somebody else
    may be signed in as me", so it revokes every token this
    account holds - exactly as /auth/logout does, and through
    the same one line: token_version goes up, and every token
    minted before this moment stops being accepted.

    That would sign out the browser doing the changing too,
    which is why a fresh pair is minted and returned here. The
    student stays where they are; every other session ends.

    The new password goes through validate_password, the same
    function registration uses, so the two endpoints can never
    disagree about what a usable password is.
    """

    # Ahead of the current-password check, which is where the
    # length rule used to sit: Pydantic rejected a short
    # new_password before this function ran at all. Keeping
    # that order means moving the rule here did not quietly
    # change which of the two complaints a student sees when
    # they get both wrong.
    validate_password(password_data.new_password)

    # verify_password, not a comparison of our own: this is the
    # same function /auth/login trusts, so a password that signs
    # in here is exactly a password that signs in there.
    if not verify_password(
        password_data.current_password,
        current_user.password_hash,
    ):

        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    current_user.password_hash = hash_password(
        password_data.new_password
    )

    current_user.token_version += 1

    db.commit()
    db.refresh(current_user)

    # Minted after the commit, so they carry the raised version
    # and are the only tokens this account now has that
    # get_current_user will accept.
    access_token = create_access_token(
        data={
            "sub": str(current_user.id),
            "ver": current_user.token_version,
        }
    )

    refresh_token = create_refresh_token(
        data={
            "sub": str(current_user.id),
            "ver": current_user.token_version,
        }
    )

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


# =========================================================
# CURRENT USER - DELETE THE ACCOUNT
# =========================================================

@app.delete(
    "/auth/me"
)
def delete_account(
    account_data: AccountDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete this account and everything belonging to it,
    permanently.

    WHOSE ACCOUNT IS DELETED. current_user, and nothing else.
    There is no user id in the path, in the query string or in
    the body, so there is nothing for a caller to put somebody
    else's id into - the row removed is the one the access
    token resolved to in get_current_user. The password below
    is a second check on the person, not on the row.

    WHAT GOES WITH IT. Every foreign key pointing at users is
    ON DELETE CASCADE in the database itself, and so is every
    key pointing at documents, conversations and quizzes - so
    one DELETE takes the documents, their chunks, the
    conversations, their messages, the quizzes, their questions
    and attempts, the contact messages and the outstanding
    verification codes with it. Postgres works the order out;
    there is no order to get wrong here, and no half-deleted
    account to be left behind by getting it wrong.

    WHY NOT db.delete(current_user), which is how
    delete_document and delete_quiz are written. User's
    relationships are cascade="all, delete-orphan" with no
    passive_deletes, so the ORM would SELECT every child row
    into Python before deleting it one at a time - including
    every chunk of every document, each carrying a 384-value
    embedding. The Core statement hands the whole job to the
    database in one round trip. This is the one delete endpoint
    in the file that does not use the ORM, and that is why.

    IF IT FAILS. A single DELETE is one transaction, so it
    either removes the account and everything cascading from it
    or removes nothing at all - there is no partial state for a
    rollback to clean up. get_db never autocommits, so an
    exception before db.commit() leaves the account exactly as
    it was, and the files on disk are still there because they
    are unlinked last, deliberately.

    THE SESSION ENDS BY ITSELF. token_version is not raised
    here and does not need to be: get_current_user looks the
    token's "sub" up in users, and after this there is no row
    to find, so every token this account holds - on every
    device - stops being accepted at once.
    """

    # -----------------------------------------------------
    # Prove the person, not just the browser
    # -----------------------------------------------------
    #
    # verify_password and the same sentence change_password
    # uses, so a password that works there works here and
    # lib/serverErrors.js already translates the refusal.

    if not verify_password(
        account_data.current_password,
        current_user.password_hash,
    ):

        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    # -----------------------------------------------------
    # The files, noted before the rows that name them
    # -----------------------------------------------------
    #
    # Nothing cascades to the filesystem. documents.file_path
    # is the only record of where an upload lives, and once the
    # row is gone there is no way to find the file again - so
    # the paths are read out first, while they still exist.

    file_paths = [
        document.file_path
        for document in (
            db.query(Document)
            .filter(
                Document.user_id == current_user.id,
            )
            .all()
        )
        if document.file_path
    ]

    # -----------------------------------------------------
    # One statement, and the database does the rest
    # -----------------------------------------------------

    db.execute(
        delete(User).where(
            User.id == current_user.id
        )
    )

    db.commit()

    # -----------------------------------------------------
    # Only now the files
    # -----------------------------------------------------
    #
    # AFTER the commit, never before it. Unlinking first would
    # destroy the uploads and then, if the DELETE failed, leave
    # a working account whose documents all point at files that
    # are no longer there.
    #
    # A file that will not delete is logged and stepped over. A
    # leftover file on disk is untidy; an exception here would
    # turn an account that IS deleted into a 500 telling the
    # student it was not.

    for file_path in file_paths:

        try:
            if os.path.exists(file_path):
                os.remove(file_path)

        except OSError as error:
            logger.warning(
                "Could not remove %s after deleting an account: %s",
                file_path,
                error,
            )

    return {
        "message": "Account deleted successfully"
    }


# =========================================================
# UPLOAD LIMITS
# =========================================================

def megabytes_from_environment(
    name: str,
    default: int,
) -> int:
    """
    Read a megabyte limit from the environment, falling back to the
    default if it is missing or not a positive whole number.

    A typo in .env should not stop the server from starting, and it
    should not silently turn a limit off either - so anything
    unreadable becomes the default rather than zero.
    """

    raw_value = os.environ.get(name)

    if not raw_value:
        return default

    try:
        value = int(raw_value.strip())

    except ValueError:
        return default

    return value if value > 0 else default


# Applies to every upload. This one only protects the disk and catches
# accidents - a student who picks the wrong file, a download that went
# wrong. It is deliberately generous: the owner already works with a
# 35.9 MB PDF every day.
MAX_UPLOAD_MB = megabytes_from_environment(
    "MAX_UPLOAD_MB",
    200,
)

# Applies only to files that have to be converted first. It is really a
# time limit wearing a size limit's clothes: conversion was measured at
# roughly 2 seconds per megabyte, so 100 MB is about 200 seconds of
# work. A PDF is never converted and so is never measured against this -
# applying it to PDFs would refuse a file for a cost it does not incur.
MAX_CONVERT_MB = megabytes_from_environment(
    "MAX_CONVERT_MB",
    100,
)

# The off switch. Set ENABLE_FILE_CONVERSION=false in .env and non-PDF
# uploads are refused exactly as they were before this feature existed,
# with no code change. Anything that is not a recognisable "yes" counts
# as off, so a typo disables a feature that is still on trial rather
# than enabling one the owner meant to turn off.
ENABLE_FILE_CONVERSION = (
    os.environ.get("ENABLE_FILE_CONVERSION", "true")
    .strip()
    .lower()
    in {"true", "1", "yes", "on"}
)

# How much of the upload is held in memory at once while it is written
# to disk. Unchanged from the block size the previous implementation
# passed to shutil.copyfileobj.
UPLOAD_BLOCK_BYTES = 1024 * 1024


# =========================================================
# DOCUMENTS - UPLOAD
# =========================================================

@app.post(
    "/documents",
    response_model=DocumentResponse,
)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Upload a PDF document, or an Office document that will be
    converted to PDF before it is processed.

    The document is first saved to disk and the database.
    RAG processing is then started as a background task, and the
    conversion - when there is one - happens inside that same
    background task.

    The uploaded file is copied in blocks instead of being
    loaded completely into memory.
    """

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required",
        )

    # -----------------------------------------------------
    # Take the name apart before trusting it
    # -----------------------------------------------------
    #
    # The client chooses this string, and it is about to become part
    # of a path. Both separators are folded to "/" first, because
    # os.path.basename on Linux does not treat a backslash as one -
    # so a Windows-shaped "..\..\evil.pdf" would survive basename
    # untouched on a Linux server and walk out of the uploads
    # directory. A name that is nothing but dots is refused outright.

    original_filename = os.path.basename(
        file.filename.replace("\\", "/")
    ).strip()

    if (
        not original_filename
        or set(original_filename) <= {"."}
    ):
        raise HTTPException(
            status_code=400,
            detail="Filename is required",
        )

    # -----------------------------------------------------
    # Which file types are accepted
    # -----------------------------------------------------
    #
    # Checked before anything is written, so a file we already know
    # we will refuse never reaches the disk at all.

    if not is_supported(original_filename):
        raise HTTPException(
            status_code=400,
            detail=(
                "Supported file types are PDF, Word, PowerPoint, "
                "Excel and OpenDocument."
            ),
        )

    if needs_conversion(original_filename):

        if not ENABLE_FILE_CONVERSION:
            raise HTTPException(
                status_code=400,
                detail="Only PDF files are supported",
            )

        # Resolved per upload rather than at startup, so a server whose
        # LibreOffice is missing still serves PDF uploads normally and
        # one that gains a LibreOffice picks it up without a restart.
        #
        # 503 rather than 400: the file is fine, the server is not.
        # The student is not told the name of a program they do not
        # have, but the log is, because that is who can act on it.
        if not find_soffice():

            logger.error(
                "Refused %s: LibreOffice was not found. "
                "Set SOFFICE_CMD or install it.",
                original_filename,
            )

            raise HTTPException(
                status_code=503,
                detail=(
                    "This file type cannot be converted on the "
                    "server right now. Please upload a PDF instead."
                ),
            )

    os.makedirs(
        "uploads",
        exist_ok=True,
    )

    safe_filename = (
        f"{uuid4()}_{original_filename}"
    )

    file_path = os.path.join(
        "uploads",
        safe_filename,
    )

    # -----------------------------------------------------
    # Save uploaded file in blocks
    # -----------------------------------------------------
    #
    # IMPORTANT:
    #
    # Do NOT use:
    #
    #     contents = await file.read()
    #
    # with no argument, because that loads the entire file into
    # memory. Read one block at a time instead.
    #
    # The bytes are counted as they go past because that is the only
    # moment we can count them: an UploadFile does not know its own
    # size until it has been read, and a Content-Length header is the
    # client's claim rather than a fact.
    # -----------------------------------------------------

    max_upload_bytes = MAX_UPLOAD_MB * 1024 * 1024

    bytes_written = 0

    too_large = False

    with open(
        file_path,
        "wb",
    ) as buffer:

        while True:

            block = await file.read(UPLOAD_BLOCK_BYTES)

            if not block:
                break

            bytes_written += len(block)

            # Tested before the write, so not one byte past the limit
            # is ever stored.
            if bytes_written > max_upload_bytes:
                too_large = True
                break

            buffer.write(block)

    # The partial file is deleted outside the `with`, because on
    # Windows a file still open cannot be removed.
    if too_large:

        os.remove(file_path)

        raise HTTPException(
            status_code=413,
            detail=(
                f"This file is larger than the {MAX_UPLOAD_MB} MB "
                f"upload limit."
            ),
        )

    # -----------------------------------------------------
    # The stricter limit, for files that must be converted
    # -----------------------------------------------------
    #
    # Checked here, with the file on disk and before LibreOffice has
    # been asked to do anything, so an oversized document costs a
    # write and a delete rather than several minutes of conversion.

    if (
        needs_conversion(original_filename)
        and bytes_written > MAX_CONVERT_MB * 1024 * 1024
    ):

        os.remove(file_path)

        raise HTTPException(
            status_code=413,
            detail=(
                f"Office documents are limited to {MAX_CONVERT_MB} MB "
                f"because they have to be converted first. PDF files "
                f"up to {MAX_UPLOAD_MB} MB are accepted."
            ),
        )

    document = Document(
        user_id=current_user.id,
        title=original_filename,
        filename=original_filename,
        file_path=file_path,
        status="pending",
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(
        process_document_background,
        document.id,
    )

    return document


# =========================================================
# GET ALL DOCUMENTS
# =========================================================

@app.get(
    "/documents",
    response_model=list[DocumentResponse],
)
def get_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all documents belonging to the current user.
    """

    documents = (
        db.query(Document)
        .filter(
            Document.user_id == current_user.id
        )
        .all()
    )

    return documents


# =========================================================
# GET ONE DOCUMENT
# =========================================================

@app.get(
    "/documents/{document_id}",
    response_model=DocumentResponse,
)
def get_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific document.
    """

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    return document



# =========================================================
# UPDATE DOCUMENT TITLE
# =========================================================

@app.patch(
    "/documents/{document_id}",
    response_model=DocumentResponse,
)
def update_document(
    document_id: UUID,
    update_data: DocumentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update a document's display title.

    Only the title can be changed here. The underlying
    file, its path, and its processing status are never
    touched by this endpoint.
    """

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    new_title = update_data.title.strip()

    if not new_title:
        raise HTTPException(
            status_code=400,
            detail="Title cannot be empty",
        )

    document.title = new_title

    db.commit()
    db.refresh(document)

    return document

# =========================================================
# DELETE DOCUMENT
# =========================================================

@app.delete(
    "/documents/{document_id}"
)
def delete_document(
    document_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a document and its physical file.

    Related chunks, conversations and quizzes
    are deleted through database cascade relationships.
    """

    document = (
        db.query(Document)
        .filter(
            Document.id == document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    if (
        document.file_path
        and os.path.exists(document.file_path)
    ):
        os.remove(document.file_path)

    db.delete(document)
    db.commit()

    return {
        "message": "Document deleted successfully"
    }


# =========================================================
# CHAT
# =========================================================

@app.post(
    "/chat",
    response_model=ChatResponse,
)
def chat(
    chat_data: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Chat with a document using the RAG pipeline.

    The endpoint also loads the last few messages from
    the current conversation and passes them to the AI
    so that Claude can understand follow-up questions.
    """

    # -----------------------------------------------------
    # Validate message
    # -----------------------------------------------------

    if not chat_data.message.strip():
        raise HTTPException(
            status_code=400,
            detail="Message cannot be empty",
        )

    # -----------------------------------------------------
    # Validate document ownership
    # -----------------------------------------------------

    document = (
        db.query(Document)
        .filter(
            Document.id == chat_data.document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:
        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    # -----------------------------------------------------
    # Document must be ready
    # -----------------------------------------------------

    if document.status != "ready":
        raise HTTPException(
            status_code=400,
            detail=(
                f"Document is not ready. "
                f"Current status: {document.status}"
            ),
        )

    # -----------------------------------------------------
    # Find existing conversation
    # -----------------------------------------------------

    conversation = None

    if chat_data.conversation_id:

        conversation = (
            db.query(Conversation)
            .filter(
                Conversation.id
                == chat_data.conversation_id,
                Conversation.user_id
                == current_user.id,
                Conversation.document_id
                == document.id,
            )
            .first()
        )

        if not conversation:
            raise HTTPException(
                status_code=404,
                detail="Conversation not found",
            )

    # -----------------------------------------------------
    # Create a new conversation if needed
    # -----------------------------------------------------

    if conversation is None:

        conversation = Conversation(
            user_id=current_user.id,
            document_id=document.id,
            title=chat_data.message[:255],
        )

        db.add(conversation)
        db.commit()
        db.refresh(conversation)

    # -----------------------------------------------------
    # LOAD PREVIOUS CONVERSATION MESSAGES
    # -----------------------------------------------------
    #
    # IMPORTANT:
    #
    # We load the previous messages BEFORE saving the
    # current user question.
    #
    # This means conversation_history contains only
    # messages that happened before the current question.
    #
    # Example:
    #
    # User: What is supply and demand?
    # Assistant: ...
    #
    # New question:
    # Explain that more simply.
    #
    # The history sent to Claude will contain the first
    # question and answer, while the new question is
    # sent separately.
    # -----------------------------------------------------

    previous_messages = (
        db.query(Message)
        .filter(
            Message.conversation_id
            == conversation.id
        )
        .order_by(
            Message.created_at.desc()
        )
        .limit(
            CHAT_HISTORY_LIMIT
        )
        .all()
    )

    # -----------------------------------------------------
    # Restore chronological order
    # -----------------------------------------------------
    #
    # The database query above returns the newest
    # messages first.
    #
    # Claude should receive them from oldest to newest.
    # -----------------------------------------------------

    previous_messages.reverse()

    # -----------------------------------------------------
    # Convert database messages into Claude format
    # -----------------------------------------------------

    conversation_history = [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in previous_messages
    ]

    # -----------------------------------------------------
    # Save current user message
    # -----------------------------------------------------

    user_message = Message(
        conversation_id=conversation.id,
        role="user",
        content=chat_data.message,
        sources=[],
    )

    db.add(user_message)
    db.commit()

    # -----------------------------------------------------
    # Run RAG + conversation memory
    # -----------------------------------------------------

    try:

        rag_result = answer_question(
            db=db,
            document_id=document.id,
            question=chat_data.message,
            conversation_history=conversation_history,
        )

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except RuntimeError as error:

        raise HTTPException(
            status_code=503,
            detail=str(error),
        )

    except Exception as error:

        logger.exception(
            "Unhandled exception in /chat for document %s.",
            document.id,
        )

        raise HTTPException(
            status_code=500,
            detail=(
                "An error occurred while processing "
                f"the AI request: {error}"
            ),
        ) from error

    # -----------------------------------------------------
    # Save assistant response
    # -----------------------------------------------------

    assistant_message = Message(
        conversation_id=conversation.id,
        role="assistant",
        content=rag_result["answer"],
        sources=rag_result["sources"],
    )

    db.add(assistant_message)
    db.commit()

    # -----------------------------------------------------
    # Return response
    # -----------------------------------------------------

    return {
        "conversation_id": conversation.id,
        "answer": rag_result["answer"],
        "sources": rag_result["sources"],
    }


# =========================================================
# CONVERSATIONS
# =========================================================

@app.get("/conversations")
def get_conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get all conversations belonging to the current user,
    pinned first and newest first within each group.

    Pinning lifts a conversation to the top of the list it is
    already in rather than moving it to a favourites page: the
    web app groups these by document, and a favourites list would
    cut across that grouping - two organising schemes for the
    same rows, and two answers to "where is my conversation".
    The column can grow into a cross-document view later if that
    is ever wanted; a second list could not be simplified back
    down.

    The rows are Conversation objects, so is_pinned is part of
    each one alongside title and created_at.
    """

    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id
        )
        .order_by(
            Conversation.is_pinned.desc(),
            Conversation.created_at.desc(),
        )
        .all()
    )

    return conversations


# =========================================================
# GET ONE CONVERSATION
# =========================================================

@app.get(
    "/conversations/{conversation_id}"
)
def get_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a conversation and its messages.
    """

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    messages = (
        db.query(Message)
        .filter(
            Message.conversation_id
            == conversation.id
        )
        .order_by(
            Message.created_at
        )
        .all()
    )

    return {
        "conversation": conversation,
        "messages": messages,
    }

# =========================================================
# UPDATE CONVERSATION - RENAME OR PIN
# =========================================================

@app.patch(
    "/conversations/{conversation_id}"
)
def update_conversation(
    conversation_id: UUID,
    update_data: ConversationUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rename a conversation, pin it, or both.

    The same shape as update_quiz, deliberately: the web app
    drives both from the same kind of row control, and two
    endpoints that differ only in wording would be two things to
    remember.

    A conversation's title is set automatically from the first
    question asked, which is a reasonable guess and often not
    what the student would have called it - hence the rename.
    """

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    # -----------------------------------------------------
    # What was actually sent
    # -----------------------------------------------------
    #
    # A PATCH with neither field cannot be what the caller meant,
    # so it is reported rather than absorbed silently as a no-op -
    # the same judgement update_quiz makes.

    if (
        update_data.title is None
        and update_data.is_pinned is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Send a title, is_pinned, or both"
            ),
        )

    if update_data.title is not None:

        new_title = update_data.title.strip()

        if not new_title:
            raise HTTPException(
                status_code=400,
                detail="Title cannot be empty",
            )

        conversation.title = new_title

    if update_data.is_pinned is not None:
        conversation.is_pinned = update_data.is_pinned

    db.commit()
    db.refresh(conversation)

    return {
        "message": "Conversation updated successfully",
        "conversation": {
            "id": str(conversation.id),

            "title": conversation.title,

            "is_pinned": conversation.is_pinned,

            "document_id": (
                str(conversation.document_id)
                if conversation.document_id
                else None
            ),

            "created_at": (
                conversation.created_at.isoformat()
                if conversation.created_at
                else None
            ),
        },
    }


# =========================================================
# DELETE CONVERSATION
# =========================================================

@app.delete(
    "/conversations/{conversation_id}"
)
def delete_conversation(
    conversation_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a conversation and every message in it.

    Messages are removed through the database cascade,
    the same way delete_document removes a document's
    conversations.
    """

    conversation = (
        db.query(Conversation)
        .filter(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
        .first()
    )

    if not conversation:
        raise HTTPException(
            status_code=404,
            detail="Conversation not found",
        )

    db.delete(conversation)
    db.commit()

    return {
        "message": "Conversation deleted successfully"
    }


# =========================================================
# CREATE QUIZ
# =========================================================

@app.post("/quizzes")
def create_quiz(
    quiz_data: QuizCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create an AI-generated quiz.

    The API endpoint is responsible for:

        1. Validating the document.
        2. Creating the Quiz record.
        3. Delegating AI quiz generation to ai.service.

    The actual AI generation logic is implemented
    in ai/service.py.
    """

    # -----------------------------------------------------
    # Validate document ownership
    # -----------------------------------------------------

    document = (
        db.query(Document)
        .filter(
            Document.id == quiz_data.document_id,
            Document.user_id == current_user.id,
        )
        .first()
    )

    if not document:

        raise HTTPException(
            status_code=404,
            detail="Document not found",
        )

    # -----------------------------------------------------
    # Document must be ready
    # -----------------------------------------------------

    if document.status != "ready":

        raise HTTPException(
            status_code=400,
            detail=(
                f"Document is not ready. "
                f"Current status: {document.status}"
            ),
        )

    # -----------------------------------------------------
    # Validate number of questions
    # -----------------------------------------------------

    if quiz_data.num_questions < 1:

        raise HTTPException(
            status_code=400,
            detail="num_questions must be at least 1",
        )

    if quiz_data.num_questions > 50:

        raise HTTPException(
            status_code=400,
            detail="num_questions cannot exceed 50",
        )

    # -----------------------------------------------------
    # Validate question types
    # -----------------------------------------------------
    #
    # An unknown type is rejected rather than ignored: silently
    # dropping it would hand back a quiz that does not match
    # what was asked for, with nothing to say why.

    if quiz_data.question_types is not None:

        unknown = [
            name
            for name in quiz_data.question_types
            if name not in QUESTION_TYPES
        ]

        if unknown:

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unknown question type(s): {', '.join(unknown)}. "
                    f"Allowed: {', '.join(QUESTION_TYPES)}"
                ),
            )

    # -----------------------------------------------------
    # Enough questions to go round
    # -----------------------------------------------------
    #
    # Every type the student picked gets at least one question,
    # so a quiz cannot have fewer questions than types picked.
    # Only types that were actually named count: omitting the
    # list is not a request for all three, it is the absence of
    # a preference, and the generator narrows its default to fit
    # the count rather than failing.
    #
    # Refused here rather than in the generator so the answer
    # comes back at once, instead of after a request to Claude
    # that was never going to work.

    requested_types = sorted(set(quiz_data.question_types or []))

    if quiz_data.num_questions < len(requested_types):

        raise HTTPException(
            status_code=400,
            detail=(
                f"{quiz_data.num_questions} question(s) is not "
                f"enough for {len(requested_types)} question "
                f"type(s): each type you pick needs at least "
                f"one question."
            ),
        )

    # -----------------------------------------------------
    # Validate the page range
    # -----------------------------------------------------
    #
    # Half a range is refused rather than completed: someone who
    # gave a first page and no last page may have meant "to the
    # end" or may simply not have finished typing, and quietly
    # choosing one of those builds a quiz from the wrong pages
    # with nothing to show that it happened.

    start_page = quiz_data.start_page
    end_page = quiz_data.end_page

    if (start_page is None) != (end_page is None):

        raise HTTPException(
            status_code=400,
            detail=(
                "Give both a first and a last page, or neither."
            ),
        )

    if start_page is not None:

        if start_page < 1:

            raise HTTPException(
                status_code=400,
                detail="The first page must be 1 or greater.",
            )

        if end_page < start_page:

            raise HTTPException(
                status_code=400,
                detail=(
                    "The last page cannot come before the first "
                    "page."
                ),
            )

        # A first page past the end of the document has nothing
        # behind it at all. The last page is left alone: pages
        # 90 to 200 of a 120 page document is a reasonable way
        # to say "to the end", and it still selects real pages.

        if (
            document.page_count
            and start_page > document.page_count
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    f"This document has {document.page_count} "
                    f"pages, so it has no page {start_page}."
                ),
            )

    # -----------------------------------------------------
    # Create Quiz record
    # -----------------------------------------------------

    quiz = Quiz(
        user_id=current_user.id,
        document_id=document.id,
        title=quiz_data.title,
    )

    db.add(quiz)
    db.flush()

    # -----------------------------------------------------
    # Generate questions through AI service
    # -----------------------------------------------------

    try:

        generated_questions, warnings = generate_quiz(
            db=db,
            quiz=quiz,
            question_count=quiz_data.num_questions,
            question_types=quiz_data.question_types,
            description=quiz_data.description,
            start_page=start_page,
            end_page=end_page,
        )

    except ValueError as error:

        db.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except RuntimeError as error:

        db.rollback()

        raise HTTPException(
            status_code=503,
            detail=str(error),
        )

    except Exception as error:

        db.rollback()

        raise HTTPException(
            status_code=500,
            detail=(
                "An error occurred while generating "
                "the quiz."
            ),
        ) from error

    # -----------------------------------------------------
    # Return result
    # -----------------------------------------------------

    # warnings is empty for a quiz that is exactly what was
    # asked for. When it is not, it says what the quiz did not
    # manage to be - a question type that produced nothing, say
    # - in words meant for the student rather than a log file.

    return {
        "message": "Quiz created successfully",
        "quiz_id": str(quiz.id),
        "questions_count": len(
            generated_questions
        ),
        "warnings": warnings,
    }

# =========================================================
# LIST QUIZZES
# =========================================================

@app.get(
    "/quizzes"
)
def list_quizzes(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Every quiz this user has created, newest first.

    Without this the web app had no way to ask which
    quizzes exist, so it kept a list in the browser's
    local storage: lost on another device, on another
    browser, and whenever site data was cleared - while
    the quizzes themselves sat in the database,
    unreachable because nothing listed them.

    Counts are gathered in two extra queries rather than
    one per quiz.
    """

    # Pinned first, then newest first inside each group.
    #
    # Pinning lifts a quiz to the top of the list it is already
    # in rather than moving it to a favourites page: this list is
    # grouped by document, and a favourites list would cut across
    # that grouping - two organising schemes for the same rows,
    # and two answers to "where is my quiz". The column could
    # grow into a cross-document view later if that is ever
    # wanted; a second list could not be simplified back down.

    quizzes = (
        db.query(Quiz)
        .filter(
            Quiz.user_id == current_user.id
        )
        .order_by(
            Quiz.is_pinned.desc(),
            Quiz.created_at.desc(),
        )
        .all()
    )

    if not quizzes:
        return {"quizzes": []}

    quiz_ids = [quiz.id for quiz in quizzes]

    # -----------------------------------------------------
    # How many questions, how many attempts
    # -----------------------------------------------------

    question_counts = {}

    for (quiz_id,) in (
        db.query(QuizQuestion.quiz_id)
        .filter(
            QuizQuestion.quiz_id.in_(quiz_ids)
        )
        .all()
    ):
        question_counts[quiz_id] = (
            question_counts.get(quiz_id, 0) + 1
        )

    attempt_counts = {}

    for (quiz_id,) in (
        db.query(QuizAttempt.quiz_id)
        .filter(
            QuizAttempt.quiz_id.in_(quiz_ids)
        )
        .all()
    ):
        attempt_counts[quiz_id] = (
            attempt_counts.get(quiz_id, 0) + 1
        )

    # -----------------------------------------------------
    # Which document each quiz came from
    # -----------------------------------------------------
    #
    # A quiz can outlive its document, so a missing title
    # is normal and is returned as null rather than
    # dropping the quiz from the list.

    document_ids = [
        quiz.document_id
        for quiz in quizzes
        if quiz.document_id is not None
    ]

    document_titles = {}

    if document_ids:

        for document_id, title in (
            db.query(
                Document.id,
                Document.title,
            )
            .filter(
                Document.id.in_(document_ids)
            )
            .all()
        ):
            document_titles[document_id] = title

    # -----------------------------------------------------
    # Return
    # -----------------------------------------------------

    return {
        "quizzes": [
            {
                "id": str(quiz.id),

                "title": quiz.title,

                "is_pinned": quiz.is_pinned,

                "document_id": (
                    str(quiz.document_id)
                    if quiz.document_id
                    else None
                ),

                "document_title": document_titles.get(
                    quiz.document_id
                ),

                "questions_count": question_counts.get(
                    quiz.id, 0
                ),

                "attempts_count": attempt_counts.get(
                    quiz.id, 0
                ),

                "created_at": (
                    quiz.created_at.isoformat()
                    if quiz.created_at
                    else None
                ),
            }
            for quiz in quizzes
        ]
    }

# =========================================================
# GET QUIZ
# =========================================================

@app.get("/quizzes/{quiz_id}")
def get_quiz(
    quiz_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a quiz and its questions.

    IMPORTANT:

    correct_answer and explanation are NOT returned
    because they must remain hidden from the student
    until the quiz is submitted.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:

        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.quiz_id == quiz.id
        )
        .order_by(
            QuizQuestion.question_index
        )
        .all()
    )

    return {
        "quiz": {
            "id": quiz.id,
            "title": quiz.title,
            "document_id": quiz.document_id,
            "created_at": quiz.created_at,
        },

        "questions": [
            QuizQuestionResponse.model_validate(
                question
            )
            for question in questions
        ],
    }


# =========================================================
# SUBMIT QUIZ ATTEMPT
# =========================================================

@app.post(
    "/quizzes/{quiz_id}/attempts"
)
def submit_quiz_attempt(
    quiz_id: UUID,
    attempt_data: QuizAttemptRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Submit answers and calculate the final score.

    Multiple choice and true/false are compared as
    strings, which is what they are: one letter, or
    "true" / "false".

    Short answers are not. The stored correct answers
    average 16.9 words and only 2 of 24 are three words
    or shorter, so string comparison marked a student
    who was right in their own words as wrong. Those are
    graded by meaning instead, and can come back
    "partial": one true part of a multi-part answer.
    A partial answer earns the mark and the student is
    told what was missing.

    Grading is one small model call per short answer, so
    the answers are graded concurrently rather than one
    after another.
    """

    # -----------------------------------------------------
    # How long it took
    # -----------------------------------------------------
    #
    # Checked before anything else is done, so a nonsense
    # duration costs nothing: rejecting it after grading would
    # mean paying for the model calls and then throwing the
    # attempt away.
    #
    # The number is measured in the browser and cannot be
    # trusted, only bounded. A negative duration or one longer
    # than a day did not happen, so it is refused rather than
    # written into the table as a fact.

    duration_seconds = attempt_data.duration_seconds

    if duration_seconds is not None:

        if (
            duration_seconds < 0
            or duration_seconds > MAX_ATTEMPT_DURATION_SECONDS
        ):

            raise HTTPException(
                status_code=400,
                detail=(
                    "duration_seconds must be between 0 and "
                    f"{MAX_ATTEMPT_DURATION_SECONDS}"
                ),
            )

    # -----------------------------------------------------
    # Find quiz
    # -----------------------------------------------------

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:

        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    # -----------------------------------------------------
    # Get questions
    # -----------------------------------------------------

    questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.quiz_id == quiz.id
        )
        .all()
    )

    if not questions:

        raise HTTPException(
            status_code=400,
            detail="This quiz has no questions.",
        )

    # -----------------------------------------------------
    # Validate answers
    # -----------------------------------------------------

    submitted_answers = (
        attempt_data.answers
    )

    total_questions = len(questions)

    results = []

    # -----------------------------------------------------
    # Grade the short answers, concurrently
    # -----------------------------------------------------
    #
    # Everything the grader needs is pulled out of the ORM
    # objects first, so nothing touches the database from
    # inside a worker thread.

    to_grade = []

    for question in questions:

        if question.question_type != "short_answer":
            continue

        student_answer = submitted_answers.get(
            str(question.id)
        )

        if student_answer is None:
            continue

        if not str(student_answer).strip():
            continue

        to_grade.append(
            (
                str(question.id),
                str(question.question_text),
                str(question.correct_answer),
                str(student_answer),
            )
        )

    grade_by_question_id = {}

    if to_grade:

        with ThreadPoolExecutor(
            max_workers=min(len(to_grade), 8)
        ) as pool:

            futures = {
                pool.submit(
                    grade_short_answer,
                    question_text,
                    correct_answer,
                    student_answer,
                ): question_id
                for (
                    question_id,
                    question_text,
                    correct_answer,
                    student_answer,
                ) in to_grade
            }

            for future in futures:

                question_id = futures[future]

                # grade_short_answer never raises - it falls
                # back to exact comparison on its own - so a
                # failure here would be a bug, not an outage.
                grade_by_question_id[question_id] = (
                    future.result()
                )

    # -----------------------------------------------------
    # Compare answers
    # -----------------------------------------------------

    correct_count = 0
    partial_count = 0

    for question in questions:

        question_id = str(
            question.id
        )

        student_answer = submitted_answers.get(
            question_id
        )

        grade = grade_by_question_id.get(
            question_id
        )

        if grade is not None:

            # A short answer that was graded. The student's
            # own text is kept exactly as they wrote it, so
            # the review screen shows their sentence rather
            # than an upper-cased version of it.
            student_answer = str(
                student_answer
            ).strip()

            verdict = grade["verdict"]
            reason = grade["reason"]

        else:

            if student_answer is not None:

                student_answer = str(
                    student_answer
                ).strip().upper()

            expected_answer = (
                str(
                    question.correct_answer
                )
                .strip()
                .upper()
            )

            verdict = (
                "correct"
                if student_answer == expected_answer
                else "incorrect"
            )

            reason = ""

        if verdict == "correct":
            correct_count += 1

        elif verdict == "partial":
            partial_count += 1

        results.append(
            {
                "question_id": question_id,
                "student_answer": student_answer,

                # Kept so that anything reading only
                # `correct` still works. A partial answer
                # earned the mark, so it is true here.
                "correct": verdict in {"correct", "partial"},

                "verdict": verdict,
                "reason": reason,

                # Sent here and nowhere else. GET
                # /quizzes/{id} deliberately omits these,
                # so before the student answers there is
                # nothing to read - not in the page, and
                # not in the network response behind it.
                "correct_answer": str(
                    question.correct_answer
                ),

                "explanation": question.explanation or "",
            }
        )

    # -----------------------------------------------------
    # Calculate percentage
    # -----------------------------------------------------

    score = correct_count + partial_count

    percentage = round(
        (score / total_questions) * 100,
        2,
    )

    # -----------------------------------------------------
    # Save attempt
    # -----------------------------------------------------

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        score=score,
        answers=submitted_answers,
        duration_seconds=duration_seconds,
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # -----------------------------------------------------
    # Return final result
    # -----------------------------------------------------

    return {
        "message": "Quiz attempt submitted successfully",

        "attempt_id": str(
            attempt.id
        ),

        "score": score,

        "total_questions": total_questions,

        "percentage": percentage,

        "correct_answers": correct_count,

        "partial_answers": partial_count,

        "wrong_answers": (
            total_questions
            - correct_count
            - partial_count
        ),

        "results": results,
    }

# =========================================================
# LIST QUIZ ATTEMPTS
# =========================================================

@app.get(
    "/quizzes/{quiz_id}/attempts"
)
def list_quiz_attempts(
    quiz_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Every attempt this user has made at this quiz,
    newest first.

    Only the score is available. The per-question
    verdicts are worked out at submission time and sent
    to the browser, but never stored, so a past attempt
    can show what was scored and not which questions
    were missed.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:

        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    # -----------------------------------------------------
    # How many questions the quiz has
    # -----------------------------------------------------
    #
    # Questions are written once when the quiz is created
    # and never change, so today's count is also the count
    # every past attempt was scored against.

    total_questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.quiz_id == quiz.id
        )
        .count()
    )

    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.user_id == current_user.id,
        )
        .order_by(
            QuizAttempt.completed_at.desc()
        )
        .all()
    )

    return {
        "total_questions": total_questions,

        "attempts": [
            {
                "id": str(attempt.id),

                "score": attempt.score,

                "total_questions": total_questions,

                "percentage": (
                    round(
                        (attempt.score / total_questions) * 100,
                        2,
                    )
                    if total_questions
                    else None
                ),

                "completed_at": (
                    attempt.completed_at.isoformat()
                    if attempt.completed_at
                    else None
                ),

                # None for every attempt recorded before the
                # timer existed. The browser shows a dash for
                # those rather than a misleading 00:00.
                "duration_seconds": attempt.duration_seconds,
            }
            for attempt in attempts
        ],
    }
# =========================================================
# GET ONE QUIZ ATTEMPT
# =========================================================

@app.get(
    "/quizzes/{quiz_id}/attempts/{attempt_id}"
)
def get_quiz_attempt(
    quiz_id: UUID,
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    One past attempt, question by question: what was asked,
    what the student wrote, and what the correct answer was.

    The verdicts are not stored, so they are worked out again
    here - but only where that costs nothing and cannot
    disagree with the original marking. Multiple choice and
    true/false are string comparisons, exactly as they were at
    submission time, so re-running them is deterministic.

    Short answers were marked by the model on meaning. Marking
    them again would be a paid call per question and could
    return a different verdict from the one the student saw,
    so `verdict` is null for them and both answers are shown
    side by side instead.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:

        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.id == attempt_id,
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.user_id == current_user.id,
        )
        .first()
    )

    if not attempt:

        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    questions = (
        db.query(QuizQuestion)
        .filter(
            QuizQuestion.quiz_id == quiz.id
        )
        .order_by(
            QuizQuestion.question_index
        )
        .all()
    )

    submitted_answers = attempt.answers or {}

    total_questions = len(questions)

    rows = []

    for question in questions:

        student_answer = submitted_answers.get(
            str(question.id)
        )

        # -------------------------------------------------
        # Re-mark only what can be re-marked for free
        # -------------------------------------------------

        verdict = None

        if question.question_type in {
            "multiple_choice",
            "true_false",
        }:

            if (
                student_answer is None
                or not str(student_answer).strip()
            ):

                verdict = "incorrect"

            else:

                verdict = (
                    "correct"
                    if str(student_answer).strip().upper()
                    == str(question.correct_answer).strip().upper()
                    else "incorrect"
                )

        rows.append(
            {
                "id": str(question.id),

                "question_index": question.question_index,

                "question_text": question.question_text,

                "question_type": question.question_type,

                "options": question.options,

                "student_answer": student_answer,

                "correct_answer": str(
                    question.correct_answer
                ),

                "explanation": question.explanation or "",

                "source_page": question.source_page,

                "verdict": verdict,
            }
        )

    return {
        "attempt": {
            "id": str(attempt.id),

            "score": attempt.score,

            "total_questions": total_questions,

            "percentage": (
                round(
                    (attempt.score / total_questions) * 100,
                    2,
                )
                if total_questions
                else None
            ),

            "completed_at": (
                attempt.completed_at.isoformat()
                if attempt.completed_at
                else None
            ),

            # Same as the list endpoint, so a caller reading one
            # attempt sees the field it already knows from the
            # table it clicked through from.
            "duration_seconds": attempt.duration_seconds,
        },

        "questions": rows,
    }


# =========================================================
# DELETE ONE QUIZ ATTEMPT
# =========================================================

@app.delete(
    "/quizzes/{quiz_id}/attempts/{attempt_id}"
)
def delete_quiz_attempt(
    quiz_id: UUID,
    attempt_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Remove one attempt from a quiz's history, permanently.

    OWNERSHIP IS CHECKED TWICE, and neither check trusts the
    URL. The quiz is loaded by id AND user_id, so a quiz
    belonging to somebody else is never found; the attempt is
    then loaded by id AND that quiz's id AND user_id, so an
    attempt id lifted from another account cannot be reached
    through a quiz this account does own. Both user_id values
    come from current_user, which came from the access token.

    The two 404s say "not found" rather than "not yours" on
    purpose: an attempt somebody else owns has to be
    indistinguishable from one that was never there, or the
    error message itself becomes a way to ask whether a given
    id exists.

    The row goes on its own. Nothing in the schema references
    quiz_attempts, so there is no cascade and nothing to order
    - and the quiz, its questions and every other attempt are
    untouched. The score and the answers stored on this row are
    the only record that the attempt happened, so the interface
    asks before calling this.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:

        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.id == attempt_id,
            QuizAttempt.quiz_id == quiz.id,
            QuizAttempt.user_id == current_user.id,
        )
        .first()
    )

    if not attempt:

        raise HTTPException(
            status_code=404,
            detail="Attempt not found",
        )

    db.delete(attempt)
    db.commit()

    return {
        "message": "Attempt deleted successfully"
    }


# =========================================================
# UPDATE QUIZ - RENAME OR PIN
# =========================================================

@app.patch(
    "/quizzes/{quiz_id}"
)
def update_quiz(
    quiz_id: UUID,
    update_data: QuizUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Rename a quiz, pin it, or both.

    PATCH rather than PUT: only the fields being changed are
    sent. The questions, the document they came from and every
    recorded attempt are neither sent nor replaced, so this is
    not a full representation of the quiz and PUT would claim it
    was.

    The two fields arrive independently - the pin control has no
    reason to know the title, and the rename form has no reason
    to know the pin - so either may be omitted.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    # -----------------------------------------------------
    # What was actually sent
    # -----------------------------------------------------
    #
    # A PATCH with neither field is refused rather than quietly
    # succeeding. It cannot be what the caller meant, and a 200
    # for it would hide the bug that produced it.

    if (
        update_data.title is None
        and update_data.is_pinned is None
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Send a title, is_pinned, or both"
            ),
        )

    if update_data.title is not None:

        new_title = update_data.title.strip()

        if not new_title:
            raise HTTPException(
                status_code=400,
                detail="Title cannot be empty",
            )

        quiz.title = new_title

    if update_data.is_pinned is not None:
        quiz.is_pinned = update_data.is_pinned

    db.commit()
    db.refresh(quiz)

    return {
        "message": "Quiz updated successfully",
        "quiz": {
            "id": str(quiz.id),
            "title": quiz.title,
            "is_pinned": quiz.is_pinned,
        },
    }


# =========================================================
# DELETE QUIZ
# =========================================================

@app.delete(
    "/quizzes/{quiz_id}"
)
def delete_quiz(
    quiz_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a quiz, its questions, and every attempt
    recorded against it.

    The attempts go too, and they are the only record of
    what the student scored - so this is not undoable and
    the interface asks before calling it.
    """

    quiz = (
        db.query(Quiz)
        .filter(
            Quiz.id == quiz_id,
            Quiz.user_id == current_user.id,
        )
        .first()
    )

    if not quiz:
        raise HTTPException(
            status_code=404,
            detail="Quiz not found",
        )

    db.delete(quiz)
    db.commit()

    return {
        "message": "Quiz deleted successfully"
    }


# =========================================================
# CONTACT - SEND A MESSAGE
# =========================================================

@app.post(
    "/contact",
    response_model=ContactResponse,
    status_code=201,
)
def send_contact_message(
    contact_data: ContactRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Store a message from a signed-in student, then queue an
    email about it.

    THE ORDER IS THE DESIGN. The row is written and committed
    first and the request succeeds there; the email is a
    notification queued afterwards. Email delivery cannot be
    verified and cannot be relied on, so the database row is
    the record - a message whose email never goes out has
    still been received, and email_sent and email_error are
    how that failure leaves a trace instead of vanishing.

    Signed-in students only, which is what makes this safe
    without a CAPTCHA or a honeypot or any other spam
    machinery. The sender is a real account: the name and the
    address come from current_user rather than from the form,
    and neither can be forged.
    """

    # -----------------------------------------------------
    # The message itself
    # -----------------------------------------------------
    #
    # Trimmed first and then measured, so that a screenful of
    # spaces is an empty message rather than a long one, and
    # so the length rule is about what was actually written.
    # The trimmed text is what is stored, too: the leading
    # newlines a paste brings with it are not content.

    message = contact_data.message.strip()

    if not message:
        raise HTTPException(
            status_code=400,
            detail="Please write a message before sending.",
        )

    # len() over the Python string, which counts characters
    # and not bytes. An Arabic message is the same length here
    # as the student sees it; counting bytes would make the
    # same sentence roughly twice as long in Arabic as in
    # English and quietly hold Arabic to a shorter limit.
    if len(message) < MIN_CONTACT_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A message must be at least "
                f"{MIN_CONTACT_MESSAGE_LENGTH} characters long."
            ),
        )

    if len(message) > MAX_CONTACT_MESSAGE_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=(
                f"A message cannot be longer than "
                f"{MAX_CONTACT_MESSAGE_LENGTH} characters."
            ),
        )

    # -----------------------------------------------------
    # The rate limit
    # -----------------------------------------------------
    #
    # A COUNT over this account's rows in the last hour, and
    # nothing else: no package, and no counter held in memory.
    # An in-memory counter would be reset by every restart and
    # would be wrong the moment the app ran as more than one
    # process, while the rows are already there and are the
    # same rows whoever is asking.
    #
    # datetime.now(timezone.utc) rather than a naive now():
    # created_at is DateTime(timezone=True), and comparing an
    # aware column against a naive value is the kind of
    # mistake that works perfectly on a machine whose clock
    # happens to be set to UTC.

    window_start = (
        datetime.now(timezone.utc)
        - CONTACT_RATE_LIMIT_WINDOW
    )

    recent_message_count = (
        db.query(func.count(ContactMessage.id))
        .filter(
            ContactMessage.user_id == current_user.id,
            ContactMessage.created_at >= window_start,
        )
        .scalar()
    )

    if recent_message_count >= MAX_CONTACT_MESSAGES_PER_HOUR:

        # 429, and no row. A refused message is not a stored
        # message - counting it would mean the limit tightened
        # itself every time somebody hit it.
        #
        # The number is not in the sentence. The student needs
        # to know to wait, not to know where the line is, and
        # a number written here would be a second place for
        # MAX_CONTACT_MESSAGES_PER_HOUR to live and go stale.
        raise HTTPException(
            status_code=429,
            detail=(
                "You have sent several messages in the last "
                "hour. Please wait a while before sending "
                "another."
            ),
        )

    # -----------------------------------------------------
    # Store it - this is the part that matters
    # -----------------------------------------------------
    #
    # Committed before anything is queued. After this line the
    # message exists whatever happens next, and everything
    # below is a notification about a record that is already
    # safe.
    #
    # user_id and nothing else about the student: the name and
    # the address stay on the user row and are joined to when
    # the email is built.

    contact_message = ContactMessage(
        user_id=current_user.id,
        message=message,
    )

    db.add(contact_message)
    db.commit()
    db.refresh(contact_message)

    # -----------------------------------------------------
    # Then tell somebody
    # -----------------------------------------------------
    #
    # The same BackgroundTasks the upload endpoint uses, and
    # the id alone for the same reason: the task runs after
    # the response has gone out and opens its own session.
    #
    # A background task rather than an inline send, because an
    # SMTP handshake is a network round trip to Gmail and the
    # student would otherwise sit and watch a spinner for it -
    # waiting on something that has no bearing on whether
    # their message was received.

    background_tasks.add_task(
        send_contact_email,
        contact_message.id,
    )

    return contact_message
