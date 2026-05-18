import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import LoginPage from "./Login";
import CalendarPage from "./CalendarPage";
import MyProfilePage from "./MyProfilePage";
import UsersPage from "./UsersPage";
import UserProfilePage from "./UserProfilePage";
import ApprovalsPage from "./ApprovalsPage";
import LibraryPage from "./LibraryPage";
import SharedNotebookPage from "./SharedNotebookPage";
import ClientTaskManagerPage from "./ClientTaskManagerPage";
import DashboardPage from "./DashboardPage";
import FinanceRequestsPage from "./FinanceRequestsPage";
import PayrollPage from "./PayrollPage";
import EmployeePayrollPage from "./EmployeePayrollPage";
import PerformanceManagementPage from "./PerformanceManagementPage";
import IndividualGoalsPage from "./IndividualGoalsPage";
import ForgotPasswordPage from "./ForgotPasswordPage";
import ResetPasswordPage from "./ResetPasswordPage";
import { clearToken, logout, getFinanceAttention, getPayrollAttention, getPayrollAdminAttention, me, updateTheme } from "./api";
import { ToastProvider, useToast } from "./ToastProvider";

const THEME_OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "slate", label: "Slate Gray" },
  { value: "teal", label: "Green Teal" },
  { value: "forest", label: "Forest" },
  { value: "ocean", label: "Ocean Blue" },
  { value: "amber", label: "Amber Sand" },
  { value: "rose", label: "Rose Blush" },
  { value: "indigo", label: "Indigo Mist" },
  { value: "cocoa", label: "Cocoa Cream" },
];

const BACKGROUND_OPTIONS = [
  { value: "bg-image-1", label: "City Lights", image: "/Background/pexels-marek-piwnicki-3907296-12966912.jpg" },
  { value: "bg-image-2", label: "Mountain Lake", image: "/Background/pexels-photograph-6642762.jpg" },
  { value: "bg-image-3", label: "Coastal Sunset", image: "/Background/pexels-prabhath-jayarathna-3459375-26873010.jpg" },
  { value: "bg-image-4", label: "Frost Bridge", image: "/Background/pexels-marek-piwnicki-3907296-12489187.jpg" },
  { value: "bg-image-5", label: "Forest Path", image: "/Background/pexels-photograph-6321746.jpg" },
  { value: "bg-image-6", label: "Golden Hour", image: "/Background/pexels-photograph-9688283.jpg" },
  { value: "bg-image-7", label: "Bloom Field", image: "/Background/pexels-timmossholder-35231163.jpg" },
  { value: "bg-image-8", label: "Sky Ridges", image: "/Background/pexels-brett-sayles-4508754.jpg" },
  { value: "bg-image-9", label: "Misty Peaks", image: "/Background/pexels-brett-sayles-4508742.jpg" },
  { value: "bg-image-10", label: "Silhouette", image: "/Background/pexels-pixabay-220118.jpg" },
  { value: "bg-image-11", label: "Aurora Mist", image: "/Background/8b3f2af524ab4c73b5802ee2d1b5abd2.png" },
];

const VALID_THEMES = new Set(THEME_OPTIONS.map((option) => option.value));

function getInitialTheme() {
  const storedTheme = localStorage.getItem("theme");
  return VALID_THEMES.has(storedTheme) ? storedTheme : "light";
}

function normalizeTheme(theme) {
  return VALID_THEMES.has(theme) ? theme : null;
}

function Shell({ onLogout, theme, setTheme, background, setBackground }) {
  const [user, setUser] = useState(null);
  const [financeAttentionTotal, setFinanceAttentionTotal] = useState(0);
  const [payrollAttentionTotal, setPayrollAttentionTotal] = useState(0);
  const [payrollAdminAttentionTotal, setPayrollAdminAttentionTotal] = useState(0);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themePaletteOpen, setThemePaletteOpen] = useState(false);
  const { showToast } = useToast();
  const nav = useNavigate();
  const canManageThemePalette = ["admin", "ceo"].includes(String(user?.role || "").toLowerCase());

  useEffect(() => {
    me()
      .then((payload) => {
        setUser(payload);
        const effectiveTheme = normalizeTheme(payload?.effective_theme);
        if (effectiveTheme) {
          setTheme(effectiveTheme);
        }
      })
      .catch(() => setUser(null));
  }, [setTheme]);

  async function persistThemePreferences(nextTheme, nextBackground, successMessage) {
    const normalizedTheme = normalizeTheme(nextTheme);
    if (!normalizedTheme) return;
    const applyToAll = canManageThemePalette;
    try {
      const payload = await updateTheme(normalizedTheme, nextBackground, applyToAll);
      setUser(payload);
      setTheme(normalizeTheme(payload?.effective_theme) || normalizedTheme);
      setBackground(payload?.background_preference || "default");
      showToast(successMessage(applyToAll), "success");
    } catch (err) {
      showToast(String(err?.message || err), "error");
      try {
        const refreshed = await me();
        setUser(refreshed);
        const refreshedTheme = normalizeTheme(refreshed?.effective_theme);
        if (refreshedTheme) {
          setTheme(refreshedTheme);
        }
        setBackground(refreshed?.background_preference || "default");
      } catch {
        // keep current local values when refresh fails
      }
    }
  }

  async function handleThemeChange(nextTheme) {
    const normalizedTheme = normalizeTheme(nextTheme);
    if (!normalizedTheme) return;
    setTheme(normalizedTheme);
    await persistThemePreferences(
      normalizedTheme,
      background,
      (applyToAll) => applyToAll ? "Theme applied to all users" : "Theme synced to your account",
    );
  }

  async function handleBackgroundChange(nextBackground) {
    setBackground(nextBackground);
    await persistThemePreferences(
      theme,
      nextBackground,
      (applyToAll) => applyToAll ? "Background applied to all users" : "Background synced to your account",
    );
  }

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    const role = (user?.role || "").toLowerCase();
    if (!["finance", "admin", "ceo"].includes(role)) {
      setFinanceAttentionTotal(0);
      return;
    }
    let cancelled = false;
    let lastTotal = 0;
    async function loadAttention() {
      try {
        const data = await getFinanceAttention();
        const newTotal = Number(data?.total || 0);
        if (!cancelled) {
          if (newTotal > lastTotal && lastTotal > 0 && Notification.permission === "granted") {
            const diff = newTotal - lastTotal;
            new Notification("Finance Request Attention", {
              body: `${diff} new finance request(s) need your attention`,
              icon: "/favicon.ico",
            });
          }
          lastTotal = newTotal;
          setFinanceAttentionTotal(newTotal);
        }
      } catch {
        if (!cancelled) setFinanceAttentionTotal(0);
      }
    }
    loadAttention();
    const timer = setInterval(loadAttention, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user?.role]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    let lastTotal = 0;
    async function loadAttention() {
      try {
        const data = await getPayrollAttention();
        const newTotal = Number(data?.pending_confirmation || 0);
        if (!cancelled) {
          if (newTotal > lastTotal && lastTotal > 0 && Notification.permission === "granted") {
            const diff = newTotal - lastTotal;
            new Notification("Payroll Confirmation Needed", {
              body: `${diff} payroll run(s) need your confirmation`,
              icon: "/favicon.ico",
            });
          }
          lastTotal = newTotal;
          setPayrollAttentionTotal(newTotal);
        }
      } catch {
        if (!cancelled) setPayrollAttentionTotal(0);
      }
    }
    loadAttention();
    const timer = setInterval(loadAttention, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  useEffect(() => {
    const role = (user?.role || "").toLowerCase();
    if (!["finance", "admin", "ceo"].includes(role)) {
      setPayrollAdminAttentionTotal(0);
      return;
    }
    let cancelled = false;
    let lastTotal = 0;
    async function loadAttention() {
      try {
        const data = await getPayrollAdminAttention();
        const newTotal = Number(data?.confirmed_pending_payment || 0);
        if (!cancelled) {
          if (newTotal > lastTotal && lastTotal > 0 && Notification.permission === "granted") {
            const diff = newTotal - lastTotal;
            new Notification("Payroll Confirmed by Employee", {
              body: `${diff} payroll run(s) confirmed and ready for payment`,
              icon: "/favicon.ico",
            });
          }
          lastTotal = newTotal;
          setPayrollAdminAttentionTotal(newTotal);
        }
      } catch {
        if (!cancelled) setPayrollAdminAttentionTotal(0);
      }
    }
    loadAttention();
    const timer = setInterval(loadAttention, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user]);

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <div className="app-ambient" aria-hidden="true">
        <div className="app-ambient-orb app-ambient-orb-a" />
        <div className="app-ambient-orb app-ambient-orb-b" />
      </div>
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div>
          <div className="sidebar-head">
            <div className="sidebar-brand">SustainFlow</div>
            <button
              className="btn sidebar-toggle-btn"
              type="button"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? ">" : "<"}
            </button>
          </div>
          <nav className="sidebar-nav">
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/profile">
              <span className="sidebar-link-text">My Profile</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/dashboard">
              <span className="sidebar-link-text">Dashboard</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/" end>
              <span className="sidebar-link-text">Calendar</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/client-task-manager">
              <span className="sidebar-link-text">Client Task Manager</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/library">
              <span className="sidebar-link-text">Library</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/shared-notebook">
              <span className="sidebar-link-text">Shared Notebook</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/finance-requests" style={{ position: "relative" }}>
              <span className="sidebar-link-text">Finance Requests</span>
              {financeAttentionTotal > 0 && (
                <span
                  aria-label={`${financeAttentionTotal} finance request notifications`}
                  title={`${financeAttentionTotal} finance request(s) need attention`}
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: "18px",
                    textAlign: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  {financeAttentionTotal > 99 ? "99+" : financeAttentionTotal}
                </span>
              )}
            </NavLink>
            {["finance", "admin", "ceo"].includes(String(user?.role || "").toLowerCase()) && (
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/payroll" style={{ position: "relative" }}>
                <span className="sidebar-link-text">Payroll Admin Portal</span>
                {payrollAdminAttentionTotal > 0 && (
                  <span
                    aria-label={`${payrollAdminAttentionTotal} confirmed pending payment`}
                    title={`${payrollAdminAttentionTotal} payroll run(s) confirmed and ready for payment`}
                    style={{
                      position: "absolute",
                      right: 8,
                      bottom: 6,
                      minWidth: 18,
                      height: 18,
                      padding: "0 5px",
                      borderRadius: 999,
                      background: "#dc2626",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: "18px",
                      textAlign: "center",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                    }}
                  >
                    {payrollAdminAttentionTotal > 99 ? "99+" : payrollAdminAttentionTotal}
                  </span>
                )}
              </NavLink>
            )}
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/my-payroll" style={{ position: "relative" }}>
              <span className="sidebar-link-text">Payroll</span>
              {payrollAttentionTotal > 0 && (
                <span
                  aria-label={`${payrollAttentionTotal} payroll confirmation needed`}
                  title={`${payrollAttentionTotal} payroll run(s) need your confirmation`}
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 6,
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: "#dc2626",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 800,
                    lineHeight: "18px",
                    textAlign: "center",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
                  }}
                >
                  {payrollAttentionTotal > 99 ? "99+" : payrollAttentionTotal}
                </span>
              )}
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/performance-management">
              <span className="sidebar-link-text">Performance Management</span>
            </NavLink>
            {(user?.role === "admin" || user?.role === "ceo") && (
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/users">
                <span className="sidebar-link-text">Users</span>
              </NavLink>
            )}
            {(user?.role === "admin" || user?.role === "ceo" || user?.role === "supervisor") && (
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/approvals">
                <span className="sidebar-link-text">Approvals</span>
              </NavLink>
            )}
          </nav>
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user" title={user ? `${user.name} (${user.role})` : "Loading user"}>
            {user ? (
              <>
                <b>{user.name}</b> <span className="muted">({user.role})</span>
              </>
            ) : (
              <span className="muted">...</span>
            )}
          </div>
          <button
            className="btn sidebar-theme-btn"
            onClick={() => handleThemeChange(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
              {canManageThemePalette && (
                <div className="theme-picker" aria-label="Theme picker">
                  <div className="theme-picker-header">
                    <div className="theme-picker-label">Theme Palette</div>
                    <button
                      type="button"
                      className="btn theme-picker-toggle-btn"
                      onClick={() => setThemePaletteOpen((open) => !open)}
                      aria-expanded={themePaletteOpen}
                      aria-controls="theme-swatch-list"
                    >
                      {themePaletteOpen ? "Hide" : "Show"}
                    </button>
                  </div>
                  <div
                    id="theme-swatch-list"
                    className={`theme-swatch-list${themePaletteOpen ? " open" : ""}`}
                    aria-hidden={!themePaletteOpen}
                  >
                    <div className="theme-swatch-section-label">Colors</div>
                    {THEME_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
className={`theme-swatch-btn${theme === option.value ? " active" : ""}`}
          onClick={() => { handleThemeChange(option.value); }}
          aria-pressed={theme === option.value}
                        title={`Switch theme to ${option.label}`}
                      >
                        <span className={`theme-swatch theme-${option.value}`} aria-hidden="true" />
                        <span className="theme-swatch-text">{option.label}</span>
                      </button>
                    ))}
                    <div className="theme-swatch-section-label">Backgrounds</div>
                    <button
                      type="button"
                      className={`theme-swatch-btn${background === "default" ? " active" : ""}`}
                      onClick={() => { handleBackgroundChange("default"); }}
                      aria-pressed={background === "default"}
                      title="No background image"
                    >
                      <span className="theme-swatch theme-none" aria-hidden="true" />
                      <span className="theme-swatch-text">None</span>
                    </button>
                    {BACKGROUND_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`theme-swatch-btn${background === option.value ? " active" : ""}`}
                        onClick={() => { handleBackgroundChange(option.value); }}
                        aria-pressed={background === option.value}
                        title={`Set background to ${option.label}`}
                      >
                        <span
                          className="theme-swatch theme-bg-swatch"
                          style={{ backgroundImage: `url(${option.image})` }}
                          aria-hidden="true"
                        />
                        <span className="theme-swatch-text">{option.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          <button className="btn sidebar-logout-btn" onClick={() => { onLogout(); nav("/login"); }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-content">
          <Routes>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/" element={<CalendarPage />} />
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/shared-notebook" element={<SharedNotebookPage />} />
            <Route path="/client-task-manager" element={<ClientTaskManagerPage />} />
            <Route path="/finance-requests" element={<FinanceRequestsPage />} />
            <Route path="/payroll" element={<PayrollPage />} />
            <Route path="/my-payroll" element={<EmployeePayrollPage />} />
            <Route path="/performance-management" element={<PerformanceManagementPage />} />
            <Route path="/performance-management/individual-goals" element={<IndividualGoalsPage />} />

            {/* Admin only pages: UI hides, backend enforces */}
            <Route path="/users" element={<UsersPage />} />
            <Route path="/users/:id" element={<UserProfilePage />} />
            <Route path="/approvals" element={<ApprovalsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [authState, setAuthState] = useState("checking");
  const [theme, setTheme] = useState(getInitialTheme);
  const [background, setBackground] = useState(() => localStorage.getItem("bgPreference") || "default");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    const allBgClasses = BACKGROUND_OPTIONS.map((o) => o.value);
    allBgClasses.forEach((cls) => {
      document.documentElement.classList.remove(cls);
      document.body.classList.remove(cls);
    });
    if (background !== "default") {
      document.documentElement.classList.add(background);
      document.body.classList.add(background);
    }
    localStorage.setItem("bgPreference", background);
  }, [background]);

   useEffect(() => {
     (async () => {
       try {
         const payload = await me();
         const effectiveTheme = normalizeTheme(payload?.effective_theme);
         if (effectiveTheme) {
           setTheme(effectiveTheme);
         }
         // Set background from user payload
         const backgroundPreference = payload?.background_preference || "default";
         setBackground(backgroundPreference);
         setAuthState("authed");
       } catch {
         clearToken();
         setAuthState("guest");
       }
     })();
   }, []);

  function handleLogout() {
    logout().catch(() => {});
    clearToken();
    setAuthState("guest");
  }

  if (authState === "checking") {
    return (
      <ToastProvider>
        <div className="auth-page">
          <div className="card auth-card">Checking session...</div>
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {authState !== "authed" ? (
            <>
              <Route path="/login" element={<LoginPage onLoggedIn={() => setAuthState("authed")} />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/*" element={<Shell onLogout={handleLogout} theme={theme} setTheme={setTheme} background={background} setBackground={setBackground} />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
