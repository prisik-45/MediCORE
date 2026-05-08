"use client";

import {
  BarChart3,
  ChevronDown,
  FileText,
  GitCompare,
  Inbox,
  LogOut,
  Menu,
  Search,
  Send,
  Settings,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type ChatMessage = {
  role: "user" | "assistant" | "status";
  text: string;
};

type SupplierItem = {
  ingredient_name: string;
  normalized_name: string;
  price_per_unit: number;
  currency: string;
  available_qty: number;
  unit: string;
  valid_until?: string;
  lead_time_days?: number | null;
  pack_size?: string | null;
};

type SupplierApiRow = {
  name: string;
  email_domain: string;
  reliability_score: number;
  last_email_date: string | null;
};

type CatalogEmailRow = {
  id: string;
  supplier_name: string;
  received_at: string;
  subject: string | null;
  pdf_url: string | null;
  processing_status: string;
};

type SupplierTableRow = SupplierItem & {
  supplier_name: string;
  email_domain: string;
  reliability_score: number;
};

type SidebarTab = "dashboard" | "inbox" | "catalogs" | "analysis" | "compare" | "price-trends" | "assistant" | "suppliers";

type CompareSort = "best-value" | "lowest-price" | "highest-qty";
type SupplierSort = "name" | "reliability" | "items" | "latest";

type InboxThread = {
  supplier_name: string;
  email_domain: string;
  reliability_score: number;
  item_count: number;
  latest_item: string;
  received_at: string | null;
  latest_price: number;
  latest_currency: string;
  latest_qty: number;
  latest_unit: string;
  status_label: string;
  status_tone: "processed" | "pending" | "review";
  items: SupplierTableRow[];
};

const exampleQuestions = [
  "Which supplier has the best price for ascorbic acid with 20,000+ units available?",
  "Find the most reliable supplier for paracetamol 500mg",
  "Compare supplier prices for citric acid"
];

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const diffMinutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatInboxDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "?0";
  }

  if (value >= 100000) {
    return `?${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `?${(value / 1000).toFixed(1)}K`;
  }

  return `?${value.toFixed(0)}`;
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function supplierInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "S";
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi there! I'm Alexa AI."
    }
  ]);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>("dashboard");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supplierRows, setSupplierRows] = useState<SupplierTableRow[]>([]);
  const [catalogEmails, setCatalogEmails] = useState<CatalogEmailRow[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [selectedInboxSupplier, setSelectedInboxSupplier] = useState("");
  const [selectedCatalogSupplier, setSelectedCatalogSupplier] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierSort, setSupplierSort] = useState<SupplierSort>("latest");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "best" | "low-stock">("all");
  const [compareIngredient, setCompareIngredient] = useState("paracetamol");
  const [compareSort, setCompareSort] = useState<CompareSort>("best-value");
  const socketRef = useRef<WebSocket | null>(null);

  const apiBaseUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }

    if (typeof window === "undefined") {
      return "http://localhost:8000";
    }

    return `${window.location.protocol}//${window.location.hostname}:8000`;
  }, []);
  const wsUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }

    if (typeof window === "undefined") {
      return "ws://localhost:8000/ws/chat";
    }

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    return `${protocol}://${window.location.hostname}:8000/ws/chat`;
  }, []);
  const showAssistantPanel = activeTab === "assistant";

  const inboxThreads = useMemo<InboxThread[]>(() => {
    const grouped = new Map<string, SupplierTableRow[]>();
    const emailBySupplier = new Map<string, CatalogEmailRow[]>();

    for (const email of catalogEmails) {
      const current = emailBySupplier.get(email.supplier_name) ?? [];
      current.push(email);
      emailBySupplier.set(email.supplier_name, current);
    }

    for (const row of supplierRows) {
      const current = grouped.get(row.supplier_name) ?? [];
      current.push(row);
      grouped.set(row.supplier_name, current);
    }

    return Array.from(grouped.entries())
      .map(([supplierName, items]) => {
        const sortedItems = [...items].sort((left, right) => left.price_per_unit - right.price_per_unit);
        const averageReliability = items.reduce((total, item) => total + item.reliability_score, 0) / items.length;
        const bestItem = sortedItems[0];
        const latestEmail = (emailBySupplier.get(supplierName) ?? []).slice().sort((left, right) => {
          return new Date(right.received_at).getTime() - new Date(left.received_at).getTime();
        })[0];
        const receivedAt = latestEmail?.received_at ?? items[0]?.valid_until ?? null;
        const ageMinutes = receivedAt ? Math.max(0, Math.round((Date.now() - new Date(receivedAt).getTime()) / 60000)) : 0;
        const statusTone: InboxThread["status_tone"] =
          ageMinutes < 90 ? "pending" : averageReliability >= 88 ? "processed" : averageReliability >= 78 ? "review" : "pending";
        const statusLabel =
          ageMinutes < 60
            ? "Extracting"
            : averageReliability >= 88
              ? "Processed"
              : averageReliability >= 78
                ? "Review"
                : "New supplier";

        return {
          supplier_name: supplierName,
          email_domain: items[0]?.email_domain ?? "-",
          reliability_score: averageReliability,
          item_count: items.length,
          latest_item: latestEmail?.subject || bestItem?.normalized_name || bestItem?.ingredient_name || "-",
          received_at: latestEmail?.received_at ?? null,
          latest_price: bestItem?.price_per_unit ?? 0,
          latest_currency: bestItem?.currency ?? "INR",
          latest_qty: bestItem?.available_qty ?? 0,
          latest_unit: bestItem?.unit ?? "",
          status_label: statusLabel,
          status_tone: statusTone,
          items: sortedItems,
        };
      })
      .sort((left, right) => right.item_count - left.item_count || left.supplier_name.localeCompare(right.supplier_name));
  }, [catalogEmails, supplierRows]);

  const selectedInboxThread = useMemo(() => {
    if (!inboxThreads.length) {
      return null;
    }
    return inboxThreads.find((thread) => thread.supplier_name === selectedInboxSupplier) ?? inboxThreads[0];
  }, [inboxThreads, selectedInboxSupplier]);

  const assistantRows = rows as Array<Record<string, unknown>>;

  const dashboardData = useMemo(() => {
    const suppliers = new Set(supplierRows.map((row) => row.supplier_name));
    const completedCatalogs = catalogEmails.filter((email) => email.processing_status === "completed").length;
    const averageReliability = supplierRows.length
      ? supplierRows.reduce((total, row) => total + row.reliability_score, 0) / supplierRows.length
      : 0;

    const itemGroups = new Map<string, SupplierTableRow[]>();
    for (const row of supplierRows) {
      const key = row.normalized_name || row.ingredient_name;
      const group = itemGroups.get(key) ?? [];
      group.push(row);
      itemGroups.set(key, group);
    }

    const deals = Array.from(itemGroups.entries())
      .map(([name, items]) => {
        const sorted = [...items].sort((left, right) => left.price_per_unit - right.price_per_unit);
        const best = sorted[0];
        const next = sorted[1];
        const savingPercent = next
          ? Math.max(0, ((next.price_per_unit - best.price_per_unit) / next.price_per_unit) * 100)
          : 0;
        const savingValue = next ? Math.max(0, next.price_per_unit - best.price_per_unit) * Math.min(best.available_qty, 1000) : 0;
        return { name, best, savingPercent, savingValue };
      })
      .filter((deal) => deal.best)
      .sort((left, right) => right.savingPercent - left.savingPercent || left.best.price_per_unit - right.best.price_per_unit);

    const potentialSavings = deals.reduce((total, deal) => total + deal.savingValue, 0);
    const activities = inboxThreads.slice(0, 5).map((thread, index) => ({
      tone: index === 2 ? "warning" : index % 2 === 0 ? "strong" : "soft",
      text: `${thread.supplier_name} sent catalog - ${thread.item_count} items extracted`,
      time: formatRelativeTime(thread.received_at),
    }));

    return {
      emailsReceived: catalogEmails.length,
      completedCatalogs,
      activeSuppliers: suppliers.size,
      potentialSavings,
      averageReliability,
      deals: deals.slice(0, 3),
      activities,
    };
  }, [catalogEmails, inboxThreads, supplierRows]);

  const topDashboardDeal = dashboardData.deals[0];

  const supplierDirectory = useMemo(() => {
    const supplierMap = new Map<string, SupplierTableRow[]>();
    for (const row of supplierRows) {
      const current = supplierMap.get(row.supplier_name) ?? [];
      current.push(row);
      supplierMap.set(row.supplier_name, current);
    }

    const emailBySupplier = new Map(catalogEmails.map((email) => [email.supplier_name, email]));
    const search = supplierSearch.trim().toLowerCase();
    const summaries = Array.from(supplierMap.entries()).map(([supplierName, items]) => {
      const sortedByPrice = [...items].sort((left, right) => left.price_per_unit - right.price_per_unit);
      const latestEmail = emailBySupplier.get(supplierName);
      const avgReliability = items.reduce((total, item) => total + item.reliability_score, 0) / items.length;
      const totalQty = items.reduce((total, item) => total + item.available_qty, 0);
      return {
        supplier_name: supplierName,
        email_domain: items[0]?.email_domain ?? "-",
        reliability_score: avgReliability,
        item_count: items.length,
        best_item: sortedByPrice[0],
        total_qty: totalQty,
        last_catalog_at: latestEmail?.received_at ?? items[0]?.valid_until ?? null,
        subject: latestEmail?.subject ?? "Mock catalogue",
        items: sortedByPrice,
      };
    }).filter((supplier) => {
      return !search
        || supplier.supplier_name.toLowerCase().includes(search)
        || supplier.email_domain.toLowerCase().includes(search)
        || supplier.items.some((item) => item.normalized_name.toLowerCase().includes(search) || item.ingredient_name.toLowerCase().includes(search));
    });

    return summaries.sort((left, right) => {
      if (supplierSort === "name") return left.supplier_name.localeCompare(right.supplier_name);
      if (supplierSort === "reliability") return right.reliability_score - left.reliability_score;
      if (supplierSort === "items") return right.item_count - left.item_count;
      return new Date(right.last_catalog_at ?? 0).getTime() - new Date(left.last_catalog_at ?? 0).getTime();
    });
  }, [catalogEmails, supplierRows, supplierSearch, supplierSort]);

  const selectedCatalog = useMemo(() => {
    if (!supplierDirectory.length) return null;
    return supplierDirectory.find((supplier) => supplier.supplier_name === selectedCatalogSupplier) ?? supplierDirectory[0];
  }, [selectedCatalogSupplier, supplierDirectory]);

  const selectedCatalogItems = useMemo(() => {
    if (!selectedCatalog) return [];
    const search = catalogSearch.trim().toLowerCase();
    const minQty = Math.min(...selectedCatalog.items.map((item) => item.available_qty));
    const bestPrice = Math.min(...selectedCatalog.items.map((item) => item.price_per_unit));
    return selectedCatalog.items.filter((item) => {
      const matchesSearch = !search
        || item.ingredient_name.toLowerCase().includes(search)
        || item.normalized_name.toLowerCase().includes(search);
      if (!matchesSearch) return false;
      if (catalogFilter === "best") return item.price_per_unit <= bestPrice * 1.08;
      if (catalogFilter === "low-stock") return item.available_qty <= minQty * 1.35;
      return true;
    });
  }, [catalogFilter, catalogSearch, selectedCatalog]);

  const availableIngredients = useMemo(() => {
    return Array.from(new Set(supplierRows.map((row) => row.normalized_name || row.ingredient_name)))
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  }, [supplierRows]);

  const compareData = useMemo(() => {
    const requested = compareIngredient.trim().toLowerCase();
    const matchedRows = supplierRows.filter((row) => {
      const normalized = (row.normalized_name || "").toLowerCase();
      const ingredient = (row.ingredient_name || "").toLowerCase();
      return !requested || normalized.includes(requested) || ingredient.includes(requested);
    });

    const bySupplier = new Map<string, SupplierTableRow>();
    for (const row of matchedRows) {
      const current = bySupplier.get(row.supplier_name);
      if (!current || row.price_per_unit < current.price_per_unit) {
        bySupplier.set(row.supplier_name, row);
      }
    }

    const rows = Array.from(bySupplier.values());
    const minPrice = Math.min(...rows.map((row) => row.price_per_unit), 0);
    const maxPrice = Math.max(...rows.map((row) => row.price_per_unit), 1);
    const maxQty = Math.max(...rows.map((row) => row.available_qty), 1);

    const scored = rows.map((row) => {
      const priceScore = maxPrice === minPrice ? 100 : ((maxPrice - row.price_per_unit) / (maxPrice - minPrice)) * 100;
      const qtyScore = (row.available_qty / maxQty) * 100;
      const reliabilityScore = Math.max(0, Math.min(100, row.reliability_score));
      const overallScore = Math.round(priceScore * 0.45 + qtyScore * 0.25 + reliabilityScore * 0.3);
      return {
        ...row,
        priceScore: Math.round(priceScore),
        qtyScore: Math.round(qtyScore),
        reliabilityDisplay: Math.round(reliabilityScore),
        overallScore,
      };
    });

    const sorted = scored.sort((left, right) => {
      if (compareSort === "lowest-price") {
        return left.price_per_unit - right.price_per_unit;
      }
      if (compareSort === "highest-qty") {
        return right.available_qty - left.available_qty;
      }
      return right.overallScore - left.overallScore || left.price_per_unit - right.price_per_unit;
    });

    return {
      rows: sorted,
      topRows: sorted.slice(0, 3),
      otherRows: sorted.slice(3),
      ingredientLabel: sorted[0]?.normalized_name || compareIngredient || "ingredient",
    };
  }, [compareIngredient, compareSort, supplierRows]);

  useEffect(() => {
    if (!selectedInboxSupplier && inboxThreads[0]) {
      setSelectedInboxSupplier(inboxThreads[0].supplier_name);
    }
  }, [inboxThreads, selectedInboxSupplier]);

  useEffect(() => {
    if (sidebarCollapsed) {
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.classList.remove("sidebar-collapsed");
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    let cancelled = false;

    async function loadSupplierRows() {
      setSupplierLoading(true);
      setSupplierError(null);

      try {
        const [suppliersRes, itemsRes, emailsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/suppliers`),
          fetch(`${apiBaseUrl}/api/catalogs/items?limit=200`),
          fetch(`${apiBaseUrl}/api/catalogs/emails?limit=50`),
        ]);

        if (!suppliersRes.ok || !itemsRes.ok) {
          throw new Error("Failed to fetch supplier data from backend.");
        }

        const suppliers: SupplierApiRow[] = await suppliersRes.json();
        const items: Array<SupplierItem & { supplier_name: string }> = await itemsRes.json();
        const emails: CatalogEmailRow[] = emailsRes.ok ? await emailsRes.json() : [];

        const supplierMeta = new Map(
          suppliers.map((supplier) => [supplier.name, supplier])
        );

        const mergedRows: SupplierTableRow[] = items.map((item) => {
          const meta = supplierMeta.get(item.supplier_name);
          return {
            ...item,
            email_domain: meta?.email_domain ?? "-",
            reliability_score: meta?.reliability_score ?? 0,
          };
        });

        if (!cancelled) {
          setSupplierRows(mergedRows);
          setCatalogEmails(emails);
          setSupplierLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setSupplierError(error instanceof Error ? error.message : "Unable to load supplier table.");
          setSupplierLoading(false);
        }
      }
    }

    loadSupplierRows();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl]);

  function ensureSocket() {
    if (socketRef.current?.readyState === WebSocket.OPEN) return socketRef.current;
    const socket = new WebSocket(wsUrl);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "status") {
        setMessages((current) => [...current, { role: "status", text: payload.message }]);
      }
      if (payload.type === "answer") {
        setRows(payload.rows || []);
        setMessages((current) => [...current, { role: "assistant", text: payload.answer }]);
      }
      if (payload.type === "error") {
        setMessages((current) => [...current, { role: "status", text: payload.message }]);
      }
    };
    socketRef.current = socket;
    return socket;
  }

  function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setInput("");
    const socket = ensureSocket();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(trimmed);
    } else {
      socket.onopen = () => socket.send(trimmed);
    }
  }

  return (
    <>
      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand">
          <h1>MediCORE</h1>
        </div>
        <div className="navbar-actions">
          <div className="user-menu" onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="user-avatar">PS</div>
            <div className="user-info">
              <p>Prisik</p>
              <span>Admin</span>
            </div>
            <ChevronDown size={16} />
          </div>
        </div>
      </nav>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-content">
          <div className="sidebar-top">
            <span className="sidebar-top-label"><h2>Main</h2></span>
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
                  className={`sidebar-nav-link ${activeTab === "dashboard" ? "active" : ""}`}
                  onClick={() => setActiveTab("dashboard")}
                >
                  <BarChart3 size={18} />
                  <span>Dashboard</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "inbox" ? "active" : ""}`}
                  onClick={() => setActiveTab("inbox")}
                >
                  <Inbox size={18} />
                  <span>Inbox</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "suppliers" ? "active" : ""}`}
                  onClick={() => setActiveTab("suppliers")}
                >
                  <Users size={18} />
                  <span>Suppliers</span>
                </button>
              </li>
            </ul>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-section-title">Analysis</div>
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "analysis" ? "active" : ""}`}
                  onClick={() => setActiveTab("analysis")}
                >
                  <BarChart3 size={18} />
                  <span>Analysis</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "compare" ? "active" : ""}`}
                  onClick={() => setActiveTab("compare")}
                >
                  <GitCompare size={18} />
                  <span>Compare</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "price-trends" ? "active" : ""}`}
                  onClick={() => setActiveTab("price-trends")}
                >
                  <TrendingUp size={18} />
                  <span>Price trends</span>
                </button>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "assistant" ? "active" : ""}`}
                  onClick={() => setActiveTab("assistant")}
                >
                  <Sparkles size={18} />
                  <span>AI assistant</span>
                </button>
              </li>
            </ul>
          </div>
          <div className="sidebar-settings-section">
            <div className="sidebar-section-title">Settings</div>
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <button className="sidebar-nav-link">
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
              </li>
            </ul>
          </div>
          <div className="sidebar-footer">
            <button>
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`app-shell ${showAssistantPanel ? "has-chat" : ""}`}>
        <section className={`dashboard ${showAssistantPanel ? "assistant-layout" : ""}`}>
          {activeTab === "dashboard" && (
            <section className="overview-dashboard">
              <div className="insight-banner">
                {supplierLoading ? (
                  "Loading mock catalogue intelligence..."
                ) : supplierError ? (
                  supplierError
                ) : topDashboardDeal ? (
                  <>
                    AI found a price drop on {topDashboardDeal.best.normalized_name} - {topDashboardDeal.best.supplier_name} is {topDashboardDeal.savingPercent.toFixed(0)}% cheaper than the next supplier.
                    <button type="button" onClick={() => setActiveTab("assistant")}>{"Review recommendation ->"}</button>
                  </>
                ) : (
                  "Mock catalogue data is ready for review."
                )}
              </div>

              <p className="overview-label">Today's overview</p>
              <div className="overview-metrics">
                <article>
                  <span>Emails received</span>
                  <strong>{dashboardData.emailsReceived}</strong>
                  <small>{dashboardData.activities.length} recent supplier updates</small>
                </article>
                <article>
                  <span>New catalogs</span>
                  <strong>{dashboardData.completedCatalogs}</strong>
                  <small>{Math.max(0, dashboardData.emailsReceived - dashboardData.completedCatalogs)} pending review</small>
                </article>
                <article>
                  <span>Active suppliers</span>
                  <strong>{dashboardData.activeSuppliers}</strong>
                  <small>{dashboardData.averageReliability.toFixed(1)} avg reliability</small>
                </article>
                <article>
                  <span>Potential savings</span>
                  <strong>{formatCompactCurrency(dashboardData.potentialSavings)}</strong>
                  <small>Based on AI analysis</small>
                </article>
              </div>

              <div className="overview-grid">
                <section className="overview-panel recent-activity-panel">
                  <div className="overview-panel-header">
                    <h2>Recent activity</h2>
                    <button type="button" onClick={() => setActiveTab("inbox")}>View all</button>
                  </div>
                  <div className="activity-list">
                    {supplierLoading ? (
                      <p className="dashboard-empty">Loading activity...</p>
                    ) : dashboardData.activities.length === 0 ? (
                      <p className="dashboard-empty">No recent catalogue activity.</p>
                    ) : dashboardData.activities.map((activity, index) => (
                      <div className="activity-row" key={`${activity.text}-${index}`}>
                        <span className={`activity-dot ${activity.tone}`} />
                        <div>
                          <p>{activity.text}</p>
                          <small>{activity.time}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="overview-panel best-deals-panel">
                  <div className="overview-panel-header">
                    <h2>AI best deals today</h2>
                    <button type="button" onClick={() => setActiveTab("assistant")}>{"Open chat ->"}</button>
                  </div>
                  <div className="deal-list">
                    {supplierLoading ? (
                      <p className="dashboard-empty">Loading deals...</p>
                    ) : dashboardData.deals.length === 0 ? (
                      <p className="dashboard-empty">No deal data available.</p>
                    ) : dashboardData.deals.map((deal, index) => (
                      <article className={`deal-row ${index === 2 ? "warning" : ""}`} key={deal.name}>
                        <div>
                          <strong>{deal.best.ingredient_name}</strong>
                          <span>{deal.best.supplier_name} - {formatQuantity(deal.best.available_qty)} {deal.best.unit}</span>
                        </div>
                        <div className="deal-price">
                          <strong>{deal.best.currency} {deal.best.price_per_unit.toFixed(2)}/{deal.best.unit}</strong>
                          <small>{deal.savingPercent > 0 ? `Save ${deal.savingPercent.toFixed(0)}%` : "Best listed"}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeTab === "inbox" && (
            <div className="inbox-layout">
              <aside className="inbox-list-panel">
                <div className="inbox-panel-header">
                  <div>
                    <p className="section-kicker">Supplier inbox</p>
                    <h2>Inbox</h2>
                  </div>
                  <span className="inbox-count">{inboxThreads.length}</span>
                </div>
                <div className="inbox-column-header">
                  <span>Sender</span>
                  <span>Status</span>
                </div>
                <div className="inbox-list">
                  {supplierLoading ? (
                    <div className="inbox-empty-state">Loading supplier inbox data...</div>
                  ) : supplierError ? (
                    <div className="inbox-empty-state">{supplierError}</div>
                  ) : inboxThreads.length === 0 ? (
                    <div className="inbox-empty-state">No supplier emails found.</div>
                  ) : (
                    inboxThreads.map((thread) => (
                      <button
                        key={thread.supplier_name}
                        type="button"
                        className={`inbox-thread ${selectedInboxThread?.supplier_name === thread.supplier_name ? "active" : ""}`}
                        onClick={() => setSelectedInboxSupplier(thread.supplier_name)}
                      >
                        <div className="inbox-thread-topline">
                          <strong>{thread.supplier_name}</strong>
                          <span>{formatRelativeTime(thread.received_at)}</span>
                        </div>
                        <div className="inbox-thread-subject">{thread.latest_item} — {thread.item_count} items</div>
                        <div className="inbox-thread-meta">
                          <span className={`thread-status ${thread.status_tone}`}>{thread.status_label}</span>
                          <span>{thread.email_domain}</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </aside>

              <section className="inbox-detail-panel">
                {selectedInboxThread ? (
                  <>
                    <div className="inbox-panel-header inbox-panel-header-main">
                      <div>
                        <h2>{selectedInboxThread.supplier_name} — {selectedInboxThread.email_domain}</h2>
                        <div className="inbox-subline">{selectedInboxThread.latest_item} — {selectedInboxThread.item_count} items enclosed</div>
                      </div>
                      <div className="inbox-subtitle">{formatInboxDate(selectedInboxThread.received_at)}</div>
                    </div>

                    <div className="inbox-summary-grid">
                      <article className="summary-card">
                        <span>Items extracted</span>
                        <strong>{selectedInboxThread.item_count}</strong>
                      </article>
                      <article className="summary-card">
                        <span>Price drops vs last</span>
                        <strong>{selectedInboxThread.items.filter((item) => item.price_per_unit < (selectedInboxThread.items.reduce((total, row) => total + row.price_per_unit, 0) / selectedInboxThread.items.length)).length}</strong>
                      </article>
                      <article className="summary-card">
                        <span>Best deals found</span>
                        <strong>{selectedInboxThread.items.filter((item) => item.price_per_unit <= Math.min(...selectedInboxThread.items.map((row) => row.price_per_unit)) * 1.05).length}</strong>
                      </article>
                    </div>

                    <div className="results-panel inbox-table-panel">
                      <div className="panel-title">
                        <Search size={18} />
                        <h2>AI extraction summary</h2>
                      </div>
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Ingredient</th>
                              <th>Pack</th>
                              <th>Price/Unit</th>
                              <th>Qty Avail.</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedInboxThread.items.length === 0 ? (
                              <tr>
                                <td colSpan={5}>No catalog items were extracted for this supplier.</td>
                              </tr>
                            ) : (
                              selectedInboxThread.items.slice(0, 4).map((item, index) => {
                                const bestPrice = Math.min(...selectedInboxThread.items.map((row) => row.price_per_unit));
                                return (
                                  <tr key={`${item.supplier_name}-${item.ingredient_name}-${index}`}>
                                    <td>{item.ingredient_name}</td>
                                    <td>{item.unit}</td>
                                    <td>{item.currency} {item.price_per_unit.toFixed(2)}</td>
                                    <td>{item.available_qty.toLocaleString()}</td>
                                    <td>{item.price_per_unit === bestPrice ? "Best price" : ""}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="inbox-actions">
                      <button type="button" onClick={() => setActiveTab("compare")}>Compare suppliers</button>
                      <button type="button" onClick={() => { setSelectedCatalogSupplier(selectedInboxThread.supplier_name); setActiveTab("catalogs"); }}>View full catalog</button>
                      <button type="button" onClick={() => setActiveTab("assistant")}>Ask AI</button>
                    </div>
                  </>
                ) : (
                  <div className="inbox-empty-state">Pick a supplier to view the extracted catalog details.</div>
                )}
              </section>
            </div>
          )}
          {activeTab === "catalogs" && (
            <section className="catalog-window">
              {selectedCatalog ? (
                <>
                  <div className="catalog-topline">
                    <button type="button" onClick={() => setActiveTab("suppliers")}>Suppliers</button>
                    <span>{selectedCatalog.supplier_name} - {formatShortDate(selectedCatalog.last_catalog_at)}</span>
                  </div>

                  <div className="catalog-supplier-head">
                    <div className="supplier-badge">{supplierInitials(selectedCatalog.supplier_name)}</div>
                    <div>
                      <h2>{selectedCatalog.supplier_name}</h2>
                      <p>{selectedCatalog.subject} - {selectedCatalog.item_count} items - extracted {formatRelativeTime(selectedCatalog.last_catalog_at)}</p>
                    </div>
                  </div>

                  <div className="catalog-controls">
                    <label className="catalog-search">
                      <Search size={16} />
                      <input value={catalogSearch} onChange={(event) => setCatalogSearch(event.target.value)} placeholder="Search ingredients..." />
                    </label>
                    <div className="catalog-filter-tabs">
                      <button className={catalogFilter === "all" ? "active" : ""} type="button" onClick={() => setCatalogFilter("all")}>All ({selectedCatalog.items.length})</button>
                      <button className={catalogFilter === "best" ? "active" : ""} type="button" onClick={() => setCatalogFilter("best")}>Best deals</button>
                      <button className={catalogFilter === "low-stock" ? "active" : ""} type="button" onClick={() => setCatalogFilter("low-stock")}>Low stock</button>
                    </div>
                  </div>

                  <div className="catalog-table-wrap">
                    <table className="catalog-table">
                      <thead>
                        <tr>
                          <th>Ingredient</th>
                          <th>Pack size</th>
                          <th>Price/unit</th>
                          <th>Qty avail.</th>
                          <th>Valid until</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCatalogItems.length === 0 ? (
                          <tr>
                            <td colSpan={6}>No catalogue items match this filter.</td>
                          </tr>
                        ) : selectedCatalogItems.map((item, index) => {
                          const bestPrice = Math.min(...selectedCatalog.items.map((row) => row.price_per_unit));
                          const minQty = Math.min(...selectedCatalog.items.map((row) => row.available_qty));
                          const status = item.price_per_unit <= bestPrice * 1.08
                            ? "Best price"
                            : item.available_qty <= minQty * 1.35
                              ? "Low stock"
                              : "Good";
                          return (
                            <tr key={`${item.supplier_name}-${item.ingredient_name}-${index}`}>
                              <td>{item.ingredient_name}</td>
                              <td>{item.pack_size || item.unit}</td>
                              <td>{item.currency} {item.price_per_unit.toFixed(2)}</td>
                              <td>{formatQuantity(item.available_qty)} {item.unit}</td>
                              <td>{formatShortDate(item.valid_until)}</td>
                              <td><span className={`catalog-status ${status === "Low stock" ? "warning" : status === "Best price" ? "best" : ""}`}>{status}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <div className="compare-empty">No supplier catalogue available.</div>
              )}
            </section>
          )}

          {activeTab === "analysis" && (
            <>
              <header className="topbar">
                <h2>Analysis</h2>
              </header>
              <div className="metrics">
                <article>
                  <span>Active Suppliers</span>
                  <strong>{inboxThreads.length}</strong>
                </article>
                <article>
                  <span>Catalog Items</span>
                  <strong>{supplierRows.length}</strong>
                </article>
              </div>
            </>
          )}

          {activeTab === "compare" && (
            <section className="compare-window">
              <div className="compare-toolbar">
                <div className="compare-search-group">
                  <span>Comparing:</span>
                  <label className="compare-search">
                    <Search size={16} />
                    <input
                      value={compareIngredient}
                      list="ingredient-options"
                      onChange={(event) => setCompareIngredient(event.target.value)}
                      placeholder="Enter ingredient"
                    />
                  </label>
                  <datalist id="ingredient-options">
                    {availableIngredients.map((ingredient) => (
                      <option key={ingredient} value={ingredient} />
                    ))}
                  </datalist>
                  <small>{compareData.rows[0]?.pack_size || `${compareData.rows[0]?.unit ?? "unit"} based`} - Min qty {formatQuantity(Math.min(...compareData.rows.map((row) => row.available_qty), 0))}</small>
                </div>
                <label className="compare-sort">
                  <span>Sort by</span>
                  <select value={compareSort} onChange={(event) => setCompareSort(event.target.value as CompareSort)}>
                    <option value="best-value">Best value score</option>
                    <option value="lowest-price">Lowest price</option>
                    <option value="highest-qty">Highest qty</option>
                  </select>
                </label>
              </div>

              <p className="compare-note">
                Showing {compareData.rows.length} suppliers who carry this ingredient - Top 3 shown as cards - AI score = price + quantity + reliability
              </p>

              {supplierLoading ? (
                <div className="compare-empty">Loading mock comparison data...</div>
              ) : supplierError ? (
                <div className="compare-empty">{supplierError}</div>
              ) : compareData.rows.length === 0 ? (
                <div className="compare-empty">No mock suppliers found for this ingredient.</div>
              ) : (
                <>
                  <div className="compare-card-grid">
                    {compareData.topRows.map((row, index) => (
                      <article className={`compare-card ${index === 0 ? "recommended" : ""}`} key={`${row.supplier_name}-${row.ingredient_name}`}>
                        {index === 0 && <div className="recommended-ribbon">AI recommended</div>}
                        <div className="compare-supplier-head">
                          <div className="supplier-badge">{supplierInitials(row.supplier_name)}</div>
                          <div>
                            <h3>{row.supplier_name}</h3>
                            <p>{row.email_domain}</p>
                          </div>
                        </div>

                        <div className="compare-stat-grid">
                          <div>
                            <strong>{row.currency} {row.price_per_unit.toFixed(2)}</strong>
                            <span>Per {row.unit}</span>
                          </div>
                          <div>
                            <strong>{formatQuantity(row.available_qty)}</strong>
                            <span>Units avail.</span>
                          </div>
                          <div>
                            <strong>{formatShortDate(row.valid_until)}</strong>
                            <span>Valid until</span>
                          </div>
                          <div>
                            <strong>{row.lead_time_days ? `${row.lead_time_days} days` : "-"}</strong>
                            <span>Lead time</span>
                          </div>
                        </div>

                        <div className="score-bars">
                          {[
                            ["Price", row.priceScore],
                            ["Qty", row.qtyScore],
                            ["Reliability", row.reliabilityDisplay],
                            ["Overall", row.overallScore],
                          ].map(([label, value]) => (
                            <div className="score-row" key={label}>
                              <span>{label}</span>
                              <div className="score-track"><i style={{ width: `${value}%` }} /></div>
                              <strong>{value}</strong>
                            </div>
                          ))}
                        </div>

                        <button className="view-catalog-button" type="button" onClick={() => { setSelectedCatalogSupplier(row.supplier_name); setActiveTab("catalogs"); }}>View catalog</button>
                      </article>
                    ))}
                  </div>

                  <section className="compare-table-panel">
                    <h2>Other {compareData.otherRows.length} suppliers for {compareData.ingredientLabel}</h2>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>#</th>
                            <th>Supplier</th>
                            <th>Price/{compareData.rows[0]?.unit ?? "unit"}</th>
                            <th>Available Qty</th>
                            <th>Valid Until</th>
                            <th>Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareData.otherRows.length === 0 ? (
                            <tr>
                              <td colSpan={6}>Only top suppliers found for this ingredient.</td>
                            </tr>
                          ) : compareData.otherRows.map((row, index) => (
                            <tr key={`${row.supplier_name}-${row.ingredient_name}-table`}>
                              <td>{index + 4}</td>
                              <td>{row.supplier_name}</td>
                              <td>{row.currency} {row.price_per_unit.toFixed(2)}</td>
                              <td>{formatQuantity(row.available_qty)} {row.unit}</td>
                              <td>{formatShortDate(row.valid_until)}</td>
                              <td>{row.overallScore}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </section>
          )}

          {activeTab === "price-trends" && (
            <>
              <header className="topbar">
                <h2>Price trends</h2>
              </header>
              <div className="results-panel">
                <div className="panel-title">
                  <TrendingUp size={18} />
                  <h2>Lowest priced items across suppliers</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th>Item</th>
                        <th>Price/Unit</th>
                        <th>Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierRows.slice().sort((left, right) => left.price_per_unit - right.price_per_unit).slice(0, 10).map((row, index) => (
                        <tr key={`${row.supplier_name}-${row.ingredient_name}-${index}`}>
                          <td>{row.supplier_name}</td>
                          <td>{row.normalized_name || row.ingredient_name}</td>
                          <td>{row.currency} {row.price_per_unit.toFixed(2)}</td>
                          <td>{row.available_qty.toLocaleString()} {row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activeTab === "assistant" && (
            <>
              <header className="topbar">
                <h2>AI Assistant</h2>
              </header>

              <section className="results-panel">
                <div className="panel-title">
                  <Search size={18} />
                  <h2>Query Results</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th>Item</th>
                        <th>Price</th>
                        <th>Qty</th>
                        <th>Reliability</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assistantRows.length === 0 ? (
                        <tr>
                          <td colSpan={5}>Results appear after Alexa AI returns supplier data.</td>
                        </tr>
                      ) : (
                        assistantRows.map((row, index) => (
                          <tr key={index}>
                            <td>{String(row.supplier_name ?? "-")}</td>
                            <td>{String(row.normalized_name ?? row.ingredient_name ?? "-")}</td>
                            <td>{String(row.price_per_unit ?? "-")} {String(row.currency ?? "")}</td>
                            <td>{String(row.available_qty ?? "-")} {String(row.unit ?? "")}</td>
                            <td>{String(row.reliability_score ?? "-")}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {activeTab === "suppliers" && (
            <section className="supplier-window">
              <div className="supplier-toolbar">
                <div>
                  <p className="section-kicker">Supplier directory</p>
                  <h2>Suppliers</h2>
                </div>
                <div className="supplier-controls">
                  <label className="supplier-search">
                    <Search size={16} />
                    <input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search suppliers or ingredients..." />
                  </label>
                  <label className="supplier-sort">
                    <span>Sort by</span>
                    <select value={supplierSort} onChange={(event) => setSupplierSort(event.target.value as SupplierSort)}>
                      <option value="latest">Latest catalog</option>
                      <option value="reliability">Reliability</option>
                      <option value="items">Catalog items</option>
                      <option value="name">Name</option>
                    </select>
                  </label>
                </div>
              </div>

              <div className="supplier-table-panel">
                <table className="supplier-directory-table">
                  <thead>
                    <tr>
                      <th>Supplier</th>
                      <th>Domain</th>
                      <th>Items</th>
                      <th>Best listed price</th>
                      <th>Total qty</th>
                      <th>Reliability</th>
                      <th>Latest catalog</th>
                      <th>View catalogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLoading ? (
                      <tr><td colSpan={8}>Loading supplier data...</td></tr>
                    ) : supplierError ? (
                      <tr><td colSpan={8}>{supplierError}</td></tr>
                    ) : supplierDirectory.length === 0 ? (
                      <tr><td colSpan={8}>No suppliers match your search.</td></tr>
                    ) : supplierDirectory.map((supplier) => (
                      <tr key={supplier.supplier_name}>
                        <td>
                          <div className="supplier-name-cell">
                            <span className="supplier-mini-badge">{supplierInitials(supplier.supplier_name)}</span>
                            <div>
                              <strong>{supplier.supplier_name}</strong>
                              <small>{supplier.subject}</small>
                            </div>
                          </div>
                        </td>
                        <td>{supplier.email_domain}</td>
                        <td>{supplier.item_count}</td>
                        <td>{supplier.best_item.currency} {supplier.best_item.price_per_unit.toFixed(2)}/{supplier.best_item.unit}</td>
                        <td>{formatQuantity(supplier.total_qty)}</td>
                        <td>{supplier.reliability_score.toFixed(1)}%</td>
                        <td>{formatRelativeTime(supplier.last_catalog_at)}</td>
                        <td>
                          <button className="table-action-button" type="button" onClick={() => { setSelectedCatalogSupplier(supplier.supplier_name); setActiveTab("catalogs"); }}>View catalogue</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </section>
      </main>

      {/* Chat Panel */}
      {showAssistantPanel && (
        <aside className="chat-panel">
          <div className="chat-header">
            <h2>Alexa AI</h2>
          </div>
          <div className="examples">
            {exampleQuestions.map((question) => (
              <button key={question} type="button" onClick={() => sendMessage(question)}>
                {question}
              </button>
            ))}
          </div>
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                {message.text}
              </div>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask Alexa AI..."
            />
            <button type="submit" aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
        </aside>
      )}
    </>
  );
}








