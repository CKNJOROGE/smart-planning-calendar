import React, { useMemo, useState } from "react";
import { login, saveToken, me } from "./api";

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const envLabel = useMemo(() => (import.meta.env.MODE || "dev").toUpperCase(), []);

  function validate() {
    if (!email.trim()) return "Email is required.";
    if (!/\S+@\S+\.\S+/.test(email.trim())) return "Enter a valid email address.";
    if (!password) return "Password is required.";
    return "";
  }

  function mapErrorMessage(raw) {
    const txt = String(raw || "").toLowerCase();
    if (txt.includes("401") || txt.includes("wrong email or password")) {
      return "Invalid email or password.";
    }
    return "Unable to log in right now. Please try again.";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setLoading(true);
    try {
      const data = await login(email.trim(), password);
      saveToken(data.access_token);
      await me();
      onLoggedIn();
    } catch (err) {
      setError(mapErrorMessage(err?.message));
      setPassword("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <div className="auth-shell">
        <div className="auth-showcase">
          <div className="auth-showcase-tag">SHR PLANNING CALENDAR</div>
          <h1 className="auth-showcase-title">Plan smarter. Approve faster.</h1>
          <p className="auth-showcase-copy">
            Track availability, manage leave approvals, and keep your team aligned in one calendar.
          </p>
        </div>

        <div className="card auth-card">
          <div className="auth-head">
            <h2 className="auth-title">Sign In</h2>
            <span className="env-badge">{envLabel}</span>
          </div>
          <p className="auth-subtitle">Use your work account to continue.</p>

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                className="auth-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="username"
                disabled={loading}
              />
            </div>

            <div className="field">
              <label htmlFor="login-password">Password</label>
              <div className="password-row">
                <input
                  id="login-password"
                  className="auth-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyUp={(e) => setCapsOn(e.getModifierState && e.getModifierState("CapsLock"))}
                  type={showPassword ? "text" : "password"}
                  placeholder="********"
                  autoComplete="current-password"
                  disabled={loading}
                />
                <button
                  type="button"
                  className="btn auth-soft-btn"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={loading}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              {capsOn && <div className="helper auth-warning">Caps Lock is on.</div>}
            </div>

            <button disabled={loading} className="btn btn-primary auth-submit-btn" style={{ width: "100%" }}>
              {loading ? "Logging in..." : "Login"}
            </button>

            <div className="auth-foot-row">
              <button
                type="button"
                className="link-btn"
                onClick={() => setError("Password reset is not set up yet. Please contact your admin.")}
                disabled={loading}
              >
                Forgot password?
              </button>
            </div>

            {error && (
              <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }} aria-live="polite">
                {error}
              </div>
            )}
          </form>

          <div className="auth-trust">Secure login for authorized staff only.</div>
        </div>
      </div>
    </div>
  );
}
