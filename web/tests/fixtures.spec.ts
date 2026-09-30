import { test, expect } from "@playwright/test";

function csv(name: string, text: string) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(text) };
}

const SCHEDULE = "date,team,opposition,venue\n14/09/2026,Hornets,Riverside,Court 1\n21/09/2026,Hornets,Lakeside,Away\n";

test("a fixture CSV lands in a Collection and re-imports without duplicates", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByTestId("import-fixtures").setInputFiles(csv("Autumn 2026.csv", SCHEDULE));
  // No Collections yet: a new one, named after the file.
  await expect(page.getByTestId("fixtures-new-name")).toHaveValue("Autumn 2026");
  await page.getByTestId("confirm-fixtures").click();
  await expect(page.getByTestId("fixtures-message")).toHaveText("Added 2 fixtures to Autumn 2026");
  await expect(page.getByTestId("upcoming-list").locator("li")).toHaveCount(2);
  await expect(page.getByTestId(/^not-sent-/)).toHaveCount(0);

  // The league adds a game: re-import the updated schedule into the same Collection.
  await page
    .getByTestId("import-fixtures")
    .setInputFiles(csv("Autumn 2026.csv", SCHEDULE + "28/09/2026,hornets ,Oakfield,Home\n"));
  await expect(page.getByTestId("fixtures-collection")).toHaveValue(/.+/);
  await page.getByTestId("confirm-fixtures").click();
  await expect(page.getByTestId("fixtures-message")).toHaveText(
    "Added 1 fixture to Autumn 2026 · Skipped 2 already there",
  );
  await page.getByRole("link", { name: "Autumn 2026" }).click();
  await expect(page.getByText("3 matches", { exact: true })).toBeVisible();
});

test("a bad row imports nothing and names the row", async ({ page }) => {
  await page.goto("/centrepass/");
  await page
    .getByTestId("import-fixtures")
    .setInputFiles(csv("bad.csv", "date,team,opposition\n14/09/2026,Hornets,Riverside\n09/14/2026,Hornets,Lakeside\n"));
  await expect(page.getByTestId("fixtures-message")).toContainText("Row 3");
  await expect(page.getByTestId("fixtures-target")).toHaveCount(0);
  await expect(page.getByText("No matches yet.")).toBeVisible();
});
