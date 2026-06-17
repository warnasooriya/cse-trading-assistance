import * as amqplib from "amqplib";
import { env } from "../serverEnv.js";

export type EventBus = {
  publish: (routingKey: string, payload: unknown) => Promise<void>;
};

const EXCHANGE_NAME = "cse_ai.events";

export async function createEventBus(): Promise<EventBus> {
  try {
    const connection = await amqplib.connect(env.RABBITMQ_URL);
    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, "topic", { durable: true });
    return {
      publish: async (routingKey, payload) => {
        const body = Buffer.from(JSON.stringify(payload), "utf-8");
        channel.publish(EXCHANGE_NAME, routingKey, body, { contentType: "application/json" });
      }
    };
  } catch (error) {
    process.stderr.write(`[market-data-service] event bus disabled: ${(error as Error).message}\n`);
    return { publish: async () => undefined };
  }
}
