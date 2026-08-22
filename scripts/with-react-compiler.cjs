/**
 * Run a child command with YARK_REACT_COMPILER=1 (Windows-friendly; #404).
 * Usage: node scripts/with-react-compiler.cjs <command> [args...]
 */
const { spawnSync } = require("node:child_process");

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error("Usage: node scripts/with-react-compiler.cjs <command> [args...]");
  process.exit(1);
}

const result = spawnSync(args[0], args.slice(1), {
  stdio: "inherit",
  env: { ...process.env, YARK_REACT_COMPILER: "1" },
  shell: true,
});

process.exit(result.status ?? 1);
