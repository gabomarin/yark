#!/usr/bin/env python3
"""Post a GitHub Release changelog to Discord (no link embeds).

Env:
  WEBHOOK_URL — Discord webhook URL (required)
  RELEASE_JSON — path to gh api release JSON (required)
"""

from __future__ import annotations

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


def main() -> int:
    webhook = (os.environ.get("WEBHOOK_URL") or "").strip()
    if not webhook:
        print("::error::Missing WEBHOOK_URL (DISCORD_RELEASES_WEBHOOK_URL)", file=sys.stderr)
        return 1

    release_path = pathlib.Path(os.environ["RELEASE_JSON"])
    data = json.loads(release_path.read_text(encoding="utf-8"))

    assets = data.get("assets") or []
    if not assets:
        print(
            "::error::GitHub Release has no assets yet; refusing to announce before installer upload.",
            file=sys.stderr,
        )
        return 1

    tag = (data.get("tag_name") or "").strip()
    name = (data.get("name") or tag).strip()
    html_url = (data.get("html_url") or "").strip()
    prerelease = bool(data.get("prerelease"))
    body = (data.get("body") or "").strip()

    title = f"**{name}**" if name.startswith("YARK") or name == tag else f"**YARK {tag}**"
    if prerelease:
        title += " _(prerelease)_"

    header = (
        f"{title} is available.\n"
        f"\n"
        f"Download: <https://getyark.com>\n"
        f"Release notes: <{html_url}>\n"
    )

    max_len = 2000
    suffix = "\n\n_(truncated — full notes on GitHub)_"
    if body:
        available = max_len - len(header) - len("\n") - len(suffix)
        if available < 80:
            content = header
        elif len(body) <= available:
            content = header + "\n" + body
        else:
            cut = body[: max(0, available)].rstrip()
            nl = cut.rfind("\n")
            if nl > available // 2:
                cut = cut[:nl].rstrip()
            content = header + "\n" + cut + suffix
    else:
        content = header

    payload = {
        "content": content,
        # SUPPRESS_EMBEDS — avoid GitHub/link preview cards
        "flags": 4,
        "allowed_mentions": {"parse": []},
    }
    req = urllib.request.Request(
        webhook,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            # Cloudflare rejects Python-urllib's default User-Agent (403 / 1010).
            "User-Agent": "YARK-release-notify/1.0 (+https://github.com/gabomarin/yark)",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            print(f"Discord webhook OK ({resp.status}); assets={len(assets)}")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        print(f"Discord webhook failed: {e.code} {detail}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
