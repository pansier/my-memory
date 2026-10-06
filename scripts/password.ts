import { hashPassword } from "../server/auth.ts";
import { createInterface } from "node:readline/promises";
const rl = createInterface({ input: process.stdin, output: process.stdout });
console.error(
  "Gebruik deze opdracht alleen in je eigen terminal; het wachtwoord wordt tijdens invoer getoond.",
);
const password = await rl.question("Nieuw wachtwoord (minimaal 12 tekens): ");
rl.close();
if (password.length < 12) throw new Error("Gebruik minimaal 12 tekens.");
console.log("APP_PASSWORD_HASH=" + hashPassword(password));
