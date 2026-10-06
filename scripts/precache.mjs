import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
const files = readdirSync("dist/assets").filter((f) => /\.(js|css)$/.test(f));
const hash = createHash("sha256");
for (const f of files) hash.update(readFileSync("dist/assets/" + f));
const paths = [
  "/",
  "/brain.svg",
  "/manifest.webmanifest",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.png",
  ...files.map((f) => "/assets/" + f),
];
const sw = readFileSync("dist/sw.js", "utf8")
  .replace("__BUILD__", hash.digest("hex").slice(0, 16))
  .replace(/\/\*ASSETS\*\/\s*\[\]/, JSON.stringify(paths));
writeFileSync("dist/sw.js", sw);
