"use client";

import { useRouter } from "next/navigation";
import { Sparkles, Check, ArrowRight } from "lucide-react";

export default function RegisterDonePage() {
  const router = useRouter();

  function handleGoToDashboard() {
    router.push("/");
    router.refresh();
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
            <div className="step completed">
              <div className="step-circle">1</div>
              <span>Account</span>
            </div>
            <div className="step-line completed"></div>
            <div className="step completed">
              <div className="step-circle">2</div>
              <span>Email Setup</span>
            </div>
            <div className="step-line completed"></div>
            <div className="step active">
              <div className="step-circle">3</div>
              <span>Done</span>
            </div>
          </div>

          <div className="success-content">
            <div className="success-badge">
              <Check className="check-icon" />
            </div>
            <h2>Setup Complete!</h2>
            <p className="success-lead-text">
              Your MediCORE account is successfully configured and active.
            </p>
            <div className="success-details-card">
              <p>
                We have connected your supplier inbox and set up automated scanning. Our AI engine will now
                regularly parse incoming supplier catalogs, extract PDF product items, and make them searchable
                directly in your dashboard!
              </p>
            </div>
          </div>

          <button
            type="button"
            className="auth-submit-btn"
            onClick={handleGoToDashboard}
          >
            Go to Dashboard
            <ArrowRight size={16} />
          </button>
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
          margin-bottom: 36px;
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

        /* Success screen specifics */
        .success-content {
          text-align: center;
          margin-bottom: 32px;
        }

        .success-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: #ecfdf5;
          border: 2px solid #a7f3d0;
          color: #10b981;
          margin-bottom: 20px;
          animation: scaleIn 0.5s ease-out;
        }

        .check-icon {
          width: 32px;
          height: 32px;
        }

        .success-content h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 800;
          color: #17211c;
        }

        .success-lead-text {
          margin: 8px 0 0;
          font-size: 15px;
          color: #66736d;
          font-weight: 500;
        }

        .success-details-card {
          margin-top: 20px;
          background: #fafcfb;
          border: 1px dashed #dce4df;
          border-radius: 12px;
          padding: 18px;
          font-size: 13px;
          line-height: 1.6;
          color: #66736d;
          text-align: left;
        }

        .success-details-card p {
          margin: 0;
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
        }

        .auth-submit-btn:hover {
          background: #0d6a50;
          box-shadow: 0 4px 12px rgba(15, 122, 95, 0.2);
        }

        @keyframes scaleIn {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}
