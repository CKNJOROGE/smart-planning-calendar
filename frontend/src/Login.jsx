import React, { useEffect, useMemo, useRef, useState } from "react";
import { login, saveToken, me } from "./api";

export default function Login({ onLoggedIn }) {
  const particlesRef = useRef(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const envLabel = useMemo(() => (import.meta.env.MODE || "dev").toUpperCase(), []);

  useEffect(() => {
    const canvas = particlesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(1.5, Math.max(1, window.devicePixelRatio || 1));
    const particles = [];
    const mouse = { x: -9999, y: -9999 };
    let raf = null;
    let particleCount = 0;
    const linkDistance = 110;
    const linkDistanceSq = linkDistance * linkDistance;
    const cellSize = 120;
    const maxLinksPerParticle = 6;
    const neighborOffsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0], [0, 0], [1, 0],
      [-1, 1], [0, 1], [1, 1],
    ];

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function getParticleCount(width) {
      if (width >= 1280) return 900; // laptop/desktop: max density
      if (width >= 1024) return 740;
      if (width >= 768) return 560;
      if (width >= 480) return 380;
      return 230;
    }

    function resize() {
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const nextCount = getParticleCount(window.innerWidth);
      if (nextCount !== particleCount) {
        particleCount = nextCount;
        seed();
      }
    }

    function seed() {
      particles.length = 0;
      for (let i = 0; i < particleCount; i += 1) {
        const depth = 0.25 + Math.random() * 0.75;
        const baseRadius = 0.9 + Math.random() * 1.8;
        particles.push({
          x: Math.random() * window.innerWidth,
          y: Math.random() * window.innerHeight,
          vx: (Math.random() - 0.5) * (0.45 + depth * 0.7),
          vy: (Math.random() - 0.5) * (0.45 + depth * 0.7),
          z: depth,
          r: baseRadius * (0.55 + depth * 0.95),
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;
      const mouseDx = mouse.x - centerX;
      const mouseDy = mouse.y - centerY;
      const pointerActive = mouse.x > -1000 && mouse.y > -1000;

      for (const p of particles) {
        // Add subtle ambient drift so particles never become static.
        const drift = 0.016 + p.z * 0.018;
        p.vx += (Math.random() - 0.5) * drift;
        p.vy += (Math.random() - 0.5) * drift;

        const dx = p.x - mouse.x;
        const dy = p.y - mouse.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 12000) {
          const force = (12000 - distSq) / 12000;
          const depthInfluence = 0.45 + p.z * 0.85;
          p.vx += (dx / 120) * force * 0.08 * depthInfluence;
          p.vy += (dy / 120) * force * 0.08 * depthInfluence;
        }

        const drag = 0.9989 - p.z * 0.00035;
        p.vx *= drag;
        p.vy *= drag;
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < -20) p.x = window.innerWidth + 20;
        if (p.x > window.innerWidth + 20) p.x = -20;
        if (p.y < -20) p.y = window.innerHeight + 20;
        if (p.y > window.innerHeight + 20) p.y = -20;

        const parallaxX = pointerActive ? (mouseDx / Math.max(centerX, 1)) * (1 - p.z) * 14 : 0;
        const parallaxY = pointerActive ? (mouseDy / Math.max(centerY, 1)) * (1 - p.z) * 14 : 0;
        const renderX = p.x + parallaxX;
        const renderY = p.y + parallaxY;
        const alpha = clamp(0.12 + p.z * 0.32, 0.12, 0.44);

        ctx.beginPath();
        ctx.fillStyle = `rgba(100, 2, 119, ${alpha})`;
        ctx.arc(renderX, renderY, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      const grid = new Map();
      for (let i = 0; i < particles.length; i += 1) {
        const p = particles[i];
        const gx = Math.floor(p.x / cellSize);
        const gy = Math.floor(p.y / cellSize);
        const key = `${gx},${gy}`;
        const bucket = grid.get(key);
        if (bucket) bucket.push(i);
        else grid.set(key, [i]);
      }

      for (let i = 0; i < particles.length; i += 1) {
        const a = particles[i];
        const gx = Math.floor(a.x / cellSize);
        const gy = Math.floor(a.y / cellSize);
        let links = 0;

        for (const [ox, oy] of neighborOffsets) {
          const bucket = grid.get(`${gx + ox},${gy + oy}`);
          if (!bucket) continue;
          for (const j of bucket) {
            if (j <= i) continue;
            const b = particles[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy;
            if (distSq >= linkDistanceSq) continue;

            const d = Math.sqrt(distSq);
            const depthBlend = (a.z + b.z) / 2;
            const alpha = (1 - d / linkDistance) * 0.22 * (0.35 + depthBlend * 0.85);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(100, 2, 119, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();

            links += 1;
            if (links >= maxLinksPerParticle) break;
          }
          if (links >= maxLinksPerParticle) break;
        }
      }

      raf = requestAnimationFrame(draw);
    }

    function onMove(e) {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    }

    function onLeave() {
      mouse.x = -9999;
      mouse.y = -9999;
    }

    resize();
    draw();

    window.addEventListener("resize", resize);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
    };
  }, []);

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
      <canvas ref={particlesRef} className="auth-particles" aria-hidden="true" />
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
              <span className="muted">Forgot password? Contact Admin/CEO.</span>
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
