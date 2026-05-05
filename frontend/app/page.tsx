"use client";

import { Send, Settings, LogOut, ChevronDown, Search, TrendingUp, Users, ShoppingCart, BarChart3, Menu, X } from "lucide-react";
import { useMemo, useRef, useState, useEffect } from "react";

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
};

type SupplierApiRow = {
  name: string;
  email_domain: string;
  reliability_score: number;
};

type SupplierTableRow = SupplierItem & {
  supplier_name: string;
  email_domain: string;
  reliability_score: number;
};

const exampleQuestions = [
  "Which supplier has the best price for ascorbic acid with 20,000+ units available?",
  "Find the most reliable supplier for paracetamol 500mg",
  "Compare supplier prices for citric acid"
];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hi there! I'm Alexa."
    }
  ]);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState("procurement");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supplierRows, setSupplierRows] = useState<SupplierTableRow[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/chat", []);
  const apiBaseUrl = useMemo(() => process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000", []);

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
        const [suppliersRes, itemsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/api/suppliers`),
          fetch(`${apiBaseUrl}/api/catalogs/items?limit=200`),
        ]);

        if (!suppliersRes.ok || !itemsRes.ok) {
          throw new Error("Failed to fetch supplier data from backend.");
        }

        const suppliers: SupplierApiRow[] = await suppliersRes.json();
        const items: Array<SupplierItem & { supplier_name: string }> = await itemsRes.json();

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
                  className={`sidebar-nav-link ${activeTab === "procurement" ? "active" : ""}`}
                  onClick={() => setActiveTab("procurement")}
                >
                  <ShoppingCart size={18} />
                  <span>Procurement</span>
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
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "analytics" ? "active" : ""}`}
                  onClick={() => setActiveTab("analytics")}
                >
                  <TrendingUp size={18} />
                  <span>Analytics</span>
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
      <main className="app-shell">
        <section className="dashboard">
          {activeTab === "dashboard" && (
            <>
              <header className="topbar">
                <h2>Dashboard</h2>
              </header>
              <div className="metrics">
                <article>
                  <span>Active Suppliers</span>
                  <strong>10</strong>
                </article>
                <article>
                  <span>Catalog Items</span>
                  <strong>80</strong>
                </article>
              </div>
            </>
          )}
          
          {activeTab === "procurement" && (
            <>
              <header className="topbar">
                <h2>Procurement Assistant</h2>
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
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Results appear after a chat query returns supplier data.</td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
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
            <>
              <header className="topbar">
                <h2>Suppliers Details</h2>
              </header>
              <div className="results-panel">
                <div className="panel-title">
                  <Users size={18} />
                  <h2>All Supplier Items</h2>
                </div>
                <div className="table-wrap suppliers-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Supplier</th>
                        <th>Email Domain</th>
                        <th>Reliability</th>
                        <th>Item Name</th>
                        <th>Normalized Name</th>
                        <th>Price/Unit</th>
                        <th>Available Qty</th>
                        <th>Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {supplierLoading ? (
                        <tr>
                          <td colSpan={8}>Loading full supplier catalog data...</td>
                        </tr>
                      ) : supplierError ? (
                        <tr>
                          <td colSpan={8}>{supplierError}</td>
                        </tr>
                      ) : supplierRows.length === 0 ? (
                        <tr>
                          <td colSpan={8}>No supplier items found.</td>
                        </tr>
                      ) : supplierRows.map((row, index) => (
                        <tr key={index}>
                          <td>{row.supplier_name}</td>
                          <td>{row.email_domain}</td>
                          <td>{row.reliability_score > 0 ? `${row.reliability_score.toFixed(1)}%` : "-"}</td>
                          <td>{row.ingredient_name}</td>
                          <td>{row.normalized_name}</td>
                          <td>
                            {row.price_per_unit} {row.currency}/{row.unit}
                          </td>
                          <td>
                            {row.available_qty} {row.unit}
                          </td>
                          <td>{row.valid_until ? new Date(row.valid_until).toLocaleDateString() : "N/A"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
          
          {activeTab === "analytics" && (
            <>
              <header className="topbar">
                <h2>Analytics</h2>
              </header>
              <div className="metrics">
                <article>
                  <span>Total Transactions</span>
                  <strong>240</strong>
                </article>
                <article>
                  <span>Avg. Supplier Score</span>
                  <strong>0.0/10</strong>
                </article>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Chat Panel */}
      <aside className="chat-panel">
        <div className="chat-header">
          <h2>Alexa</h2>
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
            placeholder="Ask Alexa..."
          />
          <button type="submit" aria-label="Send message">
            <Send size={18} />
          </button>
        </form>
      </aside>
    </>
  );
}
