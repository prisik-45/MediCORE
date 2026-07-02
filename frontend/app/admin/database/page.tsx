"use client";

import { useEffect, useState } from "react";
import { Database, Landmark, Layers, Sparkles, HelpCircle, CalendarRange, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface DBStats {
  total_suppliers: number;
  total_ingredients: number;
  database_size_mb: number;
  searches_per_day: number;
  searches_per_month: number;
}

export default function DatabaseOverview() {
  const [stats, setStats] = useState<DBStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDBStats() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const response = await fetch(`${apiUrl}/api/admin/database-stats`, {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load database health metrics.");
        }

        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDBStats();
  }, []);

  if (loading) {
    return (
      <div style={{ display: "flex", height: "50vh", alignItems: "center", justifyContent: "center" }}>
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
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Database Overview</h2>
          <p style={{ fontSize: "14px", color: "#66736d", margin: "4px 0 0 0" }}>Storage size, index health, and semantic search queries telemetry.</p>
        </div>
      </div>

      {/* Database Analytics Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginBottom: "32px" }}>
        {/* Card 1: Total Suppliers */}
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Suppliers</span>
            <h3 style={{ fontSize: "22px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.total_suppliers}</h3>
          </div>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Landmark size={20} />
          </div>
        </div>

        {/* Card 2: Total Ingredients */}
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Total Ingredients</span>
            <h3 style={{ fontSize: "22px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.total_ingredients}</h3>
          </div>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Layers size={20} />
          </div>
        </div>

        {/* Card 3: Database Size */}
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>Database Size</span>
            <h3 style={{ fontSize: "22px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.database_size_mb} MB</h3>
          </div>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Database size={20} />
          </div>
        </div>
      </div>

      {/* AI Telemetry Cards Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "24px" }}>
        {/* Searches / Day */}
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Searches / Day (Avg)</span>
            <h3 style={{ fontSize: "22px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.searches_per_day}</h3>
          </div>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HelpCircle size={20} />
          </div>
        </div>

        {/* Searches / Month */}
        <div style={{ background: "#ffffff", border: "1px solid #dce4df", borderRadius: "16px", padding: "24px", boxShadow: "0 4px 20px rgba(23, 33, 28, 0.02)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <span style={{ fontSize: "12px", fontWeight: 500, color: "#66736d", textTransform: "uppercase", letterSpacing: "0.5px" }}>AI Searches / Month (Total)</span>
            <h3 style={{ fontSize: "22px", fontWeight: 500, color: "#17211c", margin: "8px 0 0 0" }}>{stats?.searches_per_month}</h3>
          </div>
          <div style={{ width: "44px", height: "44px", borderRadius: "10px", background: "rgba(15, 122, 95, 0.08)", color: "#0f7a5f", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <CalendarRange size={20} />
          </div>
        </div>
      </div>
    </div>
  );
}
