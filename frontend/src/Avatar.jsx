import React from "react";
import { resolveAvatarUrl } from "./api";

function initials(name = "") {
  const trimmed = String(name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function Avatar({ name, url, size = 32, className = "", alt = "avatar" }) {
  const resolved = resolveAvatarUrl(url);
  const style = { width: size, height: size };

  if (resolved) {
    return (
      <img
        src={resolved}
        alt={alt}
        className={`avatar-img ${className}`.trim()}
        style={style}
      />
    );
  }

  return (
    <div
      className={`avatar-fallback ${className}`.trim()}
      style={{ ...style, fontSize: Math.max(11, Math.floor(size * 0.36)) }}
      aria-label={alt}
      title={name || "User"}
    >
      {initials(name)}
    </div>
  );
}
