import { test, expect, type Page } from "@playwright/test";

/** A Match File where `shooter` plays GS for `ourSide` and scores `goals`. */
function matchFile(id: string, date: string, ourSide: "A" | "B", shooter: string, goals: number) {
  const [teamAName, teamBName] = ourSide === "A" ? ["Hornets", "Riverside"] : ["Lakeside", "hornets"];
  const log = [
    { kind: "Substitution", team: ourSide, position: "GS", player: shooter, timestampMs: 0 },
    ...Array.from({ length: goals }, (_, i) => ({
      kind: "Event",
      team: ourSide,
      action: { type: "Goal", position: "GS", failed: false },
      flagged: false,
      timestampMs: 1_000 * (i + 1),
    })),
  ];
  return {
    name: `${id}.centrepass.json`,
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 3, id, teamAName, teamBName, date, log })),
  };
}

async function importMatch(page: Page, file: ReturnType<typeof matchFile>) {
  await page.getByTestId("import-match").setInputFiles(file);
  await expect(page.getByTestId(`match-item-${file.name.split(".")[0]}`)).toBeVisible();
}

test("a collection sums a misspelled player across matches once merged", async ({ page }) => {
  await page.goto("/centrepass/");
  // The same team in different A/B slots and capitalization; "Ali" is a typo.
  await importMatch(page, matchFile("m1", "2026-09-01", "A", "Alice", 1));
  await importMatch(page, matchFile("m2", "2026-09-08", "B", "Ali", 2));

  await page.getByTestId("new-collection-name").fill("Autumn 2026");
  await page.getByTestId("create-collection").click();
  await expect(page.getByRole("link", { name: "Autumn 2026" })).toBeVisible();

  // Add one match from the match list…
  await page.getByTestId("collections-m1").click();
  await page.getByLabel("Autumn 2026").click();
  await expect(page.getByLabel("Autumn 2026")).toBeChecked();

  // …and the other from the collection screen, which persists across reloads.
  await page.getByRole("link", { name: "Autumn 2026" }).click();
  await page.getByText("Name and matches").click();
  await page.getByTestId("pick-match-m2").click();
  await expect(page.getByTestId("pick-match-m2")).toBeChecked();
  await page.reload();
  await expect(page.getByText("2 matches", { exact: true })).toBeVisible();

  // Our team is bucketed across both slots, largest first and open.
  const ours = page.getByTestId("team-bucket-0");
  await expect(ours).toHaveAttribute("open");
  await expect(ours.locator("summary")).toHaveText("Hornets — 2 matches");
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("1/1 (100%)");
  await expect(page.getByTestId("stat-Ali-goals")).toHaveText("2/2 (100%)");

  // Merge the typo into the real name: one combined line.
  await page.getByTestId("player-name-Ali").click();
  await page.getByTestId("merge-into-Alice").click();
  await expect(page.getByTestId("player-row-Ali")).toHaveCount(0);
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("3/3 (100%)");
  await expect(page.getByTestId("stat-Alice-games")).toHaveText("2");
  await page.reload();
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("3/3 (100%)");

  // Exporting sends every member match's file in one action.
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));
  await page.getByTestId("export-collection").click();
  await expect.poll(() => downloads.length).toBe(2);

  // A deleted match simply drops out of the collection's stats.
  await page.goto("/centrepass/");
  await page.getByTestId("delete-m2").click();
  await page.getByTestId("confirm-delete-m2").click();
  await page.getByRole("link", { name: "Autumn 2026" }).click();
  await expect(page.getByText("1 match", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stat-Alice-goals")).toHaveText("1/1 (100%)");

  // Rename, then delete the collection.
  await page.getByText("Name and matches").click();
  await page.getByTestId("collection-name").fill("Season 2026");
  await page.getByTestId("rename-collection").click();
  await expect(page.getByRole("heading", { name: "Season 2026" })).toBeVisible();
  await page.getByTestId("delete-collection").click();
  await page.getByTestId("confirm-delete-collection").click();
  await expect(page.getByRole("link", { name: "Season 2026" })).toHaveCount(0);
});

test("the roster screen asks for consistent name spelling", async ({ page }) => {
  await page.goto("/centrepass/");
  await page.getByLabel("Your team").fill("Hornets");
  await page.getByLabel("Opposition").fill("Riverside");
  await page.getByRole("button", { name: "Create match" }).click();
  await expect(page.getByTestId("naming-notice")).toContainText("same way every match");
});
