#!/usr/bin/env node
/**
 * `npm run lint` — lightweight static gate for renderer features
 * (see docs/component-structure.md). Placeholder until a fuller linter (e.g. ESLint).
 *
 * - New .tsx files under src/renderer/src/features must stay under maxTsxLines.
 * - New .ts files under src/renderer/src/features must stay under maxTsLines.
 * - Grandfathered mega-files (scripts/component-structure-baseline.json) may not grow
 *   by more than growthSlack lines without updating the baseline intentionally.
 * - Test files (*.test.ts / *.test.tsx) are ignored.
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FEATURES_DIR = path.join(ROOT, 'src', 'renderer', 'src', 'features')
const BASELINE_PATH = path.join(__dirname, 'component-structure-baseline.json')
const BASELINE_REL = 'scripts/component-structure-baseline.json'

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

function failBaseline(message) {
  console.error(`lint: invalid baseline (${BASELINE_REL})\n`)
  console.error(`  ${message}`)
  console.error(
    `\nFix or regenerate ${BASELINE_REL} (JSON object with maxTsxLines, maxTsLines, growthSlack, and files: { "path/to/File.tsx": <lineCount> }).`
  )
  process.exit(1)
}

function loadBaseline() {
  let raw
  try {
    raw = fs.readFileSync(BASELINE_PATH, 'utf8')
  } catch (err) {
    failBaseline(
      `could not read file (${err.code || err.message}). Expected at ${BASELINE_REL}.`
    )
  }

  let baseline
  try {
    baseline = JSON.parse(raw)
  } catch (err) {
    failBaseline(`malformed JSON: ${err.message}`)
  }

  if (!baseline || typeof baseline !== 'object' || Array.isArray(baseline)) {
    failBaseline('root value must be a JSON object')
  }

  const maxTsxLines = Number(baseline.maxTsxLines)
  if (!Number.isFinite(maxTsxLines) || maxTsxLines <= 0) {
    failBaseline(
      `maxTsxLines must be a positive finite number (got ${JSON.stringify(baseline.maxTsxLines)})`
    )
  }

  const maxTsLines = Number(baseline.maxTsLines)
  if (!Number.isFinite(maxTsLines) || maxTsLines <= 0) {
    failBaseline(
      `maxTsLines must be a positive finite number (got ${JSON.stringify(baseline.maxTsLines)})`
    )
  }

  const growthSlack = Number(baseline.growthSlack)
  if (!Number.isFinite(growthSlack) || growthSlack < 0) {
    failBaseline(
      `growthSlack must be a finite number ≥ 0 (got ${JSON.stringify(baseline.growthSlack)})`
    )
  }

  const files = baseline.files
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    failBaseline('files must be an object mapping repo-relative paths to line counts')
  }

  const allowed = {}
  for (const [rel, value] of Object.entries(files)) {
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) {
      failBaseline(
        `files[${JSON.stringify(rel)}] must be a finite number ≥ 0 (got ${JSON.stringify(value)})`
      )
    }
    allowed[rel] = n
  }

  return { maxTsxLines, maxTsLines, growthSlack, allowed }
}

function main() {
  const { maxTsxLines, maxTsLines, growthSlack, allowed } = loadBaseline()

  const violations = []
  for (const abs of walkTsFiles(FEATURES_DIR)) {
    const rel = toPosix(path.relative(ROOT, abs))
    const lines = countLinesInFile(abs)
    const grandfathered = Object.prototype.hasOwnProperty.call(allowed, rel)

    if (!grandfathered) {
      const maxLines = abs.endsWith('.tsx') ? maxTsxLines : maxTsLines
      if (lines > maxLines) {
        violations.push(
          `${rel}: ${lines} lines (new/ungrandfathered ${path.extname(abs)} files must be ≤ ${maxLines}; split per docs/component-structure.md)`
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

  let exitCode = 0

  if (violations.length === 0) {
    console.log(
      `lint: ok (max TSX ${maxTsxLines}, max TS ${maxTsLines}, ${Object.keys(allowed).length} grandfathered feature files)`
    )
  } else {
    console.error('lint: failed\n')
    for (const v of violations) console.error(`  - ${v}`)
    console.error(
      `\nSee docs/component-structure.md. To intentionally allow growth, update ${BASELINE_REL}.`
    )
    exitCode = 1
  }

  // Supply-chain gate for workflow Action pins (#148).
  const { lintActionsPins } = require('./lint-actions-pins.cjs')
  if (lintActionsPins() !== 0) exitCode = 1

  process.exitCode = exitCode
}

main()
