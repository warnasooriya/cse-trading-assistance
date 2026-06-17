import { z } from "zod";
const envSchema = z.object({
    PORT: z.coerce.number().default(8081),
    CSE_API_BASE_URL: z.string().url().default("https://www.cse.lk/api/"),
    RABBITMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
    DATABASE_URL: z.string().default("postgresql://cse_ai:cse_ai_dev@host.docker.internal:5432/cse_ai"),
    REDIS_URL: z.string().default("redis://redis:6379"),
    MARKET_SYNC_INTERVAL_MS: z.coerce.number().int().min(30_000).default(300_000),
    JWT_SECRET: z.string().default("cse_ai_dev_secret_change_me"),
    JWT_EXPIRES_IN: z.string().default("7d"),
    LOCAL_USER_EMAIL: z.string().default("local@cse.ai"),
    DEFAULT_PORTFOLIO_NAME: z.string().default("Primary")
});
export const env = envSchema.parse(process.env);
