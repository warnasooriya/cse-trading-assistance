import { httpClient } from "./httpClient";

const MARKET_DATA_BASE_URL = import.meta.env.VITE_MARKET_DATA_BASE_URL as string | undefined;

export type MarketDashboardResponse = {
  status: { status: string };
  summary: unknown;
  indices: { aspi: unknown; snp: unknown };
  topGainers: unknown[];
  topLosers: unknown[];
  mostActive: unknown[];
  sectorPerformance: Array<{
    sectorId: number;
    symbol: string;
    indexName: string;
    period: string;
    first: number | null;
    last: number | null;
    change: number | null;
    changePct: number | null;
  }>;
};

export type MarketWatchItem = {
  id: number | null;
  name: string;
  symbol: string;
  price: number | null;
  previousClose: number | null;
  change: number | null;
  changePercentage: number | null;
  high: number | null;
  low: number | null;
  open: number | null;
  sharevolume: number | null;
  tradevolume: number | null;
  turnover: number | null;
  marketCap: number | null;
  lastTradedTime: number | null;
  status: number | null;
};

export type MarketWatchResponse = {
  total: number;
  limit: number;
  offset: number;
  sortBy: "symbol" | "name" | "price" | "changePercentage" | "sharevolume" | "turnover" | "marketCap";
  sortDir: "asc" | "desc";
  items: MarketWatchItem[];
};

export type AlertsApiItem = {
  id: string;
  type: "AI Buy Signal" | "AI Sell Signal" | "Price Breakout" | "RSI Oversold" | "RSI Overbought" | "Volume Spike";
  symbol: string;
  channel: "Email" | "SMS" | "Push";
  status: "Active" | "Paused";
  trigger: string;
};

export type PortfolioHolding = {
  symbol: string;
  name: string;
  sector: string;
  quantity: number;
  avgCost: number;
  buyCommission: number;
  sellCommissionRate: number;
  marketPrice: number | null;
  costBasis: number;
  totalInvested: number;
  marketValue: number;
  estimatedSellCommission: number;
  estimatedNetProceeds: number;
  grossProfit: number;
  netProfit: number;
  grossReturnPct: number;
  netReturnPct: number;
  breakEvenPrice: number;
  weightPct: number;
};

export type PortfolioSummary = {
  holdingsCount: number;
  totalQuantity: number;
  totalCostBasis: number;
  totalBuyCommission: number;
  totalInvested: number;
  totalMarketValue: number;
  totalEstimatedSellCommission: number;
  totalEstimatedNetProceeds: number;
  totalGrossProfit: number;
  totalNetProfit: number;
  grossReturnPct: number;
  netReturnPct: number;
};

export type PortfolioResponse = {
  id: string;
  name: string;
  summary: PortfolioSummary;
  holdings: PortfolioHolding[];
};

export type SuggestionItem = {
  symbol: string;
  name: string;
  action: "BUY" | "SELL" | "HOLD";
  confidence: number;
  reasons: string[];
  facts: {
    lastTradedPrice: number | null;
    changePercentage: number | null;
    volume: number | null;
    high52Week: number | null;
    low52Week: number | null;
    turnover: number | null;
    marketCap: number | null;
  };
};

export type SuggestionsResponse = {
  scanned: number;
  buy: SuggestionItem[];
  sell: SuggestionItem[];
};

export type NewsItem = {
  title: string;
  link: string;
  pubDate: string | null;
  source: string | null;
};

export type NewsResponse = {
  scope: "local" | "world";
  q: string | null;
  items: NewsItem[];
};

export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  role?: string | null;
  preferredLanguage?: string;
};

export type AuthResponse = {
  token: string;
  user: AuthUser;
};

export type WatchlistItem = { symbol: string; name: string };
export type Watchlist = { id: string; name: string; items: WatchlistItem[] };

function requireBaseUrl(): string {
  if (!MARKET_DATA_BASE_URL) {
    throw new Error("VITE_MARKET_DATA_BASE_URL is not set");
  }
  return MARKET_DATA_BASE_URL;
}

export async function fetchMarketDashboard(): Promise<MarketDashboardResponse> {
  const base = requireBaseUrl();
  return httpClient.getJson<MarketDashboardResponse>(`${base}/api/market/dashboard`);
}

export async function fetchMarketWatch(params: {
  q?: string;
  sortBy?: MarketWatchResponse["sortBy"];
  sortDir?: MarketWatchResponse["sortDir"];
  limit?: number;
  offset?: number;
}): Promise<MarketWatchResponse> {
  const base = requireBaseUrl();
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.sortBy) search.set("sortBy", params.sortBy);
  if (params.sortDir) search.set("sortDir", params.sortDir);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  if (typeof params.offset === "number") search.set("offset", String(params.offset));
  return httpClient.getJson<MarketWatchResponse>(`${base}/api/market/watch?${search.toString()}`);
}

export async function fetchSuggestions(limit = 12): Promise<SuggestionsResponse> {
  const base = requireBaseUrl();
  const search = new URLSearchParams();
  search.set("limit", String(limit));
  return httpClient.getJson<SuggestionsResponse>(`${base}/api/market/suggestions?${search.toString()}`);
}

export async function fetchMarketNews(params: { scope: "local" | "world"; q?: string; limit?: number }): Promise<NewsResponse> {
  const base = requireBaseUrl();
  const search = new URLSearchParams();
  search.set("scope", params.scope);
  if (params.q) search.set("q", params.q);
  if (typeof params.limit === "number") search.set("limit", String(params.limit));
  return httpClient.getJson<NewsResponse>(`${base}/api/market/news?${search.toString()}`);
}

export async function registerUser(payload: { email: string; password: string; displayName?: string; preferredLanguage?: string }): Promise<AuthResponse> {
  const base = requireBaseUrl();
  return httpClient.requestJson<AuthResponse>(`${base}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function loginUser(payload: { email: string; password: string }): Promise<AuthResponse> {
  const base = requireBaseUrl();
  return httpClient.requestJson<AuthResponse>(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchMe(): Promise<AuthUser> {
  const base = requireBaseUrl();
  return httpClient.getJson<AuthUser>(`${base}/api/auth/me`);
}

export async function updateProfile(payload: { displayName?: string; preferredLanguage?: string }): Promise<AuthUser> {
  const base = requireBaseUrl();
  return httpClient.requestJson<AuthUser>(`${base}/api/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function fetchWatchlists(): Promise<Watchlist[]> {
  const base = requireBaseUrl();
  return httpClient.getJson<Watchlist[]>(`${base}/api/watchlists`);
}

export async function createWatchlist(name: string): Promise<{ id: string }> {
  const base = requireBaseUrl();
  return httpClient.requestJson<{ id: string }>(`${base}/api/watchlists`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
}

export async function deleteWatchlist(id: string): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/watchlists/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function addWatchlistItem(watchlistId: string, payload: { symbol: string; name?: string }): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/watchlists/${encodeURIComponent(watchlistId)}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function removeWatchlistItem(watchlistId: string, symbol: string): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/watchlists/${encodeURIComponent(watchlistId)}/items/${encodeURIComponent(symbol)}`, {
    method: "DELETE"
  });
}

export async function fetchAlerts(): Promise<AlertsApiItem[]> {
  const base = requireBaseUrl();
  return httpClient.getJson<AlertsApiItem[]>(`${base}/api/alerts`);
}

export async function createAlert(payload: {
  type: AlertsApiItem["type"];
  symbol: string;
  channel: AlertsApiItem["channel"];
  trigger: string;
}): Promise<{ id: string }> {
  const base = requireBaseUrl();
  return httpClient.requestJson<{ id: string }>(`${base}/api/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateAlertStatus(id: string, status: AlertsApiItem["status"]): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/alerts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export async function deleteAlert(id: string): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/alerts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function fetchPortfolio(): Promise<PortfolioResponse> {
  const base = requireBaseUrl();
  return httpClient.getJson<PortfolioResponse>(`${base}/api/portfolio`);
}

export async function upsertPortfolioHolding(payload: {
  symbol: string;
  name?: string;
  sector?: string;
  quantity: number;
  avgCost: number;
  buyCommission?: number;
  sellCommissionRate?: number;
}): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/portfolio/holdings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function deletePortfolioHolding(symbol: string): Promise<void> {
  const base = requireBaseUrl();
  await httpClient.requestJson<void>(`${base}/api/portfolio/holdings/${encodeURIComponent(symbol)}`, { method: "DELETE" });
}
