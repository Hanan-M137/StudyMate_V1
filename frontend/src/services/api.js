const API_BASE_URL = "http://127.0.0.1:8000";

// =========================================================
// TOKEN MANAGEMENT
// =========================================================

export function getToken() {
  return localStorage.getItem("access_token");
}

export function saveToken(token) {
  localStorage.setItem("access_token", token);
}

export function removeToken() {
  localStorage.removeItem("access_token");
}

export function isAuthenticated() {
  return Boolean(getToken());
}

// =========================================================
// COMMON HELPERS
// =========================================================

async function parseResponse(response) {
  let data;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data?.detail ||
      `Request failed with status ${response.status}`;

    throw new Error(message);
  }

  return data;
}

function getAuthHeaders() {
  const token = getToken();

  if (!token) {
    throw new Error("You are not authenticated.");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// =========================================================
// AUTHENTICATION
// =========================================================

export async function registerUser(userData) {
  const response = await fetch(
    `${API_BASE_URL}/auth/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password,
        full_name: userData.full_name,
      }),
    }
  );

  return parseResponse(response);
}


export async function loginUser(email, password) {
  /*
    Backend uses OAuth2PasswordRequestForm.

    Therefore:
      username = email
      password = password

    Content-Type must be:
      application/x-www-form-urlencoded
  */

  const formData = new URLSearchParams();

  formData.append("username", email);
  formData.append("password", password);

  const response = await fetch(
    `${API_BASE_URL}/auth/login`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: formData,
    }
  );

  const data = await parseResponse(response);

  saveToken(data.access_token);

  return data;
}


export function logoutUser() {
  removeToken();
}

// =========================================================
// DOCUMENTS
// =========================================================

export async function getDocuments() {
  const response = await fetch(
    `${API_BASE_URL}/documents`,
    {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}


export async function getDocument(documentId) {
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}`,
    {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}


export async function uploadDocument(file) {
  const formData = new FormData();

  formData.append("file", file);

  /*
    Do NOT manually set Content-Type here.

    The browser automatically creates the correct
    multipart/form-data boundary for FormData.
  */

  const response = await fetch(
    `${API_BASE_URL}/documents`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
      },
      body: formData,
    }
  );

  return parseResponse(response);
}


export async function deleteDocument(documentId) {
  const response = await fetch(
    `${API_BASE_URL}/documents/${documentId}`,
    {
      method: "DELETE",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}

// =========================================================
// CHAT / RAG
// =========================================================

export async function sendChatMessage({
  documentId,
  message,
  conversationId = null,
}) {
  const response = await fetch(
    `${API_BASE_URL}/chat`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_id: documentId,
        message,
        conversation_id: conversationId,
      }),
    }
  );

  return parseResponse(response);
}


export async function getConversations() {
  const response = await fetch(
    `${API_BASE_URL}/conversations`,
    {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}


export async function getConversation(conversationId) {
  const response = await fetch(
    `${API_BASE_URL}/conversations/${conversationId}`,
    {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}

// =========================================================
// QUIZZES
// =========================================================

export async function createQuiz({
  documentId,
  title,
  numQuestions = 10,
  questionType = "multiple_choice",
}) {
  const response = await fetch(
    `${API_BASE_URL}/quizzes`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        document_id: documentId,
        title,
        num_questions: numQuestions,
        question_type: questionType,
      }),
    }
  );

  return parseResponse(response);
}


export async function getQuiz(quizId) {
  const response = await fetch(
    `${API_BASE_URL}/quizzes/${quizId}`,
    {
      method: "GET",
      headers: {
        ...getAuthHeaders(),
      },
    }
  );

  return parseResponse(response);
}


export async function submitQuizAttempt(
  quizId,
  answers
) {
  const response = await fetch(
    `${API_BASE_URL}/quizzes/${quizId}/attempts`,
    {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers,
      }),
    }
  );

  return parseResponse(response);
}