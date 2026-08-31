const API_BASE_URL = "http://localhost:8000";

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

export function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}

export function saveRefreshToken(token) {
  localStorage.setItem("refresh_token", token);
}

export function removeRefreshToken() {
  localStorage.removeItem("refresh_token");
}

export function isAuthenticated() {
  // Either a valid access token or (at least) a refresh
  // token means the user has an active session. If only
  // the refresh token remains, authFetch() will silently
  // renew the access token on the next API call.
  return Boolean(getToken() || getRefreshToken());
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

// =========================================================
// TOKEN REFRESH
// =========================================================

// Shared in-flight promise so that if several requests
// hit a 401 at the same time, only ONE refresh call is
// made instead of one per request.
let refreshPromise = null;

async function refreshAccessToken() {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();

    if (!refreshToken) {
      throw new Error("No refresh token available.");
    }

    const response = await fetch(
      `${API_BASE_URL}/auth/refresh`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
        }),
      }
    );

    const data = await parseResponse(response);

    saveToken(data.access_token);
    saveRefreshToken(data.refresh_token);

    return data.access_token;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// =========================================================
// AUTHENTICATED FETCH WRAPPER
// =========================================================

// Replaces the old getAuthHeaders() pattern.
// Attaches the access token, and on a 401 response tries
// ONE silent refresh + retry before giving up.
async function authFetch(url, options = {}) {
  const token = getToken();

  if (!token) {
    throw new Error("You are not authenticated.");
  }

  let response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    let newAccessToken;

    try {
      newAccessToken = await refreshAccessToken();
    } catch {
      removeToken();
      removeRefreshToken();

      // Hard redirect: this file is not a React component,
      // so this is the simplest reliable way to send the
      // user back to the login page from anywhere.
      window.location.href = "/login";

      throw new Error(
        "Session expired. Please log in again."
      );
    }

    response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${newAccessToken}`,
      },
    });
  }

  return response;
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
  saveRefreshToken(data.refresh_token);

  return data;
}


export function logoutUser() {
  removeToken();
  removeRefreshToken();
}

// =========================================================
// DOCUMENTS
// =========================================================

export async function getDocuments() {
  const response = await authFetch(
    `${API_BASE_URL}/documents`,
    { method: "GET" }
  );

  return parseResponse(response);
}


export async function getDocument(documentId) {
  const response = await authFetch(
    `${API_BASE_URL}/documents/${documentId}`,
    { method: "GET" }
  );

  return parseResponse(response);
}


export async function uploadDocument(file) {
  const formData = new FormData();

  formData.append("file", file);

  const response = await authFetch(
    `${API_BASE_URL}/documents`,
    {
      method: "POST",
      body: formData,
    }
  );

  return parseResponse(response);
}


export async function deleteDocument(documentId) {
  const response = await authFetch(
    `${API_BASE_URL}/documents/${documentId}`,
    { method: "DELETE" }
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
  const response = await authFetch(
    `${API_BASE_URL}/chat`,
    {
      method: "POST",
      headers: {
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
  const response = await authFetch(
    `${API_BASE_URL}/conversations`,
    { method: "GET" }
  );

  return parseResponse(response);
}


export async function getConversation(conversationId) {
  const response = await authFetch(
    `${API_BASE_URL}/conversations/${conversationId}`,
    { method: "GET" }
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
  const response = await authFetch(
    `${API_BASE_URL}/quizzes`,
    {
      method: "POST",
      headers: {
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
  const response = await authFetch(
    `${API_BASE_URL}/quizzes/${quizId}`,
    { method: "GET" }
  );

  return parseResponse(response);
}


export async function submitQuizAttempt(
  quizId,
  answers
) {
  const response = await authFetch(
    `${API_BASE_URL}/quizzes/${quizId}/attempts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        answers,
      }),
    }
  );

  return parseResponse(response);
}