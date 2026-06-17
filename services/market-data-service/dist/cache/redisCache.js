import { createClient } from "redis";
function createNoopCache() {
    return {
        getJson: async () => null,
        setJson: async () => { }
    };
}
export async function createAppCache(redisUrl) {
    let client = null;
    try {
        client = createClient({ url: redisUrl });
        client.on("error", () => { });
        await client.connect();
    }
    catch {
        if (client) {
            try {
                await client.quit();
            }
            catch {
                // ignore
            }
        }
        return createNoopCache();
    }
    return {
        getJson: async (key) => {
            try {
                const raw = await client.get(key);
                if (!raw)
                    return null;
                return JSON.parse(raw);
            }
            catch {
                return null;
            }
        },
        setJson: async (key, value, ttlSeconds) => {
            try {
                await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
            }
            catch {
                // ignore cache failures
            }
        }
    };
}
