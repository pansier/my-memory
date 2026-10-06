import { test, expect, type Page } from "@playwright/test";
async function login(page: Page, username = "alex@pansier.nl") {
  await page.goto("/");
  await page.getByLabel("Gebruikersnaam", { exact: true }).fill(username);
  await page
    .getByLabel("Wachtwoord", { exact: true })
    .fill("test-password-e2e");
  await page.getByRole("button", { name: "Open mijn geheugen" }).click();
  await expect(page.getByRole("heading", { name: "Inbox." })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
}
async function synced(page: Page) {
  await page
    .getByRole("button", { name: "Gesynchroniseerd", exact: true })
    .waitFor({ timeout: 20000 });
}
async function createNote(
  page: Page,
  title: string,
  reusable = false,
  document = false,
) {
  await page
    .getByRole("button", { name: "Nieuwe notitie", exact: true })
    .first()
    .click();
  await page.getByLabel("Titel van nieuwe notitie").fill(title);
  await page
    .getByLabel("Weergave van nieuwe notitie")
    .selectOption(document ? "document" : "tasks");
  if (reusable) await page.getByRole("dialog").getByRole("checkbox").check();
  await page.getByRole("button", { name: "Notitie maken" }).click();
  await expect(page.getByLabel("Notitietitel")).toHaveValue(title);
}
async function quick(page: Page, text: string) {
  await page.getByLabel("Snelle invoer", { exact: true }).fill(text);
  await page.getByLabel("Snelle invoer", { exact: true }).press("Enter");
  await expect(page.getByLabel("Snelle invoer", { exact: true })).toHaveValue(
    "",
  );
}
test("inbox, archive and fuzzy search retain one-time completed points", async ({
  page,
}) => {
  await login(page);
  await quick(page, "Medicijnen voor volgende reis");
  await synced(page);
  const row = page
    .locator(".block-row")
    .filter({ hasText: "Medicijnen voor volgende reis" });
  await row.getByRole("button", { name: "Punt afvinken", exact: true }).click();
  await expect(row).toHaveCount(0);
  await page
    .getByRole("button", { name: /Archief/ })
    .first()
    .click();
  await expect(
    page
      .locator(".block-row")
      .filter({ hasText: "Medicijnen voor volgende reis" }),
  ).toBeVisible();
  await page.getByLabel("Zoeken", { exact: true }).fill("medicijenn");
  await expect(
    page
      .getByRole("button")
      .filter({ hasText: "Medicijnen voor volgende reis" }),
  ).toBeVisible();
});
test("editor keeps bold formatting, continues lists and supports hashtag navigation", async ({
  page,
}) => {
  await login(page);
  await createNote(page, "Mijn reisdocument");
  const editor = page.getByRole("textbox", { name: "Inhoud van punt" }).first();
  await editor.fill("Medicijnen");
  await editor.press("ControlOrMeta+a");
  await page.getByRole("button", { name: "Vet", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("Medicijnen");
  await page.getByRole("button", { name: "Subkopopmaak" }).click();
  await expect(page.locator(".kind-subheading")).toHaveCount(1);
  await editor.press("End");
  await editor.press("Enter");
  const second = page.getByRole("textbox", { name: "Inhoud van punt" }).nth(1);
  await second.fill("Pleisters");
  await page.getByRole("button", { name: "Opsomming", exact: true }).click();
  await expect(page.locator(".kind-bullet")).toHaveCount(1);
  await second.press("End");
  await second.press("Enter");
  await expect(page.locator(".kind-bullet")).toHaveCount(2);
  await page.getByLabel("Hashtags van notitie").fill("reizen, gezondheid");
  await page.getByLabel("Notitietitel").click();
  await expect(
    page.locator(".tag-nav").getByRole("button", { name: "gezondheid" }),
  ).toBeVisible();
  await synced(page);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Inhoud van punt" }).first(),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Mijn reisdocument", exact: true })
    .click();
  await expect(page.locator(".kind-subheading strong")).toHaveText(
    "Medicijnen",
  );
});
test("reusable checklists clone whole note with new IDs, reset checks and remove scheduled dates", async ({
  page,
}) => {
  await login(page);
  await createNote(page, "Herbruikbare paklijst", true);
  await quick(page, "Paspoort");
  const row = page.locator(".block-row").filter({ hasText: "Paspoort" });
  await row.getByRole("button", { name: "Opties voor punt" }).click();
  await row.getByLabel("Datum en tijd van punt").fill("2026-12-01T09:00");
  await row.getByRole("button", { name: "Opties sluiten" }).click();
  await row.getByRole("button", { name: "Punt afvinken", exact: true }).click();
  await expect(row).toHaveClass(/is-done/);
  await page.getByRole("button", { name: "Klonen", exact: true }).click();
  await page
    .getByRole("button", { name: "Herbruikbare paklijst (kopie)", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Paspoort" }),
  ).not.toHaveClass(/is-done/);
  await expect(page.locator(".date-chip")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Herbruikbare paklijst", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Paspoort" }),
  ).toHaveClass(/is-done/);
  await page.getByRole("button", { name: "Alle vinkjes uitzetten" }).click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Paspoort" }),
  ).not.toHaveClass(/is-done/);
});
test("offline edit and image survive reload and sync without duplicates", async ({
  page,
  context,
}) => {
  await login(page);
  await createNote(page, "Offline testblad");
  await synced(page);
  await context.setOffline(true);
  await quick(page, "Offline onthouden");
  await page.getByLabel("Afbeelding aan notitie toevoegen").setInputFiles({
    name: "tiny.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aGv0AAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(page.locator(".memory-image")).toHaveCount(1);
  await page.reload();
  await page
    .getByRole("button", { name: "Offline testblad", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Offline onthouden" }),
  ).toHaveCount(1);
  await expect(page.locator(".memory-image")).toHaveCount(1);
  await context.setOffline(false);
  await synced(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Offline testblad", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Offline onthouden" }),
  ).toHaveCount(1);
  await expect(page.locator(".memory-image")).toHaveCount(1);
});
test("two devices keep both conflicting edits and can preserve local copy", async ({
  page,
  browser,
}) => {
  await login(page);
  await createNote(page, "Conflict document");
  const first = page.getByRole("textbox", { name: "Inhoud van punt" }).first();
  await first.fill("Oorspronkelijke gedachte");
  await synced(page);
  const contextB = await browser.newContext();
  const other = await contextB.newPage();
  await login(other);
  await other
    .getByRole("button", { name: "Conflict document", exact: true })
    .click();
  await synced(other);
  await page.context().setOffline(true);
  await contextB.setOffline(true);
  await first.fill("Wijziging apparaat A");
  await other
    .getByRole("textbox", { name: "Inhoud van punt" })
    .first()
    .fill("Wijziging apparaat B");
  await page.context().setOffline(false);
  await synced(page);
  await contextB.setOffline(false);
  await expect(other.locator(".conflict")).toBeVisible({ timeout: 20000 });
  await expect(other.locator(".conflict")).toContainText(
    "Wijziging apparaat A",
  );
  await expect(other.locator(".conflict")).toContainText(
    "Wijziging apparaat B",
  );
  await other.getByRole("button", { name: "Lokale kopie bewaren" }).click();
  await synced(other);
  await expect(other.locator(".conflict")).toHaveCount(0);
  await expect(
    other
      .getByRole("textbox", { name: "Inhoud van punt" })
      .filter({ hasText: "Wijziging apparaat B" }),
  ).toBeVisible();
  await contextB.close();
});
test("iPhone viewport has usable navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.getByLabel("Datum bij snelle invoer").fill("2027-01-01T10:00");
  await quick(page, "Een mobiele gedachte");
  await page.getByRole("button", { name: "Navigatie openen" }).click();
  await expect(
    page.getByRole("navigation", { name: "Hoofdnavigatie" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Herinneringen/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Herinneringen." }),
  ).toBeVisible();
  await expect(
    page.locator(".block-row").filter({ hasText: "Een mobiele gedachte" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("point destination changes preserve identity and remove it from inbox", async ({
  page,
}) => {
  await login(page);
  await createNote(page, "Bestemming voor punt");
  await page.getByRole("button", { name: /^Inbox/ }).click();
  await quick(page, "Verplaats dit punt");
  const row = page
    .locator(".block-row")
    .filter({ hasText: "Verplaats dit punt" });
  await row.getByRole("button", { name: "Opties voor punt" }).click();
  await row
    .getByLabel("Bestemming van punt", { exact: true })
    .selectOption({ label: "Bestemming voor punt" });
  await expect(row).toHaveCount(0);
  await page
    .getByRole("button", { name: "Bestemming voor punt", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Verplaats dit punt" }),
  ).toHaveCount(1);
  await synced(page);
});
test("offline checklist reset, clone, tag editing and image remain independent after restart", async ({
  page,
  context,
}) => {
  await login(page);
  await createNote(page, "Offline herbruikbaar", true);
  await quick(page, "Oplader");
  await page
    .locator(".block-row")
    .filter({ hasText: "Oplader" })
    .getByRole("button", { name: "Punt afvinken", exact: true })
    .click();
  await synced(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Alle vinkjes uitzetten" }).click();
  await page.getByLabel("Hashtags van notitie").fill("offline");
  await page.getByLabel("Notitietitel").click();
  await expect(
    page
      .locator(".tag-nav")
      .getByRole("button", { name: "offline", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Klonen", exact: true }).click();
  await page
    .getByRole("button", { name: "Offline herbruikbaar (kopie)", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Inhoud van punt" })
    .filter({ hasText: "Oplader" })
    .fill("Extra oplader");
  await expect(
    page.locator(".block-row").filter({ hasText: "Extra oplader" }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Offline herbruikbaar (kopie)", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Extra oplader" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Offline herbruikbaar", exact: true })
    .click();
  await expect(
    page.locator(".block-row").filter({ hasText: "Oplader" }),
  ).not.toHaveClass(/is-done/);
  await expect(
    page.locator(".block-row").filter({ hasText: "Extra oplader" }),
  ).toHaveCount(0);
  await context.setOffline(false);
  await synced(page);
});
test("lost sync response retries the same operation and never duplicates the point", async ({
  page,
}) => {
  await login(page);
  await synced(page);
  let dropped = false;
  const ids: string[] = [];
  await page.route("**/api/sync", async (route) => {
    const body = route.request().postDataJSON();
    const mutation = body.mutations?.find((m: { entity: { html?: string } }) =>
      m.entity.html?.includes("Veilige herhaling"),
    );
    if (mutation) {
      ids.push(mutation.opId);
      if (!dropped) {
        dropped = true;
        await route.fetch();
        await route.abort("failed");
        return;
      }
    }
    await route.continue();
  });
  await quick(page, "Veilige herhaling");
  await expect(page.locator(".sync-button")).toContainText(
    "Verbinding ontbreekt",
  );
  await page.locator(".sync-button").click();
  await synced(page);
  expect(ids.length).toBeGreaterThanOrEqual(2);
  expect(new Set(ids).size).toBe(1);
  const result = await page.request.get("/api/entities", {
    headers: { "X-Memory-Account": "owner" },
  });
  const data = await result.json();
  expect(
    data.entities.filter((e: { html?: string }) =>
      e.html?.includes("Veilige herhaling"),
    ),
  ).toHaveLength(1);
});

test("private accounts never show each other's notes after logout and reload", async ({
  page,
}) => {
  const ownerText = "Alleen Alex " + crypto.randomUUID();
  const otherText = "Alleen ander account " + crypto.randomUUID();
  const logout = async () => {
    await page.locator("button.account").click();
    await page.getByRole("button", { name: "Uitloggen", exact: false }).click();
    await expect(
      page.getByLabel("Gebruikersnaam", { exact: true }),
    ).toBeVisible();
  };
  await login(page);
  await quick(page, ownerText);
  await synced(page);
  await logout();
  await login(page, "other@example.test");
  await synced(page);
  await expect(page.getByText(ownerText, { exact: true })).toHaveCount(0);
  await quick(page, otherText);
  await synced(page);
  await page.reload();
  await synced(page);
  await expect(page.getByText(otherText, { exact: true })).toBeVisible();
  await expect(page.getByText(ownerText, { exact: true })).toHaveCount(0);
  await logout();
  await login(page);
  await synced(page);
  await expect(page.getByText(ownerText, { exact: true })).toBeVisible();
  await expect(page.getByText(otherText, { exact: true })).toHaveCount(0);
});

test("legacy offline cache is imported only into the original owner's account", async ({
  page,
}) => {
  await page.goto("/");
  const title = "Oude privé-inbox " + crypto.randomUUID();
  await page.evaluate(async (title) => {
    const entity = {
      id: crypto.randomUUID(),
      version: 0,
      updatedAt: new Date().toISOString(),
      deleted: false,
      type: "block",
      noteId: null,
      kind: "task",
      html: "<p>" + title + "</p>",
      indent: 0,
      position: Date.now(),
      done: false,
      reusable: null,
      dueAt: null,
      tags: [],
      imageIds: [],
    };
    const request = indexedDB.open("my-memory-v1", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put(
      {
        entities: [entity],
        pending: [{ opId: crypto.randomUUID(), baseVersion: 0, entity }],
        conflicts: [],
        lastSync: null,
        authenticated: true,
      },
      "owner",
    );
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, title);
  await login(page, "other@example.test");
  await synced(page);
  await expect(page.getByText(title, { exact: true })).toHaveCount(0);
  await page.locator("button.account").click();
  await page.getByRole("button", { name: "Uitloggen", exact: false }).click();
  await expect(
    page.getByLabel("Gebruikersnaam", { exact: true }),
  ).toBeVisible();
  await login(page);
  await synced(page);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("switching account updates other tabs without mixing private data", async ({
  page,
  context,
}) => {
  const privateText = "Alex-tabcontrole " + crypto.randomUUID();
  await login(page);
  await quick(page, privateText);
  await synced(page);
  const other = await context.newPage();
  await other.goto("/");
  await expect(
    other.getByRole("heading", { name: "Inbox.", exact: true }),
  ).toBeVisible();
  await other.locator("button.account").click();
  await other
    .getByRole("button", { name: "Opnieuw inloggen", exact: false })
    .click();
  await other
    .getByLabel("Gebruikersnaam", { exact: true })
    .fill("other@example.test");
  await other
    .getByLabel("Wachtwoord", { exact: true })
    .fill("test-password-e2e");
  await other.getByRole("button", { name: "Open mijn geheugen" }).click();
  await synced(other);
  await expect(page.locator("button.account")).toContainText(
    "other@example.test",
  );
  await expect(page.getByText(privateText, { exact: true })).toHaveCount(0);
  await expect(other.getByText(privateText, { exact: true })).toHaveCount(0);
  const otherText = "Ander-tabcontrole " + crypto.randomUUID();
  await quick(other, otherText);
  await synced(other);
  await expect(page.getByText(otherText, { exact: true })).toBeVisible();
  await other.close();
});

test("push permission is requested directly from the tap before waiting for server config", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      value: "default",
    });
    Object.defineProperty(Notification, "requestPermission", {
      configurable: true,
      value: () => {
        document.documentElement.dataset.pushPermission = navigator
          .userActivation.isActive
          ? "active"
          : "expired";
        return Promise.resolve("granted");
      },
    });
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/push/config", async (route) => {
    await gate;
    await route.fulfill({ json: { publicKey: null } });
  });
  await page.locator(".account").click();
  await page
    .getByRole("button", { name: /Herinneringsmeldingen inschakelen/ })
    .click();
  try {
    await expect(page.locator("html")).toHaveAttribute(
      "data-push-permission",
      "active",
    );
  } finally {
    release();
  }
  await expect(
    page.getByText("De serverplanner wordt geactiveerd bij HTTPS-hosting.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("blocked push permission explains how to enable notifications without another prompt", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(() => {
    Object.defineProperty(Notification, "permission", {
      configurable: true,
      value: "denied",
    });
    Object.defineProperty(Notification, "requestPermission", {
      configurable: true,
      value: () => {
        document.documentElement.dataset.unexpectedPushPrompt = "true";
        return Promise.resolve("denied");
      },
    });
  });
  await page.locator(".account").click();
  await page
    .getByRole("button", { name: /Herinneringsmeldingen inschakelen/ })
    .click();
  await expect(
    page.getByText(
      "Meldingen zijn geblokkeerd. Zet ze aan in de instellingen van je iPhone of browser voor My Memory en probeer opnieuw.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.locator("html")).not.toHaveAttribute(
    "data-unexpected-push-prompt",
  );
});

test("folders, editable tables and PDF attachments work; import undo is scoped", async ({
  page,
}) => {
  await login(page);
  page.once("dialog", (d) => d.accept("Reizen"));
  await page
    .getByRole("button", { name: "Map toevoegen", exact: true })
    .click();
  await page
    .locator(".folder-nav")
    .getByRole("button", { name: /^Reizen/ })
    .click();
  await createNote(page, "Bewerkbare tabel");
  await expect(page.getByLabel("Map van notitie")).not.toHaveValue("");
  const editor = page.getByRole("textbox", { name: "Inhoud van punt" }).first();
  await editor.click();
  await page
    .getByRole("button", { name: "Tabel toevoegen", exact: true })
    .click();
  await expect(editor.locator("table")).toBeVisible();
  await editor.locator("td p").first().fill("Zelf ingevuld");
  await page
    .getByRole("button", { name: "Tabelrij toevoegen", exact: true })
    .click();
  await expect(editor.locator("tr")).toHaveCount(4);
  await page.getByLabel("Afbeelding aan notitie toevoegen").setInputFiles({
    name: "voorbeeld.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
  });
  await expect(page.getByRole("link", { name: /voorbeeld.pdf/ })).toBeVisible();
  await synced(page);
  const data = await page.evaluate(async () => {
    const f = {
      id: crypto.randomUUID(),
      version: 0,
      updatedAt: new Date().toISOString(),
      deleted: false,
      type: "folder",
      name: "Importmap",
      parentId: null,
      tags: [],
    };
    const n = {
      ...f,
      id: crypto.randomUUID(),
      type: "note",
      title: "Import-test",
      folderId: f.id,
      reusable: false,
      view: "document",
    };
    delete (n as any).parentId;
    delete (n as any).name;
    const id = crypto.randomUUID();
    const res = await fetch("/api/imports", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Memory-Account": "owner",
      },
      body: JSON.stringify({
        id,
        label: "Testimport",
        source: "apple-notes",
        entities: [f, n],
        warnings: [],
      }),
    });
    return { status: res.status, id };
  });
  expect(data.status).toBe(201);
  await page
    .getByRole("button", { name: /Gesynchroniseerd/, exact: true })
    .click();
  await expect(
    page.locator(".folder-nav").getByRole("button", { name: /^Importmap/ }),
  ).toBeVisible();
  await page.locator(".account").click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Import terugdraaien", exact: true })
    .click();
  await expect(page.getByText(/Teruggedraaid op/)).toBeVisible();
  await page.getByRole("button", { name: "Sluiten", exact: true }).click();
  await expect(
    page.locator(".folder-nav").getByRole("button", { name: /^Importmap/ }),
  ).toHaveCount(0);
  await expect(
    page.locator(".folder-nav").getByRole("button", { name: /^Reizen/ }),
  ).toBeVisible();
});

test("mobile settings close without leaving a scrim or tinting the status area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await login(page);
  // Model the standalone safe area separately from Chromium's zero inset.
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--safe-area-top", "59px"),
  );
  const statusArea = async () =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body, "::before");
      return {
        background: style.backgroundColor,
        height: style.height,
        pointerEvents: style.pointerEvents,
      };
    });
  await expect.poll(statusArea).toEqual({
    background: "rgb(247, 247, 243)",
    height: "59px",
    pointerEvents: "none",
  });
  for (const closeWithBackdrop of [false, true]) {
    await page.getByRole("button", { name: "Navigatie openen" }).click();
    await expect(page.locator(".sidebar.open")).toHaveCount(1);
    await page.locator(".account").click();
    await expect(
      page.getByRole("dialog", { name: "Instellingen" }),
    ).toBeVisible();
    await expect(page.locator(".sidebar-scrim")).toHaveCount(0);
    await expect.poll(statusArea).toEqual({
      background: "rgb(247, 247, 243)",
      height: "59px",
      pointerEvents: "none",
    });
    if (closeWithBackdrop)
      await page.locator(".modal-backdrop").click({ position: { x: 3, y: 3 } });
    else
      await page.getByRole("button", { name: "Sluiten", exact: true }).click();
    await expect(
      page.locator(".modal-backdrop, .sidebar-scrim, .sidebar.open"),
    ).toHaveCount(0);
    await expect.poll(statusArea).toEqual({
      background: "rgb(247, 247, 243)",
      height: "59px",
      pointerEvents: "none",
    });
    expect(
      await page
        .locator(".topbar")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBe(59);
  }
  await page.getByRole("button", { name: "Navigatie openen" }).click();
  await page.locator(".sidebar-scrim").click({ position: { x: 350, y: 10 } });
  await expect(page.locator(".sidebar-scrim, .sidebar.open")).toHaveCount(0);
});

test("dragging makes room before drop, persists offline and supports keyboard cancellation", async ({
  page,
  context,
}) => {
  await login(page);
  await createNote(page, "Sorteer mijn paklijst", true);
  await quick(page, "Alpha");
  await quick(
    page,
    "Beta met meerdere woorden zodat deze regel een andere hoogte heeft",
  );
  await quick(page, "Gamma");
  await synced(page);
  const row = (name: string) =>
    page.locator(".sortable-point").filter({
      has: page
        .getByRole("textbox", { name: "Inhoud van punt" })
        .filter({ hasText: name }),
    });
  const alpha = row("Alpha"),
    beta = row("Beta"),
    gamma = row("Gamma");
  const handle = alpha.getByRole("button", { name: "Punt verplaatsen" });
  await gamma.scrollIntoViewIfNeeded();
  await handle.hover();
  const start = (await handle.boundingBox())!;
  const end = (await gamma.boundingBox())!;
  const betaBefore = (await beta.boundingBox())!.y;
  await context.setOffline(true);
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2);
  await page.mouse.down();
  await page.mouse.move(start.x + start.width / 2, end.y + end.height / 2, {
    steps: 15,
  });
  await expect(page.locator(".drag-preview")).toContainText("Alpha");
  await expect
    .poll(async () => (await beta.boundingBox())!.y)
    .toBeLessThan(betaBefore - 20);
  await expect(page.locator(".drag-preview")).toBeVisible();
  await expect
    .poll(async () => {
      const preview = (await page.locator(".drag-preview").boundingBox())!;
      return Math.abs(
        preview.y + preview.height / 2 - (end.y + end.height / 2),
      );
    })
    .toBeLessThan(60);
  await page.screenshot({ path: test.info().outputPath("drag-preview.png") });
  await page.mouse.up();
  const order = () =>
    page
      .getByRole("textbox", { name: "Inhoud van punt" })
      .allTextContents()
      .then((items) => items.map((x) => x.trim()).filter(Boolean));
  const sorted = [
    "Beta met meerdere woorden zodat deze regel een andere hoogte heeft",
    "Gamma",
    "Alpha",
  ];
  await expect.poll(order).toEqual(sorted);
  await page.reload();
  await page
    .getByRole("button", { name: "Sorteer mijn paklijst", exact: true })
    .click();
  await expect.poll(order).toEqual(sorted);
  await context.setOffline(false);
  await synced(page);
  await row("Alpha").getByRole("button", { name: "Punt verplaatsen" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".sortable-point.is-dragging")).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () =>
      row("Gamma").evaluate(
        (el) => new DOMMatrix(getComputedStyle(el).transform).m42,
      ),
    )
    .toBeGreaterThan(20);
  await expect(page.locator(".drag-preview")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".drag-preview")).toHaveCount(0);
  await expect.poll(order).toEqual(sorted);
  await expect
    .poll(() =>
      row("Gamma").evaluate(
        (el) => new DOMMatrix(getComputedStyle(el).transform).m42,
      ),
    )
    .toBe(0);
  await row("Alpha").getByRole("button", { name: "Punt verplaatsen" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".sortable-point.is-dragging")).toHaveCount(1);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await page.keyboard.press("ArrowUp");
  await expect
    .poll(async () =>
      row("Gamma").evaluate(
        (el) => new DOMMatrix(getComputedStyle(el).transform).m42,
      ),
    )
    .toBeGreaterThan(20);
  await expect(
    page.getByText("Nieuwe plek: 3 van 4.", { exact: true }),
  ).toHaveCount(1);
  await page.keyboard.press("Space");
  await expect.poll(order).toEqual([sorted[0], "Alpha", "Gamma"]);
  await synced(page);
  await page.reload();
  await page
    .getByRole("button", { name: "Sorteer mijn paklijst", exact: true })
    .click();
  await expect.poll(order).toEqual([sorted[0], "Alpha", "Gamma"]);
});

test("mobile touch handle reorders while the other points make room", async ({
  page,
  context,
}) => {
  await login(page);
  await createNote(page, "Touch paklijst", true);
  await quick(page, "Touch Alpha");
  await quick(page, "Touch Beta");
  await quick(page, "Touch Gamma");
  await synced(page);
  await page.setViewportSize({ width: 393, height: 852 });
  await expect
    .poll(() =>
      page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    )
    .toBeLessThanOrEqual(0);
  const row = (name: string) =>
    page.locator(".sortable-point").filter({
      has: page
        .getByRole("textbox", { name: "Inhoud van punt" })
        .filter({ hasText: name }),
    });
  const handle = row("Touch Gamma").getByRole("button", {
    name: "Punt verplaatsen",
  });
  await handle.scrollIntoViewIfNeeded();
  await expect(handle).toBeVisible();
  const start = (await handle.boundingBox())!,
    target = (await row("Touch Alpha").boundingBox())!;
  const betaBefore = (await row("Touch Beta").boundingBox())!.y;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", {
    enabled: true,
    maxTouchPoints: 1,
  });
  const x = start.x + start.width / 2,
    y = start.y + start.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let step = 1; step <= 12; step++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x, y: y + ((target.y + target.height / 2 - y) * step) / 12 },
      ],
    });
  await expect(page.locator(".drag-preview")).toContainText("Touch Gamma");
  await expect
    .poll(async () => (await row("Touch Beta").boundingBox())!.y)
    .toBeGreaterThan(betaBefore + 20);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  const order = () =>
    page
      .getByRole("textbox", { name: "Inhoud van punt" })
      .allTextContents()
      .then((items) => items.map((x) => x.trim()).filter(Boolean));
  await expect
    .poll(order)
    .toEqual(["Touch Gamma", "Touch Alpha", "Touch Beta"]);
  await synced(page);
});

test("document paragraphs, native lists and mixed reusable checklists can be authored and retained", async ({
  page,
}, testInfo) => {
  const title = `Doorlopende tekstpagina ${testInfo.repeatEachIndex}`;
  await login(page);
  // Exercise edits while earlier writes are being acknowledged, as on the VPS.
  await page.route("**/api/sync", async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 80));
    await route.fulfill({ response });
  });
  await createNote(page, title, false, true);
  const editor = page.getByRole("textbox", { name: "Inhoud van punt" }).first();
  await editor.fill("Eerste alinea.");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Tweede alinea.");
  await expect(page.locator(".block-row")).toHaveCount(1);
  await expect(editor.locator("p")).toHaveCount(2);
  await page.getByRole("button", { name: "Subkopopmaak", exact: true }).click();
  await expect(editor.locator("h2")).toHaveText("Tweede alinea.");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Een gewoon lijstpunt");
  await page.getByRole("button", { name: "Opsomming", exact: true }).click();
  await expect(editor.locator("ul li")).toHaveText("Een gewoon lijstpunt");
  await editor.press("End");
  await editor.press("Enter");
  await editor.pressSequentially("Nog een gewoon lijstpunt");
  await expect(editor.locator("ul li")).toHaveCount(2);
  await editor.press("End");
  await editor.press("Enter");
  await editor.press("Enter");
  await editor.pressSequentially("Camera meenemen");
  await page.getByRole("button", { name: "Afvinklijst", exact: true }).click();
  const task = page
    .locator(".kind-task")
    .filter({ hasText: "Camera meenemen" });
  await expect(task).toBeVisible();
  await task
    .getByRole("button", { name: "Punt afvinken", exact: true })
    .click();
  await expect(task).toHaveClass(/is-done/);
  await page
    .getByRole("button", { name: "Opnieuw gebruiken", exact: true })
    .click();
  await expect(task).not.toHaveClass(/is-done/);
  await synced(page);
  await page.reload();
  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.locator(".prose-document .ProseMirror h2")).toHaveText(
    "Tweede alinea.",
  );
  await expect(page.locator(".prose-document .ProseMirror ul li")).toHaveCount(
    2,
  );
  await expect(
    page.locator(".kind-task").filter({ hasText: "Camera meenemen" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Herinneringen/ })
    .first()
    .click();
  await expect(
    page.locator(".kind-task").filter({ hasText: "Camera meenemen" }),
  ).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});

test("all folder notes are reachable, and only explicitly scheduled points are reminders", async ({
  page,
}) => {
  await login(page);
  const label = "Fotografie documentmappen";
  page.once("dialog", (d) => d.accept(label));
  await page
    .getByRole("button", { name: "Map toevoegen", exact: true })
    .click();
  const folder = page
    .locator(".folder-nav")
    .getByRole("button", { name: new RegExp("^" + label) });
  await folder.click();
  await createNote(page, "Zeer vindbare BIO", true, true);
  await quick(page, "Checklist zonder datum");
  const row = page
    .locator(".kind-task")
    .filter({ hasText: "Checklist zonder datum" });
  await row
    .getByRole("button", { name: "Opties voor punt", exact: true })
    .click();
  await row.getByLabel("Datum en tijd van punt").fill("2027-01-01T10:00");
  await row
    .getByRole("button", { name: "Opties sluiten", exact: true })
    .click();
  await quick(page, "Tweede ongeplande checklist");
  await synced(page);
  await expect(
    page
      .locator(".folder-children")
      .getByRole("button", { name: "Zeer vindbare BIO", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Herinneringen/ })
    .first()
    .click();
  await expect(
    page.locator(".kind-task").filter({ hasText: "Checklist zonder datum" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".kind-task")
      .filter({ hasText: "Tweede ongeplande checklist" }),
  ).toHaveCount(0);
});
