import { createClient, type RedisClientType } from "redis";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type AppCache = {
  getJson: <T extends JsonValue>(key: string) => Promise<T | null>;
  setJson: <T extends JsonValue>(key: string, value: T, ttlSeconds: number) => Promise<void>;
};

function createNoopCache(): AppCache {
  return {
    getJson: async () => null,
    setJson: async () => {}
  };
}

export async function createAppCache(redisUrl: string): Promise<AppCache> {
  let client: RedisClientType | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();
  } catch {
    if (client) {
      try {
        await client.quit();
      } catch {
        // ignore
      }
    }
    return createNoopCache();
  }

  return {
    getJson: async <T extends JsonValue>(key: string): Promise<T | null> => {
      try {
        const raw = await client.get(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
    setJson: async <T extends JsonValue>(key: string, value: T, ttlSeconds: number): Promise<void> => {
      try {
        await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
      } catch {
        // ignore cache failures
      }
    }
  };
}

