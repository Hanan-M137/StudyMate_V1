import os

from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker


# =========================================================
# LOAD ENVIRONMENT VARIABLES
# =========================================================

load_dotenv()


# =========================================================
# DATABASE URL
# =========================================================

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. "
        "Please create a .env file and add DATABASE_URL."
    )


# =========================================================
# SQLALCHEMY ENGINE
# =========================================================

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
)


# =========================================================
# DATABASE SESSION
# =========================================================

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# =========================================================
# BASE CLASS
# =========================================================

Base = declarative_base()


# =========================================================
# DATABASE DEPENDENCY
# =========================================================

def get_db():
    """
    Create a database session for each request.

    The session is automatically closed
    after the request is completed.
    """

    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


# =========================================================
# INITIALIZE DATABASE
# =========================================================

def init_db():
    """
    Initialize PostgreSQL.

    1. Enable pgvector extension.
    2. Create all SQLAlchemy tables.

    Alembic should be used later for
    production database migrations.
    """

    # Import models so SQLAlchemy knows about all tables.
    from models import (
        User,
        Document,
        Chunk,
        Conversation,
        Message,
        Quiz,
        QuizQuestion,
        QuizAttempt,
    )

    # Enable pgvector extension.
    with engine.begin() as connection:
        connection.execute(
            text("CREATE EXTENSION IF NOT EXISTS vector")
        )

    # Create all tables.
    Base.metadata.create_all(
        bind=engine
    )