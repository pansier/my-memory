import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import type { Store } from "./store.ts";
export const sha = (v: string) => createHash("sha256").update(v).digest("hex");
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  try {
    const [format, salt, key] = hash.split(":");
    if (format !== "scrypt" || !salt || !key) return false;
    const expected = Buffer.from(key, "hex");
    const actual = scryptSync(password, salt, 64);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  } catch {
    return false;
  }
}
export function auth(store: Store, mcpToken?: string, mcpTokenHash?: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : "";
    if (
      bearer &&
      sha(bearer) === (mcpTokenHash ?? (mcpToken ? sha(mcpToken) : ""))
    ) {
      res.locals.bearer = true;
      return next();
    }
    const session = req.cookies?.memory_session;
    const row = session
      ? store.db
          .prepare("SELECT expires FROM sessions WHERE hash=?")
          .get(sha(session))
      : null;
    if (!row || Number(row.expires) < Date.now())
      return res
        .status(401)
        .json({ error: "Log opnieuw in om te synchroniseren." });
    next();
  };
}
