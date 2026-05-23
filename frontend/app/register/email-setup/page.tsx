"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Mail,
  Key,
  ChevronDown,
  ChevronUp,
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Settings
} from "lucide-react";

export default function EmailSetupPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [provider, setProvider] = useState("Gmail");
  const [emailAddress, setEmailAddress] = useState("");
  const [appPassword, setAppPassword] = useState("");
  
  // Filters state
  const [showFilters, setShowFilters] = useState(false);
  const [requireAttachment, setRequireAttachment] = useState(true);
  const [senderKeywords, setSenderKeywords] = useState("");
  const [subjectKeywords, setSubjectKeywords] = useState("catalog, catalogue, price, offer, quote");
  const [skipPromotionsTab, setSkipPromotionsTab] = useState(true);

  // Status and loading states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for active session and pre-fill email address
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email) {
        setEmailAddress(session.user.email);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user?.email) {
        setEmailAddress(session.user.email);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 
    (typeof window !== "undefined" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
      ? "https://backend-production-b29e.up.railway.app"
      : "http://localhost:8000");

  async function handleTestConnection() {
    if (!emailAddress || !appPassword) {
      setError("Please fill in both the email address and app password.");
      return;
    }

    setError(null);
    setTesting(true);
    setTestResult(null);

    try {
      const token = session?.access_token;
      if (!token) {
        throw new Error("No active authentication session. Please sign in again.");
      }

      // Hardcode port 993 and imap host for Gmail, or adapt if custom
      const imapHost = provider === "Gmail" ? "imap.gmail.com" : "imap.gmail.com";
      const imapPort = 993;

      const response = await fetch(`${apiBaseUrl}/api/email-accounts/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          email_address: emailAddress.trim(),
          imap_host: imapHost,
          imap_port: imapPort,
          password: appPassword.trim(),
        }),
      });

      if (!response.ok) {
        const errDetail = await response.json();
        throw new Error(errDetail?.detail || "Connection test request failed.");
      }

      const data = await response.json();
      setTestResult({
        success: data.success,
        message: data.message,
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "An unexpected error occurred during connection test.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveAccount() {
    if (!testResult?.success) return;
    setError(null);
    setSaving(true);

    try {
      const token = session?.access_token;
      if (!token) {
        throw new Error("No active session found.");
      }

      const imapHost = provider === "Gmail" ? "imap.gmail.com" : "imap.gmail.com";
      const imapPort = 993;

      const response = await fetch(`${apiBaseUrl}/api/email-accounts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          provider,
          email_address: emailAddress.trim(),
          imap_host: imapHost,
          imap_port: imapPort,
          password: appPassword.trim(),
          filters: {
            require_attachment: requireAttachment,
            sender_keywords: senderKeywords ? senderKeywords.trim() : null,
            subject_keywords: subjectKeywords ? subjectKeywords.trim() : null,
            skip_promotions_tab: skipPromotionsTab,
          },
        }),
      });

      if (!response.ok) {
        const errDetail = await response.json();
        throw new Error(errDetail?.detail || "Failed to save email account details.");
      }

      router.push("/register/done");
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Failed to save settings. Please try again.");
      setSaving(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card-wrapper">
        <div className="auth-card-glow"></div>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-logo" style={{ background: "transparent", width: "64px", height: "64px", padding: 0, display: "inline-flex", justifyContent: "center", alignItems: "center", marginBottom: "12px" }}>
              <img src="/Tarkshy.png" alt="Tarkshy Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            </div>
            <h1>MediCORE</h1>
            <p className="brand-tagline">By Tarkshy Consultancy Services</p>
          </div>

          {/* Step indicator */}
          <div className="step-indicator">
            <div className="step completed">
              <div className="step-circle">1</div>
              <span>Account</span>
            </div>
            <div className="step-line completed"></div>
            <div className="step active">
              <div className="step-circle">2</div>
              <span>Email Setup</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-circle">3</div>
              <span>Done</span>
            </div>
          </div>

          <div className="auth-header-text" style={{ textAlign: "center" }}>
            <h2>Connect Supplier Inbox</h2>
          </div>

          {error && (
            <div className="auth-error-box">
              <ShieldCheck className="error-icon" />
              <span>{error}</span>
            </div>
          )}

          {/* Provider Card Selector */}
          <div className="provider-selector-section">
            <span className="section-label">Select Provider</span>
            <div className="provider-cards">
              <button
                type="button"
                className={`provider-card ${provider === "Gmail" ? "selected" : ""}`}
                onClick={() => setProvider("Gmail")}
              >
                <div className="provider-logo-wrap">
                  <span className="gmail-color-box">M</span>
                </div>
                <strong>Gmail</strong>
              </button>
            </div>
          </div>

          {/* Inline App Password Guide */}
          <div className="guide-box">
            <div className="guide-header">
              <HelpCircle className="guide-icon" />
              <h3>How to generate a Gmail App Password</h3>
            </div>
            <ol className="guide-list">
              <li>Open your Google Account and turn on <strong>2-Step Verification</strong> in Security settings.</li>
              <li>Go to <strong>App Passwords</strong> (search for it in your account search bar).</li>
              <li>Select <strong>Other (Custom name)</strong>, type <strong>MediCORE</strong>, and click <strong>Generate</strong>.</li>
              <li>Copy the 16-character code and paste it in the App Password field below.</li>
            </ol>
          </div>

          {/* Form */}
          <div className="form-fields">
            <div className="input-group">
              <label htmlFor="emailAddress">
                <span>Work Email Address</span>
                <div className="input-with-icon">
                  <Mail className="field-icon" />
                  <input
                    id="emailAddress"
                    type="email"
                    value={emailAddress}
                    onChange={(e) => setEmailAddress(e.target.value)}
                    placeholder="sarah@coreconsultancy.com"
                    required
                    readOnly
                    style={{ opacity: 0.8, cursor: "not-allowed", backgroundColor: "#f4f7f5" }}
                  />
                </div>
              </label>
            </div>

            <div className="input-group">
              <label htmlFor="appPassword">
                <span>Gmail App Password</span>
                <div className="input-with-icon">
                  <Key className="field-icon" />
                  <input
                    id="appPassword"
                    type="password"
                    value={appPassword}
                    onChange={(e) => {
                      setAppPassword(e.target.value);
                      setTestResult(null); // Reset test status when password changes
                    }}
                    placeholder="xxxx xxxx xxxx xxxx"
                    required
                  />
                </div>
              </label>
            </div>

            {/* Collapsible Filters Section */}
            <div className="collapsible-section">
              <button
                type="button"
                className="collapsible-trigger"
                onClick={() => setShowFilters(!showFilters)}
              >
                <div className="trigger-label">
                  <Sliders className="trigger-icon" />
                  <span>Configure Email Filters (Optional)</span>
                </div>
                {showFilters ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showFilters && (
                <div className="collapsible-content">
                  <div className="filter-toggle-row">
                    <label className="toggle-label" htmlFor="requireAttachment">
                      <strong>Require Attachments (PDFs)</strong>
                      <span>Only parse emails containing PDF supplier documents</span>
                    </label>
                    <input
                      id="requireAttachment"
                      type="checkbox"
                      className="ios-switch"
                      checked={requireAttachment}
                      onChange={(e) => setRequireAttachment(e.target.checked)}
                    />
                  </div>

                  <div className="filter-toggle-row">
                    <label className="toggle-label" htmlFor="skipPromotions">
                      <strong>Skip Promotions Tab</strong>
                      <span>Ignore emails flagged as Gmail newsletters / promotions</span>
                    </label>
                    <input
                      id="skipPromotions"
                      type="checkbox"
                      className="ios-switch"
                      checked={skipPromotionsTab}
                      onChange={(e) => setSkipPromotionsTab(e.target.checked)}
                    />
                  </div>

                  <div className="input-group">
                    <label htmlFor="subjectKeywords">
                      <span>Subject Keywords Filter (Comma separated)</span>
                      <input
                        id="subjectKeywords"
                        value={subjectKeywords}
                        onChange={(e) => setSubjectKeywords(e.target.value)}
                        placeholder="catalog, catalogue, price list"
                      />
                    </label>
                  </div>

                  <div className="input-group">
                    <label htmlFor="senderKeywords">
                      <span>Sender Email Keywords (Comma separated)</span>
                      <input
                        id="senderKeywords"
                        value={senderKeywords}
                        onChange={(e) => setSenderKeywords(e.target.value)}
                        placeholder="supplier, pharma, chemical"
                      />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Test Connection Display */}
            {testResult && (
              <div className={`test-feedback-box ${testResult.success ? "success" : "failed"}`}>
                {testResult.success ? (
                  <>
                    <CheckCircle2 className="feedback-icon text-green" />
                    <div className="feedback-text">
                      <strong>Connection Succeeded</strong>
                      <p>{testResult.message}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <XCircle className="feedback-icon text-red" />
                    <div className="feedback-text">
                      <strong>Connection Failed</strong>
                      <p>{testResult.message}</p>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="button-group">
              <button
                type="button"
                className="btn-test-connection"
                onClick={handleTestConnection}
                disabled={testing || !emailAddress || !appPassword}
              >
                {testing ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Testing...
                  </>
                ) : (
                  "Test Connection"
                )}
              </button>

              <button
                type="button"
                className="btn-save-credentials"
                onClick={handleSaveAccount}
                disabled={saving || !testResult?.success}
              >
                {saving ? (
                  <>
                    <Loader2 className="animate-spin mr-2" size={16} />
                    Saving...
                  </>
                ) : (
                  <>
                    Save and Continue
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .auth-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(circle at 10% 20%, rgba(244, 247, 245, 1) 0%, rgba(220, 228, 223, 0.4) 90%);
          padding: 24px;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }

        .auth-card-wrapper {
          position: relative;
          width: 100%;
          max-width: 500px;
        }

        .auth-card-glow {
          position: absolute;
          top: -20px;
          left: -20px;
          right: -20px;
          bottom: -20px;
          background: radial-gradient(circle, rgba(15, 122, 95, 0.08) 0%, transparent 70%);
          filter: blur(10px);
          z-index: 0;
          pointer-events: none;
        }

        .auth-card {
          position: relative;
          background: #ffffff;
          border: 1px solid #dce4df;
          border-radius: 20px;
          padding: 40px;
          box-shadow: 0 10px 30px rgba(23, 33, 28, 0.06), 0 1px 3px rgba(23, 33, 28, 0.02);
          z-index: 1;
        }

        .auth-brand {
          text-align: center;
          margin-bottom: 24px;
        }

        .brand-logo {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          background: rgba(15, 122, 95, 0.1);
          color: #0f7a5f;
          border-radius: 12px;
          margin-bottom: 12px;
        }

        .brand-icon {
          width: 24px;
          height: 24px;
        }

        .auth-brand h1 {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          color: #0f7a5f;
          letter-spacing: -0.5px;
        }

        .brand-tagline {
          margin: 4px 0 0;
          font-size: 12px;
          color: #66736d;
          font-weight: 500;
          letter-spacing: 0.5px;
          text-transform: uppercase;
        }

        /* Step indicator styling */
        .step-indicator {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 32px;
          padding: 0 10px;
        }

        .step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          width: 80px;
        }

        .step-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: 2px solid #dce4df;
          background: #ffffff;
          color: #66736d;
          font-size: 14px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s;
        }

        .step span {
          font-size: 11px;
          font-weight: 600;
          color: #66736d;
          text-align: center;
        }

        .step.active .step-circle {
          border-color: #0f7a5f;
          background: #0f7a5f;
          color: #ffffff;
          box-shadow: 0 0 0 4px rgba(15, 122, 95, 0.15);
        }

        .step.active span {
          color: #0f7a5f;
          font-weight: 700;
        }

        .step.completed .step-circle {
          border-color: #0f7a5f;
          background: rgba(15, 122, 95, 0.1);
          color: #0f7a5f;
        }

        .step.completed span {
          color: #17211c;
        }

        .step-line {
          flex: 1;
          height: 2px;
          background: #dce4df;
          margin-bottom: 22px;
        }

        .step-line.completed {
          background: #0f7a5f;
        }

        .auth-header-text {
          margin-bottom: 24px;
        }

        .auth-header-text h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: #17211c;
        }

        .auth-header-text p {
          margin: 4px 0 0;
          font-size: 14px;
          color: #66736d;
        }

        .auth-error-box {
          background: #fdf2f2;
          border: 1px solid #fde8e8;
          border-radius: 8px;
          padding: 12px 16px;
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin-bottom: 24px;
          color: #9b1c1c;
          font-size: 14px;
        }

        .error-icon {
          flex-shrink: 0;
          margin-top: 2px;
          width: 16px;
          height: 16px;
        }

        .provider-selector-section {
          margin-bottom: 24px;
        }

        .section-label {
          display: block;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #66736d;
          margin-bottom: 10px;
        }

        .provider-cards {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .provider-card {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 14px;
          border: 2px solid #0f7a5f;
          border-radius: 12px;
          background: rgba(15, 122, 95, 0.04);
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
          outline: none;
        }

        .provider-logo-wrap {
          width: 32px;
          height: 32px;
          background: #ea4335;
          color: #ffffff;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
        }

        .provider-card strong {
          font-size: 15px;
          color: #17211c;
        }

        /* Guide box */
        .guide-box {
          background: #fafcfb;
          border: 1px solid #dce4df;
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 24px;
        }

        .guide-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
          color: #0f7a5f;
        }

        .guide-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
        }

        .guide-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 700;
        }

        .guide-list {
          margin: 0;
          padding-left: 20px;
          font-size: 12px;
          line-height: 1.5;
          color: #66736d;
        }

        .guide-list li {
          margin-bottom: 6px;
        }

        .form-fields {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .input-group label span {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #17211c;
          margin-bottom: 8px;
        }

        .input-with-icon {
          position: relative;
        }

        .field-icon {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          color: #66736d;
          width: 18px;
          height: 18px;
        }

        .input-with-icon input,
        .collapsible-content input {
          width: 100%;
          height: 48px;
          padding: 0 16px 0 44px;
          border: 1px solid #dce4df;
          border-radius: 10px;
          font-size: 14px;
          color: #17211c;
          background: #fafcfb;
          outline: none;
          transition: all 0.2s;
        }

        .collapsible-content input {
          padding: 0 16px; /* No icon in filter inputs */
        }

        .input-with-icon input:focus,
        .collapsible-content input:focus {
          border-color: #0f7a5f;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(15, 122, 95, 0.08);
        }

        /* Collapsible section styling */
        .collapsible-section {
          border: 1px solid #dce4df;
          border-radius: 10px;
          overflow: hidden;
          background: #ffffff;
        }

        .collapsible-trigger {
          width: 100%;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fafcfb;
          border: none;
          color: #17211c;
          cursor: pointer;
          transition: background 0.2s;
        }

        .collapsible-trigger:hover {
          background: #f4f7f5;
        }

        .trigger-label {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 13px;
          font-weight: 600;
        }

        .trigger-icon {
          width: 16px;
          height: 16px;
          color: #0f7a5f;
        }

        .collapsible-content {
          padding: 20px 16px;
          border-top: 1px solid #dce4df;
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: #ffffff;
        }

        .filter-toggle-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 12px;
          border-bottom: 1px dashed #dce4df;
        }

        .toggle-label {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .toggle-label strong {
          font-size: 13px;
          color: #17211c;
        }

        .toggle-label span {
          font-size: 11px;
          color: #66736d;
        }

        /* Custom switch styling */
        .ios-switch {
          position: relative;
          width: 44px;
          height: 24px;
          appearance: none;
          background: #dce4df;
          outline: none;
          border-radius: 20px;
          cursor: pointer;
          transition: background 0.3s;
        }

        .ios-switch:checked {
          background: #0f7a5f;
        }

        .ios-switch::before {
          content: "";
          position: absolute;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          top: 2px;
          left: 2px;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.15);
          transition: transform 0.3s;
        }

        .ios-switch:checked::before {
          transform: translateX(20px);
        }

        /* Test feedback box */
        .test-feedback-box {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px;
          border-radius: 10px;
          font-size: 13px;
          line-height: 1.4;
        }

        .test-feedback-box.success {
          background: #ecfdf5;
          border: 1px solid #a7f3d0;
          color: #065f46;
        }

        .test-feedback-box.failed {
          background: #fdf2f2;
          border: 1px solid #fde8e8;
          color: #9b1c1c;
        }

        .feedback-icon {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          margin-top: 1px;
        }

        .text-green {
          color: #10b981;
        }

        .text-red {
          color: #ef4444;
        }

        .feedback-text strong {
          display: block;
          margin-bottom: 2px;
          font-weight: 700;
        }

        .feedback-text p {
          margin: 0;
        }

        /* Buttons layout */
        .button-group {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
          gap: 12px;
          margin-top: 8px;
        }

        .btn-test-connection {
          height: 48px;
          border: 1px solid #0f7a5f;
          background: #ffffff;
          color: #0f7a5f;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .btn-test-connection:hover:not(:disabled) {
          background: rgba(15, 122, 95, 0.05);
          box-shadow: 0 2px 6px rgba(15, 122, 95, 0.1);
        }

        .btn-save-credentials {
          height: 48px;
          background: #0f7a5f;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .btn-save-credentials:hover:not(:disabled) {
          background: #0d6a50;
          box-shadow: 0 4px 12px rgba(15, 122, 95, 0.2);
        }

        .btn-test-connection:disabled,
        .btn-save-credentials:disabled {
          opacity: 0.5;
          cursor: not-allowed;
          box-shadow: none;
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        .mr-2 {
          margin-right: 8px;
        }

        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}
