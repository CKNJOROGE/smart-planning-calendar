import React, { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "./api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      setMessage(res?.message || "If an account exists, reset instructions have been sent.");
    } catch {
      setMessage("If an account exists, reset instructions have been sent.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="card auth-card">
        <h2 className="auth-title">Forgot Password</h2>
        <p className="auth-subtitle">Enter your account email to receive reset instructions.</p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              className="auth-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              disabled={loading}
            />
          </div>
          {error && <div className="error" style={{ marginBottom: 10 }}>{error}</div>}
          {message && <div className="helper" style={{ marginBottom: 10 }}>{message}</div>}
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <Link className="link-btn" to="/login">Back to login</Link>
            <button className="btn btn-primary auth-submit-btn" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

