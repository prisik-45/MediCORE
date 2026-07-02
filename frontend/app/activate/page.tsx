"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, AlertTriangle, ShieldCheck } from "lucide-react";

function ActivateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Activation token is missing. Please check your email invitation link.");
      setLoading(false);
      return;
    }
    
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    
    // Call backend endpoint to verify activation token
    fetch(`${apiUrl}/api/admin/activate/verify?token=${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          throw new Error(detail.detail || "Invalid or expired activation link.");
        }
        return res.json();
      })
      .then((data) => {
        // Redirect user to the main registration page prefilled with their name and email
        router.push(
          `/register?email=${encodeURIComponent(data.email)}&name=${encodeURIComponent(
            data.name
          )}&token=${token}`
        );
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token, router]);

  return (
    <main className="auth-page">
      <div className="auth-card-wrapper">
        <div className="auth-card-glow"></div>
        <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "200px" }}>
          {loading ? (
            <div style={{ textAlign: "center" }}>
              <Loader2 className="animate-spin" style={{ color: "#0f7a5f", margin: "0 auto 16px auto", width: "40px", height: "40px" }} />
              <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#17211c" }}>Verifying Invitation...</h2>
              <p style={{ fontSize: "14px", color: "#66736d", marginTop: "4px" }}>Please wait while we validate your token.</p>
            </div>
          ) : (
            <div style={{ textAlign: "center", width: "100%" }}>
              <div style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "56px",
                height: "56px",
                background: "#fdf2f2",
                color: "#9b1c1c",
                borderRadius: "50%",
                marginBottom: "16px",
              }}>
                <AlertTriangle size={28} />
              </div>
              <h2 style={{ fontSize: "20px", fontWeight: 700, color: "#17211c", margin: "0 0 8px 0" }}>Activation Failed</h2>
              <div className="auth-error-box" style={{ margin: "16px 0", textAlign: "left" }}>
                <ShieldCheck className="error-icon" />
                <span>{error}</span>
              </div>
              <p style={{ fontSize: "13px", color: "#66736d", lineHeight: 1.6 }}>
                If you believe this is an error, please ask your administrator to send you a new invitation link.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ActivatePage() {
  return (
    <Suspense fallback={
      <main className="auth-page">
        <div className="auth-card-wrapper">
          <div className="auth-card" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px" }}>
            <Loader2 className="animate-spin" style={{ color: "#0f7a5f" }} />
          </div>
        </div>
      </main>
    }>
      <ActivateContent />
    </Suspense>
  );
}
