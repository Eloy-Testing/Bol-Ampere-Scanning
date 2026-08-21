import { test, expect } from "@playwright/test";

const ROUTE = "/operations-dashboard/piktafel-terminal/index.html";
const SPANISH_ROUTE = "/operations-dashboard/piktafel-terminal-es/index.html";
const FIXED_EPOCH = Date.parse("2026-08-21T12:00:00.000Z");

async function setInitialClock(page, epoch = FIXED_EPOCH) {
  await page.addInitScript((value) => {
    window.__BHP_FIXED_EPOCH__ = value;
  }, epoch);
}

async function enterOperator(page, locale, name) {
  const fieldName = locale === "es" ? "Nombre del operador" : "Operatornaam";
  const actionName = locale === "es" ? "Abrir terminal" : "Terminal openen";
  await page.getByLabel(fieldName).fill(name);
  await page.getByRole("button", { name: actionName }).click();
  await expect(page.locator("body")).toHaveAttribute("data-operator-ready", "true");
  await expect(page.locator(".terminal-shell")).toBeVisible();
}

test.describe("BHP piktafel operator entry", () => {
  test.beforeEach(async ({ page }) => {
    await setInitialClock(page);
  });

  test("opens the Dutch terminal with a normalized operator name", async ({ page }) => {
    await page.goto(ROUTE);

    await expect(page.getByRole("heading", { name: "Klaar voor je dienst" })).toBeVisible();
    await expect(page.locator(".terminal-shell")).toBeHidden();
    await expect(page.getByLabel("Operatornaam")).toBeFocused();

    await enterOperator(page, "nl", "  Mila   de Boer  ");
    await expect(page.locator("#operatorEntry")).toBeHidden();
    await expect(page.locator(".picker-name")).toHaveText("Mila de Boer");
    expect(await page.evaluate(() => sessionStorage.getItem("bhp.piktafel.operator.nl"))).toBe("Mila de Boer");
  });

  test("restores the Dutch operator and terminal on refresh in the same tab", async ({ page }) => {
    await page.goto(ROUTE);
    await enterOperator(page, "nl", "Mila de Boer");
    await page.reload();

    await expect(page.locator("body")).toHaveAttribute("data-operator-ready", "true");
    await expect(page.locator("#operatorEntry")).toBeHidden();
    await expect(page.locator(".terminal-shell")).toBeVisible();
    await expect(page.locator(".picker-name")).toHaveText("Mila de Boer");
  });

  test("localizes the same-page entry flow in Spanish", async ({ page }) => {
    await page.goto(SPANISH_ROUTE);

    await expect(page.getByRole("heading", { name: "Listo para tu turno" })).toBeVisible();
    await expect(page.locator(".operator-entry__station")).toHaveText("Mesa 02 · Ubicación E");
    await expect(page.getByLabel("Nombre del operador")).toBeFocused();

    await enterOperator(page, "es", "Lucía Torres");
    await expect(page.locator(".picker-name")).toHaveText("Lucía Torres");
    expect(await page.evaluate(() => sessionStorage.getItem("bhp.piktafel.operator.es"))).toBe("Lucía Torres");
  });

  test("contains the entry panel at mobile width without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(ROUTE);

    const geometry = await page.evaluate(() => {
      const panel = document.querySelector(".operator-entry__panel").getBoundingClientRect();
      const field = document.getElementById("operatorName").getBoundingClientRect();
      const action = document.querySelector(".operator-entry__form button").getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        panelLeft: panel.left,
        panelRight: panel.right,
        fieldLeft: field.left,
        fieldRight: field.right,
        actionLeft: action.left,
        actionRight: action.right
      };
    });

    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.panelLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.panelRight).toBeLessThanOrEqual(390);
    expect(geometry.fieldLeft).toBeGreaterThanOrEqual(geometry.panelLeft);
    expect(geometry.fieldRight).toBeLessThanOrEqual(geometry.panelRight);
    expect(geometry.actionLeft).toBeGreaterThanOrEqual(geometry.panelLeft);
    expect(geometry.actionRight).toBeLessThanOrEqual(geometry.panelRight);
  });
});

test.describe("BHP piktafel terminal", () => {
  test.beforeEach(async ({ page }) => {
    await setInitialClock(page);
    await page.goto(ROUTE);
    await enterOperator(page, "nl", "Petrus van Rijn");
  });

  test("is a dedicated production-shaped single-screen terminal", async ({ page }) => {
    await expect(page).toHaveTitle("BHP Piktafel Terminal");
    await expect(page.locator(".station-type")).toContainText("Piktafel");
    await expect(page.getByText("Nog te picken", { exact: true })).toBeVisible();
    await expect(page.getByText("Door jou gepickt", { exact: true })).toBeVisible();
    await expect(page.getByText("Verwachting 22:00", { exact: true })).toBeVisible();

    const visibleText = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "mock",
      "sample",
      "demo",
      "prototype",
      "preview",
      "staging",
      "overzicht",
      "warehouse flow",
      "ledger",
      "retouren",
      "portfolio"
    ]) {
      expect(visibleText).not.toContain(forbidden);
    }
  });

  test("uses the official BHP logo asset", async ({ page }) => {
    const logo = page.locator(".brand-logo");
    await expect(logo).toBeVisible();
    await expect(logo).toHaveAttribute(
      "src",
      "/operations-dashboard/assets/brand/bhp-logo-horizontal.png",
    );
    expect(await logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBe(true);
  });

  test("keeps the same day and sequence coherent across refresh", async ({ page }) => {
    const stateBefore = await page.evaluate(() => ({
      day: document.documentElement.dataset.operationDay,
      sequence: document.documentElement.dataset.operationSequence,
      values: [
        document.getElementById("paceValue").textContent,
        document.getElementById("remainingOrders").textContent,
        document.getElementById("personalPicked").textContent,
        document.getElementById("forecastOrders").textContent
      ]
    }));

    await page.reload();

    const stateAfter = await page.evaluate(() => ({
      day: document.documentElement.dataset.operationDay,
      sequence: document.documentElement.dataset.operationSequence,
      values: [
        document.getElementById("paceValue").textContent,
        document.getElementById("remainingOrders").textContent,
        document.getElementById("personalPicked").textContent,
        document.getElementById("forecastOrders").textContent
      ]
    }));

    expect(stateAfter).toEqual(stateBefore);
  });

  test("advances on the background sequence and starts a new next-day state", async ({ page }) => {
    const first = await page.evaluate(() => ({
      day: document.documentElement.dataset.operationDay,
      sequence: Number(document.documentElement.dataset.operationSequence)
    }));

    await page.evaluate((value) => {
      window.__BHP_FIXED_EPOCH__ = value;
    }, FIXED_EPOCH + 6_000);
    await expect.poll(() => page.evaluate(() => Number(document.documentElement.dataset.operationSequence))).toBe(first.sequence + 1);

    await page.evaluate((value) => {
      window.__BHP_FIXED_EPOCH__ = value;
    }, FIXED_EPOCH + 24 * 60 * 60 * 1000);
    await expect.poll(() => page.evaluate(() => document.documentElement.dataset.operationDay)).not.toBe(first.day);
  });

  test("switches all three terminal views and announces the selected mode", async ({ page }) => {
    const calm = page.getByRole("button", { name: "Optie 1 · Rustig" });
    const numbers = page.getByRole("button", { name: "Optie 2 · Cijfers" });
    const dual = page.getByRole("button", { name: "Optie 3 · Twee meters" });

    await expect(calm).toHaveAttribute("aria-pressed", "true");
    await numbers.focus();
    await page.keyboard.press("Enter");
    await expect(numbers).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).toHaveAttribute("data-view", "numbers");
    await expect(page.locator("#viewAnnouncement")).toHaveText("Weergave Cijfers actief.");

    await dual.focus();
    await page.keyboard.press("Space");
    await expect(dual).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("body")).toHaveAttribute("data-view", "dual");
    await expect(page.locator("#viewAnnouncement")).toHaveText("Weergave Twee meters actief.");
  });

  test("fits the 1920 by 1080 reference viewport without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.reload();

    const geometry = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      canvasWidth: document.getElementById("paceGauge").getBoundingClientRect().width,
      mainColumns: getComputedStyle(document.querySelector(".terminal-main")).gridTemplateColumns
    }));

    expect(geometry.width).toBe(geometry.viewportWidth);
    expect(geometry.height).toBe(geometry.viewportHeight);
    expect(geometry.canvasWidth).toBeGreaterThan(600);
    expect(geometry.mainColumns).toContain("1121");
  });

  test("preserves the mobile task order without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    await page.reload();

    const geometry = await page.evaluate(() => {
      const pace = document.querySelector(".pace-panel").getBoundingClientRect();
      const summary = document.querySelector(".shift-summary").getBoundingClientRect();
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        paceBottom: pace.bottom,
        summaryTop: summary.top,
        buttonWidths: [...document.querySelectorAll(".view-button")].map((button) => button.getBoundingClientRect().width)
      };
    });

    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.paceBottom).toBeLessThanOrEqual(geometry.summaryTop);
    expect(geometry.buttonWidths.every((width) => width > 90)).toBe(true);
  });
});

test.describe("BHP Spanish piktafel terminal", () => {
  test.beforeEach(async ({ page }) => {
    await setInitialClock(page);
    await page.goto(SPANISH_ROUTE);
    await enterOperator(page, "es", "Herman");
  });

  test("renders warehouse-native Spanish without Dutch operational output", async ({ page }) => {
    await expect(page).toHaveTitle("Terminal de Picking BHP");
    await expect(page.getByText("Pendientes de picking", { exact: true })).toBeVisible();
    await expect(page.getByText("Preparados por ti", { exact: true })).toBeVisible();
    await expect(page.getByText("Previsión 22:00", { exact: true })).toBeVisible();
    await expect(page.getByText("Tiempo por pedido", { exact: true })).toBeVisible();
    await expect(page.getByText("Dentro del objetivo", { exact: true })).toBeVisible();
    await expect(page.getByText("Hora límite en", { exact: false })).toBeVisible();

    const visibleText = (await page.locator("body").innerText()).toLowerCase();
    for (const forbidden of [
      "nog te picken",
      "door jou gepickt",
      "verwachting",
      "piktijd per order",
      "binnen streef",
      "verwacht nu",
      "dagstreef",
      "jouw tempo",
      "cut-off over"
    ]) {
      expect(visibleText).not.toContain(forbidden);
    }
  });

  test("keeps generated contexts and accessible output in Spanish", async ({ page }) => {
    await expect(page.locator("#remainingContext")).toHaveText(/^de \d+ recibidos · \d+% pendiente$/);
    await expect(page.locator("#personalContext")).toHaveText(/^previsto ahora \d+ · [−+]?\d+$/);
    await expect(page.locator("#forecastContext")).toHaveText(/^objetivo diario \d+ · [−+]?\d+$/);
    await expect(page.locator("#pacePanel")).toHaveAttribute(
      "aria-label",
      /^Tiempo de picking \d+ segundos por pedido, (por debajo del objetivo|dentro del objetivo|por encima del máximo)$/
    );

    const numbers = page.getByRole("button", { name: "Opción 2 · Cifras" });
    await numbers.focus();
    await page.keyboard.press("Enter");
    await expect(numbers).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#viewAnnouncement")).toHaveText("Vista Cifras activa.");

    const dual = page.getByRole("button", { name: "Opción 3 · Doble" });
    await dual.focus();
    await page.keyboard.press("Space");
    await expect(dual).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#viewAnnouncement")).toHaveText("Vista Doble activa.");
  });

  test("preserves same-sequence refresh continuity", async ({ page }) => {
    const before = await page.evaluate(() => ({
      day: document.documentElement.dataset.operationDay,
      sequence: document.documentElement.dataset.operationSequence,
      pace: document.getElementById("paceValue").textContent,
      remaining: document.getElementById("remainingOrders").textContent,
      context: document.getElementById("remainingContext").textContent
    }));
    await page.reload();
    const after = await page.evaluate(() => ({
      day: document.documentElement.dataset.operationDay,
      sequence: document.documentElement.dataset.operationSequence,
      pace: document.getElementById("paceValue").textContent,
      remaining: document.getElementById("remainingOrders").textContent,
      context: document.getElementById("remainingContext").textContent
    }));
    expect(after).toEqual(before);
  });

  test("contains Spanish copy at desktop and mobile widths", async ({ page }) => {
    for (const viewport of [
      { width: 1920, height: 1080 },
      { width: 1280, height: 720 },
      { width: 390, height: 900 }
    ]) {
      await page.setViewportSize(viewport);
      await page.reload();
      const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        clipped: [...document.querySelectorAll(".view-button, .metric-label, .pace-label")].some(
          (node) => node.scrollWidth > node.clientWidth || node.scrollHeight > node.clientHeight
        )
      }));
      expect(geometry.scrollWidth).toBe(geometry.clientWidth);
      expect(geometry.clipped).toBe(false);
    }
  });
});
