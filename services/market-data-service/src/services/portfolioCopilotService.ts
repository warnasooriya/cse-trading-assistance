import { env } from "../serverEnv.js";

export type PortfolioCopilotInput = {
  holdings: Array<{
    symbol: string;
    sector: string;
    weightPct: number;
    netProfit: number;
    netReturnPct: number;
    breakEvenPrice: number;
    marketPrice: number | null;
  }>;
  totalMarketValue: number;
  totalNetProfit: number;
  topNews: Array<{
    title: string;
    sentiment: string;
    sentimentScore: number;
    symbols: string[];
  }>;
};

export type PortfolioCopilotOutput = {
  summary: string;
  portfolioHealth: "Strong" | "Balanced" | "Cautious";
  addIdeas: string[];
  reduceIdeas: string[];
  rebalanceActions: string[];
  riskAlerts: string[];
};

function fallbackPortfolioCopilot(input: PortfolioCopilotInput): PortfolioCopilotOutput {
  const largestHolding = [...input.holdings].sort((a, b) => b.weightPct - a.weightPct)[0];
  const weakest = [...input.holdings].sort((a, b) => a.netReturnPct - b.netReturnPct)[0];
  return {
    summary: `Portfolio net P/L is ${input.totalNetProfit.toFixed(2)} on market value ${input.totalMarketValue.toFixed(
      2
    )}. ${largestHolding ? `${largestHolding.symbol} is the largest exposure at ${largestHolding.weightPct.toFixed(2)}%.` : ""}`,
    portfolioHealth: input.totalNetProfit > 0 ? "Balanced" : "Cautious",
    addIdeas: input.topNews
      .filter((item) => item.sentiment === "Positive")
      .slice(0, 3)
      .map((item) => `Review accumulation candidates linked to ${item.symbols[0] ?? "market leaders"} because news tone is positive.`),
    reduceIdeas: weakest ? [`Consider reducing or hedging ${weakest.symbol} if it stays below break-even and sentiment remains weak.`] : [],
    rebalanceActions: largestHolding && largestHolding.weightPct > 35 ? [`Trim ${largestHolding.symbol} to reduce single-position concentration.`] : ["Keep sector allocations diversified across more than one theme."],
    riskAlerts: [
      "High concentration and repeated negative sentiment should trigger tighter stop-loss discipline.",
      "Use the profit simulator before rotating capital into a new idea."
    ]
  };
}

export async function generatePortfolioCopilot(input: PortfolioCopilotInput): Promise<PortfolioCopilotOutput> {
  if (!env.GEMINI_API_KEY) {
    return fallbackPortfolioCopilot(input);
  }

  const prompt = `
Return ONLY valid JSON with keys:
summary:string,
portfolioHealth:"Strong"|"Balanced"|"Cautious",
addIdeas:string[],
reduceIdeas:string[],
rebalanceActions:string[],
riskAlerts:string[]

Use this portfolio context:
${JSON.stringify(input)}

Requirements:
- Give concise portfolio-level actions
- Focus on profitable allocation, risk control, and capital rotation
- Mention sectors and concentration when relevant
- No markdown
`.trim();

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        env.GEMINI_MODEL
      )}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            responseMimeType: "application/json"
          }
        })
      }
    );
    if (!response.ok) return fallbackPortfolioCopilot(input);
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallbackPortfolioCopilot(input);
    const parsed = JSON.parse(text) as PortfolioCopilotOutput;
    if (!parsed.summary || !parsed.portfolioHealth) return fallbackPortfolioCopilot(input);
    return parsed;
  } catch {
    return fallbackPortfolioCopilot(input);
  }
}

