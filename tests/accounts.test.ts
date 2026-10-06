import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { Accounts, createAccountsApp } from "../server/accounts.ts";
import { hashPassword } from "../server/auth.ts";
import { Store } from "../server/store.ts";
import { newNote } from "../shared/model.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

test("existing owner data, sessions, images, sync and MCP remain private per account", async () => {
  const directory = mkdtempSync(join(tmpdir(), "memory-accounts-"));
  const path = join(directory, "memory.sqlite");
  const legacy = new Store(path);
  const original = newNote("Oorspronkelijke privénotitie");
  legacy.saveEntities([original]);
  legacy.close();
  const accounts = new Accounts(path, {
    username: "alex@pansier.nl",
    passwordHash: hashPassword("same-password"),
    mcpToken: "alex-private-token",
  });
  const other = accounts.add(
    "other@example.test",
    hashPassword("same-password"),
    "other-private-token",
  );
  assert.throws(
    () =>
      accounts.add(
        " OTHER@example.test ",
        hashPassword("new-password"),
        "token",
      ),
    /bestaat al/,
  );
  const server = createAccountsApp(accounts, {
    origin: "http://localhost",
    serveWeb: false,
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const address = server.address();
  const root = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  const login = async (username: string, password = "same-password") => {
    const response = await fetch(root + "/api/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    assert.equal(response.status, 200);
    const { account } = await response.json();
    return {
      cookie: response.headers.get("set-cookie")!.split(";")[0],
      "X-Memory-Account": account.id,
    };
  };
  try {
    const a = await login(" ALEX@PANSIER.NL ");
    const b = await login("other@example.test");
    const get = async (headers: Record<string, string>) =>
      (await (await fetch(root + "/api/entities", { headers })).json())
        .entities;
    assert.deepEqual(
      (await get(a)).map((e: { title: string }) => e.title),
      [original.title],
    );
    assert.equal((await get(b)).length, 0);
    assert.equal(
      (await fetch(root + "/api/entities", { headers: { cookie: a.cookie } }))
        .status,
      401,
    );
    assert.equal(
      (
        await fetch(root + "/api/entities", {
          headers: { ...a, "X-Memory-Account": other.id },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await fetch(root + "/api/entities", {
          headers: { ...a, Authorization: "Bearer wrong-token" },
        })
      ).status,
      401,
    );
    const session = await (
      await fetch(root + "/api/session", { headers: { cookie: b.cookie } })
    ).json();
    assert.deepEqual(session, {
      account: { id: other.id, username: "other@example.test" },
    });
    const bad = async (username: string, password: string) => {
      const response = await fetch(root + "/api/login", {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, password }),
      });
      assert.equal(response.status, 401);
      return response.json();
    };
    assert.deepEqual(
      await bad("absent@example.test", "same-password"),
      await bad("alex@pansier.nl", "wrong-password"),
    );
    const note = { ...newNote("Privé van ander account"), id: original.id };
    const sync = await fetch(root + "/api/sync", {
      method: "POST",
      headers: {
        ...b,
        Origin: "http://localhost",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mutations: [
          { opId: crypto.randomUUID(), baseVersion: 0, entity: note },
        ],
      }),
    });
    assert.equal(sync.status, 200);
    assert.deepEqual(
      (await get(a)).map((e: { title: string }) => e.title),
      [original.title],
    );
    assert.deepEqual(
      (await get(b)).map((e: { title: string }) => e.title),
      [note.title],
    );
    const imageId = crypto.randomUUID();
    const image = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
    assert.equal(
      (
        await fetch(root + "/api/images/" + imageId, {
          method: "PUT",
          headers: {
            ...a,
            Origin: "http://localhost",
            "Content-Type": "image/png",
          },
          body: image,
        })
      ).status,
      201,
    );
    assert.equal(
      (await fetch(root + "/api/images/" + imageId, { headers: b })).status,
      404,
    );
    for (const [token, title] of [
      ["alex-private-token", original.title],
      ["other-private-token", note.title],
    ]) {
      const client = new Client({ name: "isolation-test", version: "1" });
      try {
        await client.connect(
          new StreamableHTTPClientTransport(new URL(root + "/mcp"), {
            requestInit: { headers: { Authorization: "Bearer " + token } },
          }),
        );
        const result = await client.callTool({
          name: "read_project",
          arguments: {},
        });
        const content = JSON.parse(
          (result.content as { text: string }[])[0].text,
        );
        assert.equal(content.length, 1);
        assert.equal(content[0].title, title);
      } finally {
        await client.close();
      }
    }
    const backups = join(directory, "backups");
    execFileSync(process.execPath, ["--import", "tsx", "scripts/backup.ts"], {
      env: { ...process.env, DATABASE_PATH: path, BACKUP_DIR: backups },
    });
    const saved = join(backups, readdirSync(backups)[0]);
    const restored = new Accounts(join(saved, "memory.sqlite"), {
      username: "alex@pansier.nl",
      passwordHash: hashPassword("same-password"),
      mcpToken: "alex-private-token",
    });
    try {
      assert.equal(restored.all().length, 2);
      assert.equal(
        restored.store(restored.byUsername("alex@pansier.nl")!).all()[0].id,
        original.id,
      );
      const restoredNote = restored
        .store(restored.byUsername("other@example.test")!)
        .all()[0];
      assert.ok(restoredNote.type === "note");
      assert.equal(restoredNote.title, note.title);
    } finally {
      restored.close();
    }
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    accounts.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
