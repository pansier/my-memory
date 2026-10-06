import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.ts";
import { Store } from "../server/store.ts";
import { hashPassword } from "../server/auth.ts";
import { makeMcp } from "../server/mcp.ts";
import { newBlock, newNote } from "../shared/model.ts";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
test("HTTP login, cookie access, CSRF, bearer access, image validation and stored content", async () => {
  const s = new Store(":memory:");
  const app = createApp(s, {
    passwordHash: hashPassword("test-password"),
    mcpToken: "test-token",
    origin: "http://localhost",
    serveWeb: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const address = server.address();
  const root = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  try {
    assert.equal((await fetch(root + "/api/entities")).status, 401);
    assert.equal(
      (
        await fetch(root + "/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "test-password" }),
        })
      ).status,
      403,
    );
    const login = await fetch(root + "/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body: JSON.stringify({ password: "test-password" }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    assert.ok(login.headers.get("set-cookie")?.includes("HttpOnly"));
    assert.equal(
      (await fetch(root + "/api/entities", { headers: { cookie } })).status,
      200,
    );
    const n = newNote("Persistente notitie");
    const body = JSON.stringify({
      mutations: [{ opId: crypto.randomUUID(), baseVersion: 0, entity: n }],
    });
    assert.equal(
      (
        await fetch(root + "/api/sync", {
          method: "POST",
          headers: {
            cookie,
            "Content-Type": "application/json",
            Origin: "https://evil.example",
          },
          body,
        })
      ).status,
      403,
    );
    const valid = await fetch(root + "/api/sync", {
      method: "POST",
      headers: {
        cookie,
        "Content-Type": "application/json",
        Origin: "http://localhost",
      },
      body,
    });
    assert.equal(valid.status, 200);
    assert.equal((await valid.json()).entities[0].title, "Persistente notitie");
    assert.equal(
      (
        await fetch(root + "/api/entities", {
          headers: { Authorization: "Bearer test-token" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(root + "/api/images/" + crypto.randomUUID(), {
          method: "PUT",
          headers: {
            cookie,
            Origin: "http://localhost",
            "Content-Type": "image/png",
          },
          body: Buffer.from("not-an-image-here"),
        })
      ).status,
      400,
    );
    const logout = await fetch(root + "/api/logout", {
      method: "POST",
      headers: { cookie, Origin: "http://localhost" },
    });
    assert.equal(logout.status, 200);
    assert.equal(
      (await fetch(root + "/api/entities", { headers: { cookie } })).status,
      401,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
test("real MCP protocol exposes tools and preserves source when adding under a heading", async () => {
  const store = new Store(":memory:");
  const n = newNote("Reis");
  const h = {
    ...newBlock(n.id, "<p><strong>Medicijnen</strong></p>", "text"),
    position: 1000,
  };
  store.saveEntities([n, h]);
  const server = makeMcp(store);
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "add_point"));
    const ask = await client.callTool({
      name: "add_point",
      arguments: { noteId: n.id, html: "<p>Pleisters</p>" },
    });
    assert.ok(
      JSON.parse((ask.content as { text: string }[])[0].text)
        .needsClarification,
    );
    const result = await client.callTool({
      name: "add_point",
      arguments: {
        noteId: n.id,
        heading: "Medicijnen",
        html: "<p>Pleisters</p>",
      },
    });
    assert.equal(result.isError, undefined);
    assert.equal(store.all().length, 3);
    assert.equal((store.get(h.id) as typeof h).html, h.html);
    const full = await client.callTool({ name: "read_project", arguments: {} });
    assert.equal(
      JSON.parse((full.content as { text: string }[])[0].text).length,
      3,
    );
  } finally {
    await client.close();
    await server.close();
    store.close();
  }
});
test("Streamable HTTP MCP requires bearer and handles actual SDK initialization and tools", async () => {
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const s = new Store(":memory:");
  const app = createApp(s, {
    passwordHash: hashPassword("test-password"),
    mcpToken: "mcp-http-token",
    origin: "http://localhost",
    serveWeb: false,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.on("listening", r));
  const address = server.address();
  const root = `http://127.0.0.1:${typeof address === "object" ? address!.port : 0}`;
  const client = new Client({ name: "http-test", version: "1" });
  try {
    assert.equal(
      (
        await fetch(root + "/mcp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost",
          },
          body: "{}",
        })
      ).status,
      401,
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL(root + "/mcp"), {
        requestInit: { headers: { Authorization: "Bearer mcp-http-token" } },
      }),
    );
    const tools = await client.listTools();
    assert.ok(tools.tools.length >= 10);
    const result = await client.callTool({
      name: "create_note",
      arguments: { title: "MCP over HTTP" },
    });
    assert.ok(!result.isError);
    assert.equal(s.all().length, 1);
  } finally {
    await client.close();
    await new Promise<void>((r) => server.close(() => r()));
    s.close();
  }
});
