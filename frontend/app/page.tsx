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
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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

type SidebarTab = "dashboard" | "inbox" | "catalogs" | "analysis" | "compare" | "price-trends" | "assistant" | "suppliers" | "settings";

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

type AuthUser = {
  email: string;
  name: string;
  role: "Admin";
  organisation?: string;
};

type GmailSettings = {
  email: string;
  appPassword: string;
  mailbox: string;
  autoPoll: boolean;
};

type GmailPreviewResponse = {
  unread_count?: number;
  pdf_message_count?: number;
  mailbox?: string;
  pdf_messages?: Array<{ subject?: string | null; pdf_attachments?: string[] }>;
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


const AUTH_STORAGE_KEY = "medicore-auth-user";
const GMAIL_SETTINGS_STORAGE_KEY = "medicore-gmail-settings";

const defaultGmailSettings: GmailSettings = {
  email: "",
  appPassword: "",
  mailbox: "INBOX",
  autoPoll: false,
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

const RUPEE_SYMBOL = "\u20B9";

function currencySymbol(currency: string | null | undefined): string {
  return (currency ?? "INR").toUpperCase() === "INR" ? RUPEE_SYMBOL : currency ?? "";
}

function formatMoney(value: number, currency = "INR"): string {
  const symbol = currencySymbol(currency);
  const separator = symbol === RUPEE_SYMBOL ? "" : " ";
  return `${symbol}${separator}${value.toFixed(2)}`;
}

function formatCompactCurrency(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return `${RUPEE_SYMBOL}0`;
  }

  if (value >= 100000) {
    return `${RUPEE_SYMBOL}${(value / 100000).toFixed(1)}L`;
  }

  if (value >= 1000) {
    return `${RUPEE_SYMBOL}${(value / 1000).toFixed(1)}K`;
  }

  return `${RUPEE_SYMBOL}${value.toFixed(0)}`;
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

export default function Home() {
  const router = useRouter();
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
  const [compareIngredient, setCompareIngredient] = useState("");
  const [selectedCompareIngredient, setSelectedCompareIngredient] = useState("");
  const [compareSearchFocused, setCompareSearchFocused] = useState(false);
  const [compareSort, setCompareSort] = useState<CompareSort>("best-value");
  const [authChecked, setAuthChecked] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginError, setLoginError] = useState("");
  const [gmailSettings, setGmailSettings] = useState<GmailSettings>(defaultGmailSettings);
  const [settingsStatus, setSettingsStatus] = useState("");
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  // Settings Redesign States
  const [settingsActiveTab, setSettingsActiveTab] = useState<"profile" | "email" | "notifications" | "security">("profile");
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

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return `${window.location.protocol}//${window.location.hostname}:8000`;
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

    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      return `${protocol}://${window.location.hostname}:8000/ws/chat`;
    }

    return productionWsUrl;
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
      text: `${thread.supplier_name} sent catalogue - ${thread.item_count} items extracted`,
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
      ingredientLabel: sorted[0]?.normalized_name || selectedCompareIngredient || "ingredient",
    };
  }, [compareSort, selectedCompareIngredient, supplierRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedSettings = window.localStorage.getItem(GMAIL_SETTINGS_STORAGE_KEY);
    if (storedSettings) {
      try {
        setGmailSettings({ ...defaultGmailSettings, ...(JSON.parse(storedSettings) as Partial<GmailSettings>) });
      } catch {
        window.localStorage.removeItem(GMAIL_SETTINGS_STORAGE_KEY);
      }
    }

    // Get active Supabase session and set active user
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        const u = session.user;
        const name = u.user_metadata?.full_name || u.email?.split("@")[0] || "User";
        const org = u.user_metadata?.organisation || "MediCORE Central";
        setAuthUser({
          email: u.email || "",
          name: name,
          role: "Admin",
          organisation: org
        });
        setLoginEmail(u.email || "");
        setLoginName(name);
      } else {
        setAuthUser(null);
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
        setAuthUser({
          email: u.email || "",
          name: name,
          role: "Admin",
          organisation: org
        });
        setLoginEmail(u.email || "");
        setLoginName(name);
      } else {
        setAuthUser(null);
        router.push("/login");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [router]);

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
    if (!authUser || typeof window === "undefined") return;
    window.localStorage.setItem(GMAIL_SETTINGS_STORAGE_KEY, JSON.stringify(gmailSettings));
  }, [authUser, gmailSettings]);

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
      if (!authUser) {
        setSupplierLoading(false);
        return;
      }

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
  }, [apiBaseUrl, authUser, dataRefreshKey]);

  async function ensureSocket() {
    if (socketRef.current?.readyState === WebSocket.OPEN) return socketRef.current;
    
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token || "";
    const authenticatedWsUrl = token ? `${wsUrl}?token=${token}` : wsUrl;

    const socket = new WebSocket(authenticatedWsUrl);
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

  async function sendMessage(text = input) {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((current) => [...current, { role: "user", text: trimmed }]);
    setInput("");
    const socket = await ensureSocket();
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(trimmed);
    } else {
      socket.onopen = () => socket.send(trimmed);
    }
  }

  function gmailPayload() {
    return {
      email: gmailSettings.email.trim(),
      app_password: gmailSettings.appPassword.trim(),
      mailbox: gmailSettings.mailbox.trim() || "INBOX",
    };
  }

  function validateGmailSettings() {
    const payload = gmailPayload();
    if (!payload.email || !payload.app_password) {
      setSettingsStatus("Enter Gmail address and app password first.");
      return null;
    }
    return payload;
  }

  function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = loginEmail.trim();
    const name = loginName.trim() || email.split("@")[0] || "User";

    if (!/^[^@\s]+@gmail\.com$/i.test(email)) {
      setLoginError("Use a Gmail address to continue.");
      return;
    }

    const user: AuthUser = { email, name, role: "Admin" };
    setAuthUser(user);
    setLoginError("");
    setGmailSettings((current) => ({ ...current, email: current.email || email }));

    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
      window.localStorage.removeItem(GMAIL_SETTINGS_STORAGE_KEY);
      // Clear cookie
      document.cookie = `sb-access-token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC; SameSite=Lax; Secure`;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setAuthUser(null);
    setGmailSettings(defaultGmailSettings);
    setSettingsStatus("");
    setActiveTab("dashboard");
    router.push("/login");
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
    return (
      <main className="auth-page">
        <form className="auth-card" onSubmit={handleLogin}>
          <p className="auth-kicker">MediCORE</p>
          <h1>Sign in with Gmail</h1>
          <p>Use your Gmail address to start. Gmail reading is configured after login using an app password.</p>
          <label>
            <span>Gmail address</span>
            <input type="email" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="you@gmail.com" autoComplete="email" />
          </label>
          <label>
            <span>Name</span>
            <input value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Your name" autoComplete="name" />
          </label>
          {loginError && <div className="auth-error">{loginError}</div>}
          <button type="submit">Continue</button>
        </form>
      </main>
    );
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
        <div className="navbar-brand">
          <h1>MediCORE</h1>
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
                            {item.sender}
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
                  className={`sidebar-nav-link ${activeTab === "price-trends" ? "active" : ""}`}
                  onClick={() => setActiveTab("price-trends")}
                >
                  <TrendingUp size={18} />
                  <span>Price Trends</span>
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
                    AI found a price drop on {topDashboardDeal.best.normalized_name} - {topDashboardDeal.best.supplier_name} is {topDashboardDeal.savingPercent.toFixed(0)}% cheaper than the next supplier.
                    <button type="button" onClick={() => setActiveTab("assistant")}>{"Review recommendation ->"}</button>
                  </>
                ) : (
                  "No catalogue data extracted yet. Poll your inbox after sending an unread PDF email."
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
                  <span>New catalogues</span>
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
                          <strong>{formatMoney(deal.best.price_per_unit, deal.best.currency)}/{deal.best.unit}</strong>
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
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Inbox</h2>
              </div>
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
                        key={thread.supplier_name}
                        type="button"
                        className={`inbox-thread ${selectedInboxThread?.supplier_name === thread.supplier_name ? "active" : ""}`}
                        onClick={() => setSelectedInboxSupplier(thread.supplier_name)}
                      >
                        <div className="inbox-thread-topline">
                          <strong>{thread.supplier_name}</strong>
                          <span>{formatRelativeTime(thread.received_at)}</span>
                        </div>
                        <div className="inbox-thread-subject">{thread.item_count} items</div>
                        <div className="inbox-thread-meta">
                          <span className={`thread-status ${thread.status_tone}`}>{thread.status_label}</span>
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
                                <td colSpan={5}>No catalogue items were extracted for this supplier.</td>
                              </tr>
                            ) : (
                              selectedInboxThread.items.slice(0, 4).map((item, index) => {
                                const bestPrice = Math.min(...selectedInboxThread.items.map((row) => row.price_per_unit));
                                return (
                                  <tr key={`${item.supplier_name}-${item.ingredient_name}-${index}`}>
                                    <td>{item.ingredient_name}</td>
                                    <td>{item.unit}</td>
                                    <td>{formatMoney(item.price_per_unit, item.currency)}</td>
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
                              <td>{formatMoney(item.price_per_unit, item.currency)}</td>
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
                  Showing {compareData.rows.length} suppliers who carry this ingredient - Top 3 shown as cards - AI score = price + quantity + reliability
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
                            <p>{row.email_domain}</p>
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
                            ["Reliability", row.reliabilityDisplay],
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
                              <td>{formatMoney(row.price_per_unit, row.currency)}</td>
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
                <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Price Trends</h2>
              </div>
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
                          <td>{formatMoney(row.price_per_unit, row.currency)}</td>
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
                            <td>{typeof row.price_per_unit === "number" ? formatMoney(row.price_per_unit, String(row.currency ?? "INR")) : "-"}</td>
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


          {activeTab === "settings" && (
            <>
              <div className="settings-container" style={{
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                height: "calc(100vh - var(--navbar-height) - 64px)",
                alignItems: "stretch",
                overflow: "hidden",
              }}>
              {/* Horizontal Tabs Header Panel */}
              <div className="settings-header-panel" style={{
                background: "rgba(255, 255, 255, 0.85)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--line)",
                borderRadius: "16px",
                padding: "20px 24px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                boxShadow: "0 4px 20px rgba(0, 0, 0, 0.015)",
                flexShrink: 0,
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 600, color: "#092f28" }}>Workspace Settings</h2>
                </div>
                
                <div style={{
                  display: "flex",
                  gap: "8px",
                  borderBottom: "1px solid var(--line)",
                  paddingBottom: "8px",
                  overflow: "hidden"
                }}>
                  {[
                    { id: "profile", label: "Profile", icon: <Users size={16} /> },
                    { id: "email", label: "Supplier Connection", icon: <Sliders size={16} /> },
                    { id: "security", label: "Security", icon: <Shield size={16} /> },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setSettingsActiveTab(tab.id as any)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        padding: "10px 20px",
                        borderRadius: "8px",
                        border: "none",
                        background: settingsActiveTab === tab.id ? "rgba(15, 122, 95, 0.08)" : "transparent",
                        color: settingsActiveTab === tab.id ? "var(--accent)" : "var(--ink)",
                        fontWeight: settingsActiveTab === tab.id ? 600 : 500,
                        cursor: "pointer",
                        transition: "all 0.2s ease",
                        position: "relative",
                      }}
                      className="settings-tab-btn"
                    >
                      {tab.icon}
                      <span>{tab.label}</span>
                      {settingsActiveTab === tab.id && (
                        <div style={{
                          position: "absolute",
                          bottom: "-9px",
                          left: "0",
                          right: "0",
                          height: "3px",
                          background: "var(--accent)",
                          borderRadius: "3px 3px 0 0"
                        }} />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right Content Pane */}
              <main className="settings-content" style={{
                background: "rgba(255, 255, 255, 0.8)",
                backdropFilter: "blur(12px)",
                border: "1px solid var(--line)",
                borderRadius: "16px",
                padding: "32px",
                boxShadow: "0 8px 32px rgba(0, 0, 0, 0.03)",
                display: "flex",
                flexDirection: "column",
                gap: "24px",
                overflowY: "auto",
                flex: "1 1 0%",
              }}>
                {/* 1. PROFILE TAB */}
                {settingsActiveTab === "profile" && authUser && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <h2 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: 700 }}>Profile Configuration</h2>
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>Manage your administrative details and account profile.</p>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "20px", padding: "20px", background: "rgba(0, 0, 0, 0.015)", borderRadius: "12px", border: "1px solid var(--line)" }}>
                      <div className="user-avatar" style={{ width: "64px", height: "64px", fontSize: "24px" }}>
                        {userInitials(authUser.name, authUser.email)}
                      </div>
                      <div>
                        <h3 style={{ margin: "0 0 4px 0", fontSize: "18px", fontWeight: 600 }}>{authUser.name}</h3>
                        <span style={{ fontSize: "13px", color: "var(--muted)" }}>{authUser.email}</span>
                      </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "12px" }}>
                        <span style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Role</span>
                        <strong style={{ fontSize: "15px", color: "var(--ink)" }}>{authUser.role}</strong>
                      </div>
                      <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "12px" }}>
                        <span style={{ fontSize: "12px", color: "var(--muted)", display: "block", marginBottom: "4px" }}>Organisation</span>
                        <strong style={{ fontSize: "15px", color: "var(--ink)" }}>{authUser.organisation || "MediCORE Central"}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. SUPPLIER CONNECTION TAB */}
                {settingsActiveTab === "email" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                    <div>
                      <h2 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: 700, color: "#092f28" }}>Supplier Connection</h2>
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>Configure how MediCORE scans and reads catalog emails from your inbox.</p>
                    </div>

                    {/* Method Selection visual cards */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                      <h3 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>Choose Email Ingestion Approach</h3>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        {/* Approach 1 */}
                        <div
                          onClick={() => setLocalApproach("approach_1")}
                          style={{
                            padding: "20px",
                            borderRadius: "12px",
                            border: `2px solid ${localApproach === "approach_1" ? "var(--accent)" : "var(--line)"}`,
                            background: localApproach === "approach_1" ? "rgba(15, 122, 95, 0.04)" : "rgba(255, 255, 255, 0.4)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <strong style={{ fontSize: "15px", color: localApproach === "approach_1" ? "var(--accent)" : "var(--ink)" }}>Gmail Label Ingestion</strong>
                            <div style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              border: `2px solid ${localApproach === "approach_1" ? "var(--accent)" : "var(--muted)"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}>
                              {localApproach === "approach_1" && <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--accent)" }} />}
                            </div>
                          </div>
                          <span style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: "1.4" }}>
                            MediCORE will strictly monitor and parse emails tagged with the Gmail label <strong>'suppliers'</strong>. Safe, manual, and explicit.
                          </span>
                        </div>

                        {/* Approach 2 */}
                        <div
                          onClick={() => setLocalApproach("approach_2")}
                          style={{
                            padding: "20px",
                            borderRadius: "12px",
                            border: `2px solid ${localApproach === "approach_2" ? "var(--accent)" : "var(--line)"}`,
                            background: localApproach === "approach_2" ? "rgba(15, 122, 95, 0.04)" : "rgba(255, 255, 255, 0.4)",
                            cursor: "pointer",
                            transition: "all 0.2s ease",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <strong style={{ fontSize: "15px", color: localApproach === "approach_2" ? "var(--accent)" : "var(--ink)" }}>Smart Keyword Ingestion</strong>
                            <div style={{
                              width: "20px",
                              height: "20px",
                              borderRadius: "50%",
                              border: `2px solid ${localApproach === "approach_2" ? "var(--accent)" : "var(--muted)"}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center"
                            }}>
                              {localApproach === "approach_2" && <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--accent)" }} />}
                            </div>
                          </div>
                          <span style={{ fontSize: "12.5px", color: "var(--muted)", lineHeight: "1.4" }}>
                            Automatically read trusted suppliers. Screen unrecognized senders for keywords; if a match with PDF is found, request approval in the Navbar.
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Section depending on Approach */}
                    {localApproach === "approach_1" ? (
                      <div style={{
                        padding: "20px",
                        background: "rgba(255, 255, 255, 0.4)",
                        border: "1px solid var(--line)",
                        borderRadius: "12px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px"
                      }}>
                        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: "8px" }}>
                          <Sliders size={16} /> How to set up Gmail Labeling for MediCORE
                        </h4>
                        <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "13.5px", color: "var(--ink)", display: "flex", flexDirection: "column", gap: "10px", lineHeight: "1.5" }}>
                          <li>Open your linked Gmail account in a browser.</li>
                          <li>Go to <strong>Settings</strong> ➔ <strong>Labels</strong>. Scroll down and click <strong>Create a new label</strong>.</li>
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
                        padding: "24px",
                        background: "rgba(255, 255, 255, 0.4)",
                        border: "1px solid var(--line)",
                        borderRadius: "12px"
                      }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>Trusted Supplier Emails / Domains</label>
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Enter trusted domains or exact emails (separated by commas). Emails from these suppliers will bypass permission requests and ingest automatically.</span>
                          <textarea
                            value={localTrusted}
                            onChange={(e) => setLocalTrusted(e.target.value)}
                            placeholder="e.g. sigmaaldrich.com, orders@pharmacy.com, trustedsupplier.in"
                            rows={3}
                            style={{
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid var(--line)",
                              background: "#fff",
                              fontSize: "14px",
                              lineHeight: "1.5",
                              resize: "vertical",
                              fontFamily: "inherit"
                            }}
                          />
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <label style={{ fontWeight: 600, fontSize: "14px", color: "var(--ink)" }}>Smart Ingestion Keywords</label>
                          <span style={{ fontSize: "12px", color: "var(--muted)" }}>Comma-separated words to detect incoming catalog emails from new/unrecognized suppliers (subject or body).</span>
                          <textarea
                            value={localKeywords}
                            onChange={(e) => setLocalKeywords(e.target.value)}
                            placeholder="e.g. catalog, catalogue, price, offer, quote, inventory, sheet"
                            rows={2}
                            style={{
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid var(--line)",
                              background: "#fff",
                              fontSize: "14px",
                              lineHeight: "1.5",
                              resize: "vertical",
                              fontFamily: "inherit"
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Section 3: General Polling Settings Card */}
                    <div style={{
                      padding: "24px",
                      borderRadius: "12px",
                      background: "rgba(255, 255, 255, 0.4)",
                      border: "1px solid var(--line)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "20px"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div>
                          <h4 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#092f28" }}>General Polling & Automation</h4>
                          <p style={{ margin: "4px 0 0 0", color: "var(--muted)", fontSize: "13px" }}>Configure background sync frequencies and automatic parser tasks.</p>
                        </div>
                        {settingsSaveFeedback && (
                          <span style={{ fontSize: "12px", background: "rgba(49, 151, 149, 0.1)", color: "#2c7a7b", padding: "4px 10px", borderRadius: "12px", fontWeight: 600 }}>
                            Saved Successfully
                          </span>
                        )}
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "16px" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink)" }}>Global Polling Interval</span>
                          <select
                            value={syncSettings.poll_interval_minutes}
                            onChange={(e) => saveEmailSyncSettings({ poll_interval_minutes: Number(e.target.value) })}
                            style={{ padding: "10px", borderRadius: "8px", border: "1px solid var(--line)", background: "#fff", cursor: "pointer" }}
                          >
                            <option value={5}>Every 5 minutes</option>
                            <option value={10}>Every 10 minutes</option>
                            <option value={15}>Every 15 minutes</option>
                            <option value={30}>Every 30 minutes</option>
                            <option value={60}>Every hour</option>
                          </select>
                        </label>

                        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--line)" }} />

                        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={syncSettings.auto_extract_catalog}
                            onChange={(e) => saveEmailSyncSettings({ auto_extract_catalog: e.target.checked })}
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
                          />
                          <div>
                            <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Auto-Extract PDF Catalogue Items</strong>
                            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Automatically normalize and extract inventory sheets upon parsing.</span>
                          </div>
                        </label>

                        <hr style={{ margin: "4px 0", border: "none", borderTop: "1px solid var(--line)" }} />

                        <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={syncSettings.notify_on_new_catalog}
                            onChange={(e) => saveEmailSyncSettings({ notify_on_new_catalog: e.target.checked })}
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent)" }}
                          />
                          <div>
                            <strong style={{ display: "block", fontSize: "14px", color: "var(--ink)" }}>Push Notifications on New Catalogue Extraction</strong>
                            <span style={{ fontSize: "12px", color: "var(--muted)" }}>Notify workspace users in real-time as soon as products match suppliers.</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Unified Save Button */}
                    <button
                      type="button"
                      onClick={() => saveEmailSyncSettings({
                        ingestion_approach: localApproach,
                        trusted_suppliers: localTrusted,
                        keyword_filters: localKeywords
                      })}
                      disabled={savingSyncSettings}
                      style={{
                        padding: "14px 28px",
                        background: "var(--accent)",
                        color: "#fff",
                        border: "none",
                        borderRadius: "10px",
                        fontWeight: 600,
                        fontSize: "14px",
                        cursor: "pointer",
                        width: "fit-content",
                        alignSelf: "flex-end",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        boxShadow: "0 4px 12px rgba(15, 122, 95, 0.2)",
                        transition: "all 0.2s ease"
                      }}
                    >
                      {savingSyncSettings ? "Saving Settings..." : "Save Ingestion Settings"}
                    </button>
                  </div>
                )}

                {/* 4. SECURITY TAB */}
                {settingsActiveTab === "security" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    <div>
                      <h2 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: 700 }}>Security & Encryption</h2>
                      <p style={{ margin: 0, color: "var(--muted)", fontSize: "14px" }}>Manage credentials encryption and symmetrical vaults.</p>
                    </div>
                    <div style={{ padding: "16px", border: "1px solid var(--line)", borderRadius: "12px", background: "rgba(0, 0, 0, 0.01)", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <strong style={{ fontSize: "14px" }}>AES-256 Symmetrical Vault Encryption</strong>
                      <span style={{ fontSize: "13px", color: "var(--muted)" }}>
                        All App Passwords linked inside MediCORE are encrypted server-side using the secure 32-byte derived service-role key before hitting PostgreSQL tables. Decryption is isolated only to Celery worker polling execution scopes.
                      </span>
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
                      <option value="reliability">Reliability</option>
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
                      <th>Reliability</th>
                      <th>Latest catalogue</th>
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
                            </div>
                          </div>
                        </td>
                        <td>{supplier.email_domain}</td>
                        <td>{supplier.item_count}</td>
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
















