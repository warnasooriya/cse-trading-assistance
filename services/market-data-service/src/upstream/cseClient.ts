import { z } from "zod";
import WebSocket from "ws";
import { env } from "../serverEnv.js";

export type CseClient = {
  getMarketStatus: () => Promise<{ status: string }>;
  getMarketSummary: () => Promise<unknown>;
  getAspiSummary: () => Promise<unknown>;
  getSnpSummary: () => Promise<unknown>;
  getTradeSummary: () => Promise<unknown>;
  getTodaySharePriceList: () => Promise<unknown>;
  getTopGainers: (limit?: number) => Promise<unknown[]>;
  getTopLosers: (limit?: number) => Promise<unknown[]>;
  getMostActiveTrades: (limit?: number) => Promise<unknown[]>;
  getAllSectors: () => Promise<unknown[]>;
  getSectorChartData: (sectorId: number, period: string) => Promise<Array<{ d: number; v: number }>>;
  getCompanyInfoSummary: (symbol: string) => Promise<unknown>;
};

const marketStatusSchema = z.object({ status: z.string() }).passthrough();
const arrayUnknownSchema: z.ZodType<unknown[]> = z.array(z.unknown());

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type StompFetchParams = {
  requestDestination: string;
  topics: string[];
  timeoutMs: number;
};

function randomAlphaNum(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)]!;
  }
  return out;
}

function buildStompFrame(command: string, headers: Record<string, string>, body = ""): string {
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}:${v}`)
    .join("\n");
  return `${command}\n${headerLines}\n\n${body}\0`;
}

function parseSockJsMessages(text: string): string[] {
  if (text === "o" || text === "h") return [];
  if (text.startsWith("a")) {
    const parsed = JSON.parse(text.slice(1)) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((m): m is string => typeof m === "string");
  }
  return [];
}

function parseStompFrame(raw: string): { command: string; headers: Record<string, string>; body: string } | null {
  const trimmed = raw.endsWith("\0") ? raw.slice(0, -1) : raw;
  const parts = trimmed.split("\n\n");
  const head = parts[0] ?? "";
  const body = parts.slice(1).join("\n\n");
  const lines = head.split("\n").filter(Boolean);
  const command = lines[0];
  if (!command) return null;
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return { command, headers, body };
}

function payloadHasRows(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some((row) => !!row && typeof row === "object" && "symbol" in (row as any) && String((row as any).symbol).trim());
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if ("symbol" in obj && String((obj as any).symbol).trim()) return true;
    const nestedCandidates: unknown[] = [
      (obj as any).sharePriceList,
      (obj as any).todaySharePrice,
      (obj as any).reqTodaySharePrice,
      (obj as any).items,
      (obj as any).data
    ];
    for (const candidate of nestedCandidates) {
      if (Array.isArray(candidate) && candidate.some((row) => !!row && typeof row === "object" && "symbol" in (row as any) && String((row as any).symbol).trim())) {
        return true;
      }
    }
  }
  return false;
}

async function fetchSockJsStompJsonOnce({ requestDestination, topics, timeoutMs }: StompFetchParams): Promise<unknown> {
  const infoRes = await fetch("https://www.cse.lk/api/ws/info", { headers: { Accept: "application/json" } });
  const setCookie = infoRes.headers.get("set-cookie");
  const cookie = setCookie ? setCookie.split(";")[0] : null;

  const serverId = String(Math.floor(Math.random() * 1000));
  const sessionId = randomAlphaNum(8);
  const wsUrl = `wss://www.cse.lk/api/ws/${serverId}/${sessionId}/websocket`;

  return await new Promise<unknown>((resolve, reject) => {
    let settled = false;
    let stompConnected = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error(`CSE ws timeout waiting for topics ${topics.join(", ")} after publish ${requestDestination}`));
    }, timeoutMs);

    function settleOk(payload: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      resolve(payload);
    }

    function settleErr(error: unknown) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      reject(error);
    }

    const socket = new WebSocket(wsUrl, {
      headers: cookie ? { Cookie: cookie } : undefined
    });

    socket.on("error", () => settleErr(new Error("CSE ws connection error")));
    socket.on("close", () => {
      if (!settled) settleErr(new Error("CSE ws closed before receiving response"));
    });

    socket.on("message", (data: WebSocket.RawData) => {
      const text = typeof data === "string" ? data : data.toString("utf-8");
      const messages = parseSockJsMessages(text);
      for (const msg of messages) {
        const frames = msg.split("\0").filter(Boolean).map((f) => `${f}\0`);
        for (const frameText of frames) {
          const frame = parseStompFrame(frameText);
          if (!frame) continue;
          if (frame.command === "CONNECTED" && !stompConnected) {
            stompConnected = true;
            let id = 0;
            for (const topic of topics) {
              socket.send(JSON.stringify([buildStompFrame("SUBSCRIBE", { id: `sub-${id}`, destination: topic, ack: "auto" })]));
              id += 1;
            }
            socket.send(
              JSON.stringify([
                buildStompFrame("SEND", { destination: requestDestination, "content-length": "0" }, "")
              ])
            );
            continue;
          }
          if (frame.command === "MESSAGE") {
            try {
              const payload = JSON.parse(frame.body) as unknown;
              if (payloadHasRows(payload)) settleOk(payload);
            } catch {
              continue;
            }
          }
          if (frame.command === "ERROR") {
            settleErr(new Error(frame.headers["message"] ?? "CSE ws STOMP error"));
          }
        }
      }
      if (!stompConnected && text === "o") {
        socket.send(
          JSON.stringify([
            buildStompFrame("CONNECT", { "accept-version": "1.2", "heart-beat": "0,0" }, "")
          ])
        );
      }
    });
  });
}

async function parseJsonResponse(endpoint: string, response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`CSE ${endpoint} returned an empty response body`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const contentType = response.headers.get("content-type") ?? "unknown";
    throw new Error(
      `CSE ${endpoint} returned invalid JSON (content-type: ${contentType}): ${(error as Error).message}. Body: ${text
        .slice(0, 200)
        .replaceAll("\n", " ")}`
    );
  }
}

async function postForm<T>(endpoint: string, formData: Record<string, string | number | undefined>, schema: z.ZodType<T>): Promise<T> {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(formData)) {
    if (value !== undefined) body.set(key, String(value));
  }

  const response = await fetch(new URL(endpoint, env.CSE_API_BASE_URL), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Accept: "application/json"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CSE ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  return schema.parse(json);
}

async function postFormUnknown(endpoint: string, formData: Record<string, string | number | undefined> = {}): Promise<unknown> {
  const body = new URLSearchParams(
    Object.entries(formData)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)])
  ).toString();

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(new URL(endpoint, env.CSE_API_BASE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CSE ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    try {
      return await parseJsonResponse(endpoint, response);
    } catch (error) {
      if (attempt === 0) {
        await sleep(150);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`CSE ${endpoint} failed unexpectedly`);
}

async function postJsonUnknown(endpoint: string, payload: unknown): Promise<unknown> {
  const body = JSON.stringify(payload);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(new URL(endpoint, env.CSE_API_BASE_URL), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`CSE ${endpoint} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    try {
      return await parseJsonResponse(endpoint, response);
    } catch (error) {
      if (attempt === 0) {
        await sleep(150);
        continue;
      }
      throw error;
    }
  }

  throw new Error(`CSE ${endpoint} failed unexpectedly`);
}

const chartPointSchema = z.object({ d: z.number(), v: z.number() }).passthrough();
const chartDataSchema = z.array(chartPointSchema);

export function createCseClient(): CseClient {
  return {
    getMarketStatus: async () => postForm("marketStatus", {}, marketStatusSchema),
    getMarketSummary: async () => postFormUnknown("marketSummery", {}),
    getAspiSummary: async () => postFormUnknown("aspiData", {}),
    getSnpSummary: async () => postFormUnknown("snpData", {}),
    getTradeSummary: async () => postFormUnknown("tradeSummary", {}),
    getTodaySharePriceList: async () =>
      fetchSockJsStompJsonOnce({
        requestDestination: "/app/request-today-sharePrice",
        topics: ["/user/topic/today-sharePrice", "/topic/today-sharePrice"],
        timeoutMs: 15000
      }),
    getTopGainers: async (limit) => {
      const items = await postForm<unknown[]>("topGainers", {}, arrayUnknownSchema);
      return limit ? items.slice(0, limit) : items;
    },
    getTopLosers: async (limit) => {
      const items = await postForm<unknown[]>("topLooses", {}, arrayUnknownSchema);
      return limit ? items.slice(0, limit) : items;
    },
    getMostActiveTrades: async (limit) => {
      const items = await postForm<unknown[]>("mostActiveTrades", {}, arrayUnknownSchema);
      return limit ? items.slice(0, limit) : items;
    },
    getAllSectors: async () => postForm("allSectors", {}, arrayUnknownSchema),
    getSectorChartData: async (sectorId, period) => postForm("chartData", { chartId: sectorId, period }, chartDataSchema),
    getCompanyInfoSummary: async (symbol) => postFormUnknown("companyInfoSummery", { symbol }),
  };
}
