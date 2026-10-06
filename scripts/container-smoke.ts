import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { hashPassword } from "../server/auth.ts";
const directory = mkdtempSync(join(tmpdir(), "memory-container-"));
const name = "memory-smoke-" + randomBytes(5).toString("hex");
const volume = name + "-data";
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const docker = (args: string[]) =>
  execFileSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    encoding: "utf8",
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
writeFileSync(
  join(directory, "test.env"),
  `NODE_ENV=production\nAPP_ORIGIN=https://memory.example.test\nAPP_PASSWORD_HASH=${hashPassword(randomBytes(20).toString("hex"))}\nMCP_TOKEN=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600 },
);
try {
  docker(["volume", "create", volume]);
  docker([
    "run",
    "-d",
    "--name",
    name,
    "--env-file",
    join(directory, "test.env"),
    "--mount",
    `type=volume,src=${volume},dst=/data`,
    "my-memory:v1",
  ]);
  const wait = `for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:3001/api/health');if(r.ok)process.exit(0);}catch{}await new Promise(r=>setTimeout(r,100));}process.exit(1);`;
  docker(["exec", name, "node", "--input-type=module", "-e", wait]);
  docker([
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    `const r=await fetch('http://127.0.0.1:3001/api/sync',{method:'POST',headers:{Authorization:'Bearer '+process.env.MCP_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({mutations:[{opId:crypto.randomUUID(),baseVersion:0,entity:{id:crypto.randomUUID(),type:'note',version:0,updatedAt:new Date().toISOString(),deleted:false,title:'Container durability',tags:[],reusable:false,view:'document'}}]})});if(!r.ok)throw new Error('Sync failed');const data=await r.json();if(data.entities.length!==1)throw new Error('Missing entity');`,
  ]);
  docker(["restart", name]);
  docker(["exec", name, "node", "--input-type=module", "-e", wait]);
  docker([
    "exec",
    name,
    "node",
    "--input-type=module",
    "-e",
    `const r=await fetch('http://127.0.0.1:3001/api/entities',{headers:{Authorization:'Bearer '+process.env.MCP_TOKEN}});const d=await r.json();if(d.entities[0]?.title!=='Container durability')throw new Error('Data lost after restart');const ui=await fetch('http://127.0.0.1:3001/');if(!ui.ok||!(await ui.text()).includes('My Memory'))throw new Error('UI missing');`,
  ]);
  docker(["exec", name, "npm", "run", "backup"]);
  console.log(
    "Production container: health, authenticated API, restart durability, UI and online backup passed.",
  );
} catch (error) {
  try {
    console.error(docker(["inspect", "--format", "{{json .State}}", name]));
    const logs = spawnSync(
      "docker",
      ["--host=unix:///var/run/docker.sock", "logs", name],
      { env, encoding: "utf8" },
    );
    console.error(logs.stdout, logs.stderr);
  } catch {}
  throw error;
} finally {
  try {
    docker(["rm", "-f", name]);
  } catch {}
  try {
    docker(["volume", "rm", volume]);
  } catch {}
  rmSync(directory, { recursive: true, force: true });
}
