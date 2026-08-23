import uuid

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
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

    # Relationships
    quiz = relationship(
        "Quiz",
        back_populates="attempts",
    )

    user = relationship(
        "User",
        back_populates="quiz_attempts",
    )