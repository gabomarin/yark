const assert = require("node:assert/strict");
const path = require("node:path");
const { _electron: electron } = require("playwright");

async function run() {
  const projectRoot = path.resolve(__dirname, "..");
  process.chdir(projectRoot);

  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
  });

  try {
    const window = await app.firstWindow();
    await window.waitForLoadState("domcontentloaded");

    await window.waitForSelector("h1", { timeout: 15000 });
    const h1 = await window.textContent("h1");

    assert.ok(h1 !== null, "No se encontró el título principal en la UI");
    assert.ok(
      h1.includes("ARK Server GBO"),
      `Título inesperado. Esperado incluir 'ARK Server GBO', recibido: ${h1}`,
    );

    const serverCountText = await window.textContent("section.servers h2");
    console.log("E2E_OK");
    console.log(`UI_H1=${h1}`);
    if (serverCountText !== null) {
      console.log(`UI_SERVERS_HEADER=${serverCountText}`);
    }
  } finally {
    await app.close();
  }
}

run().catch((error) => {
  console.error("E2E_FAIL");
  console.error(error?.stack ?? String(error));
  process.exit(1);
});
