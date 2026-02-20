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

export async function uploadEventSickNote(eventId, file) {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);

  const res = await fetch(`${API_BASE}/events/${eventId}/sick-note`, {
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

export async function deleteUser(userId) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/users/${userId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

// Leave balance (optional as_of=YYYY-MM-DD)
export function getLeaveBalance(asOfYYYYMMDD) {
  const qs = asOfYYYYMMDD ? `?as_of=${encodeURIComponent(asOfYYYYMMDD)}` : "";
  return request(`/leave/balance${qs}`);
}

export function adminGetUserLeaveBalance(userId, asOfYYYYMMDD) {
  const qs = asOfYYYYMMDD ? `?as_of=${encodeURIComponent(asOfYYYYMMDD)}` : "";
  return request(`/admin/users/${userId}/leave/balance${qs}`);
}

// WebSocket URL helper
export function getWsUrl() {
  const token = (getToken() || "").trim();
  if (!token) return null;
  if (IS_ABSOLUTE_API_BASE) {
    const u = new URL(API_BASE);
    const proto = u.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${u.host}/ws?token=${encodeURIComponent(token)}`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
}

export function listLibraryDocuments(category = "") {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  return request(`/library/documents${qs}`);
}

export function listLibraryCategories() {
  return request("/library/categories");
}

export function createLibraryCategory(name) {
  return request("/library/categories", {
    method: "POST",
    body: { name },
  });
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

export function listTaskYears() {
  return request("/task-manager/years");
}

export function listTaskClients(year) {
  const qs = typeof year === "number" ? `?year=${encodeURIComponent(String(year))}` : "";
  return request(`/task-manager/clients${qs}`);
}

export function createTaskClient(name, reimbursementAmount = 0) {
  return request("/task-manager/clients", {
    method: "POST",
    body: { name, reimbursement_amount: Number(reimbursementAmount || 0) },
  });
}

export function updateTaskClient(clientId, reimbursementAmount) {
  return request(`/task-manager/clients/${clientId}`, {
    method: "PATCH",
    body: { reimbursement_amount: Number(reimbursementAmount) },
  });
}

export function listClientTasks({ year, clientId, quarter }) {
  const qs = new URLSearchParams({
    year: String(year),
    client_id: String(clientId),
  });
  if (quarter) qs.set("quarter", String(quarter));
  return request(`/task-manager/tasks?${qs.toString()}`);
}

export function createClientTask(payload) {
  return request("/task-manager/tasks", { method: "POST", body: payload });
}

export function updateClientTask(taskId, payload) {
  return request(`/task-manager/tasks/${taskId}`, { method: "PATCH", body: payload });
}

export async function deleteClientTask(taskId) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/task-manager/tasks/${taskId}`, {
    method: "DELETE",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

export function listDashboardOverview() {
  return request("/dashboard/overview");
}

export function createTodayActivity(activity) {
  return request("/dashboard/activities/today", {
    method: "POST",
    body: { activity },
  });
}

export function updateTodayActivity(activityId, completed) {
  return request(`/dashboard/activities/${activityId}`, {
    method: "PATCH",
    body: { completed: !!completed },
  });
}

export function listTodoHistory(filters = {}) {
  const qs = new URLSearchParams();
  if (filters.start_date) qs.set("start_date", filters.start_date);
  if (filters.end_date) qs.set("end_date", filters.end_date);
  if (filters.user_id) qs.set("user_id", String(filters.user_id));
  if (filters.user_query) qs.set("user_query", String(filters.user_query));
  if (filters.days) qs.set("days", String(filters.days));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return request(`/dashboard/activities/history${suffix}`);
}

export function getCashReimbursementDraft() {
  return request("/finance/reimbursements/draft");
}

export function saveCashReimbursementDraft(manualItems) {
  return request("/finance/reimbursements/draft", {
    method: "POST",
    body: { manual_items: manualItems || [] },
  });
}

export function submitCashReimbursement(manualItems) {
  return request("/finance/reimbursements/submit", {
    method: "POST",
    body: { manual_items: manualItems || [] },
  });
}

export function listMyCashReimbursements() {
  return request("/finance/reimbursements/my");
}

export function listPendingCashReimbursements() {
  return request("/finance/reimbursements/pending");
}

export function listApprovedCashReimbursements() {
  return request("/finance/reimbursements/approved");
}

export function decideCashReimbursement(requestId, approve, comment) {
  return request(`/finance/reimbursements/${requestId}/decision`, {
    method: "POST",
    body: { approve: !!approve, comment: comment || null },
  });
}

export function markCashReimbursed(requestId) {
  return request(`/finance/reimbursements/${requestId}/reimburse`, {
    method: "POST",
    body: {},
  });
}

export function submitCashRequisition(payload) {
  return request("/finance/requisitions", { method: "POST", body: payload });
}

export function listMyCashRequisitions() {
  return request("/finance/requisitions/my");
}

export function listPendingCashRequisitions() {
  return request("/finance/requisitions/pending");
}

export function listApprovedCashRequisitions() {
  return request("/finance/requisitions/approved");
}

export function decideCashRequisition(requestId, approve, comment) {
  return request(`/finance/requisitions/${requestId}/decision`, {
    method: "POST",
    body: { approve: !!approve, comment: comment || null },
  });
}

export function markCashRequisitionDisbursed(requestId, note) {
  return request(`/finance/requisitions/${requestId}/disburse`, {
    method: "POST",
    body: { note: note || null },
  });
}

export function submitAuthorityToIncurRequest(payload) {
  return request("/finance/authority-to-incur", { method: "POST", body: payload });
}

export function listMyAuthorityToIncurRequests() {
  return request("/finance/authority-to-incur/my");
}

export function listPendingAuthorityToIncurRequests() {
  return request("/finance/authority-to-incur/pending");
}

export function listApprovedAuthorityToIncurRequests() {
  return request("/finance/authority-to-incur/approved");
}

export function decideAuthorityToIncurRequest(requestId, approve, comment) {
  return request(`/finance/authority-to-incur/${requestId}/decision`, {
    method: "POST",
    body: { approve: !!approve, comment: comment || null },
  });
}

export function markAuthorityToIncurIncurred(requestId, note) {
  return request(`/finance/authority-to-incur/${requestId}/incur`, {
    method: "POST",
    body: { note: note || null },
  });
}

export function submitSalaryAdvanceRequest(payload) {
  return request("/finance/salary-advances", { method: "POST", body: payload });
}

export function listMySalaryAdvanceRequests() {
  return request("/finance/salary-advances/my");
}

export function listPendingSalaryAdvanceRequests() {
  return request("/finance/salary-advances/pending");
}

export function listApprovedSalaryAdvanceRequests() {
  return request("/finance/salary-advances/approved");
}

export function decideSalaryAdvanceRequest(requestId, approve, comment) {
  return request(`/finance/salary-advances/${requestId}/decision`, {
    method: "POST",
    body: { approve: !!approve, comment: comment || null },
  });
}

export function markSalaryAdvanceDisbursed(requestId, note) {
  return request(`/finance/salary-advances/${requestId}/disburse`, {
    method: "POST",
    body: { note: note || null },
  });
}

export async function setSalaryAdvanceDeductionStart(requestId, deductionStartDate) {
  const token = getToken();
  const form = new FormData();
  form.append("deduction_start_date", deductionStartDate);
  const res = await fetch(`${API_BASE}/finance/salary-advances/${requestId}/deduction-start`, {
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

