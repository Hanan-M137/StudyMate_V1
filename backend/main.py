import os
from uuid import UUID, uuid4

from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    UploadFile,
    File,
    BackgroundTasks,
)
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr

from .database import (
    init_db,
    get_db,
)

from .models import (
    User,
    Document,
    Conversation,
    Message,
    Quiz,
    QuizQuestion,
    QuizAttempt,
)

from .auth import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
)

# =========================================================
# AI / RAG
# =========================================================

from ai.service import process_document_background
from ai.rag_service import answer_question


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="StudyMate API",
    description="AI Study Assistant for University Students",
    version="1.0.0",
)


# =========================================================
# STARTUP
# =========================================================

@app.on_event("startup")
def startup():
    """
    Initialize database tables when the application starts.
    """

    init_db()


# =========================================================
# PYDANTIC SCHEMAS
# =========================================================

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str


class DocumentResponse(BaseModel):
    id: UUID
    title: str
    filename: str
    status: str

    class Config:
        from_attributes = True


class ChatRequest(BaseModel):
    document_id: UUID
    message: str
    conversation_id: UUID | None = None


class ChatResponse(BaseModel):
    conversation_id: UUID
    answer: str
    sources: list


class QuizCreateRequest(BaseModel):
    document_id: UUID
    title: str


class QuizAttemptRequest(BaseModel):
    answers: dict


# =========================================================
# QUIZ RESPONSE SCHEMAS
# =========================================================

class QuizQuestionResponse(BaseModel):
    id: UUID
    question_text: str
    question_type: str
    options: dict | list | None
    source_page: int | None

    class Config:
        from_attributes = True


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
    db: Session = Depends(get_db),
):
    """
    Register a new user.
    """

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

    user = User(
        email=user_data.email,
        password_hash=password_hash,
        full_name=user_data.full_name,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "User registered successfully",
        "user_id": str(user.id),
    }


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

    access_token = create_access_token(
        data={
            "sub": str(user.id)
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }


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
    Upload a PDF document.

    The document is first saved to disk and the database.
    RAG processing is then started as a background task.
    """

    # -----------------------------------------------------
    # Validate filename
    # -----------------------------------------------------

    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Filename is required",
        )

    # -----------------------------------------------------
    # Validate file type
    # -----------------------------------------------------

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=400,
            detail="Only PDF files are supported",
        )

    # -----------------------------------------------------
    # Create uploads directory
    # -----------------------------------------------------

    os.makedirs(
        "uploads",
        exist_ok=True,
    )

    # -----------------------------------------------------
    # Create safer filename
    # -----------------------------------------------------

    original_filename = file.filename

    safe_filename = (
        f"{uuid4()}_{original_filename}"
    )

    file_path = os.path.join(
        "uploads",
        safe_filename,
    )

    # -----------------------------------------------------
    # Save uploaded file
    # -----------------------------------------------------

    contents = await file.read()

    with open(
        file_path,
        "wb",
    ) as buffer:
        buffer.write(contents)

    # -----------------------------------------------------
    # Create database record
    # -----------------------------------------------------

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

    # -----------------------------------------------------
    # Start RAG document processing
    # -----------------------------------------------------

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

    Chunks, conversations and quizzes related
    to the document are also deleted through
    database cascade relationships.
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

    # -----------------------------------------------------
    # Delete physical file
    # -----------------------------------------------------

    if (
        document.file_path
        and os.path.exists(document.file_path)
    ):
        os.remove(document.file_path)

    # -----------------------------------------------------
    # Delete database record
    # -----------------------------------------------------

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

    Flow:

        Question
            ↓
        RAG
            ↓
        Vector Search
            ↓
        Relevant Chunks
            ↓
        Claude
            ↓
        Answer + Sources

    The user question and AI answer are also
    stored in the conversation history.
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
    # Verify document belongs to current user
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
    # Check document status
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
    # Get existing conversation
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
    # Create new conversation if needed
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
    # Save user message
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
    # Run RAG pipeline
    # -----------------------------------------------------

    try:

        rag_result = answer_question(
            db=db,
            document_id=document.id,
            question=chat_data.message,
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

        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the AI request.",
        ) from error

    # -----------------------------------------------------
    # Save AI response
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
    Get all conversations belonging to the current user.
    """

    conversations = (
        db.query(Conversation)
        .filter(
            Conversation.user_id == current_user.id
        )
        .order_by(Conversation.created_at.desc())
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
        .order_by(Message.created_at)
        .all()
    )

    return {
        "conversation": conversation,
        "messages": messages,
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
    Create a quiz for a document.

    AI quiz generation will be implemented separately.
    """

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

    quiz = Quiz(
        user_id=current_user.id,
        document_id=document.id,
        title=quiz_data.title,
    )

    db.add(quiz)
    db.commit()
    db.refresh(quiz)

    return {
        "message": "Quiz created",
        "quiz_id": str(quiz.id),
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

    Correct answers are NOT returned to the client.
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
            QuizQuestionResponse.model_validate(question)
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
    Submit answers for a quiz.

    Score calculation is still temporary.
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
    # TEMPORARY SCORE
    # -----------------------------------------------------

    score = 0

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=current_user.id,
        score=score,
        answers=attempt_data.answers,
    )

    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return {
        "message": "Quiz attempt submitted",
        "score": score,
        "attempt_id": str(attempt.id),
    }

