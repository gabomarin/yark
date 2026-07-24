/**
 * E2E por perfiles de usuario (principiante y experimentado)
 * + chequeos visuales base en 1280x720, 1920x1080 y 2560x1440.
 *
 * Uso:
 *   node scripts/e2e-personas.cjs
 * Requiere:
 *   npm run build
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { _electron: electron } = require("playwright");

delete process.env.ELECTRON_RUN_AS_NODE;

const viewports = [
  { name: "hd", width: 1280, height: 720 },
  { name: "full-hd", width: 1920, height: 1080 },
  { name: "qhd-2k", width: 2560, height: 1440 },
];

function uid() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function waitOverviewReady(page) {
  await page.locator("[data-overview-page]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-overview-content]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-server-list]").waitFor({ state: "visible", timeout: 10000 });
}

async function goToOverview(page) {
  const nav = page.getByRole("button", { name: "Servidores" });
  if ((await nav.count()) > 0) {
    await nav.first().click();
  }
  await waitOverviewReady(page);
}

async function setViewportAndCapture(page, outDir, label, size) {
  await page.setViewportSize({ width: size.width, height: size.height });
  await waitOverviewReady(page);
  const shot = path.join(outDir, `${label}-${size.name}.png`);
  await page.screenshot({ path: shot, fullPage: false });
  return shot;
}

async function createServerAsBeginner(page, name, baseDir) {
  await page.getByRole("button", { name: "Nuevo servidor" }).first().click();
  await page.getByRole("heading", { name: "Nuevo servidor" }).waitFor({ timeout: 10000 });

  await page.getByRole("textbox", { name: /^Nombre$/ }).fill(name);
  await page.getByRole("textbox", { name: /^Nombre de sesión$/ }).fill(`Sesion ${name}`);
  const baseDirByLabel = page.getByRole("textbox", { name: /^Carpeta base$/ });
  if ((await baseDirByLabel.count()) > 0) {
    await baseDirByLabel.first().fill(baseDir);
  } else {
    await page.getByPlaceholder("C:\\ark_servers").fill(baseDir);
  }
  await page.locator("input[type='password']").nth(1).fill("admin1234");

  await page.getByRole("button", { name: "Guardar" }).first().click();

  await goToOverview(page);
  await page.getByText(name).first().waitFor({ timeout: 15000 });
  await page.getByText(/necesita(n)? atención/i).first().waitFor({ timeout: 10000 });
}

async function openWorkspaceAndAssistant(page, serverName) {
  await page
    .getByRole("button", { name: `Abrir configuración de ${serverName}` })
    .first()
    .click();

  await page.getByRole("tab", { name: "Servidor" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "Archivos INI" }).waitFor({ timeout: 10000 });
  await page.getByRole("tab", { name: "Mods" }).waitFor({ timeout: 10000 });

  await page.getByRole("button", { name: "Asistente de configuración" }).click();
  await page.getByText("Asistente de configuración").first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Cancelar" }).first().click();

  await page.getByRole("button", { name: "Asistente de configuración" }).waitFor({ timeout: 10000 });
}

async function runExperiencedFlow(page, serverName) {
  await page.getByLabel("Volver a servidores").click();
  await goToOverview(page);

  const search = page.getByRole("textbox", { name: "Buscar servidores" });
  await search.fill(serverName);
  await page.getByText(serverName).first().waitFor({ timeout: 10000 });

  const card = page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();
  await card.waitFor({ state: "visible", timeout: 10000 });

  await card.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Clonar" }).click();

  const cloneTitle = page.locator("[data-server-card] .mantine-Text-root", {
    hasText: `${serverName} (copia`,
  }).first();
  await cloneTitle.waitFor({ state: "visible", timeout: 15000 });
  const cloneName = (await cloneTitle.textContent())?.trim() ?? "";
  assert.ok(cloneName.includes("(copia"), "No se detectó servidor clonado");

  // Navegación de usuario experimentado por secciones operativas.
  await page.getByRole("button", { name: "Registros" }).first().click();
  await page.getByRole("heading", { name: "Registros" }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "SteamCMD" }).first().click();
  await page.getByText(/SteamCMD/i).first().waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Servidores" }).first().click();
  await waitOverviewReady(page);

  await search.fill(cloneName);
  const cloneCard = page.locator("[data-server-card]", {
    has: page.getByText(cloneName, { exact: true }),
  }).first();
  await cloneCard.waitFor({ state: "visible", timeout: 10000 });

  await cloneCard.getByRole("button", { name: "Más opciones" }).click();
  await page.getByRole("menuitem", { name: "Eliminar servidor" }).click();
  await page.getByRole("button", { name: "Eliminar todo" }).click();

  await cloneCard.waitFor({ state: "detached", timeout: 15000 });

  return cloneName;
}

async function deleteServerIfPresent(page, serverName) {
  await goToOverview(page);

  const search = page.getByRole("textbox", { name: "Buscar servidores" });
  await search.fill(serverName);

  const card = page.locator("[data-server-card]", {
    has: page.getByText(serverName, { exact: true }),
  }).first();

  if ((await card.count()) === 0) {
    await search.fill("");
    return;
  }

  await card.waitFor({ state: "visible", timeout: 5000 });
  await card.getByRole("button", { name: "Más opciones" }).click();
  const deleteAction = page.getByRole("menuitem", { name: "Eliminar servidor" });
  if ((await deleteAction.count()) > 0) {
    await deleteAction.click();
    await page.getByRole("button", { name: "Eliminar todo" }).click();
    await card.waitFor({ state: "detached", timeout: 15000 });
  }

  await search.fill("");
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const outDir = path.join(os.tmpdir(), "ark-gbo-e2e-personas");
  fs.mkdirSync(outDir, { recursive: true });

  const runId = uid();
  const beginnerServerName = `Beginner-${runId}`;
  const beginnerBaseDir = `C:\\ark_servers_e2e\\${runId}`;

  const app = await electron.launch({ args: ["."], cwd: projectRoot });
  const errors = [];
  const artifacts = [];
  let cloneName = null;

  try {
    const page = await app.firstWindow();

    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      errors.push(`pageerror: ${error.message}`);
    });
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");
    await goToOverview(page);

    // Limpieza previa por si quedó de una ejecución anterior.
    await deleteServerIfPresent(page, beginnerServerName);

    // Recorrido visual base por protocolo (Overview) antes de acciones.
    for (const vp of viewports) {
      const shot = await setViewportAndCapture(page, outDir, "overview-initial", vp);
      artifacts.push(shot);
    }

    // Persona principiante.
    await createServerAsBeginner(page, beginnerServerName, beginnerBaseDir);
    await openWorkspaceAndAssistant(page, beginnerServerName);

    // Persona experimentado.
    cloneName = await runExperiencedFlow(page, beginnerServerName);

    // Capturas finales en los viewports requeridos.
    for (const vp of viewports) {
      const shot = await setViewportAndCapture(page, outDir, "overview-final", vp);
      artifacts.push(shot);
    }

    // Limpieza final: eliminar servidor creado por el recorrido principiante.
    await deleteServerIfPresent(page, beginnerServerName);

    if (errors.length > 0) {
      throw new Error(errors.join("\n"));
    }

    console.log("E2E_PERSONAS_OK");
    console.log(`E2E_PERSONAS_SERVER=${beginnerServerName}`);
    if (cloneName !== null) {
      console.log(`E2E_PERSONAS_CLONE=${cloneName}`);
    }
    console.log(`E2E_PERSONAS_ARTIFACTS_DIR=${outDir}`);
    for (const filePath of artifacts) {
      console.log(`E2E_PERSONAS_ARTIFACT=${filePath}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_PERSONAS_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
