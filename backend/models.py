import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector

from .database import Base


# =========================================================
# USER MODEL
# =========================================================

class User(Base):
    __tablename__ = "users"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    email = Column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash = Column(
        String(255),
        nullable=False,
    )

    full_name = Column(
        String(255),
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Whether this address has been proved to belong to whoever
    # registered it, by entering the code that was emailed to it.
    #
    # default=False applies to NEW ROWS ONLY. Every account that
    # existed before this column did is set to true by hand, with
    # the UPDATE that runs beside the ALTER - see the feature's
    # notes. Without that UPDATE every existing account would be
    # refused at login the moment verification was switched on,
    # including the test accounts on domains that will never
    # receive an email.
    #
    # The column does nothing at all while
    # REQUIRE_EMAIL_VERIFICATION is off: login does not read it
    # and registration does not set it to anything else.
    email_verified = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    # Every token carries the value this had when it was issued.
    # Signing out increases it, so every token minted before that
    # moment stops being accepted - on this device and on every
    # other one. See get_current_user in backend/auth.py.
    token_version = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    # Relationships
    documents = relationship(
        "Document",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    conversations = relationship(
        "Conversation",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    quizzes = relationship(
        "Quiz",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    quiz_attempts = relationship(
        "QuizAttempt",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    contact_messages = relationship(
        "ContactMessage",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    email_verifications = relationship(
        "EmailVerification",
        back_populates="user",
        cascade="all, delete-orphan",
    )


# =========================================================
# DOCUMENT MODEL
# =========================================================

class Document(Base):
    __tablename__ = "documents"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    title = Column(
        String(255),
        nullable=False,
    )

    filename = Column(
        String(255),
        nullable=False,
    )

    file_path = Column(
        Text,
        nullable=False,
    )

    page_count = Column(
        Integer,
        nullable=True,
    )

    status = Column(
        String(50),
        nullable=False,
        default="pending",
        server_default="pending",
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationships
    user = relationship(
        "User",
        back_populates="documents",
    )

    chunks = relationship(
        "Chunk",
        back_populates="document",
        cascade="all, delete-orphan",
    )

    conversations = relationship(
        "Conversation",
        back_populates="document",
        cascade="all, delete-orphan",
    )

    quizzes = relationship(
        "Quiz",
        back_populates="document",
        cascade="all, delete-orphan",
    )


# =========================================================
# CHUNK MODEL
# =========================================================

class Chunk(Base):
    __tablename__ = "chunks"

    __table_args__ = (
        Index(
            "ix_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={
                "embedding": "vector_cosine_ops",
            },
        ),
    )

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "documents.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    content = Column(
        Text,
        nullable=False,
    )

    page_number = Column(
        Integer,
        nullable=False,
    )

    chunk_index = Column(
        Integer,
        nullable=False,
    )

    embedding = Column(
        Vector(384),
        nullable=True,
    )

    # Relationship
    document = relationship(
        "Document",
        back_populates="chunks",
    )


# =========================================================
# CONVERSATION MODEL
# =========================================================

class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "documents.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    title = Column(
        String(255),
        nullable=False,
        default="New Conversation",
        server_default="New Conversation",
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # A pinned conversation is listed before the unpinned ones
    # inside its document's group, and nowhere else. The column
    # exists so that the pin survives a reload and reaches every
    # device - a pin kept in the browser is not a pin.
    is_pinned = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # Relationships
    user = relationship(
        "User",
        back_populates="conversations",
    )

    document = relationship(
        "Document",
        back_populates="conversations",
    )

    messages = relationship(
        "Message",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


# =========================================================
# MESSAGE MODEL
# =========================================================

class Message(Base):
    __tablename__ = "messages"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    conversation_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "conversations.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    role = Column(
        String(50),
        nullable=False,
    )

    content = Column(
        Text,
        nullable=False,
    )

    sources = Column(
        JSONB,
        nullable=False,
        default=list,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationship
    conversation = relationship(
        "Conversation",
        back_populates="messages",
    )


# =========================================================
# QUIZ MODEL
# =========================================================

class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    document_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "documents.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    title = Column(
        String(255),
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # The same idea as Conversation.is_pinned: pinned quizzes rise
    # to the top of the list they are already in, rather than
    # moving to a favourites page of their own.
    is_pinned = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    # Relationships
    user = relationship(
        "User",
        back_populates="quizzes",
    )

    document = relationship(
        "Document",
        back_populates="quizzes",
    )

    questions = relationship(
        "QuizQuestion",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )

    attempts = relationship(
        "QuizAttempt",
        back_populates="quiz",
        cascade="all, delete-orphan",
    )


# =========================================================
# QUIZ QUESTION MODEL
# =========================================================

class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "quizzes.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    question_index = Column(
        Integer,
        nullable=False,
    )

    question_text = Column(
        Text,
        nullable=False,
    )

    question_type = Column(
        String(50),
        nullable=False,
    )

    options = Column(
        JSONB,
        nullable=True,
    )

    correct_answer = Column(
        Text,
        nullable=False,
    )

    explanation = Column(
        Text,
        nullable=True,
    )

    source_page = Column(
        Integer,
        nullable=True,
    )

    # Relationship
    quiz = relationship(
        "Quiz",
        back_populates="questions",
    )


# =========================================================
# QUIZ ATTEMPT MODEL
# =========================================================

class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    quiz_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "quizzes.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    score = Column(
        Integer,
        nullable=False,
        default=0,
    )

    answers = Column(
        JSONB,
        nullable=False,
        default=dict,
    )

    completed_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # How long the student spent on this attempt, in seconds.
    #
    # nullable=True because every attempt recorded before this
    # column existed has no duration, and those rows must stay
    # valid rather than be invented a plausible-looking number.
    # The reading code shows a dash for them.
    #
    # The measurement is taken in the browser, so it is advisory:
    # a student who wants a better time can get one. That is
    # accepted deliberately - this is a self-study tool, not a
    # proctored exam - and it is why the value is stored as
    # information rather than used to score anything.
    duration_seconds = Column(
        Integer,
        nullable=True,
    )

    # Relationships
    quiz = relationship(
        "Quiz",
        back_populates="attempts",
    )

    user = relationship(
        "User",
        back_populates="quiz_attempts",
    )


# =========================================================
# CONTACT MESSAGE MODEL
# =========================================================

class ContactMessage(Base):
    """
    One message a signed-in student sent through the contact form.

    The row is the record and the email is a convenience. The
    endpoint writes this row and commits before it queues any
    notification, so a message whose email never goes out still
    exists and can still be read.

    The sender's name and address are deliberately NOT columns
    here. They live on the user row, this table joins to it, and
    a student who later corrects their name corrects it on every
    message they have ever sent rather than on none of them.
    """

    __tablename__ = "contact_messages"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    message = Column(
        Text,
        nullable=False,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # The two columns that make "stored first" worth anything.
    #
    # Without them a delivery failure would be invisible: the
    # student would be told the message was received, the row
    # would be there, and nobody would ever learn that the
    # notification did not arrive. email_sent stays False and
    # email_error holds the exception text, so the failures can
    # be listed with one query and answered by hand.
    #
    # email_error is nullable because the ordinary case is that
    # there is no error, and because a message whose email has
    # not been attempted yet is not a message that failed.
    email_sent = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    email_error = Column(
        Text,
        nullable=True,
    )

    # Relationship
    user = relationship(
        "User",
        back_populates="contact_messages",
    )


# =========================================================
# EMAIL VERIFICATION MODEL
# =========================================================

class EmailVerification(Base):
    """
    One six-digit code that was emailed to one account.

    A row per code issued rather than a column on the user row,
    because a code has a life of its own: it expires, it can be
    guessed at a bounded number of times, it is replaced when the
    student asks for a new one, and it is spent once it works.
    None of that fits in a column beside the password hash, and a
    row is also what lets the resend limit be a COUNT over the
    last hour the way the contact form's limit is.

    THE CODE ITSELF IS NOT HERE. Only its bcrypt hash is. The
    code is short-lived and worth little, but a database dump
    should not hand out working codes for accounts that have not
    been claimed yet, and hash_password was already in the
    project - so storing the hash cost nothing and storing the
    code would have been a decision to keep a secret in the
    clear.
    """

    __tablename__ = "email_verifications"

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Indexed, because every read of this table is "the newest
    # row for this user" and every one of them happens while
    # somebody is waiting on a sign-in screen.
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey(
            "users.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    code_hash = Column(
        String(255),
        nullable=False,
    )

    # Fifteen minutes after the row is written - see
    # VERIFICATION_CODE_MINUTES in backend/email_service.py,
    # which is also the number the email tells the student.
    #
    # timezone=True like every other timestamp in this file, so
    # the comparison against datetime.now(timezone.utc) is
    # between two aware values. Comparing an aware column with a
    # naive now() is the kind of mistake that works perfectly on
    # a machine whose clock happens to be set to UTC.
    expires_at = Column(
        DateTime(timezone=True),
        nullable=False,
    )

    # How many times a code has been offered for this row.
    #
    # This is what makes a six-digit code safe. One guess in a
    # million is only long odds if the number of guesses is
    # bounded; without this column an attacker with a script
    # would walk through the range in an afternoon.
    attempts = Column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
    )

    # When the code was spent, or killed.
    #
    # Nullable because the ordinary state of a fresh code is that
    # it has not been used. It is set on success, so a code that
    # worked cannot work twice; it is also set when the attempt
    # limit is passed and when a resend replaces the code, which
    # is how "invalidate the outstanding code" is written without
    # deleting the row somebody may later want to look at.
    used_at = Column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    # Relationship
    user = relationship(
        "User",
        back_populates="email_verifications",
    )
