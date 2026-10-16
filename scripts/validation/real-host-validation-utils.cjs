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
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === "" || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Refusing to mutate a path outside the disposable root: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
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
