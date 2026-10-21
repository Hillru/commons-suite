import { test, expect } from "@playwright/test";
import { Document, Packer, Paragraph } from "docx";
async function login(page: any) {
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-password-only-12345");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for good work." }),
  ).toBeVisible();
}
async function create(page: any, type: string, title: string) {
  await page
    .locator(".quick-create")
    .getByRole("button", { name: new RegExp(type) })
    .filter({ has: page.locator("strong") })
    .click();
  await page.getByLabel("Name", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
}
test("create, edit, save, reopen, and export a spreadsheet", async ({
  page,
}) => {
  await login(page);
  await create(page, "Spreadsheet", "Launch budget");
  await expect(page.getByLabel("A1", { exact: true })).toBeEditable();
  await page.getByLabel("A1", { exact: true }).fill("12");
  await page.getByLabel("A2", { exact: true }).fill("13");
  await page.getByLabel("B1", { exact: true }).fill("=SUM(A1:A2)");
  await page.getByLabel("B1", { exact: true }).blur();
  await expect(page.getByLabel("B1", { exact: true })).toHaveValue("25");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.getByRole("button", { name: /Launch budget/ }).click();
  await expect(page.getByLabel("B1", { exact: true })).toHaveValue("25");
  const download = page.waitForEvent("download");
  await page.getByLabel("Export format").selectOption("xlsx");
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});
test("document edits synchronize across two sessions and reopen", async ({
  browser,
  page,
}) => {
  await login(page);
  await create(page, "Document", "Shared ideas");
  const editor = page.getByRole("textbox", { name: "Document content" });
  await expect(editor).toBeVisible();
  await editor.fill("A shared beginning");
  const other = await browser.newContext();
  const second = await other.newPage();
  await login(second);
  await second.getByRole("button", { name: /Shared ideas/ }).click();
  await expect(
    second.getByRole("textbox", { name: "Document content" }),
  ).toContainText("A shared beginning");
  await second.getByRole("textbox", { name: "Document content" }).press("End");
  await second
    .getByRole("textbox", { name: "Document content" })
    .pressSequentially(" together");
  await expect(editor).toContainText("together");
  await page.getByRole("button", { name: "Save export snapshot" }).click();
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.getByRole("button", { name: /Shared ideas/ }).click();
  await expect(
    page.getByRole("textbox", { name: "Document content" }),
  ).toContainText("together");
  await other.close();
});
test("presentation editing and responsive workspace", async ({ page }) => {
  await login(page);
  await create(page, "Presentation", "A better way to work");
  await expect(page.getByLabel("Slide title")).toBeEditable();
  await page.getByLabel("Slide title").fill("Meet Commons");
  await page.getByLabel("Slide body").fill("An open workspace for everyone.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Present", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit slideshow" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Exit slideshow" }).click();
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Create new" })).toBeVisible();
  if (process.env.CAPTURE_PREVIEWS) {
    await page.screenshot({ path: "docs/preview-mobile.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: "docs/preview-workspace.png",
      fullPage: true,
    });
  }
});
test("DOCX import seeds live editing and original bytes are retained", async ({
  page,
}) => {
  await login(page);
  const bytes = await Packer.toBuffer(
    new Document({
      sections: [
        {
          children: [new Paragraph("Imported content survives collaboration")],
        },
      ],
    }),
  );
  const result = await page.request.post("/api/import", {
    headers: { origin: "http://localhost:3100" },
    data: { name: "Imported brief.docx", data: bytes.toString("base64") },
  });
  expect(result.status()).toBe(201);
  const payload = await result.json();
  expect(
    (
      await page.request.get("/api/files/" + payload.file.id + "/original")
    ).status(),
  ).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: /Imported brief/ }).click();
  await expect(page.locator(".tiptap")).toContainText(
    "Imported content survives collaboration",
  );
});
test("viewer cannot edit and live access is revoked when sharing is removed", async ({
  page,
  browser,
}) => {
  await login(page);
  await create(page, "Document", "Permission boundary");
  await page.locator(".tiptap").fill("Team-only content");
  const file = (await (await page.request.get("/api/files")).json()).find(
    (f: any) => f.title === "Permission boundary",
  );
  const member = await page.request.post("/api/users", {
    headers: { origin: "http://localhost:3100" },
    data: { email: "reader@example.com", password: "reader-password-12345" },
  });
  expect(member.status()).toBe(201);
  const reader = await member.json();
  const grant = await page.request.put(
    "/api/files/" + file.id + "/permissions",
    {
      headers: { origin: "http://localhost:3100" },
      data: { userId: reader.id, role: "viewer" },
    },
  );
  expect(grant.status()).toBe(200);
  const context = await browser.newContext(),
    second = await context.newPage();
  await second.goto("/");
  await second.getByLabel("Email", { exact: true }).fill("reader@example.com");
  await second
    .getByLabel("Password", { exact: true })
    .fill("reader-password-12345");
  await second.getByRole("button", { name: "Enter workspace" }).click();
  await second.getByRole("button", { name: /Permission boundary/ }).click();
  await expect(second.locator(".tiptap")).toContainText("Team-only content");
  await expect(second.locator(".tiptap")).toHaveAttribute(
    "contenteditable",
    "false",
  );
  expect(
    (
      await second.request.put("/api/files/" + file.id, {
        headers: { origin: "http://localhost:3100" },
        data: { revision: 1, content: { html: "Unauthorized" } },
      })
    ).status(),
  ).toBe(404);
  await page.request.put("/api/files/" + file.id + "/permissions", {
    headers: { origin: "http://localhost:3100" },
    data: { userId: reader.id, role: null },
  });
  expect(
    (
      await second.request.get("/api/files/" + file.id + "/export/docx")
    ).status(),
  ).toBe(404);
  await second.reload();
  await expect(
    second.getByRole("button", { name: /Permission boundary/ }),
  ).toHaveCount(0);
  await context.close();
});
