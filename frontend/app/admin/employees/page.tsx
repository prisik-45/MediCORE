"use client";

import { useEffect, useState } from "react";
import { Plus, UserPlus, RefreshCw, Trash2, X, ShieldAlert, Loader2, MailCheck, AlertTriangle } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface Employee {
  id: string;
  name: string;
  email: string;
  status: string;
  role: string;
  last_sync: string;
}

export default function EmployeeManagement() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  // Action Confirmation states
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSuccessMsg, setResetSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchEmployees();
  }, []);

  async function fetchEmployees() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/admin/employees`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to load employee list.");
      }

      const data = await response.json();
      // Sort: Active first, then pending activation, then disabled
      const sorted = data.sort((a: Employee, b: Employee) => {
        if (a.status === b.status) return a.name.localeCompare(b.name);
        if (a.status === "Active") return -1;
        if (b.status === "Active") return 1;
        if (a.status === "Pending Activation") return -1;
        return 1;
      });
      setEmployees(sorted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    setInviteLoading(true);
    setInviteSuccess(false);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      setInviteError("Please enter a valid email address.");
      setInviteLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/admin/employees/invite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          name: inviteName.trim(),
          email: inviteEmail.trim(),
        }),
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Failed to invite employee.");
      }

      setInviteSuccess(true);
      setInviteName("");
      setInviteEmail("");
      fetchEmployees();
      setTimeout(() => {
        setShowAddModal(false);
        setInviteSuccess(false);
      }, 2000);
    } catch (err: any) {
      setInviteError(err.message);
    } finally {
      setInviteLoading(false);
    }
  }

  async function handleRemoveEmployee() {
    if (!confirmRemoveId) return;
    setRemoveLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/admin/employees/${confirmRemoveId}/remove`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Failed to remove employee.");
      }

      setConfirmRemoveId(null);
      fetchEmployees();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setRemoveLoading(false);
    }
  }

  async function handleResetPassword() {
    if (!confirmResetId) return;
    setResetLoading(true);
    setResetSuccessMsg(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiUrl}/api/admin/employees/${confirmResetId}/reset-password`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        throw new Error(detail.detail || "Failed to request password reset.");
      }

      setResetSuccessMsg("Password reset link sent to employee email.");
      setTimeout(() => {
        setConfirmResetId(null);
        setResetSuccessMsg(null);
      }, 2500);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setResetLoading(false);
    }
  }

  function getStatusStyle(status: string) {
    switch (status) {
      case "Active":
        return { background: "rgba(16, 185, 129, 0.08)", color: "#10b981", border: "1px solid rgba(16, 185, 129, 0.15)" };
      case "Pending Activation":
        return { background: "rgba(245, 158, 11, 0.08)", color: "#f59e0b", border: "1px solid rgba(245, 158, 11, 0.15)" };
      case "Disabled":
      default:
        return { background: "rgba(239, 68, 68, 0.08)", color: "#ef4444", border: "1px solid rgba(239, 68, 68, 0.15)" };
    }
  }

  return (
    <div>
      {/* Header Panel */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Employee Directory</h2>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#0f7a5f",
            color: "#ffffff",
            border: "none",
            borderRadius: "10px",
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: "0 4px 12px rgba(15, 122, 95, 0.15)"
          }}
        >
          <Plus size={18} />
          Add Employee
        </button>
      </div>

      {error && (
        <div style={{ background: "#fdf2f2", color: "#9b1c1c", padding: "16px", borderRadius: "10px", border: "1px solid #fde8e8", marginBottom: "24px" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: "flex", height: "40vh", alignItems: "center", justifyContent: "center" }}>
          <Loader2 className="animate-spin" style={{ color: "#0f7a5f" }} size={32} />
        </div>
      ) : (
        /* Employee Table */
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", overflow: "hidden", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "#fafcfb", borderBottom: "1px solid #dce4df" }}>
                <th style={{ padding: "18px 24px", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Employee Name</th>
                <th style={{ padding: "18px 24px", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Connected Email</th>
                <th style={{ padding: "18px 24px", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Status</th>
                <th style={{ padding: "18px 24px", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Last Sync</th>
                <th style={{ padding: "18px 24px", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.5px", textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "40px", textAlign: "center", color: "var(--muted)", fontSize: "13px" }}>
                    No employees found. Invite your first employee by clicking "Add Employee".
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.id} style={{ borderBottom: "1px solid #f4f7f5", transition: "background 0.2s" }}>
                    {/* Name */}
                    <td style={{ padding: "16px 24px" }}>
                      <div style={{ fontWeight: 400, color: "var(--ink)", fontSize: "13px" }}>{emp.name}</div>
                    </td>
                    
                    {/* Connected Email */}
                    <td style={{ padding: "16px 24px", fontSize: "13px", color: "var(--ink)" }}>{emp.email}</td>
                    
                    {/* Status badge */}
                    <td style={{ padding: "16px 24px" }}>
                      <span style={{
                        padding: "3px 8px",
                        borderRadius: "20px",
                        fontSize: "10.5px",
                        fontWeight: 500,
                        display: "inline-block",
                        ...getStatusStyle(emp.status)
                      }}>
                        {emp.status}
                      </span>
                    </td>
                    
                    {/* Last sync time */}
                    <td style={{ padding: "16px 24px", fontSize: "12.5px", color: "var(--muted)" }}>{emp.last_sync}</td>
                    
                    {/* Actions button group */}
                    <td style={{ padding: "18px 24px", textAlign: "right" }}>
                      {emp.role !== "admin" && emp.status !== "Disabled" && (
                        <div style={{ display: "inline-flex", gap: "8px" }}>
                          <button
                            onClick={() => setConfirmResetId(emp.id)}
                            title="Reset Password"
                            style={{ background: "none", border: "none", color: "#66736d", padding: "6px", cursor: "pointer", borderRadius: "6px", transition: "all 0.2s" }}
                          >
                            <RefreshCw size={16} />
                          </button>
                          <button
                            onClick={() => setConfirmRemoveId(emp.id)}
                            title="Remove Employee"
                            style={{ background: "none", border: "none", color: "#ef4444", padding: "6px", cursor: "pointer", borderRadius: "6px", transition: "all 0.2s" }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* 1. Add Employee Modal */}
      {showAddModal && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(23, 33, 28, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", width: "100%", maxWidth: "440px", padding: "28px", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", position: "relative" }}>
            <button onClick={() => setShowAddModal(false)} style={{ position: "absolute", top: "20px", right: "20px", background: "none", border: "none", color: "#66736d", cursor: "pointer" }}>
              <X size={20} />
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "rgba(15, 122, 95, 0.1)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UserPlus size={18} />
              </div>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#17211c" }}>Invite Employee</h3>
            </div>

            {inviteSuccess ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <MailCheck style={{ color: "#0f7a5f", margin: "0 auto 12px auto" }} size={48} />
                <h4 style={{ color: "#17211c", fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Invitation Sent</h4>
                <p style={{ color: "#66736d", fontSize: "13px", margin: 0 }}>An activation link was emailed successfully.</p>
              </div>
            ) : (
              <form onSubmit={handleInvite}>
                {inviteError && (
                  <div style={{ background: "#fdf2f2", color: "#9b1c1c", padding: "10px 14px", borderRadius: "8px", border: "1px solid #fde8e8", fontSize: "13px", marginBottom: "16px" }}>
                    {inviteError}
                  </div>
                )}
                <div style={{ marginBottom: "16px" }}>
                  <label htmlFor="modal-name" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#17211c", marginBottom: "6px" }}>Employee Name</label>
                  <input
                    id="modal-name"
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="E.g., John Doe"
                    required
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #dce4df", borderRadius: "8px", outline: "none", fontSize: "14px" }}
                  />
                </div>
                <div style={{ marginBottom: "24px" }}>
                  <label htmlFor="modal-email" style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#17211c", marginBottom: "6px" }}>Employee Email Address</label>
                  <input
                    id="modal-email"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="john@company.com"
                    required
                    style={{ width: "100%", padding: "10px 12px", border: "1px solid #dce4df", borderRadius: "8px", outline: "none", fontSize: "14px" }}
                  />
                </div>
                <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    style={{ padding: "10px 18px", border: "1px solid #dce4df", background: "#ffffff", color: "#17211c", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteLoading}
                    style={{
                      padding: "10px 18px",
                      background: "#0f7a5f",
                      color: "#ffffff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px"
                    }}
                  >
                    {inviteLoading && <Loader2 className="animate-spin" size={14} />}
                    Send Invitation
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* 2. Reset Password Modal */}
      {confirmResetId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(23, 33, 28, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", width: "100%", maxWidth: "400px", padding: "28px", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", textAlign: "center" }}>
            {resetSuccessMsg ? (
              <div>
                <MailCheck style={{ color: "#0f7a5f", margin: "0 auto 12px auto" }} size={44} />
                <h4 style={{ color: "#17211c", fontSize: "16px", fontWeight: 700, margin: "0 0 4px 0" }}>Reset Emailed</h4>
                <p style={{ color: "#66736d", fontSize: "13px", margin: 0 }}>{resetSuccessMsg}</p>
              </div>
            ) : (
              <>
                <div style={{ display: "inline-flex", width: "48px", height: "48px", borderRadius: "50%", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                  <RefreshCw size={20} />
                </div>
                <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700, color: "#17211c" }}>Reset Password?</h3>
                <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#66736d", lineHeight: 1.5 }}>
                  This will generate a secure reset token and email the reset link to the employee. Link expires in 2 hours.
                </p>
                <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
                  <button
                    onClick={() => setConfirmResetId(null)}
                    style={{ padding: "10px 18px", border: "1px solid #dce4df", background: "#ffffff", color: "#17211c", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleResetPassword}
                    disabled={resetLoading}
                    style={{ padding: "10px 18px", background: "#0f7a5f", color: "#ffffff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                  >
                    {resetLoading && <Loader2 className="animate-spin" size={14} />}
                    Reset Password
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 3. Remove Employee Confirmation Modal */}
      {confirmRemoveId && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(23, 33, 28, 0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", width: "100%", maxWidth: "400px", padding: "28px", boxShadow: "0 20px 40px rgba(0,0,0,0.1)", textAlign: "center" }}>
            <div style={{ display: "inline-flex", width: "48px", height: "48px", borderRadius: "50%", background: "#fdf2f2", color: "#ef4444", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
              <AlertTriangle size={20} />
            </div>
            <h3 style={{ margin: "0 0 8px 0", fontSize: "18px", fontWeight: 700, color: "#17211c" }}>Deactivate Employee?</h3>
            <p style={{ margin: "0 0 24px 0", fontSize: "14px", color: "#66736d", lineHeight: 1.5 }}>
              Are you sure you want to remove this employee? This will stop email synchronization and disable login, but preserves procurement records in the database.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => setConfirmRemoveId(null)}
                style={{ padding: "10px 18px", border: "1px solid #dce4df", background: "#ffffff", color: "#17211c", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemoveEmployee}
                disabled={removeLoading}
                style={{ padding: "10px 18px", background: "#ef4444", color: "#ffffff", border: "none", borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                {removeLoading && <Loader2 className="animate-spin" size={14} />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
