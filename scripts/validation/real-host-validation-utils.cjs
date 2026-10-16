const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_SCENARIOS = ["lifecycle", "backup-restore"];

function parseScenarioList(raw = DEFAULT_SCENARIOS.join(",")) {
  const allowed = new Set(DEFAULT_SCENARIOS);
  const scenarios = [
    ...new Set(
      String(raw)
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (scenarios.length === 0) {
    throw new Error(`At least one scenario is required: ${DEFAULT_SCENARIOS.join(", ")}`);
  }
  const unknown = scenarios.filter((scenario) => !allowed.has(scenario));
  if (unknown.length > 0) {
    throw new Error(`Unknown real-host scenario(s): ${unknown.join(", ")}. Allowed: ${DEFAULT_SCENARIOS.join(", ")}`);
  }
  return scenarios;
}

function assertDisposablePath(candidate, root) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot)) {
    throw new Error(`Disposable root must already exist: ${resolvedRoot}`);
  }
  assertNoReparsePoints(resolvedRoot);

  let existingPath = resolvedCandidate;
  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    existingPath = parent;
  }
  assertNoReparsePoints(existingPath);

  const canonicalRoot = fs.realpathSync.native(resolvedRoot);
  const canonicalExisting = fs.realpathSync.native(existingPath);
  const missingSuffix = path.relative(existingPath, resolvedCandidate);
  const canonicalCandidate = path.resolve(canonicalExisting, missingSuffix);
  const relative = path.relative(canonicalRoot, canonicalCandidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to mutate a path outside the disposable root: ${canonicalCandidate}`);
  }
  return resolvedCandidate;
}

function assertNoReparsePoints(startPath) {
  let current = path.resolve(startPath);
  while (true) {
    if (fs.existsSync(current)) {
      const stats = fs.lstatSync(current);
      if (stats.isSymbolicLink()) {
        throw new Error(`Refusing to use a reparse point in disposable path: ${current}`);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

function redactEvidence(value) {
  return JSON.parse(
    JSON.stringify(value)
      .replace(/("adminPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
      .replace(/("serverPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
      .replace(/("admin_password"\s*:\s*")[^"]*(")/gi, "$1***$2")
      .replace(/("server_password"\s*:\s*")[^"]*(")/gi, "$1***$2")
      .replace(/("password"\s*:\s*")[^"]*(")/gi, "$1***$2"),
  );
}

module.exports = {
  DEFAULT_SCENARIOS,
  assertDisposablePath,
  parseScenarioList,
  redactEvidence,
};
