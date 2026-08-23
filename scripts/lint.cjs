#!/usr/bin/env node
/**
 * `npm run lint` — feature + backend file-size caps + GitHub Actions pin check
 * (see docs/component-structure.md, docs/decomposition-146.md). ESLint runs next via `eslint .`.
 *
 * - New .tsx files under src/renderer/src/features must stay under maxTsxLines.
 * - New .ts files under src/renderer/src/features must stay under maxTsLines.
 * - New .ts files under src/backend must stay under backend maxTsLines.
 * - Grandfathered mega-files (component-structure-baseline.json /
 *   backend-structure-baseline.json) may not grow by more than growthSlack lines
 *   without updating the baseline intentionally.
 * - Test files (*.test.ts / *.test.tsx) are ignored.
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FEATURES_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'features')
const BACKEND_DIR = path.join(ROOT, 'src', 'backend')
const BASELINE_PATH = path.join(__dirname, 'component-structure-baseline.json')
const BASELINE_REL = 'scripts/component-structure-baseline.json'
const BACKEND_BASELINE_PATH = path.join(__dirname, 'backend-structure-baseline.json')
const BACKEND_BASELINE_REL = 'scripts/backend-structure-baseline.json'

function walkTsFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkTsFiles(full, out)
      continue
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue
    out.push(full)
  }
  return out
}

function toPosix(relPath) {
  return relPath.split(path.sep).join('/')
}

/** Count lines by scanning bytes (no full-string split). Trailing newline does not add an extra line. */
function countLinesInFile(absPath) {
  const fd = fs.openSync(absPath, 'r')
  try {
    const chunk = Buffer.allocUnsafe(64 * 1024)
    let lines = 0
    let total = 0
    let lastByte = 0

    for (;;) {
      const n = fs.readSync(fd, chunk, 0, chunk.length, null)
      if (n === 0) break
      for (let i = 0; i < n; i++) {
        if (chunk[i] === 0x0a) lines++
      }
      lastByte = chunk[n - 1]
      total += n
    }

    if (total === 0) return 0
    // Content after the final newline (or a file with no newlines) is still one line.
    if (lastByte !== 0x0a) lines++
    return lines
  } finally {
    fs.closeSync(fd)
  }
}

function failBaseline(relLabel, message, shapeHint) {
  console.error(`lint: invalid baseline (${relLabel})\n`)
  console.error(`  ${message}`)
  console.error(`\nFix or regenerate ${relLabel} (${shapeHint}).`)
  process.exit(1)
}

function loadJsonBaseline(absPath, relLabel) {
  let raw
  try {
    raw = fs.readFileSync(absPath, 'utf8')
  } catch (err) {
    failBaseline(
      relLabel,
      `could not read file (${err.code || err.message}). Expected at ${relLabel}.`,
      'valid JSON object'
    )
  }

  let baseline
  try {
    baseline = JSON.parse(raw)
  } catch (err) {
    failBaseline(relLabel, `malformed JSON: ${err.message}`, 'valid JSON object')
  }

  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    failBaseline(relLabel, 'root value must be a JSON object', 'JSON object')
  }

  return baseline
}

function parseAllowedFiles(files, relLabel) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    failBaseline(
      relLabel,
      'files must be an object mapping repo-relative paths to line counts',
      'files: { "path/to/File.ts": <lineCount> }'
    )
  }

  const allowed = {}
  for (const [rel, value] of Object.entries(files)) {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) {
      failBaseline(
        relLabel,
        `files[${JSON.stringify(rel)}] must be a finite number ≥ 0 (got ${JSON.stringify(value)})`,
        'files: { "path/to/File.ts": <lineCount> }'
      )
    }
    allowed[rel] = n
  }
  return allowed
}

function loadFeatureBaseline() {
  const baseline = loadJsonBaseline(BASELINE_PATH, BASELINE_REL)

  const maxTsxLines = Number(baseline.maxTsxLines)
  if (!Number.isFinite(maxTsxLines) || maxTsxLines <= 0) {
    failBaseline(
      BASELINE_REL,
      `maxTsxLines must be a positive finite number (got ${JSON.stringify(baseline.maxTsxLines)})`,
      'maxTsxLines, maxTsLines, growthSlack, files'
    )
  }

  const maxTsLines = Number(baseline.maxTsLines)
  if (!Number.isFinite(maxTsLines) || maxTsLines <= 0) {
    failBaseline(
      BASELINE_REL,
      `maxTsLines must be a positive finite number (got ${JSON.stringify(baseline.maxTsLines)})`,
      'maxTsxLines, maxTsLines, growthSlack, files'
    )
  }

  const growthSlack = Number(baseline.growthSlack)
  if (!Number.isFinite(growthSlack) || growthSlack < 0) {
    failBaseline(
      BASELINE_REL,
      `growthSlack must be a finite number ≥ 0 (got ${JSON.stringify(baseline.growthSlack)})`,
      'maxTsxLines, maxTsLines, growthSlack, files'
    )
  }

  return {
    maxTsxLines,
    maxTsLines,
    growthSlack,
    allowed: parseAllowedFiles(baseline.files, BASELINE_REL),
  }
}

function loadBackendBaseline() {
  const baseline = loadJsonBaseline(BACKEND_BASELINE_PATH, BACKEND_BASELINE_REL)

  const maxTsLines = Number(baseline.maxTsLines)
  if (!Number.isFinite(maxTsLines) || maxTsLines <= 0) {
    failBaseline(
      BACKEND_BASELINE_REL,
      `maxTsLines must be a positive finite number (got ${JSON.stringify(baseline.maxTsLines)})`,
      'maxTsLines, growthSlack, files'
    )
  }

  const growthSlack = Number(baseline.growthSlack)
  if (!Number.isFinite(growthSlack) || growthSlack < 0) {
    failBaseline(
      BACKEND_BASELINE_REL,
      `growthSlack must be a finite number ≥ 0 (got ${JSON.stringify(baseline.growthSlack)})`,
      'maxTsLines, growthSlack, files'
    )
  }

  return {
    maxTsLines,
    growthSlack,
    allowed: parseAllowedFiles(baseline.files, BACKEND_BASELINE_REL),
  }
}

function collectSizeViolations(dir, allowed, growthSlack, maxForFile) {
  const violations = []
  for (const abs of walkTsFiles(dir)) {
    const rel = toPosix(path.relative(ROOT, abs))
    const lines = countLinesInFile(abs)
    const grandfathered = Object.prototype.hasOwnProperty.call(allowed, rel)

    if (!grandfathered) {
      const maxLines = maxForFile(abs)
      if (lines > maxLines) {
        violations.push(
          `${rel}: ${lines} lines (new/ungrandfathered ${path.extname(abs)} files must be ≤ ${maxLines}; split per docs/component-structure.md / docs/decomposition-146.md)`
        )
      }
      continue
    }

    const baselineLines = allowed[rel]
    const cap = baselineLines + growthSlack
    if (lines > cap) {
      violations.push(
        `${rel}: ${lines} lines (baseline ${baselineLines} + slack ${growthSlack} = ${cap}; split or raise baseline intentionally)`
      )
    }
  }
  return violations
}

function main() {
  const feature = loadFeatureBaseline()
  const backend = loadBackendBaseline()

  const violations = [
    ...collectSizeViolations(
      FEATURES_DIR,
      feature.allowed,
      feature.growthSlack,
      (abs) => (abs.endsWith('.tsx') ? feature.maxTsxLines : feature.maxTsLines)
    ),
    ...collectSizeViolations(
      BACKEND_DIR,
      backend.allowed,
      backend.growthSlack,
      () => backend.maxTsLines
    ),
  ]

  let exitCode = 0

  if (violations.length === 0) {
    console.log(
      `lint: ok (features TSX ${feature.maxTsxLines} / TS ${feature.maxTsLines}, ${Object.keys(feature.allowed).length} grandfathered; backend TS ${backend.maxTsLines}, ${Object.keys(backend.allowed).length} grandfathered)`
    )
  } else {
    console.error('lint: failed\n')
    for (const v of violations) console.error(`  - ${v}`)
    console.error(
      `\nSee docs/component-structure.md and docs/decomposition-146.md. Update ${BASELINE_REL} or ${BACKEND_BASELINE_REL} only when intentionally allowing growth.`
    )
    exitCode = 1
  }

  // Supply-chain gate for workflow Action pins (#148).
  const { lintActionsPins } = require('./lint-actions-pins.cjs')
  if (lintActionsPins() !== 0) exitCode = 1

  process.exitCode = exitCode
}

main()
