import { env } from "../serverEnv.js";
function fallbackCopilot(params) {
    const lastPriceLabel = params.lastPrice !== null ? params.lastPrice.toFixed(2) : "current market price";
    return {
        summary: `${params.symbol} currently leans ${params.action} with ${params.confidence.toFixed(0)}% confidence based on rule-driven signals and technical structure.`,
        entryPlan: [
            `Use ${lastPriceLabel} as the anchor price and avoid chasing large moves intraday.`,
            params.action === "BUY"
                ? "Prefer accumulating near support or after confirmation above recent resistance."
                : "Wait for a clearer confirmation candle before increasing exposure."
        ],
        exitPlan: [
            params.action === "SELL"
                ? "Use strength toward resistance to reduce exposure."
                : "Stage exits at target levels instead of closing the whole position at once.",
            "Review position again if momentum weakens and MACD histogram turns negative."
        ],
        risks: [
            "Recent volatility can invalidate short-term entries.",
            "Transaction costs can erode profits when trade frequency is high."
        ],
        actionItems: [
            "Compare this setup with 6M and 1Y history before trading.",
            "Use the Profit Simulator and Backtesting Auto Simulation to validate reward/risk."
        ],
        confidenceNote: `Fallback copilot used because live LLM response was unavailable. RSI: ${params.indicators.rsi_14?.toFixed(2) ?? "n/a"}, MACD histogram: ${params.indicators.macd_hist?.toFixed(4) ?? "n/a"}.`
    };
}
export async function generateCopilotInsight(params) {
    if (!env.GEMINI_API_KEY) {
        return fallbackCopilot(params);
    }
    const prompt = `
You are an institutional trading copilot for Colombo Stock Exchange retail/investment users.
Return ONLY valid JSON with keys:
summary:string,
entryPlan:string[],
exitPlan:string[],
risks:string[],
actionItems:string[],
confidenceNote:string

Symbol: ${params.symbol}
Company: ${params.companyName ?? params.symbol}
Recommendation Action: ${params.action}
Recommendation Confidence: ${params.confidence}
Last Price: ${params.lastPrice ?? "unknown"}
Change Percentage: ${params.changePct ?? "unknown"}
Indicators: ${JSON.stringify(params.indicators)}
Recent Closes: ${JSON.stringify(params.recentCloses.slice(-20))}

Requirements:
- Focus on profitable entry and exit guidance
- Mention risk management clearly
- Keep each array item concise and practical
- Do not mention being an AI model
- Do not add markdown
`.trim();
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    responseMimeType: "application/json"
                }
            })
        });
        if (!response.ok) {
            return fallbackCopilot(params);
        }
        const payload = (await response.json());
        const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text)
            return fallbackCopilot(params);
        const parsed = JSON.parse(text);
        if (typeof parsed.summary !== "string" ||
            !Array.isArray(parsed.entryPlan) ||
            !Array.isArray(parsed.exitPlan) ||
            !Array.isArray(parsed.risks) ||
            !Array.isArray(parsed.actionItems) ||
            typeof parsed.confidenceNote !== "string") {
            return fallbackCopilot(params);
        }
        return {
            summary: parsed.summary,
            entryPlan: parsed.entryPlan.map(String),
            exitPlan: parsed.exitPlan.map(String),
            risks: parsed.risks.map(String),
            actionItems: parsed.actionItems.map(String),
            confidenceNote: parsed.confidenceNote
        };
    }
    catch {
        return fallbackCopilot(params);
    }
}
