const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

function uniqueSuffix() {
  return `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

async function waitForCardByName(page, name, timeout = 15000) {
  const card = page.locator("article.card", {
    has: page.locator("h3", { hasText: name }),
  });
  await card.first().waitFor({ state: "visible", timeout });
  return card.first();
}

async function removeServerIfPresent(page, name) {
  const card = page.locator("article.card", {
    has: page.locator("h3", { hasText: name }),
  }).first();
  if ((await card.count()) === 0) {
    return;
  }

  const deleteButton = card.getByRole("button", { name: "Eliminar" });
  if ((await deleteButton.count()) === 0) {
    return;
  }

  await deleteButton.click();
  await card.waitFor({ state: "detached", timeout: 15000 });
}

async function createServer(page, serverName, installDir, ports) {
  await page.getByRole("button", { name: "+ Nuevo servidor" }).click();
  await page.getByRole("heading", { name: "Nuevo servidor" }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  await page.getByLabel("Nombre del perfil").fill(serverName);
  await page
    .getByLabel("Nombre de sesión (visible en el juego)")
    .fill(`Session ${serverName}`);
  await page
    .getByLabel("Directorio de instalación del servidor")
    .fill(installDir);

  await page.getByLabel("Puerto de juego").fill(String(ports.game));
  await page.getByLabel("Puerto de query").fill(String(ports.query));
  await page.getByLabel("Puerto RCON").fill(String(ports.rcon));
  await page.getByLabel("Password de administrador (RCON)").fill("admin1234");

  await page.getByRole("button", { name: "Guardar" }).click();

  await page.getByRole("heading", { name: /Servidores \(\d+\)/ }).waitFor({
    state: "visible",
    timeout: 10000,
  });

  return await waitForCardByName(page, serverName);
}

async function cloneServer(page, serverName) {
  const card = await waitForCardByName(page, serverName);
  await card.getByRole("button", { name: "Clonar" }).click();

  const cloneNamePrefix = `${serverName} (copia`;
  const cloneCard = page.locator("article.card", {
    has: page.locator("h3", { hasText: cloneNamePrefix }),
  }).first();
  await cloneCard.waitFor({ state: "visible", timeout: 10000 });

  const cloneName = await cloneCard.locator("h3").first().textContent();
  assert.ok(cloneName !== null && cloneName.includes("(copia"));

  return cloneName;
}

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const runId = uniqueSuffix();
  const serverName = `E2E-${runId}`;
  let cloneName = null;

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  try {
    const page = await app.firstWindow();

    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.waitForLoadState("domcontentloaded");

    await removeServerIfPresent(page, serverName);

    const ports = {
      game: 20000 + Math.floor(Math.random() * 1000),
      query: 21000 + Math.floor(Math.random() * 1000),
      rcon: 22000 + Math.floor(Math.random() * 1000),
    };
    const installDir = `C:\\asa-e2e\\${runId}`;

    await createServer(page, serverName, installDir, ports);
    cloneName = await cloneServer(page, serverName);

    await removeServerIfPresent(page, serverName);
    if (cloneName !== null) {
      await removeServerIfPresent(page, cloneName);
    }

    console.log("E2E_SUITE_OK");
    console.log(`E2E_CREATED_SERVER=${serverName}`);
    if (cloneName !== null) {
      console.log(`E2E_CLONED_SERVER=${cloneName}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_SUITE_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
