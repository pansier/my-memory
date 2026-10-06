import type { Store } from "./store.ts";
import { text } from "../shared/model.ts";
import webpush from "web-push";
export type PushSender = (
  subscription: webpush.PushSubscription,
  payload: string,
  options: { topic: string; TTL: number },
) => Promise<unknown>;
export async function tick(store: Store, send: PushSender, clock = Date.now()) {
  const tasks = store.activeTasks();
  const subscriptions = store.db
    .prepare("SELECT id,data FROM subscriptions")
    .all();
  const due = tasks.filter((b) => Date.parse(b.dueAt!) <= clock);
  for (const b of due)
    for (const s of subscriptions) {
      const key = `${b.id}:${b.dueAt}:${s.id}`;
      store.db
        .prepare(
          "INSERT OR IGNORE INTO deliveries(key,block_id,due,subscription_id,state) VALUES(?,?,?,?,?)",
        )
        .run(key, b.id, b.dueAt!, s.id, "pending");
    }
  const jobs = store.db
    .prepare("SELECT * FROM deliveries WHERE state='pending' AND retry_at<=?")
    .all(clock);
  for (const job of jobs) {
    const current = store.get(String(job.block_id));
    if (
      !current ||
      current.type !== "block" ||
      current.deleted ||
      current.done ||
      current.dueAt !== job.due ||
      !tasks.some((t) => t.id === current.id)
    ) {
      store.db
        .prepare("UPDATE deliveries SET state='cancelled' WHERE key=?")
        .run(job.key);
      continue;
    }
    const sub = store.db
      .prepare("SELECT data FROM subscriptions WHERE id=?")
      .get(job.subscription_id);
    if (!sub) {
      store.db
        .prepare("UPDATE deliveries SET state='cancelled' WHERE key=?")
        .run(job.key);
      continue;
    }
    try {
      // A stable topic and notification tag collapse retries after an ambiguous response.
      await send(
        JSON.parse(String(sub.data)),
        JSON.stringify({
          title: "My Memory",
          body: text(current.html),
          tag: `memory-${current.id}-${current.dueAt}`,
          url: "/?item=" + current.id,
        }),
        { topic: current.id.replaceAll("-", "").slice(0, 32), TTL: 86400 },
      );
      store.db
        .prepare(
          "UPDATE deliveries SET state='sent',attempts=attempts+1 WHERE key=?",
        )
        .run(job.key);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        store.db
          .prepare("DELETE FROM subscriptions WHERE id=?")
          .run(job.subscription_id);
        store.db
          .prepare("UPDATE deliveries SET state='cancelled' WHERE key=?")
          .run(job.key);
      } else {
        const attempts = Number(job.attempts) + 1;
        store.db
          .prepare(
            "UPDATE deliveries SET attempts=?,retry_at=?,state=? WHERE key=?",
          )
          .run(
            attempts,
            clock + Math.min(3600000, 30000 * 2 ** attempts),
            attempts >= 10 ? "failed" : "pending",
            job.key,
          );
        console.error("Push delivery retry", status ?? "network error");
      }
    }
  }
}
