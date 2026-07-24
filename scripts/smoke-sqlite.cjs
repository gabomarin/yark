// Smoke test: verify node:sqlite works inside the Electron runtime.
const { app } = require("electron");
const fs = require("node:fs");

app.whenReady().then(() => {
  try {
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync(":memory:");
    db.exec("CREATE TABLE t (x INTEGER)");
    db.prepare("INSERT INTO t (x) VALUES (?)").run(42);
    const row = db.prepare("SELECT x FROM t").get();
    fs.writeFileSync("sqlite-check.txt", row.x === 42 ? "OK" : "FAIL: valor inesperado");
  } catch (err) {
    fs.writeFileSync("sqlite-check.txt", "FAIL: " + err.message);
  }
  app.exit(0);
});
