import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import {
  me,
  listUsers,
  listTaskClients,
  listEvents,
  createEvent,
  createLeaveRequest,
  approveLeaveRequest,
  rejectLeaveRequest,
  updateEvent,
  uploadEventSickNote,
  deleteEvent,
  getLeaveBalance,
  getWsUrl,
  openProtectedFile,
} from "./api";
import { useToast } from "./ToastProvider";
import Avatar from "./Avatar";

const PUBLIC_HOLIDAY_TYPE = "Public Holiday";

function typeLabel(t) {
  if ((t || "").toLowerCase() === "public holiday") return PUBLIC_HOLIDAY_TYPE;
  if ((t || "").toLowerCase() === "hospital") return "Sick Leave";
  return t || "Unavailable";
}

function colorByType(type) {
  switch ((type || "").toLowerCase()) {
    case "public holiday":
      return "#0f766e";
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

function holidayThemeFromName(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("jamhuri") || n.includes("mashujaa") || n.includes("madaraka")) return "national";
  if (n.includes("christmas") || n.includes("easter") || n.includes("good friday")) return "faith";
  if (n.includes("eid")) return "eid";
  if (n.includes("labour")) return "civic";
  if (n.includes("mazingira")) return "eco";
  return "default";
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

function formatExportBoundary(v, allDay, isEnd = false) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  if (allDay) {
    if (isEnd) d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function normalizeStatus(status) {
  const s = (status || "approved").toLowerCase();
  if (s === "pending" || s === "approved" || s === "rejected") return s;
  return "approved";
}

function toCsvCell(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
    return `"${s.replace(/"/g, "\"\"")}"`;
  }
  return s;
}

function makeUtcDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day));
}

function addUtcDays(d, days) {
  const copy = new Date(d.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function toYmdUtc(d) {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function easterSundayUtc(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return makeUtcDate(year, month, day);
}

function kenyaIslamicHolidayMap(year) {
  const map = {
    2025: { fitr: "2025-03-31", adha: "2025-06-06" },
    2026: { fitr: "2026-03-20", adha: "2026-05-27" },
    2027: { fitr: "2027-03-10", adha: "2027-05-17" },
    2028: { fitr: "2028-02-28", adha: "2028-05-05" },
    2029: { fitr: "2029-02-16", adha: "2029-04-24" },
    2030: { fitr: "2030-02-06", adha: "2030-04-13" },
  };
  return map[year] || null;
}

function buildKenyaPublicHolidays(year) {
  const easter = easterSundayUtc(year);
  const oct10Name = year >= 2025 ? "Mazingira Day" : "Huduma Day";
  const fixed = [
    { name: "New Year's Day", date: toYmdUtc(makeUtcDate(year, 1, 1)) },
    { name: "Labour Day", date: toYmdUtc(makeUtcDate(year, 5, 1)) },
    { name: "Madaraka Day", date: toYmdUtc(makeUtcDate(year, 6, 1)) },
    { name: oct10Name, date: toYmdUtc(makeUtcDate(year, 10, 10)) },
    { name: "Mashujaa Day", date: toYmdUtc(makeUtcDate(year, 10, 20)) },
    { name: "Jamhuri Day", date: toYmdUtc(makeUtcDate(year, 12, 12)) },
    { name: "Christmas Day", date: toYmdUtc(makeUtcDate(year, 12, 25)) },
    { name: "Boxing Day", date: toYmdUtc(makeUtcDate(year, 12, 26)) },
  ];
  const movable = [
    { name: "Good Friday", date: toYmdUtc(addUtcDays(easter, -2)) },
    { name: "Easter Monday", date: toYmdUtc(addUtcDays(easter, 1)) },
  ];
  const islamic = kenyaIslamicHolidayMap(year);
  if (islamic) {
    movable.push({ name: "Eid al-Fitr", date: islamic.fitr });
    movable.push({ name: "Eid al-Adha", date: islamic.adha });
  }

  const items = [...fixed, ...movable];
  const observed = [];
  for (const h of items) {
    const d = new Date(`${h.date}T00:00:00Z`);
    if (d.getUTCDay() === 0) {
      observed.push({
        name: `${h.name} (Observed)`,
        date: toYmdUtc(addUtcDays(d, 1)),
      });
    }
  }
  return [...items, ...observed].map((h) => ({
    ...h,
    theme: holidayThemeFromName(h.name),
  }));
}

function buildKenyaHolidayEntries(startISO, endISO) {
  const rangeStart = new Date(startISO);
  const rangeEnd = new Date(endISO);
  if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime())) return [];

  const startYear = rangeStart.getFullYear();
  const endYear = rangeEnd.getFullYear();
  const holidays = [];

  for (let year = startYear; year <= endYear; year += 1) {
    const annual = buildKenyaPublicHolidays(year);
    for (const h of annual) {
      const start = new Date(`${h.date}T00:00:00`);
      const end = addUtcDays(new Date(`${h.date}T00:00:00Z`), 1);
      if (start < rangeEnd && end > rangeStart) {
        const endDate = toYmdUtc(end);
        holidays.push({
          id: `holiday-${h.date}-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
          name: h.name,
          date: h.date,
          start: h.date,
          end: endDate,
          theme: h.theme || "default",
        });
      }
    }
  }
  return holidays;
}

function isPastCurrentDayEvent(apiEvent) {
  if (!apiEvent?.end_ts) return false;
  const end = new Date(apiEvent.end_ts);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end <= today;
}

function isLeaveLikeType(type) {
  return ["leave", "hospital"].includes((type || "").toLowerCase());
}

function getReviewBlockReason(apiEvent, currentUser) {
  if (!apiEvent || !currentUser) return "";
  const role = String(currentUser.role || "").toLowerCase();
  if (!["admin", "ceo", "supervisor"].includes(role)) return "";
  if (!["leave", "hospital"].includes((apiEvent.type || "").toLowerCase())) return "";
  if ((apiEvent.status || "").toLowerCase() !== "pending") return "";
  if (apiEvent.can_current_user_approve || apiEvent.can_current_user_reject) return "";

  const requiresTwoStep = !!apiEvent.require_two_step_leave_approval;
  const firstApproverId = apiEvent.first_approver_id ?? null;
  const secondApproverId = apiEvent.second_approver_id ?? null;
  const firstApproved = !!apiEvent.first_approved_by_id;

  if (requiresTwoStep) {
    if (firstApproverId == null || secondApproverId == null) {
      return "Approval setup is incomplete. Contact admin.";
    }
    if (currentUser.id === secondApproverId && !firstApproved) {
      return "Waiting for first approver.";
    }
    if (firstApproved && currentUser.id !== secondApproverId) {
      return "Waiting for assigned second approver.";
    }
    if (currentUser.id !== firstApproverId && currentUser.id !== secondApproverId) {
      return "You are not an assigned approver for this request.";
    }
    return "You cannot act on this request right now.";
  }

  if (firstApproverId != null || secondApproverId != null) {
    if (currentUser.id !== firstApproverId && currentUser.id !== secondApproverId) {
      return "You are not an assigned approver for this request.";
    }
  }
  return "You cannot act on this request right now.";
}

export default function CalendarPage() {
  const { showToast } = useToast();
  const [user, setUser] = useState(null);

  const [events, setEvents] = useState([]);
  const [holidayByDate, setHolidayByDate] = useState({});
  const [range, setRange] = useState({ start: null, end: null });
  const [error, setError] = useState("");

  // Filtering
  const [users, setUsers] = useState([]);
  const [taskClients, setTaskClients] = useState([]);
  const [filters, setFilters] = useState({
    type: "",         // Leave/Hospital/...
    user_id: "",      // admin only
    department: "",   // admin only
    start_date: "",
    end_date: "",
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
    clientSource: "managed",
    clientId: "",
    oneTimeClientName: "",
    note: "",
  });
  const [createSickNoteFile, setCreateSickNoteFile] = useState(null);

  // edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    id: null,
    startDate: "",
    endDate: "",
    type: "Leave",
    clientSource: "managed",
    clientId: "",
    oneTimeClientName: "",
    note: "",
  });
  const [editSickNoteFile, setEditSickNoteFile] = useState(null);
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
    if (filters.start_date && filters.end_date && filters.start_date > filters.end_date) {
      setError("Filter error: Start Date cannot be after End Date.");
      setEvents([]);
      setHolidayByDate({});
      return;
    }

    let queryStart = startISO;
    let queryEnd = endISO;
    if (filters.start_date) {
      queryStart = `${filters.start_date}T00:00:00`;
    }
    if (filters.end_date) {
      const d = new Date(`${filters.end_date}T00:00:00`);
      d.setDate(d.getDate() + 1);
      queryEnd = d.toISOString().slice(0, 19);
    }

    const f = {};
    if (filters.type && filters.type !== PUBLIC_HOLIDAY_TYPE) f.type = filters.type;
    if (user?.role === "admin") {
      if (filters.user_id) f.user_id = Number(filters.user_id);
      if (filters.department) f.department = filters.department;
    }

    const onlyHolidays = filters.type === PUBLIC_HOLIDAY_TYPE;
    const data = onlyHolidays ? [] : await listEvents(queryStart, queryEnd, f);

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

    const includePublicHolidays = !filters.type || filters.type === PUBLIC_HOLIDAY_TYPE;
    const holidayEntries = includePublicHolidays ? buildKenyaHolidayEntries(queryStart, queryEnd) : [];
    const holidayEvents = holidayEntries.map((h) => ({
      id: h.id,
      title: h.name,
      start: h.start,
      end: h.end,
      display: "background",
      allDay: true,
      classNames: ["fc-kenya-holiday-bg", `fc-kenya-holiday-theme-${h.theme || "default"}`],
      extendedProps: {
        holidayName: h.name,
        isHolidayBackground: true,
      },
      backgroundColor: colorByType(PUBLIC_HOLIDAY_TYPE),
    }));
    const holidayMap = {};
    for (const h of holidayEntries) {
      holidayMap[h.date] = { name: h.name, theme: h.theme || "default" };
    }
    setHolidayByDate(holidayMap);

    const combined = [...mapped, ...holidayEvents].sort(
      (a, b) => Number(new Date(a.start)) - Number(new Date(b.start))
    );
    setEvents(combined);
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

  const dayCellClassNames = useCallback((arg) => {
    const dayKey = toLocalDateInput(arg.date);
    const holiday = holidayByDate[dayKey];
    if (!holiday) return [];
    return ["fc-kenya-holiday-day", `fc-kenya-holiday-theme-${holiday.theme || "default"}`];
  }, [holidayByDate]);

  const dayCellDidMount = useCallback((arg) => {
    const dayKey = toLocalDateInput(arg.date);
    const holiday = holidayByDate[dayKey];
    const host = arg.el.querySelector(".fc-daygrid-day-frame") || arg.el;
    const existing = host.querySelector(".fc-holiday-day-badge");
    if (existing) existing.remove();
    if (!holiday) return;

    arg.el.setAttribute("title", `${holiday.name} (${PUBLIC_HOLIDAY_TYPE})`);
    arg.el.setAttribute("data-holiday-theme", holiday.theme || "default");

    const badge = document.createElement("div");
    badge.className = "fc-holiday-day-badge";
    badge.textContent = holiday.name;
    host.appendChild(badge);
  }, [holidayByDate]);

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
  }, [range.start, range.end, filters.type, filters.user_id, filters.department, filters.start_date, filters.end_date, user?.role]);

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
      clientSource: "managed",
      clientId: "",
      oneTimeClientName: "",
      note: "",
    };
    setForm(next);
    setCreateSickNoteFile(null);
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
    if (!apiEvent) return;
    const jsEvent = clickInfo.jsEvent;
    const leaveLike = isLeaveLikeType(apiEvent?.type);
    setPopup({
      x: jsEvent.clientX,
      y: jsEvent.clientY,
      apiEvent,
    });
    setPopupApprovalConfig({
      requireTwoStep: leaveLike && !!apiEvent?.require_two_step_leave_approval,
      firstApproverId: leaveLike ? (apiEvent?.first_approver_id ?? null) : null,
      secondApproverId: leaveLike ? (apiEvent?.second_approver_id ?? null) : null,
      firstApproverName: leaveLike ? (apiEvent?.first_approver_name ?? "") : "",
      secondApproverName: leaveLike ? (apiEvent?.second_approver_name ?? "") : "",
    });
  }

  function approverLabel(id, name) {
    if (name && String(name).trim()) return String(name).trim();
    if (!id) return "Unassigned";
    const found = users.find((u) => u.id === id);
    if (found?.name) return found.name;
    return "Assigned approver";
  }

  function clientNameById(id) {
    const n = Number(id);
    if (!n) return "Unassigned";
    const found = taskClients.find((c) => Number(c.id) === n);
    return found ? found.name : `Client #${n}`;
  }

  const canEdit = useMemo(() => {
    if (!popup || !user) return false;
    if (isPastCurrentDayEvent(popup.apiEvent)) return false;
    return popup.apiEvent.user_id === user.id;
  }, [popup, user]);

  const canDelete = useMemo(() => {
    if (!popup || !user) return false;
    if (isPastCurrentDayEvent(popup.apiEvent)) return false;
    return popup.apiEvent.user_id === user.id;
  }, [popup, user]);

  const canApproveLeave = useMemo(() => {
    if (!popup || !user) return false;
    return !!popup.apiEvent.can_current_user_approve;
  }, [popup, user]);

  const canRejectLeave = useMemo(() => {
    if (!popup || !user) return false;
    return !!popup.apiEvent.can_current_user_reject;
  }, [popup, user]);

  const canViewSickNote = useMemo(() => {
    if (!user) return false;
    return user.role === "admin" || user.role === "ceo";
  }, [user]);

  const popupStatus = useMemo(() => {
    if (!popup?.apiEvent) return "approved";
    return normalizeStatus(popup.apiEvent.status);
  }, [popup]);

  const reviewBlockReason = useMemo(() => {
    if (!popup || !user) return "";
    return getReviewBlockReason(popup.apiEvent, user);
  }, [popup, user]);

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
      clientSource: e.one_time_client_name ? "one_time" : "managed",
      clientId: e.client_id ? String(e.client_id) : "",
      oneTimeClientName: e.one_time_client_name || "",
      note: e.note || "",
    });
    setEditSickNoteFile(null);
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
      showToast("Request approved", "success");
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
      showToast("Request rejected", "success");
    } catch (e) {
      setError(String(e.message || e));
      showToast(String(e.message || e), "error");
    }
  }

  function handleExportFiltered() {
    if (!events.length) {
      showToast("No filtered events to export", "error");
      return;
    }

    const rows = events
      .map((ev) => {
        const api = ev.extendedProps?.api || {};
        const allDay = typeof api.all_day === "boolean" ? api.all_day : !!ev.allDay;
        const startRaw = api.start_ts || ev.start || "";
        const endRaw = api.end_ts || ev.end || "";
        return {
          userName: api.user?.name || "",
          eventType: api.type || "",
          startRaw,
          endRaw,
          allDay,
          status: api.status || "",
          department: api.user?.department || "",
          note: api.note || "",
        };
      })
      .slice()
      .sort((a, b) => Number(new Date(a.startRaw)) - Number(new Date(b.startRaw)));

    const header = ["User", "Type", "Start", "End", "Status", "Department", "Note"];
    const lines = [header.join(",")];
    for (const e of rows) {
      lines.push([
        toCsvCell(e.userName),
        toCsvCell(typeLabel(e.eventType)),
        toCsvCell(formatExportBoundary(e.startRaw, e.allDay, false)),
        toCsvCell(formatExportBoundary(e.endRaw, e.allDay, true)),
        toCsvCell(normalizeStatus(e.status)),
        toCsvCell(e.department),
        toCsvCell(e.note),
      ].join(","));
    }

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calendar_filtered_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Filtered export downloaded", "success");
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
    const isSickLeave = (form.type || "").toLowerCase() === "hospital";
    if (isClientVisit) {
      if (form.clientSource === "managed" && !form.clientId) {
        setError("Please choose a client for Client Visit.");
        return;
      }
      if (form.clientSource === "one_time" && !(form.oneTimeClientName || "").trim()) {
        setError("Please enter a one-time client name for Client Visit.");
        return;
      }
    }

    try {
      let created = null;
      const noteFile = createSickNoteFile;
      if ((form.type || "").toLowerCase() === "leave") {
        await createLeaveRequest({
          start_ts: startISO,
          end_ts: endISO,
          all_day: true,
          note: form.note || null,
        });
      } else {
        created = await createEvent({
          start_ts: startISO,
          end_ts: endISO,
          all_day: true,
          type: form.type,
          client_id: isClientVisit && form.clientSource === "managed" ? Number(form.clientId) : null,
          one_time_client_name: isClientVisit && form.clientSource === "one_time" ? (form.oneTimeClientName || "").trim() : null,
          note: form.note || null,
        });
      }
      setCreateOpen(false);
      setCreateSickNoteFile(null);
      setLeaveBalance(null);
      await refresh();
      showToast("Entry created", "success");
      if (isSickLeave && noteFile && created?.id) {
        (async () => {
          try {
            await uploadEventSickNote(created.id, noteFile);
            await refresh();
            showToast("Sick note uploaded", "success");
          } catch (uploadErr) {
            const msg = String(uploadErr?.message || uploadErr);
            setError(`Entry saved, but sick note upload failed: ${msg}`);
            showToast("Entry saved, but sick note upload failed", "error");
          }
        })();
      }
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
    const isSickLeave = (editForm.type || "").toLowerCase() === "hospital";
    if (isClientVisit) {
      if (editForm.clientSource === "managed" && !editForm.clientId) {
        setError("Please choose a client for Client Visit.");
        return;
      }
      if (editForm.clientSource === "one_time" && !(editForm.oneTimeClientName || "").trim()) {
        setError("Please enter a one-time client name for Client Visit.");
        return;
      }
    }

    try {
      const noteFile = editSickNoteFile;
      const updated = await updateEvent(editForm.id, {
        start_ts: startISO,
        end_ts: endISO,
        all_day: true,
        type: editForm.type,
        client_id: isClientVisit && editForm.clientSource === "managed" ? Number(editForm.clientId) : null,
        one_time_client_name: isClientVisit && editForm.clientSource === "one_time" ? (editForm.oneTimeClientName || "").trim() : null,
        note: editForm.note || null,
      });
      setEditOpen(false);
      setEditSickNoteFile(null);
      setPopup(null);
      setLeaveBalance(null);
      await refresh();
      showToast("Entry updated", "success");
      if (isSickLeave && noteFile && updated?.id) {
        (async () => {
          try {
            await uploadEventSickNote(updated.id, noteFile);
            await refresh();
            showToast("Sick note uploaded", "success");
          } catch (uploadErr) {
            const msg = String(uploadErr?.message || uploadErr);
            setError(`Changes saved, but sick note upload failed: ${msg}`);
            showToast("Changes saved, but sick note upload failed", "error");
          }
        })();
      }
    } catch (e) {
      setError(String(e.message || e));
      showToast(String(e.message || e), "error");
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
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={handleExportFiltered}>Export</button>
              <button
                className="btn"
                onClick={() => setFilters({ type: "", user_id: "", department: "", start_date: "", end_date: "" })}
              >
                Clear
              </button>
            </div>
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
                <option value="Hospital">Sick Leave</option>
                <option value="Client Visit">Client Visit</option>
                <option value="Training">Training</option>
                <option value="Other">Other</option>
                <option value={PUBLIC_HOLIDAY_TYPE}>{PUBLIC_HOLIDAY_TYPE}</option>
              </select>
            </div>

            <div className="field" style={{ flex: "1 1 180px" }}>
              <label>Start Date</label>
              <input
                type="date"
                value={filters.start_date}
                onChange={(e) => setFilters((f) => ({ ...f, start_date: e.target.value }))}
              />
            </div>

            <div className="field" style={{ flex: "1 1 180px" }}>
              <label>End Date</label>
              <input
                type="date"
                value={filters.end_date}
                onChange={(e) => setFilters((f) => ({ ...f, end_date: e.target.value }))}
              />
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
          <span className="pill"><span className="dot" style={{ background: "#c62828" }} /> Sick Leave</span>
          <span className="pill"><span className="dot" style={{ background: "#6a1b9a" }} /> Client Visit</span>
          <span className="pill"><span className="dot" style={{ background: "#ef6c00" }} /> Training</span>
          <span className="pill"><span className="dot" style={{ background: "#1565c0" }} /> Other</span>
          <span className="pill"><span className="dot" style={{ background: "#0f766e" }} /> {PUBLIC_HOLIDAY_TYPE}</span>
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
            dayCellClassNames={dayCellClassNames}
            dayCellDidMount={dayCellDidMount}
            datesSet={onDatesSet}
            dateClick={onDateClick}
            eventClick={onEventClick}
            eventContent={(arg) => {
              const holidayName = arg.event.extendedProps?.holidayName;
              if (holidayName) {
                return (
                  <div className="event-chip holiday-name-chip">
                    <div className="event-text" title={holidayName}>{holidayName}</div>
                  </div>
                );
              }
              const api = arg.event.extendedProps.api;
              const isPendingLeave =
                ["leave", "hospital"].includes((api?.type || "").toLowerCase()) &&
                (api?.status || "").toLowerCase() === "pending";
              const label = `${api?.user?.name || "User"} • ${typeLabel(api?.type)}`;
              return (
                <div className="event-chip">
                  <Avatar
                    name={api?.user?.name}
                    url={api?.user?.avatar_url}
                    size={30}
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
                  <div className="calendar-popup-value">{popup.apiEvent.one_time_client_name || clientNameById(popup.apiEvent.client_id)}</div>
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
              {(popup.apiEvent.type || "").toLowerCase() === "hospital" && popup.apiEvent.sick_note_url && canViewSickNote && (
                <div className="calendar-popup-field">
                  <div className="calendar-popup-label">Doctor/Sick Note</div>
                  <div className="calendar-popup-value">
                    <button
                      className="btn"
                      type="button"
                      onClick={() => openProtectedFile(popup.apiEvent.sick_note_url)}
                    >
                      View Attachment
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="calendar-popup-actions">
              <button className="btn" onClick={() => { setPopup(null); setPopupApprovalConfig(null); }}>Close</button>

              <div className="calendar-popup-action-group">
                {canApproveLeave && (
                  <button className="btn btn-primary" onClick={handleApproveLeave}>Approve</button>
                )}
                {canRejectLeave && (
                  <button className="btn btn-danger" onClick={handleRejectLeave}>Reject</button>
                )}
                {canEdit && (
                  <button className="btn btn-primary" onClick={openEditFromPopup}>Edit</button>
                )}
                {canDelete && (
                  <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
                )}
              </div>
            </div>
            {reviewBlockReason && (
              <div className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                {reviewBlockReason}
              </div>
            )}

            {popupApprovalConfig?.requireTwoStep && (
              <div className="calendar-popup-approval">
                <div className="calendar-popup-approval-title">Two-step approval</div>
                <div className="calendar-popup-approval-item">
                  <div className="calendar-popup-approval-label">1st approver</div>
                  <div className="calendar-popup-approval-value">{approverLabel(popupApprovalConfig.firstApproverId, popupApprovalConfig.firstApproverName)}</div>
                  <span className={`calendar-mini-status ${popup.apiEvent.first_approved_by_id ? "approved" : "pending"}`}>
                    {popup.apiEvent.first_approved_by_id ? "Approved" : "Pending"}
                  </span>
                </div>
                <div className="calendar-popup-approval-item">
                  <div className="calendar-popup-approval-label">2nd approver</div>
                  <div className="calendar-popup-approval-value">{approverLabel(popupApprovalConfig.secondApproverId, popupApprovalConfig.secondApproverName)}</div>
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
                      setForm((f) => ({
                        ...f,
                        type: t,
                        clientSource: t === "Client Visit" ? f.clientSource : "managed",
                        clientId: t === "Client Visit" ? f.clientId : "",
                        oneTimeClientName: t === "Client Visit" ? f.oneTimeClientName : "",
                      }));
                      if (t === "Leave" && form.startDate) refreshLeaveBalance(form.startDate);
                      else setLeaveBalance(null);
                    }}
                  >
                    <option>Leave</option>
                    <option value="Hospital">Sick Leave</option>
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
                <>
                  <div className="field">
                    <label>Client Type</label>
                    <select
                      value={form.clientSource}
                      onChange={(e) => setForm((f) => ({ ...f, clientSource: e.target.value, clientId: "", oneTimeClientName: "" }))}
                    >
                      <option value="managed">Managed Client</option>
                      <option value="one_time">One-time Client</option>
                    </select>
                  </div>
                  {form.clientSource === "managed" ? (
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
                  ) : (
                    <div className="field">
                      <label>One-time Client Name</label>
                      <input
                        value={form.oneTimeClientName}
                        onChange={(e) => setForm((f) => ({ ...f, oneTimeClientName: e.target.value }))}
                        placeholder="Enter one-time client name"
                      />
                    </div>
                  )}
                </>
              )}

              {form.type === "Hospital" && (
                <div className="field">
                  <label>Doctor/Sick Note</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setCreateSickNoteFile(e.target.files?.[0] || null)}
                  />
                  <div className="helper">Optional: upload doctor/sick note for Sick Leave.</div>
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
                <label>{form.type === "Client Visit" ? "To-Do List" : "Notes (visible to everyone)"}</label>
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
                      setEditForm((f) => ({
                        ...f,
                        type: t,
                        clientSource: t === "Client Visit" ? f.clientSource : "managed",
                        clientId: t === "Client Visit" ? f.clientId : "",
                        oneTimeClientName: t === "Client Visit" ? f.oneTimeClientName : "",
                      }));
                      if (t === "Leave" && editForm.startDate) refreshLeaveBalance(editForm.startDate);
                      else setLeaveBalance(null);
                    }}
                  >
                    <option>Leave</option>
                    <option value="Hospital">Sick Leave</option>
                    <option>Client Visit</option>
                    <option>Training</option>
                    <option>Other</option>
                  </select>
                </div>
              </div>

              {editForm.type === "Client Visit" && (
                <>
                  <div className="field">
                    <label>Client Type</label>
                    <select
                      value={editForm.clientSource}
                      onChange={(e) => setEditForm((f) => ({ ...f, clientSource: e.target.value, clientId: "", oneTimeClientName: "" }))}
                    >
                      <option value="managed">Managed Client</option>
                      <option value="one_time">One-time Client</option>
                    </select>
                  </div>
                  {editForm.clientSource === "managed" ? (
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
                  ) : (
                    <div className="field">
                      <label>One-time Client Name</label>
                      <input
                        value={editForm.oneTimeClientName}
                        onChange={(e) => setEditForm((f) => ({ ...f, oneTimeClientName: e.target.value }))}
                        placeholder="Enter one-time client name"
                      />
                    </div>
                  )}
                </>
              )}

              {editForm.type === "Hospital" && (
                <div className="field">
                  <label>Doctor/Sick Note</label>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={(e) => setEditSickNoteFile(e.target.files?.[0] || null)}
                  />
                  <div className="helper">Optional: upload a new doctor/sick note to replace existing.</div>
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
                <label>{editForm.type === "Client Visit" ? "To-Do List" : "Notes (visible to everyone)"}</label>
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

