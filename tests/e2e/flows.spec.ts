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
async function createNote(page: Page, title: string, reusable = false) {
  await page
    .getByRole("button", { name: "Nieuwe notitie", exact: true })
    .first()
    .click();
  await page.getByLabel("Titel van nieuwe notitie").fill(title);
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
