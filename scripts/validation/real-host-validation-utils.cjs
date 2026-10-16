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

let credentialRedaction;

function loadCredentialRedaction() {
  if (credentialRedaction !== undefined) return credentialRedaction;

  const builtCandidates = [
    path.resolve(__dirname, "../../out/main/credential-redaction.js"),
    path.resolve(__dirname, "../../out/shared/credential-redaction.js"),
    path.resolve(__dirname, "../../out/main/shared/credential-redaction.js"),
  ];
  for (const candidate of builtCandidates) {
    try {
      credentialRedaction = require(candidate);
      return credentialRedaction;
    } catch {
      // Try the source fallback below.
    }
  }

  try {
    const Module = require("node:module");
    const typescript = require("typescript");
    const sourcePath = path.resolve(__dirname, "../../src/shared/credential-redaction.ts");
    const source = fs.readFileSync(sourcePath, "utf8");
    const compiled = typescript.transpileModule(source, {
      compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
      fileName: sourcePath,
    }).outputText;
    const runtimeModule = new Module(sourcePath, module);
    runtimeModule.filename = sourcePath;
    runtimeModule.paths = module.paths;
    runtimeModule._compile(compiled, sourcePath);
    credentialRedaction = runtimeModule.exports;
    return credentialRedaction;
  } catch {
    credentialRedaction = null;
    return credentialRedaction;
  }
}

function legacyRedactSerializedEvidence(serialized) {
  return serialized
    .replace(/("adminPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("serverPassword"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("admin_password"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("server_password"\s*:\s*")[^"]*(")/gi, "$1***$2")
    .replace(/("password"\s*:\s*")[^"]*(")/gi, "$1***$2");
}

function redactKnownSecretValues(serialized, knownSecrets) {
  return [...new Set(knownSecrets.map((secret) => String(secret).trim()).filter((secret) => secret.length >= 4))]
    .sort((left, right) => right.length - left.length)
    .reduce((text, secret) => text.split(secret).join("••••••••"), serialized);
}

function redactEvidence(value, knownSecretProfiles = []) {
  const serialized = JSON.stringify(value);
  const helper = loadCredentialRedaction();
  let sanitized = serialized;
  const profileSecrets = [];
  for (const profile of knownSecretProfiles) {
    if (typeof profile?.adminPassword === "string") profileSecrets.push(profile.adminPassword);
    if (typeof profile?.serverPassword === "string") profileSecrets.push(profile.serverPassword);
  }
  if (helper?.sanitizeDiagnosticText && helper?.collectKnownSecrets) {
    let knownSecrets = [];
    try {
      knownSecrets = helper.collectKnownSecrets(knownSecretProfiles);
    } catch {
      knownSecrets = [];
    }
    sanitized = helper.sanitizeDiagnosticText(serialized, knownSecrets);
  }
  sanitized = redactKnownSecretValues(sanitized, profileSecrets);
  try {
    return JSON.parse(legacyRedactSerializedEvidence(sanitized));
  } catch {
    return JSON.parse(legacyRedactSerializedEvidence(redactKnownSecretValues(serialized, profileSecrets)));
  }
}

module.exports = {
  DEFAULT_SCENARIOS,
  assertDisposablePath,
  parseScenarioList,
  redactEvidence,
};
