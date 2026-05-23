"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Sparkles, ArrowRight, ShieldCheck, Mail, Lock, User, Briefcase, Loader2, Info } from "lucide-react";

export default function RegisterStep1Page() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            organisation: organisation.trim(),
            role: "member",
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!data.user) {
        setError("Sign up succeeded but user was not created. Please contact support.");
        setLoading(false);
        return;
      }

      // If user is auto-confirmed, sign in should work immediately.
      // Supabase by default auto-signs-in on signup in dev environments.
      // If a session is active, we proceed. Even if session is not active,
      // we attempt standard login or redirect to email setup which will verify.
      router.push("/register/email-setup");
      router.refresh();
    } catch (err) {
      setError("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card-wrapper">
        <div className="auth-card-glow"></div>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="brand-logo">
              <Sparkles className="brand-icon" />
            </div>
            <h1>MediCORE</h1>
            <p className="brand-tagline">AI-Powered Catalog Intake & Procurement</p>
          </div>

          {/* Step indicator */}
          <div className="step-indicator">
            <div className="step active">
              <div className="step-circle">1</div>
              <span>Account</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-circle">2</div>
              <span>Email Setup</span>
            </div>
            <div className="step-line"></div>
            <div className="step">
              <div className="step-circle">3</div>
              <span>Done</span>
            </div>
          </div>

          <div className="auth-header-text">
            <h2>Create Your Account</h2>
            <p>Step 1 of 3: Enter your profile details</p>
          </div>

          {error && (
            <div className="auth-error-box">
              <ShieldCheck className="error-icon" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegister}>
            <div className="input-group">
              <label htmlFor="fullName">
                <span>Full Name</span>
                <div className="input-with-icon">
                  <User className="field-icon" />
                  <input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Sarah Connor"
                    required
                    autoComplete="name"
                  />
                </div>
              </label>
            </div>

            <div className="input-group">
              <label htmlFor="organisation">
                <span>Organisation / Clinic</span>
                <div className="input-with-icon">
                  <Briefcase className="field-icon" />
                  <input
                    id="organisation"
                    value={organisation}
                    onChange={(e) => setOrganisation(e.target.value)}
                    placeholder="Core Consultancy Ltd"
                    required
                    autoComplete="organization"
                  />
                </div>
              </label>
            </div>

            <div className="input-group">
              <label htmlFor="email">
                <span>Work Email Address</span>
                <div className="input-with-icon">
                  <Mail className="field-icon" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="sarah@coreconsultancy.com"
                    required
                    autoComplete="email"
                  />
                </div>
              </label>
            </div>

            <div className="input-group">
              <label htmlFor="password">
                <span>Password</span>
                <div className="input-with-icon">
                  <Lock className="field-icon" />
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="new-password"
                  />
                </div>
              </label>
              <div className="hint-box">
                <Info className="hint-icon" />
                <span>
                  This password is for logging into MediCORE only. Do not use your email app password here.
                </span>
              </div>
            </div>

            <button type="submit" className="auth-submit-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={18} />
                  Creating account...
                </>
              ) : (
                <>
                  Continue to Email Setup
                  <ArrowRight size={16} />
                </>
              )}
            </button>

            <p className="auth-footer-text">
              Already have an account? <Link href="/login" className="auth-link">Sign In</Link>
            </p>
          </form>
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
          max-width: 460px;
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

        .input-group {
          margin-bottom: 20px;
          position: relative;
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

        .input-with-icon input {
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

        .input-with-icon input:focus {
          border-color: #0f7a5f;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(15, 122, 95, 0.08);
        }

        .hint-box {
          display: flex;
          align-items: flex-start;
          gap: 6px;
          margin-top: 6px;
          color: #66736d;
          font-size: 11px;
          line-height: 1.4;
        }

        .hint-icon {
          flex-shrink: 0;
          margin-top: 2px;
          color: #0f7a5f;
          width: 14px;
          height: 14px;
        }

        .auth-submit-btn {
          width: 100%;
          height: 48px;
          background: #0f7a5f;
          color: #ffffff;
          border: none;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 24px;
        }

        .auth-submit-btn:hover {
          background: #0d6a50;
          box-shadow: 0 4px 12px rgba(15, 122, 95, 0.2);
        }

        .auth-submit-btn:disabled {
          background: #80bfae;
          cursor: not-allowed;
          box-shadow: none;
        }

        .auth-footer-text {
          margin: 24px 0 0;
          text-align: center;
          font-size: 14px;
          color: #66736d;
        }

        .auth-link {
          color: #0f7a5f;
          font-weight: 600;
          text-decoration: none;
          transition: color 0.2s;
        }

        .auth-link:hover {
          color: #0d6a50;
          text-decoration: underline;
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
