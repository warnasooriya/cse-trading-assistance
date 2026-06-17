import { createApp } from "./server.js";
import { env } from "./serverEnv.js";

const app = await createApp();

app.listen(env.PORT, () => {
  process.stdout.write(`[market-data-service] listening on :${env.PORT}\n`);
});

