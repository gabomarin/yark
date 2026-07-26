#!/usr/bin/env sh
# Shared helpers for Husky hooks (sourced by pre-commit / pre-push).

is_wsl() {
  [ -f /proc/version ] && grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null
}

# Run npm on the host that matches this checkout's node_modules.
# WSL on /mnt/<drive>/… usually has Windows optional deps (Rollup/Electron) — Linux
# npm test then fails with missing @rollup/rollup-linux-*. Delegate to cmd.exe.
npm_host() {
  if is_wsl; then
    if ! command -v wslpath >/dev/null 2>&1 || ! command -v cmd.exe >/dev/null 2>&1; then
      echo "husky: WSL detected, but wslpath/cmd.exe are unavailable."
      echo "Run git commit/push from Windows PowerShell (Node 22.5+), not WSL."
      exit 1
    fi
    # wslpath -w yields backslashes; sh treats \a \n etc. as escapes inside "...".
    # cmd.exe accepts forward slashes, so normalize before quoting.
    win_cwd=$(wslpath -w "$PWD" | tr '\\' '/')
    printf 'husky: WSL detected — using Windows Node in %s\n' "$win_cwd"
    cmd.exe /c "cd /d \"${win_cwd}\" && npm $*"
    return $?
  fi
  npm "$@"
}
