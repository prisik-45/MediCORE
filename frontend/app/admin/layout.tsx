"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Database, LogOut, Loader2, Menu, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Verify session and role on layout mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push("/login");
        return;
      }
      
      const role = session.user.user_metadata?.role;
      if (role !== "admin") {
        router.push("/login");
        return;
      }
      
      setAdminName(session.user.user_metadata?.full_name || "Admin");
      setLoading(false);
    });
  }, [router]);

  useEffect(() => {
    // Manage sidebar-collapsed body class to align margins globally
    if (sidebarCollapsed) {
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.classList.remove("sidebar-collapsed");
    }
    return () => {
      document.body.classList.remove("sidebar-collapsed");
    };
  }, [sidebarCollapsed]);

  async function handleLogout() {
    await supabase.auth.signOut();
    document.cookie = `sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure`;
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-card-wrapper" style={{ maxWidth: "420px" }}>
          <div className="auth-card-glow"></div>
          <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px", textAlign: "center" }}>
            <Loader2 className="animate-spin" size={40} style={{ color: "#0f7a5f", marginBottom: "20px" }} />
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#17211c", margin: "0 0 8px 0" }}>Verifying Admin Session</h2>
            <p style={{ fontSize: "13px", color: "#66736d", margin: 0, lineHeight: 1.5 }}>
              Loading dashboard metrics...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <h1>MediCORE</h1>
          <span style={{ fontSize: "12.5px", color: "var(--muted)", fontWeight: 500, letterSpacing: "0.02em", borderLeft: "1px solid var(--line)", paddingLeft: "14px" }}>
            Admin Portal
          </span>
        </div>
        <div className="navbar-actions">
          <div className="user-menu" style={{ cursor: "default" }}>
            <div className="user-avatar">
              {adminName ? adminName.split(" ").map((n: string) => n[0]).join("").toUpperCase() : "AD"}
            </div>
            <div className="user-info">
              <p>{adminName}</p>
              <span>Admin</span>
            </div>
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-top">
            <span className="sidebar-top-label"><h2>Admin</h2></span>
            <button
              className="sidebar-toggle"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
            </button>
          </div>

          <div className="sidebar-section">
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <Link 
                  href="/admin" 
                  className={`sidebar-nav-link ${pathname === "/admin" ? "active" : ""}`}
                  style={{ textDecoration: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit" }}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </Link>
              </li>
              <li className="sidebar-nav-item">
                <Link 
                  href="/admin/employees" 
                  className={`sidebar-nav-link ${pathname === "/admin/employees" ? "active" : ""}`}
                  style={{ textDecoration: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit" }}
                >
                  <Users size={18} />
                  <span>Employees</span>
                </Link>
              </li>
              <li className="sidebar-nav-item">
                <Link 
                  href="/admin/database" 
                  className={`sidebar-nav-link ${pathname === "/admin/database" ? "active" : ""}`}
                  style={{ textDecoration: "none", color: "inherit", fontFamily: "inherit", fontSize: "inherit", fontWeight: "inherit" }}
                >
                  <Database size={18} />
                  <span>Database</span>
                </Link>
              </li>
            </ul>
          </div>

          <div className="sidebar-footer" style={{ marginTop: "auto" }}>
            <button type="button" onClick={handleLogout}>
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-shell">
        <section className="dashboard">
          {children}
        </section>
      </main>
    </>
  );
}
