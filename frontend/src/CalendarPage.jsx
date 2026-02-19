import React, { useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  me,
  listUsers,
  listTaskClients,
  adminGetUserProfile,
  listEvents,
  createEvent,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  updateEvent,
  deleteEvent,
  getLeaveBalance,
  getWsUrl,
} from "./api";
import { useToast } from "./ToastProvider";
import Avatar from "./Avatar";

function typeLabel(t) {
  return t || "Unavailable";
}

function colorByType(type) {
  switch ((type || "").toLowerCase()) {
    case "leave":
      return "#2e7d32";
    case "hospital":
      return "#c62828";
    case "client visit":
      return "#6a1b9a";
    case "training":
      return "#ef6c00";
    default:
      return "#1565c0";
  }
}

function toLocalDateInput(d) {
  const x = new Date(d);
  const yyyy = x.getFullYear();
  const mm = String(x.getMonth() + 1).padStart(2, "0");
  const dd = String(x.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateTime(v) {
  if (!v) return "N/A";
  return new Date(v).toLocaleString();
}

function formatEventBoundary(v, allDay, isEnd = false) {
  if (!v) return "N/A";
  const d = new Date(v);
  if (allDay) {
    if (isEnd) d.setDate(d.getDate() - 1);
    return d.toLocaleDateString();
  }
  return d.toLocaleString();
}

function normalizeStatus(status) {
  const s = (status || "approved").toLowerCase();
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return "approved";
}

export default function CalendarPage() {
  const { showToast } = useToast();
  const [user, setUser] = useState(null);

  const [events, setEvents] = useState([]);
  const [range, setRange] = useState({ start: null, end: null });
  const [error, setError] = useState("");

  // Filtering
  const [users, setUsers] = useState([]);
  const [taskClients, setTaskClients] = useState([]);
  const [filters, setFilters] = useState({
    type: "",         // Leave/Hospital/...
    user_id: "",      // admin only
    department: "",   // admin only
  });

  const departments = useMemo(() => {
    const set = new Set();
    for (const u of users) if (u.department) set.add(u.department);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [users]);

  // WebSocket
  const wsRef = useRef(null);
  const reconnectRef = useRef({ tries: 0, timer: null });
  const [live, setLive] = useState(false);

  // Leave balance (shown when selecting Leave)
  const [leaveBalance, setLeaveBalance] = useState(null);
  const [dashboardBalance, setDashboardBalance] = useState(null);

  // event info popup
  const [popup, setPopup] = useState(null); // {x,y,apiEvent}
  const [popupApprovalConfig, setPopupApprovalConfig] = useState(null);

  // create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    startDate: "",
    endDate: "",
    allDay: true,
    type: "Leave",
    clientId: "",
    note: "",
  });

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    startDate: "",
    endDate: "",
    type: "Leave",
    clientId: "",
    note: "",
  });
  const minDate = useMemo(() => toLocalDateInput(new Date()), []);

  const popupLayout = useMemo(() => {
    if (!popup || typeof window === "undefined") return null;

    const margin = 12;
    const gutter = 10;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(360, Math.max(280, viewportWidth - margin * 2));
    const maxHeight = Math.max(220, viewportHeight - margin * 2);
    const estimatedHeight = Math.min(460, maxHeight);

    let left = popup.x + gutter;
    if (left + width > viewportWidth - margin) {
      left = popup.x - width - gutter;
    }
    left = Math.max(margin, Math.min(left, viewportWidth - width - margin));

    let top = popup.y + gutter;
    if (top + estimatedHeight > viewportHeight - margin) {
      top = popup.y - estimatedHeight - gutter;
    }
    top = Math.max(margin, Math.min(top, viewportHeight - estimatedHeight - margin));

    return { left, top, width, maxHeight };
  }, [popup]);

  async function loadMe() {
    const u = await me();
    setUser(u);
    try {
      const clients = await listTaskClients(new Date().getFullYear());
      setTaskClients(clients);
    } catch {
      setTaskClients([]);
    }
    try {
      const bal = await getLeaveBalance();
      setDashboardBalance(bal);
    } catch {
      setDashboardBalance(null);
    }

    // admin loads users list for filtering
    if (u.role === "admin" || u.role === "ceo") {
      const all = await listUsers();
      setUsers(all);
    } else {
      setUsers([]);
    }
  }

  async function loadEvents(startISO, endISO) {
    const f = {};
    if (filters.type) f.type = filters.type;
    if (user?.role === "admin") {
      if (filters.user_id) f.user_id = Number(filters.user_id);
      if (filters.department) f.department = filters.department;
    }

    const data = await listEvents(startISO, endISO, f);

    const mapped = data.map((e) => ({
      id: String(e.id),
      title: `${e.user.name} • ${typeLabel(e.type)}`,
      start: e.start_ts,
      end: e.end_ts,
      allDay: e.all_day,
      backgroundColor: colorByType(e.type),
      borderColor: colorByType(e.type),
      extendedProps: { api: e },
    }));

    setEvents(mapped);
  }

  async function refresh() {
    if (!range.start || !range.end) return;
    try {
      await loadEvents(range.start, range.end);
      const bal = await getLeaveBalance();
      setDashboardBalance(bal);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  // Leave balance helper (compute as-of start date to allow future accrual)
  async function refreshLeaveBalance(asOfYYYYMMDD) {
    try {
      const bal = await getLeaveBalance(asOfYYYYMMDD);
      setLeaveBalance(bal);
    } catch {
      setLeaveBalance(null);
    }
  }

  // WebSocket connect / reconnect
  function connectWs() {
    if (reconnectRef.current.timer) {
      clearTimeout(reconnectRef.current.timer);
      reconnectRef.current.timer = null;
    }

    try {
      const url = getWsUrl();
      if (!url) {
        setLive(false);
        return;
      }
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectRef.current.tries = 0;
        setLive(true);
      };

      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.type === "events_changed") {
            await refresh();
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        setLive(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        // Let onclose handle the reconnect
      };
    } catch {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    const tries = (reconnectRef.current.tries += 1);
    const delay = Math.min(10000, 500 * Math.pow(2, Math.min(tries, 5))); // up to 10s
    reconnectRef.current.timer = setTimeout(() => {
      const url = getWsUrl();
      if (!url) {
        setLive(false);
        return;
      }
      connectWs();
    }, delay);
  }

  useEffect(() => {
    loadMe().catch((e) => setError(String(e.message || e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start WebSocket once user is known
  useEffect(() => {
    if (!user) return;
    connectWs();
    return () => {
      if (reconnectRef.current.timer) clearTimeout(reconnectRef.current.timer);
      if (wsRef.current) wsRef.current.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Reload events when range or filters change
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.start, range.end, filters.type, filters.user_id, filters.department, user?.role]);

  function onDatesSet(arg) {
    setRange({ start: arg.startStr, end: arg.endStr });
  }

  function openCreateForDay(dateObj) {
    setPopup(null);
    setError("");

    const d = toLocalDateInput(dateObj);
    const next = {
      startDate: d,
      endDate: d,
      allDay: true,
      type: "Leave",
      clientId: "",
      note: "",
    };
    setForm(next);
    setCreateOpen(true);
    refreshLeaveBalance(d); // show leave balance by default in create modal
  }

  function onDateClick(info) {
    const clicked = toLocalDateInput(info.date);
    if (clicked < minDate) return;
    openCreateForDay(info.date);
  }

  function onEventClick(clickInfo) {
    const apiEvent = clickInfo.event.extendedProps.api;
    const jsEvent = clickInfo.jsEvent;
    setPopup({
      x: jsEvent.clientX,
      y: jsEvent.clientY,
      apiEvent,
    });
    loadPopupApprovalConfig(apiEvent);
  }

  async function loadPopupApprovalConfig(apiEvent) {
    setPopupApprovalConfig(null);
    if (!user || (user.role !== "admin" && user.role !== "ceo")) return;
    if ((apiEvent?.type || "").toLowerCase() !== "leave") return;
    try {
      const p = await adminGetUserProfile(apiEvent.user_id);
      setPopupApprovalConfig({
        requireTwoStep: !!p.require_two_step_leave_approval,
        firstApproverId: p.first_approver_id ?? null,
        secondApproverId: p.second_approver_id ?? null,
      });
    } catch {
      setPopupApprovalConfig(null);
    }
  }

  function approverLabel(id) {
    if (!id) return "Unassigned";
    const found = users.find((u) => u.id === id);
    return found ? `${found.name} (ID ${found.id})` : `Admin #${id}`;
  }

  function clientNameById(id) {
    const n = Number(id);
    if (!n) return "Unassigned";
    const found = taskClients.find((c) => Number(c.id) === n);
    return found ? found.name : `Client #${n}`;
  }

  const canEdit = useMemo(() => {
    if (!popup || !user) return false;
    if (user.role === "admin" || user.role === "ceo") return true;
    if (popup.apiEvent.user_id !== user.id) return false;

    const isLeave = (popup.apiEvent.type || "").toLowerCase() === "leave";
    const status = normalizeStatus(popup.apiEvent.status);
    if (user.role === "employee" && isLeave && (status === "approved" || status === "rejected")) {
      return false;
    }
    return true;
  }, [popup, user]);

  const canDelete = useMemo(() => {
    if (!popup || !user) return false;
    return user.role === "admin" || user.role === "ceo" || popup.apiEvent.user_id === user.id;
  }, [popup, user]);

  const canReviewLeave = useMemo(() => {
    if (!popup || !user) return false;
    return (
      (user.role === "admin" || user.role === "ceo") &&
      (popup.apiEvent.type || "").toLowerCase() === "leave" &&
      (popup.apiEvent.status || "").toLowerCase() === "pending"
    );
  }, [popup, user]);

  const popupStatus = useMemo(() => {
    if (!popup?.apiEvent) return "approved";
    return normalizeStatus(popup.apiEvent.status);
  }, [popup]);

  function openEditFromPopup() {
    if (!popup) return;
    setError("");

    const e = popup.apiEvent;

    const startD = toLocalDateInput(new Date(e.start_ts));
    const endDt = new Date(e.end_ts);
    endDt.setDate(endDt.getDate() - 1);
    const endD = toLocalDateInput(endDt);

    setEditForm({
      id: e.id,
      startDate: startD,
      endDate: endD,
      type: e.type || "Other",
      clientId: e.client_id ? String(e.client_id) : "",
      note: e.note || "",
    });
    setEditOpen(true);
    if ((e.type || "").toLowerCase() === "leave") refreshLeaveBalance(startD);
    else setLeaveBalance(null);
  }

  async function handleDelete() {
    if (!popup) return;
    if (!confirm("Delete this unavailability entry?")) return;
    try {
      await deleteEvent(popup.apiEvent.id);
      setPopup(null);
      // refresh will happen via WS; call anyway for immediate UI response
      await refresh();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleApproveLeave() {
    if (!popup) return;
    try {
      await approveLeaveRequest(popup.apiEvent.id);
      setPopup(null);
      await refresh();
      showToast("Leave approved", "success");
    } catch (e) {
      setError(String(e.message || e));
      showToast(String(e.message || e), "error");
    }
  }

  async function handleRejectLeave() {
    if (!popup) return;
    const reason = prompt("Reason for rejection (optional):") || "";
    try {
      await rejectLeaveRequest(popup.apiEvent.id, reason);
      setPopup(null);
      await refresh();
      showToast("Leave rejected", "success");
    } catch (e) {
      setError(String(e.message || e));
      showToast(String(e.message || e), "error");
    }
  }

  async function submitCreate() {
    setError("");

    if (!form.startDate || !form.endDate) {
      setError("Please select start and end date.");
      return;
    }
    if (form.startDate < minDate || form.endDate < minDate) {
      setError("Past dates are not allowed.");
      return;
    }

    const startISO = `${form.startDate}T00:00:00`;
    const end = new Date(form.endDate);
    end.setDate(end.getDate() + 1);
    const endISO = end.toISOString().slice(0, 19);
    const isClientVisit = (form.type || "").toLowerCase() === "client visit";
    if (isClientVisit && !form.clientId) {
      setError("Please choose a client for Client Visit.");
      return;
    }

    try {
      if ((form.type || "").toLowerCase() === "leave") {
        await createLeaveRequest({
          start_ts: startISO,
          end_ts: endISO,
          all_day: true,
          note: form.note || null,
        });
      } else {
        await createEvent({
          start_ts: startISO,
          end_ts: endISO,
          all_day: true,
          type: form.type,
          client_id: isClientVisit ? Number(form.clientId) : null,
          note: form.note || null,
        });
      }
      setCreateOpen(false);
      setLeaveBalance(null);
      await refresh();
      showToast("Entry created", "success");
    } catch (e) {
      setError(String(e.message || e));
      showToast(String(e.message || e), "error");
    }
  }

  async function submitEdit() {
    setError("");

    if (!editForm.startDate || !editForm.endDate) {
      setError("Please select start and end date.");
      return;
    }
    if (editForm.startDate < minDate || editForm.endDate < minDate) {
      setError("Past dates are not allowed.");
      return;
    }

    const startISO = `${editForm.startDate}T00:00:00`;
    const end = new Date(editForm.endDate);
    end.setDate(end.getDate() + 1);
    const endISO = end.toISOString().slice(0, 19);
    const isClientVisit = (editForm.type || "").toLowerCase() === "client visit";
    if (isClientVisit && !editForm.clientId) {
      setError("Please choose a client for Client Visit.");
      return;
    }

    try {
      await updateEvent(editForm.id, {
        start_ts: startISO,
        end_ts: endISO,
        all_day: true,
        type: editForm.type,
        client_id: isClientVisit ? Number(editForm.clientId) : null,
        note: editForm.note || null,
      });
      setEditOpen(false);
      setPopup(null);
      setLeaveBalance(null);
      await refresh();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  return (
    <>
      <div className="topbar calendar-topbar">
        <div>
          <h2 className="brand-title">SHR PLANNING CALENDAR</h2>
          <div className="brand-sub">
            Logged in as <b>{user ? user.name : "..."}</b> ({user ? user.role : "..."}) •{" "}
            {live ? <b>Live updates</b> : <span className="muted">Reconnecting…</span>}
          </div>
        </div>

        <div className="row">
          <button className="btn btn-primary" onClick={() => openCreateForDay(new Date())}>
            + Add Unavailability
          </button>
        </div>
      </div>

      <div className="page calendar-page">
        {error && (
          <div style={{ marginBottom: 10, color: "crimson", whiteSpace: "pre-wrap" }}>
            {error}
          </div>
        )}

        {dashboardBalance && (
          <div className="card" style={{ marginBottom: 14, background: "#f8fafc" }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>My Leave Balance</div>
            <div className="row">
              <div className="pill">Accrued: <b>{dashboardBalance.accrued}</b></div>
              <div className="pill">Used: <b>{dashboardBalance.used}</b></div>
              <div className="pill">Remaining: <b>{dashboardBalance.remaining}</b></div>
            </div>
            <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
              Period: {dashboardBalance.period_start} - {dashboardBalance.period_end}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Filters</div>
            <button
              className="btn"
              onClick={() => setFilters({ type: "", user_id: "", department: "" })}
            >
              Clear
            </button>
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <div className="field" style={{ flex: "1 1 220px" }}>
              <label>Event type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}
              >
                <option value="">All</option>
                <option value="Leave">Leave</option>
                <option value="Hospital">Hospital</option>
                <option value="Client Visit">Client Visit</option>
                <option value="Training">Training</option>
                <option value="Other">Other</option>
              </select>
            </div>

            {(user?.role === "admin" || user?.role === "ceo") && (
              <>
                <div className="field" style={{ flex: "1 1 260px" }}>
                  <label>User</label>
                  <select
                    value={filters.user_id}
                    onChange={(e) => setFilters((f) => ({ ...f, user_id: e.target.value }))}
                  >
                    <option value="">All</option>
                    {users.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name} (ID {u.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>Department</label>
                  <select
                    value={filters.department}
                    onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
                  >
                    <option value="">All</option>
                    {departments.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="legend">
          <span className="pill"><span className="dot" style={{ background: "#2e7d32" }} /> Leave</span>
          <span className="pill"><span className="dot" style={{ background: "#dc2626" }} /> Pending Approval</span>
          <span className="pill"><span className="dot" style={{ background: "#c62828" }} /> Hospital</span>
          <span className="pill"><span className="dot" style={{ background: "#6a1b9a" }} /> Client Visit</span>
          <span className="pill"><span className="dot" style={{ background: "#ef6c00" }} /> Training</span>
          <span className="pill"><span className="dot" style={{ background: "#1565c0" }} /> Other</span>
        </div>

        <div className="card">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            height="auto"
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            events={events}
            validRange={{ start: minDate }}
            datesSet={onDatesSet}
            dateClick={onDateClick}
            eventClick={onEventClick}
            eventContent={(arg) => {
              const api = arg.event.extendedProps.api;
              const isPendingLeave =
                (api?.type || "").toLowerCase() === "leave" &&
                (api?.status || "").toLowerCase() === "pending";
              const label = `${api?.user?.name || "User"} • ${typeLabel(api?.type)}`;
              return (
                <div className="event-chip">
                  <Avatar
                    name={api?.user?.name}
                    url={api?.user?.avatar_url}
                    size={18}
                    className="event-avatar"
                  />
                  {isPendingLeave && <span className="pending-dot" title="Pending approval" />}
                  <div className="event-text" title={label}>{label}</div>
                </div>
              );
            }}
          />
        </div>

        {/* Details popup */}
        {popup && popupLayout && (
          <div
            className="calendar-event-popup"
            style={{
              left: popupLayout.left,
              top: popupLayout.top,
              width: popupLayout.width,
              maxHeight: popupLayout.maxHeight,
            }}
          >
            <div className="calendar-popup-header">
              <Avatar
                name={popup.apiEvent.user?.name}
                url={popup.apiEvent.user?.avatar_url}
                size={48}
              />
              <div className="calendar-popup-header-text">
                <div className="calendar-popup-title">{popup.apiEvent.user.name}</div>
                <div className="calendar-popup-type">{typeLabel(popup.apiEvent.type)}</div>
              </div>
              <span className={`calendar-status-pill status-${popupStatus}`}>
                {popupStatus}
              </span>
            </div>

            <div className="calendar-popup-body">
              <div className="calendar-popup-field">
                <div className="calendar-popup-label">From</div>
                <div className="calendar-popup-value">
                  {formatEventBoundary(popup.apiEvent.start_ts, popup.apiEvent.all_day, false)}
                </div>
              </div>
              <div className="calendar-popup-field">
                <div className="calendar-popup-label">To</div>
                <div className="calendar-popup-value">
                  {formatEventBoundary(popup.apiEvent.end_ts, popup.apiEvent.all_day, true)}
                </div>
              </div>
              {(popup.apiEvent.type || "").toLowerCase() === "client visit" && (
                <div className="calendar-popup-field">
                  <div className="calendar-popup-label">Client</div>
                  <div className="calendar-popup-value">{clientNameById(popup.apiEvent.client_id)}</div>
                </div>
              )}
              {popup.apiEvent.rejection_reason && (
                <div className="calendar-popup-field">
                  <div className="calendar-popup-label">Rejection reason</div>
                  <div className="calendar-popup-value">{popup.apiEvent.rejection_reason}</div>
                </div>
              )}
              {popup.apiEvent.note && (
                <div className="calendar-popup-field">
                  <div className="calendar-popup-label">Note</div>
                  <div className="calendar-popup-value">{popup.apiEvent.note}</div>
                </div>
              )}
            </div>

            <div className="calendar-popup-actions">
              <button className="btn" onClick={() => { setPopup(null); setPopupApprovalConfig(null); }}>Close</button>

              <div className="calendar-popup-action-group">
                {canReviewLeave && (
                  <>
                    <button className="btn btn-primary" onClick={handleApproveLeave}>Approve</button>
                    <button className="btn btn-danger" onClick={handleRejectLeave}>Reject</button>
                  </>
                )}
                {canEdit && (
                  <button className="btn btn-primary" onClick={openEditFromPopup}>Edit</button>
                )}
                {canDelete && (
                  <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                )}
              </div>
            </div>

            {popupApprovalConfig?.requireTwoStep && (
              <div className="calendar-popup-approval">
                <div className="calendar-popup-approval-title">Two-step approval</div>
                <div className="calendar-popup-approval-item">
                  <div className="calendar-popup-approval-label">1st approver</div>
                  <div className="calendar-popup-approval-value">{approverLabel(popupApprovalConfig.firstApproverId)}</div>
                  <span className={`calendar-mini-status ${popup.apiEvent.first_approved_by_id ? "approved" : "pending"}`}>
                    {popup.apiEvent.first_approved_by_id ? "Approved" : "Pending"}
                  </span>
                </div>
                <div className="calendar-popup-approval-item">
                  <div className="calendar-popup-approval-label">2nd approver</div>
                  <div className="calendar-popup-approval-value">{approverLabel(popupApprovalConfig.secondApproverId)}</div>
                  <span className={`calendar-mini-status ${popup.apiEvent.second_approved_by_id ? "approved" : "pending"}`}>
                    {popup.apiEvent.second_approved_by_id ? "Approved" : "Pending"}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create modal */}
      {createOpen && (
        <div className="modal-overlay" onMouseDown={() => setCreateOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Add Unavailability</h3>
              <button className="btn" onClick={() => setCreateOpen(false)}>Close</button>
            </div>

            <div style={{ paddingTop: 10 }}>
              <div className="row">
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      setForm((f) => ({ ...f, type: t, clientId: t === "Client Visit" ? f.clientId : "" }));
                      if (t === "Leave" && form.startDate) refreshLeaveBalance(form.startDate);
                      else setLeaveBalance(null);
                    }}
                  >
                    <option>Leave</option>
                    <option>Hospital</option>
                    <option>Client Visit</option>
                    <option>Training</option>
                    <option>Other</option>
                  </select>
                </div>

                <div className="field" style={{ flex: "1 1 180px" }}>
                  <label>All day</label>
                  <select value="yes" disabled>
                    <option value="yes">Yes (recommended)</option>
                  </select>
                  <div className="helper">For v1 we store all entries as full-day blocks.</div>
                </div>
              </div>

              {form.type === "Client Visit" && (
                <div className="field">
                  <label>Client</label>
                  <select
                    value={form.clientId}
                    onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))}
                  >
                    <option value="">Select client</option>
                    {taskClients.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                  {!taskClients.length && (
                    <div className="helper">No clients found. Add clients in Client Task Manager first.</div>
                  )}
                </div>
              )}

              {/* Leave balance */}
              {form.type === "Leave" && leaveBalance && (
                <div className="card" style={{ marginBottom: 12, background: "#f8fafc" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Leave balance</div>
                  <div className="row">
                    <div className="pill">Accrued: <b>{leaveBalance.accrued}</b></div>
                    <div className="pill">Used: <b>{leaveBalance.used}</b></div>
                    <div className="pill">Remaining: <b>{leaveBalance.remaining}</b></div>
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Period: {leaveBalance.period_start} → {leaveBalance.period_end}
                  </div>
                </div>
              )}

              <div className="row">
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>Start date</label>
                  <input
                    type="date"
                    value={form.startDate}
                    min={minDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({ ...f, startDate: v }));
                      if (form.type === "Leave" && v) refreshLeaveBalance(v);
                    }}
                  />
                </div>

                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>End date</label>
                  <input
                    type="date"
                    value={form.endDate}
                    min={minDate}
                    onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="field">
                <label>Notes (visible to everyone)</label>
                <textarea
                  value={form.note}
                  onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g., Annual leave, Clinic appointment, Visiting client site…"
                />
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={() => setCreateOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={submitCreate}>Save</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editOpen && (
        <div className="modal-overlay" onMouseDown={() => setEditOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Edit Unavailability</h3>
              <button className="btn" onClick={() => setEditOpen(false)}>Close</button>
            </div>

            <div style={{ paddingTop: 10 }}>
              <div className="row">
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>Type</label>
                  <select
                    value={editForm.type}
                    onChange={(e) => {
                      const t = e.target.value;
                      setEditForm((f) => ({ ...f, type: t, clientId: t === "Client Visit" ? f.clientId : "" }));
                      if (t === "Leave" && editForm.startDate) refreshLeaveBalance(editForm.startDate);
                      else setLeaveBalance(null);
                    }}
                  >
                    <option>Leave</option>
                    <option>Hospital</option>
                    <option>Client Visit</option>
                    <option>Training</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              {editForm.type === "Client Visit" && (
                <div className="field">
                  <label>Client</label>
                  <select
                    value={editForm.clientId}
                    onChange={(e) => setEditForm((f) => ({ ...f, clientId: e.target.value }))}
                  >
                    <option value="">Select client</option>
                    {taskClients.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                  {!taskClients.length && (
                    <div className="helper">No clients found. Add clients in Client Task Manager first.</div>
                  )}
                </div>
              )}

              {editForm.type === "Leave" && leaveBalance && (
                <div className="card" style={{ marginBottom: 12, background: "#f8fafc" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Leave balance</div>
                  <div className="row">
                    <div className="pill">Accrued: <b>{leaveBalance.accrued}</b></div>
                    <div className="pill">Used: <b>{leaveBalance.used}</b></div>
                    <div className="pill">Remaining: <b>{leaveBalance.remaining}</b></div>
                  </div>
                  <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                    Period: {leaveBalance.period_start} → {leaveBalance.period_end}
                  </div>
                </div>
              )}

              <div className="row">
                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>Start date</label>
                  <input
                    type="date"
                    value={editForm.startDate}
                    min={minDate}
                    onChange={(e) => {
                      const v = e.target.value;
                      setEditForm((f) => ({ ...f, startDate: v }));
                      if (editForm.type === "Leave" && v) refreshLeaveBalance(v);
                    }}
                  />
                </div>

                <div className="field" style={{ flex: "1 1 240px" }}>
                  <label>End date</label>
                  <input
                    type="date"
                    value={editForm.endDate}
                    min={minDate}
                    onChange={(e) => setEditForm((f) => ({ ...f, endDate: e.target.value }))}
                  />
                </div>
              </div>

              <div className="field">
                <label>Notes (visible to everyone)</label>
                <textarea
                  value={editForm.note}
                  onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))}
                  placeholder="e.g., Updated reason…"
                />
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={() => setEditOpen(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={submitEdit}>Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

