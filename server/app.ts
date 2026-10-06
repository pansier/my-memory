import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { auth, sha, verifyPassword } from "./auth.ts";
import { Store } from "./store.ts";
import { syncSchema, id } from "../shared/model.ts";
import {
  applyImport,
  importRecords,
  importSummary,
  importSchema,
  previewUndo,
  undoImport,
} from "./imports.ts";
import { handleMcp } from "./mcp.ts";
export type Config = {
  passwordHash: string;
  username?: string;
  loginLimit?: number;
  loginLimiter?: express.RequestHandler;
  accountId?: string;
  mcpTokenHash?: string;
  mcpToken?: string;
  origin?: string;
  production?: boolean;
  vapidPublicKey?: string;
  serveWeb?: boolean;
};
export function createApp(store: Store, config: Config) {
  const app = express();
  const account = {
    id: config.accountId ?? "owner",
    username: config.username ?? "owner",
  };
  app.disable("x-powered-by");
  if (config.production) app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "img-src": ["'self'", "blob:", "data:"],
          "connect-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "script-src": ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "20mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({ ok: true, version: "1.0.0" }),
  );
  // Cookie-authenticated mutations require a same-origin browser request; bearer requests are not susceptible to CSRF.
  app.use((req, res, next) => {
    if (
      ["GET", "HEAD", "OPTIONS"].includes(req.method) ||
      req.headers.authorization?.startsWith("Bearer ")
    )
      return next();
    const origin = req.headers.origin;
    const allowed = config.origin ?? `${req.protocol}://${req.get("host")}`;
    if (origin !== allowed)
      return res.status(403).json({ error: "Ongeldige herkomst." });
    next();
  });
  app.post(
    "/api/login",
    config.loginLimiter ??
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: config.loginLimit ?? 10,
        standardHeaders: "draft-8",
        legacyHeaders: false,
      }),
    (req, res) => {
      const p = z
        .object({
          username: z.string().max(254),
          password: z.string().max(500),
        })
        .safeParse(req.body);
      const validPassword = verifyPassword(
        p.success ? p.data.password : "",
        config.passwordHash,
      );
      if (
        !p.success ||
        p.data.username.trim().toLowerCase() !== account.username ||
        !validPassword
      )
        return res
          .status(401)
          .json({ error: "Gebruikersnaam of wachtwoord klopt niet." });
      const session = randomBytes(32).toString("hex");
      const expiry = Date.now() + 30 * 86400000;
      store.db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
      store.db
        .prepare("INSERT INTO sessions VALUES(?,?)")
        .run(sha(session), expiry);
      res
        .cookie("memory_session", session, {
          httpOnly: true,
          secure: !!config.production,
          sameSite: "strict",
          maxAge: 30 * 86400000,
          path: "/",
        })
        .json({ ok: true, account });
    },
  );
  const requireAuth = auth(store, config.mcpToken, config.mcpTokenHash);
  app.use("/api", requireAuth);
  app.use("/mcp", requireAuth);
  app.get("/api/session", (_req, res) => res.json({ account }));
  app.post("/api/logout", (req, res) => {
    if (req.cookies.memory_session)
      store.db
        .prepare("DELETE FROM sessions WHERE hash=?")
        .run(sha(req.cookies.memory_session));
    res.clearCookie("memory_session", { path: "/" }).json({ ok: true });
  });
  app.post("/api/sync", (req, res) =>
    res.json(store.sync(syncSchema.parse(req.body).mutations)),
  );
  app.get("/api/imports", (_req, res) =>
    res.json({ imports: importRecords(store).map(importSummary) }),
  );
  app.post("/api/imports", (req, res) =>
    res.status(201).json(applyImport(store, importSchema.parse(req.body))),
  );
  app.get("/api/imports/:id/undo", (req, res) =>
    res.json(previewUndo(store, id.parse(req.params.id))),
  );
  app.post("/api/imports/:id/undo", (req, res) =>
    res.json(
      undoImport(
        store,
        id.parse(req.params.id),
        z.object({ includeChanged: z.boolean().default(false) }).parse(req.body)
          .includeChanged,
      ),
    ),
  );
  app.get("/api/entities", (_req, res) => res.json({ entities: store.all() }));
  app.get("/api/images/:id", (req, res) => {
    const image = store.db
      .prepare("SELECT mime,data FROM images WHERE id=?")
      .get(id.parse(req.params.id));
    if (!image) return res.sendStatus(404);
    res
      .set({
        "Content-Type": String(image.mime),
        "Cache-Control": "private, max-age=31536000, immutable",
      })
      .send(Buffer.from(image.data as Uint8Array));
  });
  app.put(
    "/api/images/:id",
    express.raw({
      type: [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "application/pdf",
      ],
      limit: "50mb",
    }),
    (req, res) => {
      const imageId = id.parse(req.params.id);
      const mime = req.headers["content-type"]?.split(";")[0] ?? "";
      const data = req.body;
      if (!Buffer.isBuffer(data) || data.length < 12)
        return res.status(400).json({ error: "Ongeldige afbeelding." });
      const valid =
        (mime === "application/pdf" &&
          data.subarray(0, 5).toString() === "%PDF-") ||
        (mime === "image/png" &&
          data
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
        (mime === "image/jpeg" && data[0] === 255 && data[1] === 216) ||
        (mime === "image/webp" &&
          data.subarray(0, 4).toString() === "RIFF" &&
          data.subarray(8, 12).toString() === "WEBP") ||
        (mime === "image/gif" && data.subarray(0, 3).toString() === "GIF");
      if (!valid)
        return res.status(400).json({ error: "Afbeeldingstype klopt niet." });
      store.putImage(imageId, mime, data);
      res.status(201).json({ id: imageId });
    },
  );
  app.get("/api/push/config", (_req, res) =>
    res.json({ publicKey: config.vapidPublicKey ?? null }),
  );
  app.post("/api/push/unsubscribe", (req, res) => {
    const { endpoint } = z
      .object({ endpoint: z.string().max(2048) })
      .parse(req.body);
    store.db.prepare("DELETE FROM subscriptions WHERE id=?").run(sha(endpoint));
    res.json({ ok: true });
  });
  app.post("/api/push/subscribe", (req, res) => {
    const sub = z
      .object({
        endpoint: z.url().startsWith("https://").max(2048),
        keys: z.object({
          p256dh: z
            .string()
            .regex(/^[\w-]+={0,2}$/)
            .max(200),
          auth: z
            .string()
            .regex(/^[\w-]+={0,2}$/)
            .max(100),
        }),
      })
      .parse(req.body);
    // Do not allow arbitrary outbound URLs through the notification sender.
    const host = new URL(sub.endpoint).hostname;
    if (
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].some((h) => host === h || host.endsWith("." + h))
    )
      return res.status(400).json({ error: "Onbekende pushdienst." });
    store.db
      .prepare(
        "INSERT INTO subscriptions VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(sha(sub.endpoint), JSON.stringify(sub));
    res.json({ ok: true });
  });
  app.post("/mcp", (req, res, next) => {
    if (!res.locals.bearer)
      return res.status(401).json({ error: "Gebruik een MCP bearer-token." });
    void handleMcp(store, req, res).catch(next);
  });
  app.get("/mcp", (_req, res) => res.status(405).end());
  app.delete("/mcp", (_req, res) => res.status(405).end());
  if (config.serveWeb !== false && existsSync("dist/index.html")) {
    app.use(
      express.static(resolve("dist"), {
        setHeaders(res, path) {
          if (path.endsWith("sw.js"))
            res.setHeader("Cache-Control", "no-cache");
        },
      }),
    );
    app.get("/{*path}", (req, res) => {
      if (req.path.startsWith("/api/")) return res.sendStatus(404);
      res.sendFile(resolve("dist/index.html"));
    });
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (error instanceof z.ZodError)
        return res
          .status(400)
          .json({ error: "Ongeldige invoer.", details: error.issues });
      console.error(
        "Request rejected:",
        error instanceof Error ? error.message : "unknown error",
      );
      res.status(400).json({
        error: error instanceof Error ? error.message : "Verzoek mislukt.",
      });
    },
  );
  return app;
}
