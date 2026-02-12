import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from "react-router-dom";
import LoginPage from "./Login";
import CalendarPage from "./CalendarPage";
import MyProfilePage from "./MyProfilePage";
import UsersPage from "./UsersPage";
import UserProfilePage from "./UserProfilePage";
import ApprovalsPage from "./ApprovalsPage";
import LibraryPage from "./LibraryPage";
import ClientTaskManagerPage from "./ClientTaskManagerPage";
import { getToken, clearToken } from "./api";
import { me } from "./api";
import { ToastProvider } from "./ToastProvider";

function Shell({ onLogout }) {
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const nav = useNavigate();

  useEffect(() => {
    me().then(setUser).catch(() => setUser(null));
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside className={`app-sidebar${sidebarCollapsed ? " collapsed" : ""}`}>
        <div>
          <div className="sidebar-head">
            <div className="sidebar-brand">SHR PLANNING CALENDAR</div>
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
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/" end>
              <span className="sidebar-link-text">Calendar</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/profile">
              <span className="sidebar-link-text">My Profile</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/library">
              <span className="sidebar-link-text">Library</span>
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/client-task-manager">
              <span className="sidebar-link-text">Client Task Manager</span>
            </NavLink>
            {user?.role === "admin" && (
              <NavLink className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`} to="/users">
                <span className="sidebar-link-text">Users</span>
              </NavLink>
            )}
            {(user?.role === "admin" || user?.role === "supervisor") && (
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
            onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
            title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {theme === "light" ? "Dark mode" : "Light mode"}
          </button>
          <button className="btn sidebar-logout-btn" onClick={() => { onLogout(); nav("/login"); }}>
            Logout
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-content">
          <Routes>
            <Route path="/" element={<CalendarPage />} />
            <Route path="/profile" element={<MyProfilePage />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/client-task-manager" element={<ClientTaskManagerPage />} />

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

  useEffect(() => {
    (async () => {
      const token = getToken();
      if (!token) {
        setAuthState("guest");
        return;
      }
      try {
        await me();
        setAuthState("authed");
      } catch {
        clearToken();
        setAuthState("guest");
      }
    })();
  }, []);

  function handleLogout() {
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
              <Route path="*" element={<Navigate to="/login" replace />} />
            </>
          ) : (
            <>
              <Route path="/*" element={<Shell onLogout={handleLogout} />} />
            </>
          )}
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
