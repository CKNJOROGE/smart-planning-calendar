const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/$/, "");
const IS_ABSOLUTE_API_BASE = /^https?:\/\//i.test(API_BASE);

export function saveToken(token) {
  localStorage.setItem("token", token);
}

export function getToken() {
  return localStorage.getItem("token");
}

export function clearToken() {
  localStorage.removeItem("token");
}

export function resolveAvatarUrl(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("/") && IS_ABSOLUTE_API_BASE) return `${API_BASE}${url}`;
  if (url.startsWith("/")) return url;
  return url;
}

function resolveFileUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/") && IS_ABSOLUTE_API_BASE) return `${API_BASE}${url}`;
  return url;
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();

  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

export async function login(email, password) {
  const form = new URLSearchParams();
  form.append("username", email);
  form.append("password", password);

  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

export function me() {
  return request("/me");
}

export function listUsers() {
  return request("/users");
}

// filters: { type?, user_id?, department? }
export function listEvents(startISO, endISO, filters = {}) {
  const qs = new URLSearchParams({ start: startISO, end: endISO });
  if (filters.type) qs.set("type", filters.type);
  if (filters.user_id) qs.set("user_id", String(filters.user_id));
  if (filters.department) qs.set("department", filters.department);
  return request(`/events?${qs.toString()}`);
}

export function createEvent(payload) {
  return request("/events", { method: "POST", body: payload });
}

export function createLeaveRequest(payload) {
  return request("/leave/requests", { method: "POST", body: payload });
}

export function listLeaveRequests(filters = {}) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set("status", filters.status);
  if (filters.user_id) qs.set("user_id", String(filters.user_id));
  if (filters.start) qs.set("start", filters.start);
  if (filters.end) qs.set("end", filters.end);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/leave/requests${suffix}`);
}

export function approveLeaveRequest(id) {
  return request(`/leave/requests/${id}/approve`, { method: "POST", body: {} });
}

export function rejectLeaveRequest(id, reason) {
  return request(`/leave/requests/${id}/reject`, {
    method: "POST",
    body: { reason: reason || null },
  });
}

export function updateEvent(id, payload) {
  return request(`/events/${id}`, { method: "PATCH", body: payload });
}

export async function deleteEvent(id) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/events/${id}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export function getUserProfile(userId) {
  return request(`/users/${userId}/profile`);
}

export function updateUserProfile(userId, payload) {
  return request(`/users/${userId}/profile`, { method: "PATCH", body: payload });
}

export async function uploadMyAvatar(file) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/users/me/avatar`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

export async function uploadMyDocument(docType, file) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/users/me/documents/${encodeURIComponent(docType)}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

export function adminGetUserProfile(userId) {
  return request(`/admin/users/${userId}/profile`);
}

export function adminUpdateUserProfile(userId, payload) {
  return request(`/admin/users/${userId}/profile`, { method: "PATCH", body: payload });
}

export async function adminUploadUserDocument(userId, docType, file) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(
    `${API_BASE}/admin/users/${userId}/documents/${encodeURIComponent(docType)}`,
    {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  return res.json();
}

export function createUser(payload) {
  return request("/users", { method: "POST", body: payload });
}

// Leave balance (optional as_of=YYYY-MM-DD)
export function getLeaveBalance(asOfYYYYMMDD) {
  const qs = asOfYYYYMMDD ? `?as_of=${encodeURIComponent(asOfYYYYMMDD)}` : "";
  return request(`/leave/balance${qs}`);
}

// WebSocket URL helper
export function getWsUrl() {
  const token = getToken();
  if (IS_ABSOLUTE_API_BASE) {
    const u = new URL(API_BASE);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/ws?token=${encodeURIComponent(token || "")}`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token || "")}`;
}

export function listLibraryDocuments(category = "") {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/library/documents${qs}`);
}

export async function uploadLibraryDocument({ title, category, file }) {
  const token = getToken();
  const form = new FormData();
  form.append("title", title);
  form.append("category", category);
  form.append("file", file);

  const res = await fetch(`${API_BASE}/library/documents`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function deleteLibraryDocument(docId) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/library/documents/${docId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export async function openProtectedFile(url) {
  const token = getToken();
  const resolved = resolveFileUrl(url);
  if (!resolved) throw new Error("Missing file URL");

  const res = await fetch(resolved, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  const opened = window.open(blobUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.assign(blobUrl);
  }
  setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
}
