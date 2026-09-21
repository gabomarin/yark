#!/usr/bin/env python3
"""Post a GitHub Release changelog to Discord as Yark Bot (no link embeds).

Preferred env (posts as the Discord application "Yark Bot"):
  DISCORD_BOT_TOKEN — bot token from the Discord Developer Portal
  DISCORD_RELEASES_CHANNEL_ID — snowflake for #releases
  RELEASE_JSON — path to gh api release JSON (required)
  WHATS_NEW_TS — curated changelog path (default src/shared/settings/changelog.ts)
  DRY_RUN — when truthy, print the rendered message and post nothing

Fallback (legacy webhook identity, e.g. "Github Release"):
  WEBHOOK_URL — Discord incoming webhook URL

Body source: the curated operator-facing entry from the in-app What's new
(`src/shared/settings/changelog.ts`) for the released version, so #releases
reads like the app instead of the auto-generated PR list. Falls back to the
GitHub release notes body when no curated entry exists.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

# Auto-generated "What's Changed" often includes the SemVer cut PR itself
# (title `release: vX.Y.Z`) — not operator-facing changelog.
_RELEASE_CUT_PR_LINE = re.compile(
    r"^\s*[\*\-]?\s*release:\s*v?\d[\w.+-]*\b",
    re.IGNORECASE,
)

_USER_AGENT = "YARK-release-notify/1.0 (+https://github.com/gabomarin/yark)"

# Curated in-app What's new (same text as the app + getyark.com changelog).
_CHANGELOG_TS_DEFAULT = "src/shared/settings/changelog.ts"
_TS_VERSION_RE = re.compile(r'^\s*version:\s*"((?:[^"\\]|\\.)*)"')
_TS_TITLE_RE = re.compile(r'^\s*title:\s*"((?:[^"\\]|\\.)*)"')
_TS_ITEM_RE = re.compile(r'^\s*"((?:[^"\\]|\\.)*)"\s*,?\s*$')
_VERSION_IN_TAG_RE = re.compile(r"\d+\.\d+\.\d+[\w.+-]*")


def _ts_string(token: str) -> str:
    try:
        return json.loads(f'"{token}"')
    except json.JSONDecodeError:
        return token


def parse_whats_new_sections(ts_text: str, version: str) -> list[dict]:
    """Extract the curated sections for one version from changelog.ts.

    Entries are newest-first; stop at the next `version:` line once the
    target block has been consumed. Returns [] when the version is absent.
    """
    needle = (version or "").strip().lstrip("vV")
    if not needle:
        return []

    in_target = False
    sections: list[dict] = []
    current: dict | None = None
    for raw in ts_text.splitlines():
        match = _TS_VERSION_RE.match(raw)
        if match:
            found = _ts_string(match.group(1))
            if in_target and found != needle:
                break
            in_target = found == needle
            current = None
            continue
        if not in_target:
            continue
        match = _TS_TITLE_RE.match(raw)
        if match:
            current = {"title": _ts_string(match.group(1)), "items": []}
            sections.append(current)
            continue
        match = _TS_ITEM_RE.match(raw)
        if match:
            if current is None:
                current = {"title": "", "items": []}
                sections.append(current)
            current["items"].append(_ts_string(match.group(1)))
    return sections


def load_whats_new_sections(version: str) -> list[dict]:
    path = pathlib.Path(os.environ.get("WHATS_NEW_TS") or _CHANGELOG_TS_DEFAULT)
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return []
    return parse_whats_new_sections(text, version)


def format_whats_new(sections: list[dict]) -> str:
    blocks: list[str] = []
    for section in sections:
        items = [f"• {item}" for item in section.get("items", []) if item]
        if not items:
            continue
        title = (section.get("title") or "").strip()
        block = "\n".join(items)
        blocks.append(f"**{title}**\n{block}" if title else block)
    return "\n\n".join(blocks)


def release_version(data: dict) -> str:
    tag = (data.get("tag_name") or "").strip()
    match = _VERSION_IN_TAG_RE.search(tag)
    return match.group(0) if match else tag.lstrip("vV")


def filter_release_notes_body(body: str) -> str:
    """Drop release-cut PR bullets from GitHub auto-generated notes."""
    kept: list[str] = []
    for line in body.splitlines():
        if _RELEASE_CUT_PR_LINE.match(line):
            continue
        kept.append(line)
    # Collapse runs of blank lines left by removals.
    out: list[str] = []
    blank = False
    for line in kept:
        if line.strip() == "":
            if blank:
                continue
            blank = True
            out.append("")
        else:
            blank = False
            out.append(line)
    return "\n".join(out).strip()


def build_message_content(data: dict, sections: list[dict] | None = None) -> str:
    tag = (data.get("tag_name") or "").strip()
    name = (data.get("name") or tag).strip()
    html_url = (data.get("html_url") or "").strip()
    prerelease = bool(data.get("prerelease"))
    if sections is None:
        sections = load_whats_new_sections(release_version(data))
    body = format_whats_new(sections)
    if not body:
        body = filter_release_notes_body((data.get("body") or "").strip())

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
    if not body:
        return header
    available = max_len - len(header) - len("\n") - len(suffix)
    if available < 80:
        return header
    if len(body) <= available:
        return header + "\n" + body
    cut = body[: max(0, available)].rstrip()
    nl = cut.rfind("\n")
    if nl > available // 2:
        cut = cut[:nl].rstrip()
    return header + "\n" + cut + suffix


def post_json(url: str, payload: dict, headers: dict[str, str]) -> tuple[int, str]:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, ""
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        return e.code, detail


def is_dry_run() -> bool:
    return (os.environ.get("DRY_RUN") or "").strip().lower() in {"1", "true", "yes", "on"}


def main() -> int:
    dry_run = is_dry_run()
    bot_token = (os.environ.get("DISCORD_BOT_TOKEN") or "").strip()
    channel_id = (os.environ.get("DISCORD_RELEASES_CHANNEL_ID") or "").strip()
    webhook = (os.environ.get("WEBHOOK_URL") or "").strip()

    use_bot = bool(bot_token and channel_id)
    if not use_bot and not webhook and not dry_run:
        print(
            "::error::Set DISCORD_BOT_TOKEN + DISCORD_RELEASES_CHANNEL_ID "
            "(preferred, posts as Yark Bot) or WEBHOOK_URL (legacy).",
            file=sys.stderr,
        )
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

    content = build_message_content(data)
    payload = {
        "content": content,
        # SUPPRESS_EMBEDS — avoid GitHub/link preview cards
        "flags": 4,
        "allowed_mentions": {"parse": []},
    }

    if dry_run:
        target = f"channel {channel_id}" if use_bot else "webhook" if webhook else "no target"
        print(f"--- dry run ({target}); {len(content)} chars; nothing posted ---")
        print(content)
        print("--- end dry run ---")
        return 0

    if use_bot:
        url = f"https://discord.com/api/v10/channels/{channel_id}/messages"
        headers = {
            "Authorization": f"Bot {bot_token}",
            "Content-Type": "application/json",
            "User-Agent": _USER_AGENT,
        }
        status, detail = post_json(url, payload, headers)
        if status < 200 or status >= 300:
            print(f"Discord bot message failed: {status} {detail}", file=sys.stderr)
            return 1
        print(f"Discord bot OK ({status}); assets={len(assets)}; channel={channel_id}")
        return 0

    headers = {
        "Content-Type": "application/json",
        # Cloudflare rejects Python-urllib's default User-Agent (403 / 1010).
        "User-Agent": _USER_AGENT,
    }
    status, detail = post_json(webhook, payload, headers)
    if status < 200 or status >= 300:
        print(f"Discord webhook failed: {status} {detail}", file=sys.stderr)
        return 1
    print(f"Discord webhook OK ({status}); assets={len(assets)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
