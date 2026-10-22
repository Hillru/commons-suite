import { test, expect } from "@playwright/test";

test("WebKit local workspace: login, live document, save sheet/slides, and export", async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto("/");
  await page.getByLabel("Email", { exact: true }).fill("owner@example.com");
  await page
    .getByLabel("Password", { exact: true })
    .fill("test-password-only-12345");
  await page.getByRole("button", { name: "Enter workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Make room for good work." }),
  ).toBeVisible();
  async function create(type: string, title: string) {
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
  await create("Document", "WebKit document");
  const editor = page.getByRole("textbox", { name: "Document content" });
  await editor.fill("Written in WebKit");
  await page.getByRole("button", { name: "Save export snapshot" }).click();
  const docx = page.waitForEvent("download");
  await page.getByLabel("Export format").selectOption("docx");
  expect((await docx).suggestedFilename()).toMatch(/\.docx$/);
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.getByRole("button", { name: /WebKit document/ }).click();
  await expect(editor).toContainText("Written in WebKit");
  await page.getByRole("button", { name: "Back to files" }).click();
  await create("Spreadsheet", "WebKit sheet");
  await page.getByLabel("A1", { exact: true }).fill("12");
  await page.getByLabel("B1", { exact: true }).fill("=A1*2");
  await page.getByLabel("B1", { exact: true }).blur();
  await expect(page.getByLabel("B1", { exact: true })).toHaveValue("24");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const xlsx = page.waitForEvent("download");
  await page.getByLabel("Export format").selectOption("xlsx");
  expect((await xlsx).suggestedFilename()).toMatch(/\.xlsx$/);
  await page.getByRole("button", { name: "Back to files" }).click();
  await create("Presentation", "WebKit presentation");
  await page.getByLabel("Slide title").fill("A Mac workspace");
  await page.getByLabel("Slide body").fill("Saved in WebKit");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  const pptx = page.waitForEvent("download");
  await page.getByLabel("Export format").selectOption("pptx");
  expect((await pptx).suggestedFilename()).toMatch(/\.pptx$/);
  await page.getByRole("button", { name: "Back to files" }).click();
  await page.getByRole("button", { name: /WebKit presentation/ }).click();
  await expect(page.getByLabel("Slide title")).toHaveValue("A Mac workspace");
});
