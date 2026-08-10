#!/usr/bin/env node
/**
 * Reject mutable third-party GitHub Action refs in workflows.
 * Policy: docs/github-actions.md (#148).
 *
 * Allowed `uses:` forms:
 * - Local / same-repo composite: ./path/to/action
 * - Third-party: owner/name@<40-char-sha>
 * - Reusable workflow: owner/repo/.github/workflows/file.yml@<40-char-sha>
 *
 * Rejected: @v4, @v4.2.2, @main, short SHAs, floating branch tags.
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const WORKFLOWS_DIR = path.join(ROOT, '.github', 'workflows')
const FULL_SHA = /^[0-9a-f]{40}$/i

function listWorkflowFiles() {
  if (!fs.existsSync(WORKFLOWS_DIR)) return []
  return fs
    .readdirSync(WORKFLOWS_DIR)
    .filter((name) => /\.ya?ml$/i.test(name))
    .map((name) => path.join(WORKFLOWS_DIR, name))
    .sort()
}

/** Strip a trailing YAML `# comment` from a uses value. */
function stripInlineComment(value) {
  const idx = value.search(/\s+#/)
  return idx >= 0 ? value.slice(0, idx).trim() : value.trim()
}

/**
 * @param {string} absPath
 * @returns {{ file: string, line: number, uses: string, reason: string }[]}
 */
function findViolations(absPath) {
  const rel = path.relative(ROOT, absPath).split(path.sep).join('/')
  const lines = fs.readFileSync(absPath, 'utf8').split(/\r?\n/)
  /** @type {{ file: string, line: number, uses: string, reason: string }[]} */
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s*uses:\s*(.+?)\s*$/)
    if (!match) continue

    const uses = stripInlineComment(match[1])

    if (uses.startsWith('./') || uses.startsWith('.\\')) {
      continue
    }

    if (uses.startsWith('docker://')) {
      out.push({
        file: rel,
        line: i + 1,
        uses,
        reason:
          'docker:// Actions must not use mutable tags; prefer a digest or avoid docker Actions',
      })
      continue
    }

    const at = uses.lastIndexOf('@')
    if (at <= 0) {
      out.push({
        file: rel,
        line: i + 1,
        uses,
        reason: 'missing @ref (expected owner/name@<40-char-sha>)',
      })
      continue
    }

    const ref = uses.slice(at + 1).trim()
    if (!FULL_SHA.test(ref)) {
      out.push({
        file: rel,
        line: i + 1,
        uses,
        reason: `mutable or non-SHA ref "${ref}" — pin to a full 40-character commit SHA (see docs/github-actions.md)`,
      })
    }
  }

  return out
}

function lintActionsPins() {
  const files = listWorkflowFiles()
  if (files.length === 0) {
    console.error('lint-actions-pins: no workflow files under .github/workflows')
    return 1
  }

  /** @type {{ file: string, line: number, uses: string, reason: string }[]} */
  const violations = []
  for (const file of files) {
    violations.push(...findViolations(file))
  }

  if (violations.length === 0) {
    console.log(`lint-actions-pins: OK (${files.length} workflow file(s))`)
    return 0
  }

  console.error('lint-actions-pins: mutable third-party Action refs are not allowed:\n')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`)
    console.error(`    uses: ${v.uses}`)
    console.error(`    ${v.reason}\n`)
  }
  console.error(
    'Pin each Action to a full commit SHA and keep a `# owner/name@vX.Y.Z` comment above the uses line. See docs/github-actions.md.'
  )
  return 1
}

module.exports = { lintActionsPins, findViolations }

if (require.main === module) {
  process.exitCode = lintActionsPins()
}
