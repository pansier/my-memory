import { createApp } from "./app.ts";
import { Store } from "./store.ts";
import { tick } from "./planner.ts";
import webpush from "web-push";
const production = process.env.NODE_ENV === "production";
const passwordHash = process.env.APP_PASSWORD_HASH;
if (!passwordHash)
  throw new Error(
    "APP_PASSWORD_HASH ontbreekt. Maak een hash met npm run password.",
  );
if (
  production &&
  (!process.env.APP_ORIGIN?.startsWith("https://") ||
    !process.env.MCP_TOKEN ||
    process.env.MCP_TOKEN.length < 32)
)
  throw new Error(
    "Production needs HTTPS APP_ORIGIN and an MCP_TOKEN of at least 32 characters.",
  );
const store = new Store(process.env.DATABASE_PATH ?? "data/memory.sqlite");
const app = createApp(store, {
  passwordHash,
  mcpToken: process.env.MCP_TOKEN,
  production,
  origin: process.env.APP_ORIGIN,
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
});
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;
if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  timer = setInterval(() => {
    if (running) return;
    running = true;
    void tick(store, (s, p, o) => webpush.sendNotification(s, p, o))
      .catch((e) => console.error("Planner failure", e.message))
      .finally(() => (running = false));
  }, 15000);
}
const http = app.listen(
  Number(process.env.PORT ?? 3001),
  process.env.HOST ?? "0.0.0.0",
  () =>
    console.log("My Memory API listening on port", process.env.PORT ?? 3001),
);
function stop() {
  if (timer) clearInterval(timer);
  http.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
