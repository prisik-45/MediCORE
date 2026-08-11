import React from "react";

interface LoaderProps {
  title?: string;
  subtitle?: string;
  variant?: "fullscreen" | "card" | "tab" | "inline";
}

export default function Loader({ title, subtitle, variant = "tab" }: LoaderProps) {
  const content = (
    <div className="modern-loader-container">
      <div className="modern-spinner" aria-hidden="true">
        <div className="modern-spinner-ring"></div>
        <div className="modern-spinner-arc"></div>
      </div>
      {title && <h2 className="modern-loader-title">{title}</h2>}
      {subtitle && <p className="modern-loader-subtitle">{subtitle}</p>}
    </div>
  );

  if (variant === "fullscreen") {
    return (
      <div className="modern-loader-fullscreen">
        {content}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <main className="auth-page">
        <div className="auth-card-wrapper" style={{ maxWidth: "420px" }}>
          <div className="auth-card-glow"></div>
          <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px", textAlign: "center" }}>
            {content}
          </div>
        </div>
      </main>
    );
  }

  if (variant === "tab") {
    return (
      <div style={{ display: "flex", height: "60vh", alignItems: "center", justifyContent: "center", width: "100%" }}>
        {content}
      </div>
    );
  }

  return content;
}
