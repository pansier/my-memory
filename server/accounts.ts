import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { createApp, type Config } from "./app.ts";
import { sha } from "./auth.ts";
import { Store } from "./store.ts";

export type Account = {
  id: string;
  username: string;
  passwordHash: string;
  tokenHash: string;
};
export const normalizeUsername = (username: string) =>
  username.trim().toLowerCase();
export function validUsername(username: string) {
  return /^[a-z0-9][a-z0-9@._+\-]{2,253}$/.test(username);
}
export class Accounts {
  db: DatabaseSync;
  private stores = new Map<string, Store>();
  constructor(
    public databasePath: string,
    owner: { username: string; passwordHash: string; mcpToken?: string },
  ) {
    mkdirSync(dirname(databasePath), { recursive: true });
    const path = join(dirname(databasePath), "accounts.sqlite");
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(
      "PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, passwordHash TEXT NOT NULL, tokenHash TEXT NOT NULL)",
    );
    const username = normalizeUsername(owner.username);
    if (!validUsername(username)) throw new Error("Ongeldige gebruikersnaam.");
    this.db
      .prepare(
        "INSERT INTO accounts VALUES('owner',?,?,?) ON CONFLICT(id) DO UPDATE SET username=excluded.username,passwordHash=excluded.passwordHash,tokenHash=excluded.tokenHash",
      )
      .run(
        username,
        owner.passwordHash,
        owner.mcpToken ? sha(owner.mcpToken) : "",
      );
  }
  all(): Account[] {
    return this.db
      .prepare("SELECT * FROM accounts ORDER BY id")
      .all() as Account[];
  }
  byUsername(username: string): Account | undefined {
    return this.db
      .prepare("SELECT * FROM accounts WHERE username=?")
      .get(normalizeUsername(username)) as Account | undefined;
  }
  add(username: string, passwordHash: string, mcpToken: string): Account {
    username = normalizeUsername(username);
    if (!validUsername(username))
      throw new Error(
        "Gebruik 3–254 letters, cijfers of @ . _ + - voor de gebruikersnaam.",
      );
    if (this.byUsername(username))
      throw new Error("Deze gebruikersnaam bestaat al.");
    const account = {
      id: randomUUID(),
      username,
      passwordHash,
      tokenHash: sha(mcpToken),
    };
    this.db
      .prepare("INSERT INTO accounts VALUES(?,?,?,?)")
      .run(account.id, username, passwordHash, account.tokenHash);
    return account;
  }
  store(account: Account): Store {
    let store = this.stores.get(account.id);
    if (!store) {
      const path =
        account.id === "owner"
          ? this.databasePath
          : join(
              dirname(this.databasePath),
              "users",
              account.id,
              "memory.sqlite",
            );
      store = new Store(path);
      chmodSync(path, 0o600);
      this.stores.set(account.id, store);
    }
    return store;
  }
  close() {
    for (const store of this.stores.values()) store.close();
    this.db.close();
  }
}

export function createAccountsApp(
  accounts: Accounts,
  config: Omit<Config, "passwordHash">,
) {
  const app = express();
  if (config.production) app.set("trust proxy", 1);
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: config.loginLimit ?? 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const apps = new Map<string, { fingerprint: string; app: express.Express }>();
  const accountApp = (account: Account) => {
    const fingerprint =
      account.username + account.passwordHash + account.tokenHash;
    let cached = apps.get(account.id);
    if (!cached || cached.fingerprint !== fingerprint) {
      cached = {
        fingerprint,
        app: createApp(accounts.store(account), {
          ...config,
          loginLimiter,
          accountId: account.id,
          username: account.username,
          passwordHash: account.passwordHash,
          mcpToken: undefined,
          mcpTokenHash: account.tokenHash,
        }),
      };
      apps.set(account.id, cached);
    }
    return cached.app;
  };
  app.post("/api/login", (req, res, next) => {
    const username =
      typeof req.body?.username === "string" ? req.body.username : "";
    const account =
      accounts.byUsername(username) ??
      accounts.all().find((a) => a.id === "owner")!;
    accountApp(account)(req, res, next);
  });
  app.use((req, res, next) => {
    const all = accounts.all();
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";
    let account: Account | undefined;
    if (req.headers.authorization) {
      account = bearer
        ? all.find((a) => a.tokenHash && a.tokenHash === sha(bearer))
        : undefined;
      if (!account)
        return res.status(401).json({ error: "Ongeldige toegang." });
    } else if (req.cookies?.memory_session) {
      const hash = sha(String(req.cookies.memory_session));
      account = all.find(
        (a) =>
          !!accounts
            .store(a)
            .db.prepare("SELECT hash FROM sessions WHERE hash=? AND expires>?")
            .get(hash, Date.now()),
      );
    }
    const expectedAccount = req.headers["x-memory-account"];
    if (
      (expectedAccount && (!account || expectedAccount !== account.id)) ||
      (account &&
        !bearer &&
        req.path.startsWith("/api/") &&
        !["/api/session", "/api/health"].includes(req.path) &&
        expectedAccount !== account.id)
    )
      return res.status(401).json({
        error:
          "Log opnieuw in bij dit account. Lokale wijzigingen blijven bewaard.",
      });
    accountApp(account ?? all.find((a) => a.id === "owner")!)(req, res, next);
  });
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error(
        "Account request rejected:",
        error instanceof Error ? error.message : "unknown error",
      );
      res.status(400).json({ error: "Ongeldig verzoek." });
    },
  );
  return app;
}
