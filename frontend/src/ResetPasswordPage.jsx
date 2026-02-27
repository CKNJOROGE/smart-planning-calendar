import React, { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "./api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = useMemo(() => (searchParams.get("token") || "").trim(), [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      setError("Reset token is missing.");
      return;
    }
    if (newPassword.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await resetPassword(token, newPassword);
      setMessage(res?.message || "Password has been reset successfully.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e2) {
      const txt = String(e2?.message || "");
      setError(txt.includes("Invalid or expired reset token") ? "Invalid or expired reset link." : "Unable to reset password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2 className="auth-title">Reset Password</h2>
        <p className="auth-subtitle">Set your new account password.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>New Password</label>
            <input
              className="auth-input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="field">
            <label>Confirm Password</label>
            <input
              className="auth-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
          {message && <div className="helper" style={{ marginBottom: 10 }}>{message}</div>}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Link className="link-btn" to="/login">Back to login</Link>
            <button className="btn btn-primary auth-submit-btn" type="submit" disabled={loading}>
              {loading ? "Saving..." : "Reset Password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

