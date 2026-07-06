"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Users, Database, LogOut, Menu, X, Settings } from "lucide-react";
import { supabase } from "@/lib/supabase";
import Loader from "@/components/Loader";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [adminName, setAdminName] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentPathname, setCurrentPathname] = useState("/admin");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentPathname(window.location.pathname);
      
      const handlePopState = () => {
        setCurrentPathname(window.location.pathname);
      };
      window.addEventListener("popstate", handlePopState);
      return () => window.removeEventListener("popstate", handlePopState);
    }
  }, []);

  const handleNavigate = (path: string) => {
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", path);
      window.dispatchEvent(new Event("popstate"));
    }
  };

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
    return <Loader variant="card" title="Verifying Admin Session" subtitle="Loading dashboard metrics..." />;
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
                <button
                  onClick={() => handleNavigate("/admin")}
                  className={`sidebar-nav-link ${currentPathname === "/admin" ? "active" : ""}`}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  onClick={() => handleNavigate("/admin/employees")}
                  className={`sidebar-nav-link ${currentPathname === "/admin/employees" ? "active" : ""}`}
                >
                  <Users size={18} />
                  <span>Employees</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  onClick={() => handleNavigate("/admin/database")}
                  className={`sidebar-nav-link ${currentPathname === "/admin/database" ? "active" : ""}`}
                >
                  <Database size={18} />
                  <span>Database</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="sidebar-settings-section" style={{ marginTop: "auto" }}>
            <div className="sidebar-section-title">Settings</div>
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <button
                  onClick={() => handleNavigate("/admin/settings")}
                  className={`sidebar-nav-link ${currentPathname === "/admin/settings" ? "active" : ""}`}
                >
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
              </li>
            </ul>
          </div>

          <div className="sidebar-footer">
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
