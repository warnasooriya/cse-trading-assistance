import { env } from "../serverEnv.js";
export async function computeIndicators(candles) {
    const response = await fetch(`${env.TECHNICAL_ANALYSIS_URL}/indicators/compute`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json"
        },
        body: JSON.stringify({ candles })
    });
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`Technical analysis service error: ${text.slice(0, 200)}`);
    }
    return (await response.json());
}
