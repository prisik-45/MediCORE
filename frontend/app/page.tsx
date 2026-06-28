"use client";

import {
  BarChart3,
  Bell,
  ChevronDown,
  FileText,
  GitCompare,
  Inbox,
  Loader2,
  LogOut,
  Mail,
  Menu,
  Plus,
  Search,
  Send,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
  X,
  Sliders,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Trash2,
  Edit,
  ArrowRight,
  Info,
  Eye,
  EyeOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

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
  moq?: number | null;
  pack_size?: string | null;
  catalog_email_id?: string | null;
};

type SupplierApiRow = {
  name: string;
  email_domain: string;
  last_email_date: string | null;
  certifications: string | null;
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
  certifications?: string | null;
};

type SidebarTab = "dashboard" | "inbox" | "catalogs" | "analysis" | "compare" | "assistant" | "suppliers" | "settings";

type CompareSort = "best-value" | "lowest-price" | "highest-qty";
type SupplierSort = "name" | "items" | "latest";

type InboxThread = {
  id: string;
  supplier_name: string;
  email_domain: string;
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
  pdf_url?: string | null;
  subject?: string | null;
};

type AuthUser = {
  email: string;
  name: string;
  role: string;
  organisation?: string;
};

type EmailFilter = {
  id?: string;
  require_attachment: boolean;
  sender_keywords: string | null;
  subject_keywords: string | null;
  skip_promotions_tab: boolean;
};

type ConnectedEmailAccount = {
  id: string;
  user_id: string;
  provider: string;
  email_address: string;
  imap_host: string;
  imap_port: number;
  sync_status: string;
  sync_error_msg?: string | null;
  last_synced_at?: string | null;
  created_at: string;
  filters: EmailFilter[];
};

type EmailSyncSetting = {
  id: string;
  user_id: string;
  poll_interval_minutes: number;
  auto_extract_catalog: boolean;
  notify_on_new_catalog: boolean;
  ingestion_approach?: string;
  trusted_suppliers?: string;
  keyword_filters?: string;
  pending_approvals?: string;
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

const RUPEE_SYMBOL = "₹";

function getBasePrice(price: number, currency: string): number {
  const curr = (currency || "INR").toUpperCase();
  if (curr === "USD") return price * 83;
  if (curr === "CAD") return price * 61;
  if (curr === "AUD") return price * 55;
  return price;
}

function formatMoney(value: number, currency = "INR"): string {
  const curr = (currency || "INR").toUpperCase();

  let symbol = curr;
  if (curr === "INR") symbol = "₹";
  else if (curr === "USD") symbol = "$";
  else if (curr === "CAD") symbol = "C$";
  else if (curr === "AUD") symbol = "A$";
  else if (curr === "EUR") symbol = "€";
  else if (curr === "GBP") symbol = "£";

  const separator = (symbol === "₹" || symbol === "$" || symbol === "€" || symbol === "£") ? "" : " ";
  return `${symbol}${separator}${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatCompactCurrency(value: number): string {
  let pref = "INR";
  if (typeof window !== "undefined") {
    pref = localStorage.getItem("mediCORE_currency_pref") || "INR";
  }

  if (!Number.isFinite(value) || value <= 0) {
    const defaultSymbol = pref === "USD" ? "$" : pref === "CAD" ? "C$" : pref === "AUD" ? "A$" : "₹";
    return `${defaultSymbol}0`;
  }

  // Convert base value (assumed INR) to preferred currency
  let finalVal = value;
  if (pref === "USD") {
    finalVal = value / 83;
  } else if (pref === "CAD") {
    finalVal = value / 61;
  } else if (pref === "AUD") {
    finalVal = value / 55;
  }

  let symbol = "₹";
  if (pref === "USD") symbol = "$";
  else if (pref === "CAD") symbol = "C$";
  else if (pref === "AUD") symbol = "A$";

  if (finalVal >= 100000) {
    return `${symbol}${(finalVal / 100000).toFixed(1)}L`;
  }

  if (finalVal >= 1000) {
    return `${symbol}${(finalVal / 1000).toFixed(1)}K`;
  }

  return `${symbol}${finalVal.toFixed(0)}`;
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

function userInitials(name: string, email: string): string {
  const source = name.trim() || email.split("@")[0] || "U";
  return source
    .split(/[.\s_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: "44px",
        height: "24px",
        borderRadius: "12px",
        background: checked ? "var(--accent)" : "rgba(0, 0, 0, 0.12)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.2s ease",
        opacity: disabled ? 0.6 : 1,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: "18px",
          height: "18px",
          borderRadius: "50%",
          background: "#fff",
          position: "absolute",
          top: "3px",
          left: checked ? "23px" : "3px",
          transition: "left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)",
          boxShadow: "0 1px 3px rgba(0, 0, 0, 0.15)",
        }}
      />
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      text: "Hey User!\nHow can I help you today?"
    }
  ]);
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>("dashboard");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [supplierRows, setSupplierRows] = useState<SupplierTableRow[]>([]);
  const [catalogEmails, setCatalogEmails] = useState<CatalogEmailRow[]>([]);
  const [supplierMetaRows, setSupplierMetaRows] = useState<SupplierApiRow[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(true);
  const [supplierError, setSupplierError] = useState<string | null>(null);
  const [selectedInboxSupplier, setSelectedInboxSupplier] = useState("");
  const [selectedCatalogSupplier, setSelectedCatalogSupplier] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [supplierSort, setSupplierSort] = useState<SupplierSort>("latest");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"all" | "best" | "low-stock">("all");
  const [compareIngredient, setCompareIngredient] = useState("");
  const [selectedCompareIngredient, setSelectedCompareIngredient] = useState("");
  const [compareSearchFocused, setCompareSearchFocused] = useState(false);
  const [compareSort, setCompareSort] = useState<CompareSort>("best-value");
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [selectedInboxThreadId, setSelectedInboxThreadId] = useState<string | null>(null);
  const [latestSeenEmailId, setLatestSeenEmailId] = useState<string | null>(null);
  const [visibleGuides, setVisibleGuides] = useState<Record<string, boolean>>({});

  // Settings Redesign States
  const [settingsActiveTab, setSettingsActiveTab] = useState<"profile" | "email">("profile");
  const [connectedAccounts, setConnectedAccounts] = useState<ConnectedEmailAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [syncSettings, setSyncSettings] = useState<EmailSyncSetting>({
    id: "",
    user_id: "",
    poll_interval_minutes: 15,
    auto_extract_catalog: true,
    notify_on_new_catalog: true
  });
  const [savingSyncSettings, setSavingSyncSettings] = useState(false);
  const [settingsSaveFeedback, setSettingsSaveFeedback] = useState(false);
  const [onboardingChecked, setOnboardingChecked] = useState(false);

  // Local states for settings inputs
  const [localApproach, setLocalApproach] = useState<string>("approach_2");
  const [localTrusted, setLocalTrusted] = useState<string>("");
  const [localKeywords, setLocalKeywords] = useState<string>("catalog, catalogue, price, offer, quote");

  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editOrganisation, setEditOrganisation] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Chat streaming and indicator states/refs
  const [isTypingResponse, setIsTypingResponse] = useState(false);
  const streamIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement | null>(null);

  // Initial load tracking ref
  const initialLoadRef = useRef(false);

  useEffect(() => {
    if (syncSettings) {
      setLocalApproach(syncSettings.ingestion_approach || "approach_2");
      setLocalTrusted(syncSettings.trusted_suppliers || "");
      setLocalKeywords(syncSettings.keyword_filters || "catalog, catalogue, price, offer, quote");
    }
  }, [syncSettings]);

  const pendingApprovalsList = useMemo(() => {
    try {
      return JSON.parse(syncSettings.pending_approvals || "[]");
    } catch (e) {
      return [];
    }
  }, [syncSettings.pending_approvals]);

  // Click outside detection to close the notifications menu
  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!userMenuOpen) return;
      const target = event.target as HTMLElement;
      const navbarActionsElement = document.querySelector(".navbar-actions");
      if (navbarActionsElement && !navbarActionsElement.contains(target)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleDocumentClick);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
    };
  }, [userMenuOpen]);



  // Add Account Form States
  const [addAccountExpanded, setAddAccountExpanded] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [newAccountProvider, setNewAccountProvider] = useState("Gmail");
  const [newAccountEmail, setNewAccountEmail] = useState("");
  const [newAccountPassword, setNewAccountPassword] = useState("");
  const [showSettingsPassword, setShowSettingsPassword] = useState(false);
  const [newAccountImapHost, setNewAccountImapHost] = useState("imap.gmail.com");
  const [newAccountImapPort, setNewAccountImapPort] = useState(993);

  // Filters States
  const [filterRequireAttachment, setFilterRequireAttachment] = useState(false);
  const [filterSenderKeywords, setFilterSenderKeywords] = useState("");
  const [filterSubjectKeywords, setFilterSubjectKeywords] = useState("");
  const [filterSkipPromotions, setFilterSkipPromotions] = useState(false);

  // Connection Testing States
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);






  const [syncingAccountsState, setSyncingAccountsState] = useState<Record<string, boolean>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const productionApiBaseUrl = "https://backend-production-b29e.up.railway.app";
  const productionWsUrl = "wss://backend-production-b29e.up.railway.app/ws/chat";

  const apiBaseUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      return process.env.NEXT_PUBLIC_API_URL;
    }

    if (typeof window === "undefined") {
      return productionApiBaseUrl;
    }

    const hn = window.location.hostname;
    const isLocal = hn === "localhost" ||
      hn === "127.0.0.1" ||
      hn === "0.0.0.0" ||
      hn.startsWith("192.168.") ||
      hn.startsWith("10.") ||
      hn.startsWith("172.") ||
      hn.endsWith(".local");

    if (isLocal) {
      const targetHost = hn === "localhost" ? "127.0.0.1" : hn;
      return `${window.location.protocol}//${targetHost}:8000`;
    }

    return productionApiBaseUrl;
  }, []);
  const wsUrl = useMemo(() => {
    if (process.env.NEXT_PUBLIC_WS_URL) {
      return process.env.NEXT_PUBLIC_WS_URL;
    }

    if (typeof window === "undefined") {
      return productionWsUrl;
    }

    const hn = window.location.hostname;
    const isLocal = hn === "localhost" ||
      hn === "127.0.0.1" ||
      hn === "0.0.0.0" ||
      hn.startsWith("192.168.") ||
      hn.startsWith("10.") ||
      hn.startsWith("172.") ||
      hn.endsWith(".local");

    if (isLocal) {
      const targetHost = hn === "localhost" ? "127.0.0.1" : hn;
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      return `${protocol}://${targetHost}:8000/ws/chat`;
    }

    return productionWsUrl;
  }, []);
  const showAssistantPanel = activeTab === "assistant";

  const inboxThreads = useMemo<InboxThread[]>(() => {
    const supplierMeta = new Map(supplierMetaRows.map((supplier) => [supplier.name, supplier]));

    // Group items by their catalog_email_id
    const itemsByEmail = new Map<string, SupplierTableRow[]>();
    for (const row of supplierRows) {
      if (row.catalog_email_id) {
        const current = itemsByEmail.get(row.catalog_email_id) ?? [];
        current.push(row);
        itemsByEmail.set(row.catalog_email_id, current);
      }
    }

    return catalogEmails.map((email) => {
      const items = itemsByEmail.get(email.id) ?? [];
      const sortedItems = [...items].sort((left, right) => getBasePrice(left.price_per_unit, left.currency) - getBasePrice(right.price_per_unit, right.currency));
      const meta = supplierMeta.get(email.supplier_name);
      const bestItem = sortedItems[0];
      const hasExtractedItems = sortedItems.length > 0;

      const statusTone: InboxThread["status_tone"] = hasExtractedItems ? "processed" : "pending";

      const statusLabel = hasExtractedItems
        ? "Processed"
        : email.processing_status === "completed" ? "Stored" : "Extracting";

      return {
        id: email.id,
        supplier_name: email.supplier_name,
        email_domain: items[0]?.email_domain ?? meta?.email_domain ?? "-",
        item_count: items.length,
        latest_item: email.subject || bestItem?.normalized_name || bestItem?.ingredient_name || "Email stored, extraction pending",
        received_at: email.received_at,
        latest_price: bestItem?.price_per_unit ?? 0,
        latest_currency: bestItem?.currency ?? "INR",
        latest_qty: bestItem?.available_qty ?? 0,
        latest_unit: bestItem?.unit ?? "",
        status_label: statusLabel,
        status_tone: statusTone,
        items: sortedItems,
        pdf_url: email.pdf_url,
        subject: email.subject
      };
    }).sort((left, right) => {
      const leftTime = new Date(left.received_at ?? 0).getTime();
      const rightTime = new Date(right.received_at ?? 0).getTime();
      return rightTime - leftTime;
    });
  }, [catalogEmails, supplierMetaRows, supplierRows]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setLatestSeenEmailId(localStorage.getItem("latestSeenEmailId"));
    }
  }, []);

  const hasNewMail = useMemo(() => {
    if (!inboxThreads.length) return false;
    if (activeTab === "inbox") return false;
    if (!latestSeenEmailId) {
      return true;
    }
    return inboxThreads[0].id !== latestSeenEmailId;
  }, [inboxThreads, latestSeenEmailId, activeTab]);

  useEffect(() => {
    if (activeTab === "inbox" && inboxThreads.length > 0) {
      const latestId = inboxThreads[0].id;
      localStorage.setItem("latestSeenEmailId", latestId);
      setLatestSeenEmailId(latestId);
    }
  }, [activeTab, inboxThreads]);

  const selectedInboxThread = useMemo(() => {
    if (!inboxThreads.length) {
      return null;
    }
    return inboxThreads.find((thread) => thread.id === selectedInboxThreadId) ?? inboxThreads[0];
  }, [inboxThreads, selectedInboxThreadId]);

  const assistantRows = rows as Array<Record<string, unknown>>;

  const dashboardData = useMemo(() => {
    const suppliers = new Set([
      ...supplierRows.map((row) => row.supplier_name),
      ...catalogEmails.map((email) => email.supplier_name),
    ]);
    const completedCatalogs = catalogEmails.filter((email) => email.processing_status === "completed").length;

    const itemGroups = new Map<string, SupplierTableRow[]>();
    for (const row of supplierRows) {
      const key = row.normalized_name || row.ingredient_name;
      const group = itemGroups.get(key) ?? [];
      group.push(row);
      itemGroups.set(key, group);
    }

    const deals = Array.from(itemGroups.entries())
      .map(([name, items]) => {
        const sorted = [...items].sort((left, right) => getBasePrice(left.price_per_unit, left.currency) - getBasePrice(right.price_per_unit, right.currency));
        const best = sorted[0];
        return { name, best };
      })
      .filter((deal) => deal.best)
      .sort((left, right) => getBasePrice(left.best.price_per_unit, left.best.currency) - getBasePrice(right.best.price_per_unit, right.best.currency));

    const activities = inboxThreads.slice(0, 5).map((thread, index) => ({
      tone: index === 2 ? "warning" : index % 2 === 0 ? "strong" : "soft",
      text: thread.item_count > 0
        ? `${thread.supplier_name} sent catalogue - ${thread.item_count} items extracted`
        : `${thread.supplier_name} sent catalogue email - extraction pending`,
      time: formatRelativeTime(thread.received_at),
    }));

    return {
      emailsReceived: catalogEmails.length,
      completedCatalogs,
      activeSuppliers: suppliers.size,
      deals: deals.slice(0, 3),
      activities,
    };
  }, [catalogEmails, inboxThreads, supplierRows]);

  const topDashboardDeal = dashboardData.deals[0];

  const supplierDirectory = useMemo(() => {
    const supplierMap = new Map<string, SupplierTableRow[]>();
    const emailBySupplier = new Map<string, CatalogEmailRow[]>();
    const supplierMeta = new Map(supplierMetaRows.map((supplier) => [supplier.name, supplier]));

    for (const row of supplierRows) {
      const current = supplierMap.get(row.supplier_name) ?? [];
      current.push(row);
      supplierMap.set(row.supplier_name, current);
    }

    for (const email of catalogEmails) {
      const current = emailBySupplier.get(email.supplier_name) ?? [];
      current.push(email);
      emailBySupplier.set(email.supplier_name, current);
    }

    const supplierNames = new Set([...supplierMap.keys(), ...emailBySupplier.keys()]);
    const search = supplierSearch.trim().toLowerCase();
    const summaries = Array.from(supplierNames).map((supplierName) => {
      const items = supplierMap.get(supplierName) ?? [];
      const sortedByPrice = [...items].sort((left, right) => getBasePrice(left.price_per_unit, left.currency) - getBasePrice(right.price_per_unit, right.currency));
      const latestEmail = (emailBySupplier.get(supplierName) ?? []).slice().sort((left, right) => {
        return new Date(right.received_at).getTime() - new Date(left.received_at).getTime();
      })[0];
      const meta = supplierMeta.get(supplierName);
      const totalQty = items.reduce((total, item) => total + item.available_qty, 0);
      return {
        supplier_name: supplierName,
        email_domain: items[0]?.email_domain ?? meta?.email_domain ?? "-",
        item_count: items.length,
        best_item: sortedByPrice[0],
        total_qty: totalQty,
        last_catalog_at: latestEmail?.received_at ?? items[0]?.valid_until ?? meta?.last_email_date ?? null,
        subject: latestEmail?.subject ?? "Catalogue email received",
        items: sortedByPrice,
        certifications: meta?.certifications ?? null,
      };
    }).filter((supplier) => {
      return !search
        || supplier.supplier_name.toLowerCase().includes(search)
        || supplier.email_domain.toLowerCase().includes(search)
        || supplier.items.some((item) => item.normalized_name.toLowerCase().includes(search) || item.ingredient_name.toLowerCase().includes(search));
    });

    return summaries.sort((left, right) => {
      if (supplierSort === "name") return left.supplier_name.localeCompare(right.supplier_name);
      if (supplierSort === "items") return right.item_count - left.item_count;
      return new Date(right.last_catalog_at ?? 0).getTime() - new Date(left.last_catalog_at ?? 0).getTime();
    });
  }, [catalogEmails, supplierMetaRows, supplierRows, supplierSearch, supplierSort]);

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

  const compareSuggestions = useMemo(() => {
    const requested = compareIngredient.trim().toLowerCase();
    const ranked = availableIngredients.filter((ingredient) => {
      const normalized = ingredient.toLowerCase();
      return !requested || normalized.startsWith(requested) || normalized.includes(requested);
    });
    return ranked.slice(0, 8);
  }, [availableIngredients, compareIngredient]);

  const compareData = useMemo(() => {
    const requested = selectedCompareIngredient.trim().toLowerCase();
    if (!requested) {
      return { rows: [], topRows: [], otherRows: [], ingredientLabel: "ingredient" };
    }

    const matchedRows = supplierRows.filter((row) => {
      const normalized = (row.normalized_name || "").toLowerCase();
      const ingredient = (row.ingredient_name || "").toLowerCase();
      return !requested || normalized.includes(requested) || ingredient.includes(requested);
    });

    const bySupplier = new Map<string, SupplierTableRow>();
    for (const row of matchedRows) {
      const current = bySupplier.get(row.supplier_name);
      if (!current || getBasePrice(row.price_per_unit, row.currency) < getBasePrice(current.price_per_unit, current.currency)) {
        bySupplier.set(row.supplier_name, row);
      }
    }

    const rows = Array.from(bySupplier.values());
    const minPrice = Math.min(...rows.map((row) => getBasePrice(row.price_per_unit, row.currency)), 0);
    const maxPrice = Math.max(...rows.map((row) => getBasePrice(row.price_per_unit, row.currency)), 1);
    const maxQty = Math.max(...rows.map((row) => row.available_qty), 1);

    const scored = rows.map((row) => {
      const rowPriceBase = getBasePrice(row.price_per_unit, row.currency);
      const priceScore = maxPrice === minPrice ? 100 : ((maxPrice - rowPriceBase) / (maxPrice - minPrice)) * 100;
      const qtyScore = (row.available_qty / maxQty) * 100;
      const overallScore = Math.round(priceScore * 0.65 + qtyScore * 0.35);
      return {
        ...row,
        priceScore: Math.round(priceScore),
        qtyScore: Math.round(qtyScore),
        overallScore,
      };
    });

    const sorted = scored.sort((left, right) => {
      if (compareSort === "lowest-price") {
        return getBasePrice(left.price_per_unit, left.currency) - getBasePrice(right.price_per_unit, right.currency);
      }
      if (compareSort === "highest-qty") {
        return right.available_qty - left.available_qty;
      }
      return right.overallScore - left.overallScore || getBasePrice(left.price_per_unit, left.currency) - getBasePrice(right.price_per_unit, right.currency);
    });

    return {
      rows: sorted,
      topRows: sorted.slice(0, 3),
      otherRows: sorted.slice(3),
      ingredientLabel: sorted[0]?.normalized_name || selectedCompareIngredient || "ingredient",
    };
  }, [compareSort, selectedCompareIngredient, supplierRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Get active Supabase session and set active user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.email?.split("@")[0] || "User";
        const org = u.user_metadata?.organisation || "MediCORE Central";
        const userRole = u.user_metadata?.role
          ? (u.user_metadata.role.charAt(0).toUpperCase() + u.user_metadata.role.slice(1))
          : "Member";
        setAuthUser((prev) => {
          if (
            prev &&
            prev.email === (u.email || "") &&
            prev.name === name &&
            prev.role === userRole &&
            prev.organisation === org
          ) {
            return prev;
          }
          return {
            email: u.email || "",
            name: name,
            role: userRole,
            organisation: org
          };
        });
      } else {
        setAuthUser(null);
        initialLoadRef.current = false;
        router.push("/login");
      }
      setAuthChecked(true);
    });

    // Listen to changes in auth state (e.g. sign outs)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.email?.split("@")[0] || "User";
        const org = u.user_metadata?.organisation || "MediCORE Central";
        const userRole = u.user_metadata?.role
          ? (u.user_metadata.role.charAt(0).toUpperCase() + u.user_metadata.role.slice(1))
          : "Member";
        setAuthUser((prev) => {
          if (
            prev &&
            prev.email === (u.email || "") &&
            prev.name === name &&
            prev.role === userRole &&
            prev.organisation === org
          ) {
            return prev;
          }
          return {
            email: u.email || "",
            name: name,
            role: userRole,
            organisation: org
          };
        });
      } else {
        setAuthUser(null);
        initialLoadRef.current = false;
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

  useEffect(() => {
    if (authUser?.name) {
      setMessages((prev) => {
        if (
          prev.length === 1 &&
          prev[0].role === "assistant" &&
          (prev[0].text.startsWith("Hi there!") || prev[0].text.startsWith("Hey "))
        ) {
          return [
            {
              role: "assistant",
              text: `Hey ${authUser.name}!\nHow can I help you today?`,
            },
          ];
        }
        return prev;
      });
    }
  }, [authUser]);

  // Auto scroll to bottom of chat window
  useEffect(() => {
    if (chatMessagesEndRef.current) {
      chatMessagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTypingResponse]);

  // Clean up streaming interval on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) {
        clearInterval(streamIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    async function checkEmailAccountOnboarding() {
      if (!authUser) return;
      try {
        const res = await authFetch(`${apiBaseUrl}/api/email-accounts`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length === 0) {
            router.push("/register/email-setup");
          } else {
            setOnboardingChecked(true);
          }
        } else {
          setOnboardingChecked(true); // Fallback to dashboard on API error
        }
      } catch (err) {
        console.error("Error during onboarding account check:", err);
        setOnboardingChecked(true); // Fallback to dashboard on network error
      }
    }

    if (authChecked && authUser) {
      checkEmailAccountOnboarding();
    }
  }, [authUser, authChecked, apiBaseUrl, router]);

  useEffect(() => {
    if (!selectedInboxThreadId && inboxThreads[0]) {
      setSelectedInboxThreadId(inboxThreads[0].id);
      setSelectedInboxSupplier(inboxThreads[0].supplier_name);
    }
  }, [inboxThreads, selectedInboxThreadId]);

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
      if (!authUser) {
        setSupplierLoading(false);
        return;
      }

      if (!initialLoadRef.current) {
        setSupplierLoading(true);
      }
      setSupplierError(null);

      try {
        const [suppliersRes, itemsRes, emailsRes] = await Promise.all([
          authFetch(`${apiBaseUrl}/api/suppliers`),
          authFetch(`${apiBaseUrl}/api/catalogs/items?limit=200`),
          authFetch(`${apiBaseUrl}/api/catalogs/emails?limit=50`),
        ]);

        if (!emailsRes.ok) {
          throw new Error("Failed to fetch supplier emails from backend.");
        }

        const suppliers: SupplierApiRow[] = suppliersRes.ok ? await suppliersRes.json() : [];
        const items: Array<SupplierItem & { supplier_name: string }> = itemsRes.ok ? await itemsRes.json() : [];
        const emails: CatalogEmailRow[] = await emailsRes.json();

        const supplierMeta = new Map(
          suppliers.map((supplier) => [supplier.name, supplier])
        );

        const mergedRows: SupplierTableRow[] = items.map((item) => {
          const meta = supplierMeta.get(item.supplier_name);
          return {
            ...item,
            email_domain: meta?.email_domain ?? "-",
            certifications: meta?.certifications ?? null,
          };
        });

        if (!cancelled) {
          setSupplierMetaRows(suppliers);
          setSupplierRows(mergedRows);
          setCatalogEmails(emails);
          setSupplierError(!suppliersRes.ok || !itemsRes.ok ? "Showing fetched emails. Catalogue item details are still loading or unavailable." : null);
          setSupplierLoading(false);
          initialLoadRef.current = true;
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
  }, [apiBaseUrl, authUser, dataRefreshKey]);

  useEffect(() => {
    if (authUser?.name) {
      setMessages((current) => {
        if (
          current.length === 1 &&
          current[0].role === "assistant" &&
          (current[0].text === "Hey User!\nHow can I help you today?" || current[0].text.startsWith("Hey User!"))
        ) {
          const firstName = authUser.name.split(" ")[0];
          return [
            {
              role: "assistant",
              text: `Hey ${firstName}!\nHow can I help you today?`
            }
          ];
        }
        return current;
      });
    }
  }, [authUser]);

  async function ensureSocket() {
    if (socketRef.current?.readyState === WebSocket.OPEN) return socketRef.current;

    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || "";
    const authenticatedWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

    const socket = new WebSocket(authenticatedWsUrl);
    socket.onmessage = (event) => {
      const payload = JSON.parse(event.data);
      if (payload.type === "status") {
        // Skip "Planning query" status messages
        if (payload.message !== "Planning query") {
          setMessages((current) => [...current, { role: "status", text: payload.message }]);
        }
      }
      if (payload.type === "answer") {
        setIsTypingResponse(false);
        setRows(payload.rows || []);
        simulateStreamingResponse(payload.answer);
      }
      if (payload.type === "error") {
        setIsTypingResponse(false);
        setMessages((current) => [...current, { role: "status", text: payload.message }]);
      }
    };
    socketRef.current = socket;
    return socket;
  }

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setInput("");
    
    // Trigger typing response indicator
    setIsTypingResponse(true);
    
    const socket = await ensureSocket();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(trimmed);
    } else {
      socket.onopen = () => socket.send(trimmed);
    }
  }

  function simulateStreamingResponse(fullText: string) {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }
    
    // Add empty assistant message to stream into
    setMessages((current) => [...current, { role: "assistant", text: "" }]);
    
    let index = 0;
    const speed = 15;
    const charsPerChunk = 3;
    
    streamIntervalRef.current = setInterval(() => {
      setMessages((current) => {
        const next = [...current];
        const lastMsg = next[next.length - 1];
        if (lastMsg && lastMsg.role === "assistant") {
          const chunk = fullText.slice(index, index + charsPerChunk);
          lastMsg.text += chunk;
          index += charsPerChunk;
          
          if (index >= fullText.length) {
            if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
          }
        }
        return next;
      });
    }, speed);
  }

  function handleRefreshChat() {
    socketRef.current?.close();
    socketRef.current = null;
    const nameToUse = authUser?.name ? authUser.name.split(" ")[0] : "User";
    setMessages([
      {
        role: "assistant",
        text: `Hey ${nameToUse}!\nHow can I help you today?`
      }
    ]);
    setInput("");
    setIsTypingResponse(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      // Clear cookie
      document.cookie = `sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure`;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setAuthUser(null);
    initialLoadRef.current = false;
    setActiveTab("dashboard");
    router.push("/login");
  }

  async function handleSaveProfile() {
    if (!editName.trim()) {
      setProfileError("Name cannot be empty.");
      return;
    }
    setIsSavingProfile(true);
    setProfileError(null);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: {
          full_name: editName.trim(),
          organisation: editOrganisation.trim()
        }
      });
      if (error) throw error;
      
      // Update local state
      setAuthUser(prev => prev ? {
        ...prev,
        name: editName.trim(),
        organisation: editOrganisation.trim()
      } : null);
      
      setIsEditingProfile(false);
    } catch (err: any) {
      setProfileError(err.message || "Failed to update profile.");
    } finally {
      setIsSavingProfile(false);
    }
  }

  // --- Premium Settings Integration Helpers ---
  async function authFetch(url: string, options: RequestInit = {}) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const headers = {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(url, { ...options, headers });
  }

  async function fetchConnectedAccounts() {
    setLoadingAccounts(true);
    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts`);
      if (res.ok) {
        const data = await res.json();
        setConnectedAccounts(data);
      }
    } catch (error) {
      console.error("Error loading email accounts:", error);
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function fetchEmailSyncSettings() {
    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts/sync-settings`);
      if (res.ok) {
        const data = await res.json();
        setSyncSettings(data);
      }
    } catch (error) {
      console.error("Error loading sync settings:", error);
    }
  }

  async function saveEmailSyncSettings(updatedSettings: Partial<any>) {
    setSavingSyncSettings(true);
    const merged = { ...syncSettings, ...updatedSettings };
    setSyncSettings(merged);

    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts/sync-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poll_interval_minutes: Number(merged.poll_interval_minutes),
          auto_extract_catalog: Boolean(merged.auto_extract_catalog),
          notify_on_new_catalog: Boolean(merged.notify_on_new_catalog),
          ingestion_approach: String(merged.ingestion_approach || "approach_2"),
          trusted_suppliers: String(merged.trusted_suppliers || ""),
          keyword_filters: String(merged.keyword_filters || "catalog, catalogue, price, offer, quote"),
          pending_approvals: String(merged.pending_approvals || ""),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSyncSettings(data);
        setSettingsSaveFeedback(true);
        setTimeout(() => setSettingsSaveFeedback(false), 2500);
      }
    } catch (error) {
      console.error("Error saving sync settings:", error);
    } finally {
      setSavingSyncSettings(false);
    }
  }

  async function handleGrantAccess(item: any) {
    const sender = item.sender.trim().toLowerCase();
    const domain = sender.split("@")[1] || sender;

    const currentTrusted = syncSettings.trusted_suppliers || "";
    const trustedList = currentTrusted.split(",").map((s: string) => s.trim().toLowerCase()).filter(Boolean);
    if (!trustedList.includes(sender) && !trustedList.includes(domain)) {
      trustedList.push(sender);
    }
    const newTrusted = trustedList.join(", ");

    let currentPending: any[] = [];
    try {
      currentPending = JSON.parse(syncSettings.pending_approvals || "[]");
    } catch (e) {
      currentPending = [];
    }
    const newPending = currentPending.filter((p: any) => p.email_id !== item.email_id);

    await saveEmailSyncSettings({
      trusted_suppliers: newTrusted,
      pending_approvals: JSON.stringify(newPending)
    });

    try {
      await authFetch(`${apiBaseUrl}/api/ingestion/poll-now`, { method: "POST" });
    } catch (e) {
      console.error("Error triggering immediate poll:", e);
    }
  }

  async function handleIgnoreAccess(item: any) {
    let currentPending: any[] = [];
    try {
      currentPending = JSON.parse(syncSettings.pending_approvals || "[]");
    } catch (e) {
      currentPending = [];
    }
    const newPending = currentPending.filter((p: any) => p.email_id !== item.email_id);

    await saveEmailSyncSettings({
      pending_approvals: JSON.stringify(newPending)
    });
  }

  async function testConnection() {
    if (!newAccountEmail.trim() || !newAccountPassword.trim()) {
      setTestResult({ success: false, message: "Email and app password are required to test connection." });
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: newAccountProvider,
          email_address: newAccountEmail.trim(),
          imap_host: newAccountImapHost,
          imap_port: Number(newAccountImapPort),
          password: newAccountPassword,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({ success: true, message: data.message || "Connected successfully! App credentials passed verification." });
      } else {
        setTestResult({ success: false, message: data.detail || data.message || "Verification failed. Check IMAP settings and App Password." });
      }
    } catch (error) {
      setTestResult({ success: false, message: "Server connection error. Please ensure backend is running." });
    } finally {
      setTestingConnection(false);
    }
  }

  async function saveAccount() {
    if (!newAccountEmail.trim() || (!editingAccountId && !newAccountPassword.trim())) {
      return;
    }
    setSavingAccount(true);
    try {
      const payload = {
        provider: newAccountProvider,
        email_address: newAccountEmail.trim(),
        imap_host: newAccountImapHost,
        imap_port: Number(newAccountImapPort),
        password: newAccountPassword || undefined,
        filters: {
          require_attachment: filterRequireAttachment,
          sender_keywords: filterSenderKeywords.trim() || null,
          subject_keywords: filterSubjectKeywords.trim() || null,
          skip_promotions_tab: filterSkipPromotions,
        }
      };

      const url = editingAccountId
        ? `${apiBaseUrl}/api/email-accounts/${editingAccountId}`
        : `${apiBaseUrl}/api/email-accounts`;

      const method = editingAccountId ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        await fetchConnectedAccounts();
        resetAddAccountForm();
        setDataRefreshKey((current) => current + 1);
      } else {
        const data = await res.json();
        alert(data.detail || "Failed to save email account credentials.");
      }
    } catch (error) {
      console.error("Error saving email account:", error);
    } finally {
      setSavingAccount(false);
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm("Are you sure you want to disconnect this inbox? MediCORE will completely stop polling and remove all configurations.")) {
      return;
    }
    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchConnectedAccounts();
        setDataRefreshKey((current) => current + 1);
      } else {
        alert("Failed to delete account from server.");
      }
    } catch (error) {
      console.error("Error disconnecting account:", error);
    }
  }

  async function triggerAccountSync(id: string) {
    setSyncingAccountsState(prev => ({ ...prev, [id]: true }));
    try {
      const res = await authFetch(`${apiBaseUrl}/api/email-accounts/${id}/sync`, {
        method: "POST",
      });
      if (res.ok) {
        setTimeout(async () => {
          await fetchConnectedAccounts();
          setSyncingAccountsState(prev => ({ ...prev, [id]: false }));
          setDataRefreshKey((current) => current + 1);
        }, 1500);
      } else {
        setSyncingAccountsState(prev => ({ ...prev, [id]: false }));
      }
    } catch (error) {
      console.error("Error triggering sync:", error);
      setSyncingAccountsState(prev => ({ ...prev, [id]: false }));
    }
  }

  async function deleteCatalogEmail(emailId: string) {
    if (!confirm("WARNING: This will permanently delete this email and all of its extracted catalog data from MediCORE.\n\nThis action cannot be undone. Are you sure you want to proceed?")) {
      return;
    }
    try {
      const res = await authFetch(`${apiBaseUrl}/api/catalogs/emails/${emailId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSelectedInboxThreadId(null);
        setSelectedInboxSupplier("");
        setDataRefreshKey((current) => current + 1);
      } else {
        alert("Failed to delete catalog email from server.");
      }
    } catch (error) {
      console.error("Error deleting catalog email:", error);
      alert("Failed to delete catalog email. Please try again.");
    }
  }

  function editAccount(acc: ConnectedEmailAccount) {
    setEditingAccountId(acc.id);
    setNewAccountProvider(acc.provider);
    setNewAccountEmail(acc.email_address);
    setNewAccountPassword("");
    setNewAccountImapHost(acc.imap_host);
    setNewAccountImapPort(acc.imap_port);

    const filter = acc.filters?.[0];
    if (filter) {
      setFilterRequireAttachment(filter.require_attachment);
      setFilterSenderKeywords(filter.sender_keywords || "");
      setFilterSubjectKeywords(filter.subject_keywords || "");
      setFilterSkipPromotions(filter.skip_promotions_tab);
    } else {
      setFilterRequireAttachment(false);
      setFilterSenderKeywords("");
      setFilterSubjectKeywords("");
      setFilterSkipPromotions(false);
    }

    setSetupStep(3);
    setAddAccountExpanded(true);
    setTestResult({ success: true, message: "Testing is not required to update filters or provider details. Type a new app password if you want to update credentials." });
  }

  function resetAddAccountForm() {
    setAddAccountExpanded(false);
    setEditingAccountId(null);
    setSetupStep(1);
    setNewAccountProvider("Gmail");
    setNewAccountEmail(authUser?.email || "");
    setNewAccountPassword("");
    setNewAccountImapHost("imap.gmail.com");
    setNewAccountImapPort(993);
    setFilterRequireAttachment(false);
    setFilterSenderKeywords("");
    setFilterSubjectKeywords("");
    setFilterSkipPromotions(false);
    setTestResult(null);
  }

  useEffect(() => {
    if (authUser && activeTab === "settings") {
      fetchConnectedAccounts();
      fetchEmailSyncSettings();
      setNewAccountEmail(authUser.email);
    }
  }, [authUser, activeTab]);

  if (!authChecked || (authUser && !onboardingChecked)) {
    return (
      <main className="auth-page">
        <div className="auth-card-wrapper" style={{ maxWidth: "420px" }}>
          <div className="auth-card-glow"></div>
          <div className="auth-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "220px", textAlign: "center" }}>
            <Loader2 className="animate-spin text-emerald" size={40} style={{ color: "#0f7a5f", marginBottom: "20px" }} />
            <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#17211c", margin: "0 0 8px 0" }}>Setting up your workspace</h2>
            <p style={{ fontSize: "13px", color: "#66736d", margin: 0, lineHeight: 1.5 }}>
              Verifying your credentials and preparing supplier catalogs...
            </p>
          </div>
        </div>
      </main>
    );
  }

  if (!authUser) {
    return null;
  }

  return (
    <>
      <style>{`
        @keyframes pulse-bell {
          0% { transform: scale(1); }
          50% { transform: scale(1.15) rotate(8deg); }
          100% { transform: scale(1); }
        }
        @keyframes fade-in-down {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-brand" style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          <h1>MediCORE</h1>
          <span style={{ fontSize: "12.5px", color: "var(--muted)", fontWeight: 500, letterSpacing: "0.02em", borderLeft: "1px solid var(--line)", paddingLeft: "14px" }}>
            AI-Powered Automated Procurement System
          </span>
        </div>
        <div className="navbar-actions" style={{ position: "relative" }}>
          <div className="user-menu" onClick={() => setUserMenuOpen(!userMenuOpen)}>
            <div className="user-avatar">{userInitials(authUser.name, authUser.email)}</div>
            <div className="user-info">
              <p>{authUser.name}</p>
              <span>{authUser.role}</span>
            </div>
            {/* Pulsating Bell Icon instead of ChevronDown */}
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: "4px" }}>
              <Bell
                size={18}
                style={{
                  color: pendingApprovalsList.length > 0 ? "var(--accent)" : "var(--muted)",
                  transition: "all 0.3s ease",
                  animation: pendingApprovalsList.length > 0 ? "pulse-bell 1.5s infinite ease-in-out" : "none"
                }}
              />
              {pendingApprovalsList.length > 0 && (
                <span style={{
                  position: "absolute",
                  top: "-4px",
                  right: "-4px",
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  background: "#ff5a5a",
                  border: "2px solid #fff",
                  boxShadow: "0 0 6px rgba(255, 90, 90, 0.6)"
                }} />
              )}
            </div>
          </div>

          {/* Floating Notifications Window */}
          {userMenuOpen && (
            <div style={{
              position: "absolute",
              top: "54px",
              right: 0,
              width: "380px",
              background: "rgba(255, 255, 255, 0.95)",
              backdropFilter: "blur(16px)",
              border: "1px solid var(--line)",
              borderRadius: "14px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.08)",
              zIndex: 1000,
              padding: "16px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              animation: "fade-in-down 0.2s ease-out"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#092f28", display: "flex", alignItems: "center", gap: "6px" }}>
                  <Bell size={16} /> Notifications
                </span>
                {pendingApprovalsList.length > 0 && (
                  <span style={{ fontSize: "11px", background: "rgba(255, 90, 90, 0.1)", color: "#ff5a5a", padding: "2px 8px", borderRadius: "10px", fontWeight: 600 }}>
                    {pendingApprovalsList.length} Pending Approval{pendingApprovalsList.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              {/* Notifications List Container */}
              <div style={{
                maxHeight: "280px",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "10px"
              }}>
                {pendingApprovalsList.length === 0 ? (
                  <div style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "8px"
                  }}>
                    <div style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      background: "rgba(15, 122, 95, 0.06)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)"
                    }}>
                      <CheckCircle2 size={20} />
                    </div>
                    <strong style={{ fontSize: "13px", color: "var(--ink)" }}>All Caught Up!</strong>
                    <span style={{ fontSize: "12px", color: "var(--muted)" }}>No new supplier permission requests pending.</span>
                  </div>
                ) : (
                  pendingApprovalsList.map((item: any) => (
                    <div
                      key={item.email_id}
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "rgba(0, 0, 0, 0.015)",
                        border: "1px solid var(--line)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 700, fontSize: "12.5px", color: "var(--ink)", wordBreak: "break-all", paddingRight: "8px" }}>
                            {item.supplier_name || item.sender}
                          </span>
                          <span style={{ fontSize: "10px", color: "var(--muted)", whiteSpace: "nowrap" }}>
                            {formatRelativeTime(item.date)}
                          </span>
                        </div>
                        <span style={{ fontSize: "11.5px", color: "var(--muted)", fontStyle: "italic", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {item.subject || "(No Subject)"}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGrantAccess(item);
                          }}
                          style={{
                            flex: 1,
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            borderRadius: "6px",
                            border: "none",
                            background: "var(--accent)",
                            color: "#fff",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                        >
                          <CheckCircle2 size={13} /> Grant Access
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleIgnoreAccess(item);
                          }}
                          style={{
                            padding: "6px 12px",
                            fontSize: "11.5px",
                            fontWeight: 600,
                            borderRadius: "6px",
                            border: "1px solid var(--line)",
                            background: "#fff",
                            color: "var(--muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "4px"
                          }}
                        >
                          <XCircle size={13} /> Ignore
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
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
                  <div className="sidebar-icon-wrapper">
                    <Inbox size={18} />
                    {hasNewMail && <span className="notification-dot" />}
                  </div>
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
          <div className="sidebar-section"><ul className="sidebar-nav">
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
                className={`sidebar-nav-link ${activeTab === "assistant" ? "active" : ""}`}
                onClick={() => setActiveTab("assistant")}
              >
                <Sparkles size={18} />
                <span>AI Assistant</span>
              </button>
            </li>
          </ul>
          </div>
          <div className="sidebar-settings-section">
            <div className="sidebar-section-title">Settings</div>
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-nav-link ${activeTab === "settings" ? "active" : ""}`}
                  onClick={() => setActiveTab("settings")}
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
      <main className={`app-shell ${showAssistantPanel ? "has-chat" : ""}`}>
        <section className={`dashboard ${showAssistantPanel ? "assistant-layout" : ""}`}>
          {activeTab === "dashboard" && (
            <section className="overview-dashboard">
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px",
                borderRadius: "10px",
                border: "1px solid var(--line)",
                background: "var(--panel)",
                marginBottom: "8px"
              }}>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Dashboard</h2>
              </div>
              <div className="insight-banner">
                {supplierLoading ? (
                  "Loading catalogue intelligence..."
                ) : supplierError ? (
                  supplierError
                ) : topDashboardDeal ? (
                  <>
                    AI found the best deal on {topDashboardDeal.best.normalized_name} - {topDashboardDeal.best.supplier_name} offers the lowest price at {formatMoney(topDashboardDeal.best.price_per_unit, topDashboardDeal.best.currency)}/{topDashboardDeal.best.unit}.
                    <button type="button" onClick={() => setActiveTab("compare")}>{"Compare suppliers ->"}</button>
                  </>
                ) : (
                  "No catalogue data extracted yet. Poll your inbox after sending an unread PDF email."
                )}
              </div>

              <p className="overview-label">Overall overview</p>
              <div className="overview-metrics">
                <article>
                  <span>Emails received</span>
                  <strong>{dashboardData.emailsReceived}</strong>
                  <small>{dashboardData.activities.length} recent supplier updates</small>
                </article>
                <article>
                  <span>New catalogues</span>
                  <strong>{dashboardData.completedCatalogs}</strong>
                  <small>{Math.max(0, dashboardData.emailsReceived - dashboardData.completedCatalogs)} pending review</small>
                </article>
                <article>
                  <span>Active suppliers</span>
                  <strong>{dashboardData.activeSuppliers}</strong>
                  <small>All verified suppliers</small>
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
                    <h2>Best Deals</h2>
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
                          <strong>{formatMoney(deal.best.price_per_unit, deal.best.currency)}/{deal.best.unit}</strong>
                          <small>Best listed</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            </section>
          )}

          {activeTab === "inbox" && (
            <>
              <div className="inbox-layout">
                <aside className="inbox-list-panel">
                  <div className="inbox-panel-header">
                    <div>
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
                          key={thread.id}
                          type="button"
                          className={`inbox-thread ${selectedInboxThread?.id === thread.id ? "active" : ""}`}
                          onClick={() => {
                            setSelectedInboxThreadId(thread.id);
                            setSelectedInboxSupplier(thread.supplier_name);
                          }}
                        >
                          <div className="inbox-thread-topline">
                            <strong>{thread.supplier_name}</strong>
                            <span>{formatRelativeTime(thread.received_at)}</span>
                          </div>
                          <div className="inbox-thread-subject" style={{ textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                            {thread.subject || "No Subject"}
                          </div>
                          <div className="inbox-thread-meta">
                            <span className={`thread-status ${thread.status_tone}`}>{thread.status_label}</span>
                            <span className="thread-meta-items" style={{ fontSize: "11px", color: "var(--muted)", marginLeft: "auto" }}>{thread.item_count} items</span>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </aside>

                <section className="inbox-detail-panel">
                  {selectedInboxThread ? (
                    <>
                      <div className="inbox-panel-header inbox-panel-header-main" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "18px" }}>
                        <div>
                          <h2>{selectedInboxThread.supplier_name} — {selectedInboxThread.email_domain}</h2>
                          <div className="inbox-subline">{selectedInboxThread.subject || "No Subject"} — {selectedInboxThread.item_count} items enclosed</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                          <div className="inbox-subtitle" style={{ margin: 0 }}>{formatInboxDate(selectedInboxThread.received_at)}</div>
                          <button
                            type="button"
                            onClick={() => deleteCatalogEmail(selectedInboxThread.id)}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "6px",
                              padding: "6px 12px",
                              background: "rgba(229, 62, 62, 0.08)",
                              color: "#e53e3e",
                              border: "1px solid rgba(229, 62, 62, 0.2)",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: 600,
                              cursor: "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            <Trash2 size={13} /> Delete Email
                          </button>
                        </div>
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
                                <th>Price/Unit</th>
                                <th>Qty Avail.</th>
                                <th>Lead Time</th>
                                <th>MOQ</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedInboxThread.items.length === 0 ? (
                                <tr>
                                  <td colSpan={6}>No catalogue items were extracted for this supplier.</td>
                                </tr>
                              ) : (
                                selectedInboxThread.items.slice(0, 4).map((item, index) => {
                                  const bestPrice = Math.min(...selectedInboxThread.items.map((row) => row.price_per_unit));
                                  return (
                                    <tr key={`${item.supplier_name}-${item.ingredient_name}-${index}`}>
                                      <td>{item.ingredient_name}</td>
                                      <td>{formatMoney(item.price_per_unit, item.currency)}/{item.unit}</td>
                                      <td>{item.available_qty.toLocaleString()} {item.unit}</td>
                                      <td>{item.lead_time_days != null ? `${item.lead_time_days} days` : "-"}</td>
                                      <td>{item.moq != null ? `${formatQuantity(Number(item.moq))} ${item.unit}` : "-"}</td>
                                      <td>{item.price_per_unit === bestPrice ? "Best price" : "-"}</td>
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
                        <button type="button" onClick={() => { setSelectedCatalogSupplier(selectedInboxThread.supplier_name); setActiveTab("catalogs"); }}>View full catalogue</button>
                        <button type="button" onClick={() => setActiveTab("assistant")}>Ask AI</button>
                      </div>
                    </>
                  ) : (
                    <div className="inbox-empty-state">Pick a supplier to view the extracted catalogue details.</div>
                  )}
                </section>
              </div>
            </>
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
                          <th>Price/unit</th>
                          <th>Qty avail.</th>
                          <th>Lead Time</th>
                          <th>MOQ</th>
                          <th>Valid until</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedCatalogItems.length === 0 ? (
                          <tr>
                            <td colSpan={7}>No catalogue items match this filter.</td>
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
                              <td>{formatMoney(item.price_per_unit, item.currency)}/{item.unit}</td>
                              <td>{formatQuantity(item.available_qty)} {item.unit}</td>
                              <td>{item.lead_time_days != null ? `${item.lead_time_days} days` : "-"}</td>
                              <td>{item.moq != null ? `${formatQuantity(Number(item.moq))} ${item.unit}` : "-"}</td>
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
                  <span>Catalogue Items</span>
                  <strong>{supplierRows.length}</strong>
                </article>
              </div>
            </>
          )}

          {activeTab === "compare" && (
            <section className="compare-window">
              <div className="compare-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Compare</h2>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
                  <div className="compare-search-group">
                    <span>Comparing:</span>
                    <div className="compare-search-wrap">
                      <label className="compare-search">
                        <Search size={16} />
                        <input
                          value={compareIngredient}
                          onBlur={() => globalThis.setTimeout(() => setCompareSearchFocused(false), 180)}
                          onChange={(event) => { setCompareIngredient(event.target.value); setSelectedCompareIngredient(""); }}
                          onFocus={() => setCompareSearchFocused(true)}
                          placeholder="Search ingredient"
                        />
                      </label>
                      {compareSearchFocused && compareSuggestions.length > 0 && (
                        <div className="compare-suggestions">
                          {compareSuggestions.map((ingredient) => (
                            <button key={ingredient} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => { setCompareIngredient(ingredient); setSelectedCompareIngredient(ingredient); setCompareSearchFocused(false); }}>{ingredient}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    {compareData.rows.length > 0 && <small>{compareData.rows[0]?.pack_size || `${compareData.rows[0]?.unit ?? "unit"} based`} - Min qty {formatQuantity(Math.min(...compareData.rows.map((row) => row.available_qty)))}</small>}
                  </div>
                  <label className="compare-sort">
                    <span>Sort by</span>
                    <select value={compareSort} onChange={(event) => setCompareSort(event.target.value as CompareSort)}>
                      <option value="best-value">Best value score</option>
                      <option value="highest-qty">Highest qty</option>
                      <option value="lowest-price">Lowest price</option>
                    </select>
                  </label>
                </div>
              </div>

              {compareData.rows.length > 0 && (
                <p className="compare-note">
                  Showing {compareData.rows.length} suppliers who carry this ingredient - Top 3 shown as cards - AI score = price + quantity
                </p>
              )}

              {supplierLoading ? (
                <div className="compare-empty">Loading mock comparison data...</div>
              ) : supplierError ? (
                <div className="compare-empty">{supplierError}</div>
              ) : !selectedCompareIngredient.trim() ? (
                <div className="compare-empty">Select an ingredient from suggestions to compare suppliers.</div>
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
                            <p style={{ margin: 0 }}>{row.email_domain}</p>
                            {row.certifications && (
                              <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "4px" }}>
                                {row.certifications.split(",").map((cert) => {
                                  const trimmed = cert.trim();
                                  return (
                                    <span
                                      key={trimmed}
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        background: "rgba(15, 122, 95, 0.06)",
                                        color: "var(--accent)",
                                        fontSize: "10px",
                                        fontWeight: 600,
                                        padding: "1px 5px",
                                        borderRadius: "3px",
                                        border: "1px solid rgba(15, 122, 95, 0.12)",
                                      }}
                                    >
                                      {trimmed}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="compare-stat-grid">
                          <div>
                            <strong>{formatMoney(row.price_per_unit, row.currency)}</strong>
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
                            ["Overall", row.overallScore],
                          ].map(([label, value]) => (
                            <div className="score-row" key={label}>
                              <span>{label}</span>
                              <div className="score-track" aria-hidden="true">
                                <svg viewBox="0 0 100 5" preserveAspectRatio="none" role="presentation" focusable="false">
                                  <rect x="0" y="0" width={Math.max(0, Math.min(100, Number(value)))} height="5" rx="2.5" />
                                </svg>
                              </div>
                              <strong>{value}</strong>
                            </div>
                          ))}
                        </div>

                        <button className="view-catalog-button" type="button" onClick={() => { setSelectedCatalogSupplier(row.supplier_name); setActiveTab("catalogs"); }}>View catalogue</button>
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
                            <th>Price/Unit</th>
                            <th>Available Qty</th>
                            <th>Lead Time</th>
                            <th>MOQ</th>
                            <th>Valid Until</th>
                            <th>Score</th>
                            <th>Certifications</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compareData.otherRows.length === 0 ? (
                            <tr>
                              <td colSpan={9}>Only top suppliers found for this ingredient.</td>
                            </tr>
                          ) : compareData.otherRows.map((row, index) => (
                            <tr key={`${row.supplier_name}-${row.ingredient_name}-table`}>
                              <td>{index + 4}</td>
                              <td>{row.supplier_name}</td>
                              <td>{formatMoney(row.price_per_unit, row.currency)}/{row.unit}</td>
                              <td>{formatQuantity(row.available_qty)} {row.unit}</td>
                              <td>{row.lead_time_days != null ? `${row.lead_time_days} days` : "-"}</td>
                              <td>{row.moq != null ? `${formatQuantity(Number(row.moq))} ${row.unit}` : "-"}</td>
                              <td>{formatShortDate(row.valid_until)}</td>
                              <td>{row.overallScore}</td>
                              <td>
                                {row.certifications ? (
                                  <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
                                    {row.certifications.split(",").map((cert) => {
                                      const trimmed = cert.trim();
                                      return (
                                        <span
                                          key={trimmed}
                                          style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            background: "rgba(15, 122, 95, 0.06)",
                                            color: "var(--accent)",
                                            fontSize: "10.5px",
                                            fontWeight: 600,
                                            padding: "1px 6px",
                                            borderRadius: "3px",
                                            border: "1px solid rgba(15, 122, 95, 0.12)",
                                          }}
                                        >
                                          {trimmed}
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span style={{ color: "var(--muted)", fontSize: "11px" }}>-</span>
                                )}
                              </td>
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



          {activeTab === "assistant" && (
            <>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "18px 20px",
                borderRadius: "10px",
                border: "1px solid var(--line)",
                background: "var(--panel)",
                marginBottom: "24px"
              }}>
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>AI Assistant</h2>
              </div>
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
                        <th>Price/Unit</th>
                        <th>Qty</th>
                        <th>Lead Time</th>
                        <th>MOQ</th>
                        <th>Certifications</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assistantRows.length === 0 ? (
                        <tr>
                          <td colSpan={7}>Results appear after ProcuraAI returns supplier data.</td>
                        </tr>
                      ) : (
                        assistantRows.map((row, index) => (
                          <tr key={index}>
                            <td>{String(row.supplier_name ?? "-")}</td>
                            <td>{String(row.normalized_name ?? row.ingredient_name ?? "-")}</td>
                            <td>{typeof row.price_per_unit === "number" ? `${formatMoney(Number(row.price_per_unit), String(row.currency ?? "INR"))}/${String(row.unit ?? "unit")}` : "-"}</td>
                            <td>{row.available_qty != null ? `${formatQuantity(Number(row.available_qty))} ${String(row.unit ?? "")}` : "-"}</td>
                            <td>{row.lead_time_days != null ? `${row.lead_time_days} days` : "-"}</td>
                            <td>{row.moq != null ? `${formatQuantity(Number(row.moq))} ${String(row.unit ?? "")}` : "-"}</td>
                            <td>
                              {row.certifications ? (
                                <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
                                  {String(row.certifications).split(",").map((cert) => {
                                    const trimmed = cert.trim();
                                    return (
                                      <span
                                        key={trimmed}
                                        style={{
                                          display: "inline-flex",
                                          alignItems: "center",
                                          background: "rgba(15, 122, 95, 0.06)",
                                          color: "var(--accent)",
                                          fontSize: "10.5px",
                                          fontWeight: 600,
                                          padding: "1px 6px",
                                          borderRadius: "3px",
                                          border: "1px solid rgba(15, 122, 95, 0.12)",
                                        }}
                                      >
                                        {trimmed}
                                      </span>
                                    );
                                  })}
                                </div>
                              ) : (
                                <span style={{ color: "var(--muted)", fontSize: "11px" }}>-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}


          {activeTab === "settings" && (
            <>
              <div className="settings-container" style={{
                display: "flex",
                flexDirection: "row",
                height: "calc(100vh - var(--navbar-height) - 48px)",
                alignItems: "stretch",
                overflow: "hidden",
                background: "#fff",
                border: "1px solid var(--line)",
                borderRadius: "16px",
                boxShadow: "0 4px 24px rgba(0, 0, 0, 0.025)",
              }}>
                {/* 1. LEFT SIDEBAR PANEL */}
                <aside className="settings-sidebar" style={{
                  width: "250px",
                  background: "#fcfcfc",
                  borderRight: "1px solid var(--line)",
                  padding: "32px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                  flexShrink: 0,
                }}>
                  <div style={{ padding: "0 12px 20px 12px", borderBottom: "1px solid var(--line)", marginBottom: "20px" }}>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#092f28", letterSpacing: "-0.2px" }}>Workspace Settings</h2>
                    <span style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", display: "block" }}>Configure defaults & preferences</span>
                  </div>

                  {[
                    { id: "profile", label: "Profile & Preferences", icon: <Users size={16} /> },
                    { id: "email", label: "Supplier Connection", icon: <Sliders size={16} /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsActiveTab(tab.id as any)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "none",
                        background: settingsActiveTab === tab.id ? "rgba(15, 122, 95, 0.08)" : "transparent",
                        color: settingsActiveTab === tab.id ? "var(--accent)" : "var(--ink)",
                        fontWeight: settingsActiveTab === tab.id ? 600 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                        textAlign: "left",
                        width: "100%",
                      }}
                      className="settings-tab-btn"
                    >
                      {tab.icon}
                      <span style={{ fontSize: "13.5px" }}>{tab.label}</span>
                    </button>
                  ))}
                </aside>

                {/* 2. RIGHT CONTENT PANEL */}
                <main className="settings-content" style={{
                  background: "#fff",
                  padding: "40px",
                  display: "flex",
                  flexDirection: "column",
                  flex: "1 1 0%",
                  overflowY: "auto",
                  gap: "32px"
                }}>
                  {/* PROFILE TAB */}
                  {settingsActiveTab === "profile" && authUser && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                      <div style={{ borderBottom: "1px solid var(--line)", paddingBottom: "24px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28", letterSpacing: "-0.3px" }}>Profile & Preferences</h2>
                          <span
                            onMouseEnter={() => setVisibleGuides(p => ({ ...p, profile_tab_desc: true }))}
                            onMouseLeave={() => setVisibleGuides(p => ({ ...p, profile_tab_desc: false }))}
                            style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default", marginTop: "4px" }}
                          >
                            <Info size={16} />
                            {visibleGuides.profile_tab_desc && (
                              <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                Manage your administrative profile, workspace details, and system localization preferences.
                              </span>
                            )}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                          <h3 style={{ margin: 0, fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>User Identity</h3>
                          {!isEditingProfile ? (
                            <button
                              onClick={() => {
                                setEditName(authUser.name);
                                setEditOrganisation(authUser.organisation || "");
                                setIsEditingProfile(true);
                                setProfileError(null);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                background: "transparent",
                                border: "none",
                                color: "var(--accent)",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                                padding: "4px 8px",
                                borderRadius: "4px",
                                transition: "all 0.15s ease",
                              }}
                              className="profile-edit-btn"
                            >
                              <Edit size={14} />
                              Edit Profile
                            </button>
                          ) : (
                            <div style={{ display: "flex", gap: "8px" }}>
                              <button
                                onClick={handleSaveProfile}
                                disabled={isSavingProfile}
                                style={{
                                  background: "var(--accent)",
                                  color: "#fff",
                                  border: "none",
                                  padding: "4px 12px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: isSavingProfile ? "not-allowed" : "pointer",
                                  opacity: isSavingProfile ? 0.7 : 1,
                                }}
                              >
                                {isSavingProfile ? "Saving..." : "Save"}
                              </button>
                              <button
                                onClick={() => setIsEditingProfile(false)}
                                disabled={isSavingProfile}
                                style={{
                                  background: "transparent",
                                  color: "var(--muted)",
                                  border: "1px solid var(--line)",
                                  padding: "4px 12px",
                                  borderRadius: "6px",
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  cursor: isSavingProfile ? "not-allowed" : "pointer",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>

                        {profileError && (
                          <div style={{
                            background: "#fdf2f2",
                            border: "1px solid #fde8e8",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            marginBottom: "16px",
                            color: "#9b1c1c",
                            fontSize: "13px",
                          }}>
                            {profileError}
                          </div>
                        )}

                        <div style={{ background: "#fff", border: "1px solid var(--line)", borderRadius: "10px", padding: "0 20px" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "16px", minWidth: 0, flex: 1 }}>
                              <div className="user-avatar" style={{ width: "48px", height: "48px", fontSize: "18px", flexShrink: 0, boxShadow: "none" }}>
                                {userInitials(isEditingProfile ? editName : authUser.name, authUser.email)}
                              </div>
                              <div style={{ minWidth: 0, flex: 1, maxWidth: "400px" }}>
                                {!isEditingProfile ? (
                                  <>
                                    <strong style={{ display: "block", fontSize: "15px", color: "var(--ink)" }}>{authUser.name}</strong>
                                    <span style={{ fontSize: "13.0px", color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", display: "block", marginTop: "2px" }}>{authUser.email}</span>
                                  </>
                                ) : (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <input
                                      type="text"
                                      value={editName}
                                      onChange={(e) => setEditName(e.target.value)}
                                      style={{
                                        padding: "6px 12px",
                                        borderRadius: "6px",
                                        border: "1px solid var(--line)",
                                        fontSize: "14px",
                                        color: "var(--ink)",
                                        outline: "none",
                                        width: "100%",
                                        maxWidth: "280px",
                                      }}
                                      placeholder="Full Name"
                                      disabled={isSavingProfile}
                                    />
                                    <span style={{ fontSize: "12.0px", color: "var(--muted)", display: "block" }}>{authUser.email}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <span style={{
                              padding: "4px 12px",
                              background: "rgba(15, 122, 95, 0.08)",
                              color: "var(--accent)",
                              borderRadius: "20px",
                              fontSize: "11px",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                              textTransform: "uppercase"
                            }}>
                              {authUser.role}
                            </span>
                          </div>

                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0" }}>
                            <div style={{ paddingRight: "24px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Workplace Organisation</strong>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, profile_org: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, profile_org: false }))}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.profile_org && (
                                    <span className="settings-tooltip centered" style={{ width: "200px" }}>
                                      The workspace name displayed across generated reports and analytics.
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            {!isEditingProfile ? (
                              <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)", background: "#f9fafb", padding: "6px 12px", borderRadius: "6px", border: "1px solid var(--line)" }}>
                                {authUser.organisation || "MediCORE Central"}
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={editOrganisation}
                                onChange={(e) => setEditOrganisation(e.target.value)}
                                style={{
                                  padding: "6px 12px",
                                  borderRadius: "6px",
                                  border: "1px solid var(--line)",
                                  fontSize: "13.5px",
                                  fontWeight: 600,
                                  color: "var(--ink)",
                                  outline: "none",
                                  width: "200px",
                                }}
                                placeholder="Workplace Organisation"
                                disabled={isSavingProfile}
                              />
                            )}
                          </div>
                        </div>
                      </div>


                    </div>
                  )}

                  {/* SUPPLIER CONNECTION TAB */}
                  {settingsActiveTab === "email" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "32px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", alignItems: "flex-start", flexWrap: "wrap", borderBottom: "1px solid var(--line)", paddingBottom: "24px" }}>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28", letterSpacing: "-0.3px" }}>Supplier Connection</h2>
                            <span
                              onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_tab_desc: true }))}
                              onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_tab_desc: false }))}
                              style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default", marginTop: "4px" }}
                            >
                              <Info size={16} />
                              {visibleGuides.email_tab_desc && (
                                <span className="settings-tooltip centered" style={{ width: "240px" }}>
                                  Configure email sync connections, define ingestion approaches, and manage supplier validation filters.
                                </span>
                              )}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Stats Overview */}
                      <div style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "16px"
                      }}>
                        {[
                          { icon: <Mail size={18} />, label: "Target Sync Inbox", value: connectedAccounts[0]?.email_address || "No Active Mailbox" },
                          { icon: <CheckCircle2 size={18} />, label: "Ingestion Status", value: pendingApprovalsList.length ? `${pendingApprovalsList.length} supplier requests pending` : "No pending approvals" },
                        ].map((item) => (
                          <div key={item.label} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "16px",
                            padding: "16px",
                            border: "1px solid var(--line)",
                            borderRadius: "10px",
                            background: "#fff",
                          }}>
                            <span style={{
                              width: "36px",
                              height: "36px",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "8px",
                              background: "rgba(15, 122, 95, 0.08)",
                              color: "var(--accent)"
                            }}>{item.icon}</span>
                            <div style={{ minWidth: 0 }}>
                              <span style={{ display: "block", color: "var(--muted)", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>{item.label}</span>
                              <strong style={{ display: "block", marginTop: "4px", color: "#092f28", fontSize: "13.0px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.value}</strong>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Add/Edit Account Form Panel */}
                      {addAccountExpanded && (
                        <div style={{
                          padding: "24px",
                          borderRadius: "10px",
                          background: "#fff",
                          border: "1px solid var(--accent)",
                          boxShadow: "0 4px 24px rgba(15, 122, 95, 0.08)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "20px",
                          position: "relative"
                        }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#092f28" }}>
                              {editingAccountId ? "Edit Mailbox Filters & Settings" : "Connect New Supplier Inbox"}
                            </h3>
                            <button
                              type="button"
                              onClick={resetAddAccountForm}
                              style={{
                                background: "rgba(0,0,0,0.05)",
                                border: "none",
                                borderRadius: "50%",
                                width: "28px",
                                height: "28px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                color: "var(--muted)",
                                transition: "all 0.2s"
                              }}
                            >
                              <X size={16} />
                            </button>
                          </div>

                          {/* Setup Steps Tabs */}
                          {!editingAccountId && (
                            <div style={{ display: "flex", gap: "16px", borderBottom: "1px solid var(--line)", paddingBottom: "4px" }}>
                              {[
                                { step: 1, label: "1. Connection Credentials" },
                                { step: 3, label: "2. Rules & Filters" }
                              ].map((s) => (
                                <button
                                  key={s.step}
                                  type="button"
                                  onClick={() => setSetupStep(s.step)}
                                  style={{
                                    background: "none",
                                    border: "none",
                                    borderBottom: setupStep === s.step ? "3px solid var(--accent)" : "3px solid transparent",
                                    padding: "8px 4px 12px",
                                    color: setupStep === s.step ? "var(--accent)" : "var(--muted)",
                                    fontWeight: setupStep === s.step ? 700 : 500,
                                    fontSize: "14px",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                  }}
                                >
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}

                          {/* Step 1: Credentials Form */}
                          {(editingAccountId || setupStep === 1) && (
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                              <label style={{ display: "flex", flexDirection: "column", gap: "8px", gridColumn: "span 2" }}>
                                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>Provider Type</span>
                                <select
                                  value={newAccountProvider}
                                  onChange={(e) => {
                                    setNewAccountProvider(e.target.value);
                                    if (e.target.value === "Gmail") {
                                      setNewAccountImapHost("imap.gmail.com");
                                      setNewAccountImapPort(993);
                                    }
                                  }}
                                  disabled={!!editingAccountId}
                                  style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", background: "#fff", fontSize: "14px", outline: "none" }}
                                >
                                  <option value="Gmail">Gmail</option>
                                  <option value="Custom">Custom IMAP Server</option>
                                </select>
                              </label>

                              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>IMAP Username / Email Address</span>
                                <input
                                  type="email"
                                  value={newAccountEmail}
                                  onChange={(e) => setNewAccountEmail(e.target.value)}
                                  disabled={!!editingAccountId}
                                  placeholder="e.g. suppliers@company.com"
                                  style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", background: editingAccountId ? "#f7fafc" : "#fff", fontSize: "14px", outline: "none" }}
                                />
                              </label>

                              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>
                                  {editingAccountId ? "New App Password (leave blank to keep)" : "Gmail App Password"}
                                </span>
                                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                  <input
                                    type={showSettingsPassword ? "text" : "password"}
                                    value={newAccountPassword}
                                    onChange={(e) => setNewAccountPassword(e.target.value)}
                                    placeholder={editingAccountId ? "••••••••••••••••" : "16-character Google app password"}
                                    style={{
                                      padding: "11px 44px 11px 14px",
                                      borderRadius: "8px",
                                      border: "1px solid var(--line)",
                                      fontSize: "14px",
                                      outline: "none",
                                      width: "100%"
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => setShowSettingsPassword(!showSettingsPassword)}
                                    style={{
                                      position: "absolute",
                                      right: "12px",
                                      top: "50%",
                                      transform: "translateY(-50%)",
                                      background: "none",
                                      border: "none",
                                      color: "#66736d",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: "4px",
                                      zIndex: 2,
                                    }}
                                    aria-label={showSettingsPassword ? "Hide password" : "Show password"}
                                  >
                                    {showSettingsPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                  </button>
                                </div>
                              </label>

                              {newAccountProvider === "Custom" && (
                                <>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>IMAP Server Host</span>
                                    <input
                                      type="text"
                                      value={newAccountImapHost}
                                      onChange={(e) => setNewAccountImapHost(e.target.value)}
                                      placeholder="e.g. imap.example.com"
                                      style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "14px", outline: "none" }}
                                    />
                                  </label>

                                  <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                    <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>IMAP Server Port</span>
                                    <input
                                      type="number"
                                      value={newAccountImapPort}
                                      onChange={(e) => setNewAccountImapPort(Number(e.target.value))}
                                      placeholder="e.g. 993"
                                      style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", fontSize: "14px", outline: "none" }}
                                    />
                                  </label>
                                </>
                              )}

                              {!editingAccountId && (
                                <div style={{ gridColumn: "span 2", display: "flex", gap: "12px", marginTop: "12px" }}>
                                  <button
                                    type="button"
                                    onClick={testConnection}
                                    disabled={testingConnection}
                                    style={{
                                      padding: "11px 20px",
                                      border: "1px solid var(--accent)",
                                      borderRadius: "8px",
                                      background: "transparent",
                                      color: "var(--accent)",
                                      fontWeight: 600,
                                      fontSize: "13.5px",
                                      cursor: "pointer",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      transition: "all 0.2s"
                                    }}
                                  >
                                    {testingConnection && <Loader2 className="animate-spin" size={14} />}
                                    {testingConnection ? "Verifying Host..." : "Test Connection Setup"}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setSetupStep(3)}
                                    disabled={!testResult?.success}
                                    style={{
                                      padding: "11px 20px",
                                      borderRadius: "8px",
                                      background: testResult?.success ? "var(--accent)" : "#cbd5e0",
                                      color: "#fff",
                                      border: "none",
                                      fontWeight: 600,
                                      fontSize: "13.5px",
                                      cursor: testResult?.success ? "pointer" : "not-allowed",
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "8px",
                                      transition: "all 0.2s"
                                    }}
                                  >
                                    Continue to Ingestion Rules <ArrowRight size={14} />
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Step 3: Ingestion Rules & Filters Form */}
                          {(editingAccountId || setupStep === 3) && (
                            <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <h4 style={{ margin: 0, fontSize: "15px", fontWeight: 700, color: "var(--accent)" }}>
                                    Ingestion Gatekeeper Filters
                                  </h4>
                                  <span
                                    onMouseEnter={() => setVisibleGuides(p => ({ ...p, gatekeeper_filters_desc: true }))}
                                    onMouseLeave={() => setVisibleGuides(p => ({ ...p, gatekeeper_filters_desc: false }))}
                                    style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                  >
                                    <Info size={14} />
                                    {visibleGuides.gatekeeper_filters_desc && (
                                      <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                        Fine-tune which messages inside the target mailbox get processed into catalogue sheets.
                                      </span>
                                    )}
                                  </span>
                                </div>
                              </div>

                              <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "20px", background: "rgba(0,0,0,0.015)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                                {/* Toggle 1: Require PDF Attachment */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ paddingRight: "16px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Require PDF Attachment</strong>
                                      <span
                                        onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_require_attachment: true }))}
                                        onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_require_attachment: false }))}
                                        style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                      >
                                        <Info size={14} />
                                        {visibleGuides.email_require_attachment && (
                                          <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                            Skip emails that do not contain parsed attachment files. (Turn off to parse text bodies)
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <ToggleSwitch checked={filterRequireAttachment} onChange={setFilterRequireAttachment} />
                                </div>

                                <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--line)" }} />

                                {/* Toggle 2: Auto-Skip Bulk/Promotion */}
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                  <div style={{ paddingRight: "16px" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                      <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Auto-Skip Bulk / Promotion Emails</strong>
                                      <span
                                        onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_skip_promotions: true }))}
                                        onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_skip_promotions: false }))}
                                        style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                      >
                                        <Info size={14} />
                                        {visibleGuides.email_skip_promotions && (
                                          <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                            Skips bulk emails, newsletters, or unsubscribable list messages.
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                  <ToggleSwitch checked={filterSkipPromotions} onChange={setFilterSkipPromotions} />
                                </div>

                                <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--line)" }} />

                                {/* Input 1: Subject Keywords */}
                                <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>Subject Keyword Restriction List</span>
                                    <span
                                      onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_subject_keywords: true }))}
                                      onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_subject_keywords: false }))}
                                      style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                    >
                                      <Info size={14} />
                                      {visibleGuides.email_subject_keywords && (
                                        <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                          Only sync emails containing these keywords in the subject (leave blank for all). Separated by commas.
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <input
                                    type="text"
                                    value={filterSubjectKeywords}
                                    onChange={(e) => setFilterSubjectKeywords(e.target.value)}
                                    placeholder="e.g. catalog, price, inventory"
                                    style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", background: "#fff", fontSize: "13.5px", outline: "none" }}
                                  />
                                </label>

                                <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--line)" }} />

                                {/* Input 2: Sender Keywords */}
                                <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--ink)" }}>Sender Address Restriction List</span>
                                    <span
                                      onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_sender_keywords: true }))}
                                      onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_sender_keywords: false }))}
                                      style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                    >
                                      <Info size={14} />
                                      {visibleGuides.email_sender_keywords && (
                                        <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                          Only process emails from senders containing these letters/words (leave blank for all).
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <input
                                    type="text"
                                    value={filterSenderKeywords}
                                    onChange={(e) => setFilterSenderKeywords(e.target.value)}
                                    placeholder="e.g. orders, sales, billing"
                                    style={{ padding: "11px 14px", borderRadius: "8px", border: "1px solid var(--line)", background: "#fff", fontSize: "13.5px", outline: "none" }}
                                  />
                                </label>
                              </div>

                              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "8px" }}>
                                <button
                                  type="button"
                                  onClick={resetAddAccountForm}
                                  style={{
                                    padding: "10px 18px",
                                    border: "1px solid var(--line)",
                                    borderRadius: "8px",
                                    background: "transparent",
                                    color: "var(--ink)",
                                    fontSize: "13.5px",
                                    fontWeight: 600,
                                    cursor: "pointer"
                                  }}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  onClick={saveAccount}
                                  disabled={savingAccount}
                                  style={{
                                    padding: "10px 20px",
                                    background: "var(--accent)",
                                    color: "#fff",
                                    border: "none",
                                    borderRadius: "8px",
                                    fontSize: "13.5px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    transition: "all 0.2s"
                                  }}
                                >
                                  {savingAccount && <Loader2 className="animate-spin" size={14} />}
                                  {editingAccountId ? "Update Account & Filters" : "Connect Account"}
                                </button>
                              </div>
                            </div>
                          )}

                          {testResult && (
                            <div style={{
                              padding: "14px 18px",
                              borderRadius: "8px",
                              fontSize: "13.5px",
                              lineHeight: "1.45",
                              background: testResult.success ? "rgba(49, 151, 149, 0.08)" : "rgba(229, 62, 62, 0.08)",
                              color: testResult.success ? "#2c7a7b" : "#c53030",
                              border: `1px solid ${testResult.success ? "rgba(49, 151, 149, 0.18)" : "rgba(229, 62, 62, 0.18)"}`
                            }}>
                              {testResult.message}
                            </div>
                          )}
                        </div>
                      )}



                      {/* Ingestion Mode Choice */}
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#092f28", textTransform: "uppercase", letterSpacing: "0.05em" }}>Ingestion Gatekeeper Mode</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "20px" }}>
                          {/* Approach 1 */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setLocalApproach("approach_1")}
                            onKeyDown={(e) => e.key === "Enter" && setLocalApproach("approach_1")}
                            style={{
                              padding: "24px",
                              borderRadius: "12px",
                              border: `2px solid ${localApproach === "approach_1" ? "var(--accent)" : "var(--line)"}`,
                              background: localApproach === "approach_1" ? "linear-gradient(180deg, rgba(15, 122, 95, 0.05), #fff)" : "#fff",
                              color: "var(--ink)",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                              textAlign: "left",
                              boxShadow: localApproach === "approach_1" ? "0 8px 20px rgba(15, 122, 95, 0.06)" : "0 2px 4px rgba(0,0,0,0.01)",
                              outline: "none"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                <Mail size={18} color="var(--accent)" />
                                <strong style={{ fontSize: "16px", color: localApproach === "approach_1" ? "var(--accent)" : "#092f28" }}>Gmail Label Ingestion</strong>
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, approach_1_desc: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, approach_1_desc: false }))}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.approach_1_desc && (
                                    <span className="settings-tooltip right-aligned" style={{ width: "200px" }}>
                                      Only messages tagged with the Gmail label <strong style={{ color: "var(--accent)" }}>suppliers</strong> are parsed. Best for manual control.
                                    </span>
                                  )}
                                </span>
                                <div style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "50%",
                                  border: `2px solid ${localApproach === "approach_1" ? "var(--accent)" : "var(--muted)"}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0
                                }}>
                                  {localApproach === "approach_1" && <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--accent)" }} />}
                                </div>
                              </div>
                            </div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--accent)", fontSize: "12.5px", fontWeight: 700 }}>
                              <Sliders size={13} /> Explicit mailbox scope
                            </span>
                          </div>

                          {/* Approach 2 */}
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setLocalApproach("approach_2")}
                            onKeyDown={(e) => e.key === "Enter" && setLocalApproach("approach_2")}
                            style={{
                              padding: "24px",
                              borderRadius: "12px",
                              border: `2px solid ${localApproach === "approach_2" ? "var(--accent)" : "var(--line)"}`,
                              background: localApproach === "approach_2" ? "linear-gradient(180deg, rgba(15, 122, 95, 0.05), #fff)" : "#fff",
                              color: "var(--ink)",
                              cursor: "pointer",
                              transition: "all 0.2s ease",
                              display: "flex",
                              flexDirection: "column",
                              gap: "12px",
                              textAlign: "left",
                              boxShadow: localApproach === "approach_2" ? "0 8px 20px rgba(15, 122, 95, 0.06)" : "0 2px 4px rgba(0,0,0,0.01)",
                              outline: "none"
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                                <CheckCircle2 size={18} color="var(--accent)" />
                                <strong style={{ fontSize: "16px", color: localApproach === "approach_2" ? "var(--accent)" : "#092f28" }}>Trusted Supplier Approval</strong>
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, approach_2_desc: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, approach_2_desc: false }))}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.approach_2_desc && (
                                    <span className="settings-tooltip right-aligned" style={{ width: "200px" }}>
                                      Trusted senders ingest automatically. New matching suppliers stay blocked until approved.
                                    </span>
                                  )}
                                </span>
                                <div style={{
                                  width: "20px",
                                  height: "20px",
                                  borderRadius: "50%",
                                  border: `2px solid ${localApproach === "approach_2" ? "var(--accent)" : "var(--muted)"}`,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0
                                }}>
                                  {localApproach === "approach_2" && <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--accent)" }} />}
                                </div>
                              </div>
                            </div>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--accent)", fontSize: "12.5px", fontWeight: 700 }}>
                              <CheckCircle2 size={13} /> Approval gate enabled
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Section depending on Ingestion Mode */}
                      {localApproach === "approach_1" ? (
                        <div style={{
                          padding: "20px",
                          background: "#fafafa",
                          border: "1px solid var(--line)",
                          borderRadius: "10px",
                          display: "flex",
                          flexDirection: "column",
                          gap: "12px"
                        }}>
                          <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
                            <Sliders size={15} /> How to configure Gmail labeling
                          </h4>
                          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "13.0px", color: "var(--ink)", display: "flex", flexDirection: "column", gap: "8px", lineHeight: "1.5" }}>
                            <li>Open your linked Gmail account in a browser.</li>
                            <li>Go to <strong>Settings</strong> &gt; <strong>Labels</strong>. Scroll down and click <strong>Create a new label</strong>.</li>
                            <li>Enter <strong>suppliers</strong> (all lowercase) as the label name and click Create.</li>
                            <li>Apply this new label to any incoming emails from your suppliers.</li>
                            <li>MediCORE will dynamically sync and analyze catalogs <em>only</em> inside this labeled folder.</li>
                          </ol>
                        </div>
                      ) : (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "20px",
                          padding: "20px",
                          background: "#fff",
                          border: "1px solid var(--line)",
                          borderRadius: "10px"
                        }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <label style={{ fontWeight: 600, fontSize: "14px", color: "#092f28", margin: 0 }}>Trusted Supplier Emails / Domains</label>
                              <span
                                onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_trusted_suppliers: true }))}
                                onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_trusted_suppliers: false }))}
                                style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                              >
                                <Info size={14} />
                                {visibleGuides.email_trusted_suppliers && (
                                  <span className="settings-tooltip centered" style={{ width: "240px" }}>
                                    Enter trusted domains or exact emails (separated by commas). Senders matching these will bypass the approval gate entirely.
                                  </span>
                                )}
                              </span>
                            </div>
                            <textarea
                              value={localTrusted}
                              onChange={(e) => setLocalTrusted(e.target.value)}
                              placeholder="e.g. sigmaaldrich.com, orders@pharmacy.com, trustedsupplier.in"
                              rows={3}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid var(--line)",
                                background: "#fff",
                                fontSize: "13.5px",
                                lineHeight: "1.5",
                                resize: "vertical",
                                fontFamily: "inherit",
                                outline: "none",
                                transition: "border-color 0.15s ease"
                              }}
                            />
                          </div>

                          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <label style={{ fontWeight: 600, fontSize: "14px", color: "#092f28", margin: 0 }}>Smart Ingestion Keywords</label>
                              <span
                                onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_smart_keywords: true }))}
                                onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_smart_keywords: false }))}
                                style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                              >
                                <Info size={14} />
                                {visibleGuides.email_smart_keywords && (
                                  <span className="settings-tooltip centered" style={{ width: "240px" }}>
                                    Comma-separated words to scan incoming emails (subject/body) for potential catalogue files from new/unrecognized suppliers.
                                  </span>
                                )}
                              </span>
                            </div>
                            <textarea
                              value={localKeywords}
                              onChange={(e) => setLocalKeywords(e.target.value)}
                              placeholder="e.g. catalog, catalogue, price, offer, quote, inventory, sheet"
                              rows={2}
                              style={{
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid var(--line)",
                                background: "#fff",
                                fontSize: "13.5px",
                                lineHeight: "1.5",
                                resize: "vertical",
                                fontFamily: "inherit",
                                outline: "none",
                                transition: "border-color 0.15s ease"
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Automation/Polling settings */}
                      <div>
                        <h3 style={{ margin: "0 0 16px 0", fontSize: "12px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Background Sync & Automation</h3>
                        <div style={{
                          padding: "0 20px",
                          borderRadius: "10px",
                          background: "#fff",
                          border: "1px solid var(--line)",
                          display: "flex",
                          flexDirection: "column"
                        }}>
                          {/* Row 1: Polling Interval */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ paddingRight: "24px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Global Polling Interval</strong>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_poll_interval: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_poll_interval: false }))}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.email_poll_interval && (
                                    <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                      Configure how frequently the background sync processes check for new supplier emails.
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <select
                              value={syncSettings.poll_interval_minutes}
                              onChange={(e) => saveEmailSyncSettings({ poll_interval_minutes: Number(e.target.value) })}
                              style={{ padding: "8px 12px", borderRadius: "8px", border: "1px solid var(--line)", background: "#fff", cursor: "pointer", fontSize: "13px", fontWeight: 600, outline: "none", minWidth: "180px" }}
                            >
                              <option value={5}>Every 5 minutes</option>
                              <option value={10}>Every 10 minutes</option>
                              <option value={15}>Every 15 minutes</option>
                              <option value={30}>Every 30 minutes</option>
                              <option value={60}>Every hour</option>
                            </select>
                          </div>

                          {/* Row 2: Auto Extract */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0", borderBottom: "1px solid var(--line)" }}>
                            <div style={{ paddingRight: "24px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Auto-Extract PDF Catalogue Items</strong>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_auto_extract: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_auto_extract: false }))}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.email_auto_extract && (
                                    <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                      Automatically run background normalization models to ingest PDF inventory lists.
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <ToggleSwitch
                              checked={syncSettings.auto_extract_catalog}
                              onChange={(checked) => saveEmailSyncSettings({ auto_extract_catalog: checked })}
                            />
                          </div>

                          {/* Row 3: Push Notifications */}
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 0" }}>
                            <div style={{ paddingRight: "24px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>New Catalogue Alerts</strong>
                                <span
                                  onMouseEnter={() => setVisibleGuides(p => ({ ...p, email_notify_on_new_catalog: true }))}
                                  onMouseLeave={() => setVisibleGuides(p => ({ ...p, email_notify_on_new_catalog: false }))}
                                  style={{ position: "relative", display: "inline-flex", alignItems: "center", color: "var(--muted)", cursor: "default" }}
                                >
                                  <Info size={14} />
                                  {visibleGuides.email_notify_on_new_catalog && (
                                    <span className="settings-tooltip centered" style={{ width: "220px" }}>
                                      Receive real-time push notifications on the system when a new catalogue is synced.
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <ToggleSwitch
                              checked={syncSettings.notify_on_new_catalog}
                              onChange={(checked) => saveEmailSyncSettings({ notify_on_new_catalog: checked })}
                            />
                          </div>
                        </div>

                        {settingsSaveFeedback && (
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "12px" }}>
                            <span style={{ fontSize: "13px", background: "rgba(49, 151, 149, 0.1)", color: "#2c7a7b", padding: "6px 14px", borderRadius: "12px", fontWeight: 600 }}>
                              Automation settings saved
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Secure Save Footer */}
                      <div style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "20px",
                        flexWrap: "wrap",
                        padding: "16px 20px",
                        border: "1px solid rgba(15, 122, 95, 0.12)",
                        borderRadius: "10px",
                        background: "rgba(15, 122, 95, 0.02)",
                      }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                          <span style={{
                            width: "36px",
                            height: "36px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: "8px",
                            background: "rgba(15, 122, 95, 0.08)",
                            color: "var(--accent)"
                          }}>
                            <Sliders size={18} />
                          </span>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ display: "block", color: "#092f28", fontSize: "14px" }}>Gatekeeper settings</strong>
                            <span style={{ display: "block", marginTop: "2px", color: "var(--muted)", fontSize: "12.5px" }}>
                              Save current Ingestion Mode, Smart Keywords, and Trusted domains.
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => saveEmailSyncSettings({
                            ingestion_approach: localApproach,
                            trusted_suppliers: localTrusted,
                            keyword_filters: localKeywords
                          })}
                          disabled={savingSyncSettings}
                          style={{
                            minHeight: "40px",
                            padding: "0 20px",
                            background: savingSyncSettings ? "rgba(15, 122, 95, 0.65)" : "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "8px",
                            fontWeight: 600,
                            fontSize: "13.5px",
                            cursor: savingSyncSettings ? "not-allowed" : "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            transition: "all 0.2s ease"
                          }}
                        >
                          {savingSyncSettings ? <Loader2 className="animate-spin" size={14} /> : <CheckCircle2 size={14} />}
                          {savingSyncSettings ? "Saving Settings..." : "Save Gatekeeper Settings"}
                        </button>
                      </div>
                    </div>
                  )}
                </main>
              </div>
            </>
          )}

          {activeTab === "suppliers" && (
            <section className="supplier-window">
              <div className="supplier-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Suppliers</h2>
                </div>
                <div className="supplier-controls">
                  <label className="supplier-search">
                    <Search size={16} />
                    <input value={supplierSearch} onChange={(event) => setSupplierSearch(event.target.value)} placeholder="Search suppliers or ingredients..." />
                  </label>
                  <label className="supplier-sort">
                    <span>Sort by</span>
                    <select value={supplierSort} onChange={(event) => setSupplierSort(event.target.value as SupplierSort)}>
                      <option value="items">Catalogue items</option>
                      <option value="latest">Latest catalogue</option>
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
                      <th>Email</th>
                      <th>Items</th>
                      <th>Total qty</th>
                      <th>Latest catalogue</th>
                      <th>Certifications</th>
                      <th>View catalogue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierLoading ? (
                      <tr><td colSpan={7}>Loading supplier data...</td></tr>
                    ) : supplierError ? (
                      <tr><td colSpan={7}>{supplierError}</td></tr>
                    ) : supplierDirectory.length === 0 ? (
                      <tr><td colSpan={7}>No suppliers match your search.</td></tr>
                    ) : supplierDirectory.map((supplier) => (
                      <tr key={supplier.supplier_name}>
                        <td>
                          <div className="supplier-name-cell">
                            <span className="supplier-mini-badge">{supplierInitials(supplier.supplier_name)}</span>
                            <div>
                              <strong>{supplier.supplier_name}</strong>
                            </div>
                          </div>
                        </td>
                        <td>{supplier.email_domain}</td>
                        <td>{supplier.item_count}</td>
                        <td>{formatQuantity(supplier.total_qty)}</td>
                        <td>{formatRelativeTime(supplier.last_catalog_at)}</td>
                        <td>
                          {supplier.certifications ? (
                            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", justifyContent: "center" }}>
                              {supplier.certifications.split(",").map((cert) => {
                                const trimmed = cert.trim();
                                return (
                                  <span
                                    key={trimmed}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      background: "rgba(15, 122, 95, 0.06)",
                                      color: "var(--accent)",
                                      fontSize: "11.5px",
                                      fontWeight: 600,
                                      padding: "2px 8px",
                                      borderRadius: "4px",
                                      border: "1px solid rgba(15, 122, 95, 0.12)",
                                      letterSpacing: "0.02em",
                                    }}
                                  >
                                    {trimmed}
                                  </span>
                                );
                              })}
                            </div>
                          ) : (
                            <span style={{ color: "var(--muted)", fontSize: "12px" }}>-</span>
                          )}
                        </td>
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
            <h2>ProcuraAI</h2>
            <button
              onClick={handleRefreshChat}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                padding: "6px",
                borderRadius: "6px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.2s ease",
              }}
              title="Refresh Chat"
              type="button"
              className="chat-refresh-button"
            >
              <RefreshCw size={16} />
            </button>
          </div>
          <div className="messages">
            {messages.map((message, index) => (
              <div key={index} className={`message ${message.role}`}>
                {message.text}
              </div>
            ))}

            {messages.length === 1 && (
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginTop: "16px",
                paddingLeft: "4px",
                animation: "fadeInUp 0.6s ease"
              }}>
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--accent)", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "4px", opacity: 0.8 }}>Suggested Actions</span>
                {exampleQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => sendMessage(question)}
                    style={{
                      padding: "12px 16px",
                      border: "1px solid rgba(15, 122, 95, 0.12)",
                      borderRadius: "12px",
                      background: "linear-gradient(135deg, rgba(15, 122, 95, 0.02) 0%, rgba(15, 122, 95, 0.05) 100%)",
                      color: "#1a3a32",
                      textAlign: "left",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      lineHeight: "1.4",
                      transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
                      boxShadow: "0 2px 6px rgba(15, 122, 95, 0.01)",
                      display: "block",
                      width: "100%",
                      outline: "none"
                    }}
                    className="premium-suggestion-btn"
                  >
                    {question}
                  </button>
                ))}
              </div>
            )}

            {isTypingResponse && (
              <div className="message assistant" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "12px 16px", minWidth: "60px", background: "var(--soft)", border: "1px solid var(--line)" }}>
                <div className="typing-dot" />
                <div className="typing-dot" />
                <div className="typing-dot" />
              </div>
            )}
            <div ref={chatMessagesEndRef} />
          </div>
          <form
            className="composer"
            style={{ borderBottom: "none" }}
            onSubmit={(event) => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask ProcuraAI..."
            />
            <button type="submit" aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
          <div style={{
            fontSize: "11px",
            color: "var(--muted)",
            textAlign: "center",
            padding: "0 18px 12px 18px",
            lineHeight: "1.4",
            letterSpacing: "-0.1px",
            background: "#fff",
            flexShrink: 0
          }}>
            ProcuraAI can make mistakes. Your data is never used to train our model.
          </div>
        </aside>
      )}
    </>
  );
}
















