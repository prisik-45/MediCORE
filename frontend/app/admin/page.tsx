"use client";

import { useEffect, useState } from "react";
import { Users, MailOpen, MessageSquare, Loader2, Sparkles, TrendingUp } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface DashboardStats {
  total_employees: number;
  total_emails_processed: number;
  ai_queries_today: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/admin/dashboard-stats`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load dashboard metrics.");
        }

        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "60vh", alignItems: "center", justifyContent: "center" }}>
        <Loader2 className="animate-spin" style={{ color: "#0f7a5f" }} size={32} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ background: "#fdf2f2", color: "#9b1c1c", padding: "16px", borderRadius: "10px", border: "1px solid #fde8e8" }}>
        {error}
      </div>
    );
  }

  return (
    <div>
      {/* Header bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Dashboard Overview</h2>
          <p style={{ fontSize: "14px", color: "#66736d", margin: "4px 0 0 0" }}>System metrics and operations tracking.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "#ffffff", padding: "8px 16px", borderRadius: "10px", border: "1px solid #dce4df", fontSize: "13px", fontWeight: 500, color: "#0f7a5f" }}>
          <Sparkles size={16} />
          System Active
        </div>
      </div>

      {/* Metric Cards Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "40px" }}>
        {/* Card 1: Total Employees */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #dce4df",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden"
        }}>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Employees</span>
            <h3 style={{ fontSize: "24px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.total_employees}</h3>
          </div>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={24} />
          </div>
        </div>

        {/* Card 2: Processed Emails */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #dce4df",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden"
        }}>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Supplier Emails Processed</span>
            <h3 style={{ fontSize: "24px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.total_emails_processed}</h3>
          </div>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MailOpen size={24} />
          </div>
        </div>

        {/* Card 3: AI Queries Today */}
        <div style={{
          background: "#ffffff",
          border: "1px solid #dce4df",
          borderRadius: "16px",
          padding: "24px",
          boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "relative",
          overflow: "hidden"
        }}>
          <div>
            <span style={{ fontSize: "13px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Queries Today</span>
            <h3 style={{ fontSize: "24px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.ai_queries_today}</h3>
          </div>
          <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <MessageSquare size={24} />
          </div>
        </div>
      </div>
    </div>
  );
}
