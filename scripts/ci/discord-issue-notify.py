#!/usr/bin/env python3
"""Post a newly opened GitHub issue to Discord as Yark Bot.

Skips the repository owner and bot accounts. Does not post the issue body.

Preferred env (posts as the Discord application "Yark Bot"):
  DISCORD_BOT_TOKEN — bot token from the Discord Developer Portal
  DISCORD_ISSUES_CHANNEL_ID — snowflake for the issues channel
  ISSUE_NUMBER, ISSUE_TITLE, ISSUE_URL, ISSUE_AUTHOR, ISSUE_USER_TYPE
  DRY_RUN — when truthy, print the rendered message and post nothing

Optional:
  ISSUE_JSON — path to a GitHub issue object (workflow_dispatch). When the
  file exists it replaces the ISSUE_* fields.
"""

from __future__ import annotations

import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.request

# Canonical login. GitHub logins are case-insensitive.
_OWNER_LOGIN = "gabomarin"
_ISSUE_URL_RE = re.compile(r"^https://github\.com/gabomarin/yark/issues/(\d+)$")
_USER_AGENT = "YARK-issue-notify/1.0 (+https://github.com/gabomarin/yark)"
_TITLE_LIMIT = 300


def should_notify(login: str, user_type: str) -> bool:
    """True when this author should produce a Discord message."""
    name = (login or "").strip()
    if not name:
        return False
    if name.casefold() == _OWNER_LOGIN:
        return False
    if (user_type or "").strip() == "Bot":
        return False
    if name.casefold().endswith("[bot]"):
        return False
    return True


def sanitize_visible(value: str, limit: int) -> str:
    """Single-line text that cannot introduce a Discord mention or link."""
    text = (value or "").replace("\r", " ").replace("\n", " ")
    text = text.replace("<", "‹").replace(">", "›").replace("@", "@\u200b")
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


def issue_url(number: int, html_url: str) -> str:
    url = (html_url or "").strip()
    match = _ISSUE_URL_RE.match(url)
    if match and int(match.group(1)) == number:
        return url
    return f"https://github.com/gabomarin/yark/issues/{number}"


def build_message(number: int, title: str, url: str, author: str) -> str:
    visible_title = sanitize_visible(title, _TITLE_LIMIT) or "(untitled)"
    visible_author = sanitize_visible(author, 39) or "unknown"
    link = issue_url(number, url)
    return f"**Issue #{number}** opened by {visible_author}\n{visible_title}\n\n<{link}>"


def is_dry_run() -> bool:
    return (os.environ.get("DRY_RUN") or "").strip().lower() in {"1", "true", "yes", "on"}


def load_issue() -> dict:
    raw_path = (os.environ.get("ISSUE_JSON") or "").strip()
    if raw_path:
        path = pathlib.Path(raw_path)
        if path.is_file():
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                raise ValueError("ISSUE_JSON is not an object")
            return data
    number = (os.environ.get("ISSUE_NUMBER") or "").strip()
    return {
        "number": int(number) if number else 0,
        "title": os.environ.get("ISSUE_TITLE") or "",
        "html_url": os.environ.get("ISSUE_URL") or "",
        "user": {
            "login": os.environ.get("ISSUE_AUTHOR") or "",
            "type": os.environ.get("ISSUE_USER_TYPE") or "",
        },
    }


def issue_fields(data: dict) -> tuple[int, str, str, str, str]:
    user = data.get("user") if isinstance(data.get("user"), dict) else {}
    try:
        number = int(data.get("number") or 0)
    except (TypeError, ValueError):
        number = 0
    return (
        number,
        str(data.get("title") or ""),
        str(data.get("html_url") or ""),
        str(user.get("login") or ""),
        str(user.get("type") or ""),
    )


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
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, str(e)


def main() -> int:
    try:
        data = load_issue()
    except (OSError, ValueError, json.JSONDecodeError) as e:
        print(f"::error::Could not read the issue payload: {e}", file=sys.stderr)
        return 1

    if isinstance(data.get("pull_request"), dict):
        print("Skip: pull request, not an issue.")
        return 0

    number, title, url, author, user_type = issue_fields(data)
    if number <= 0:
        print("::error::Issue number is missing.", file=sys.stderr)
        return 1

    if not should_notify(author, user_type):
        print(f"Skip: issue #{number} author {author or '(none)'} ({user_type or 'unknown'}).")
        return 0

    content = build_message(number, title, url, author)
    if is_dry_run():
        print(f"--- dry run; {len(content)} chars; nothing posted ---")
        print(content)
        print("--- end dry run ---")
        return 0

    token = (os.environ.get("DISCORD_BOT_TOKEN") or "").strip()
    channel_id = (os.environ.get("DISCORD_ISSUES_CHANNEL_ID") or "").strip()
    if not token or not channel_id.isdigit():
        print(
            "::error::Set secret DISCORD_BOT_TOKEN and variable DISCORD_ISSUES_CHANNEL_ID "
            "(numeric channel snowflake).",
            file=sys.stderr,
        )
        return 1

    payload = {
        "content": content,
        # SUPPRESS_EMBEDS — the issue link stays a URL, not a preview card.
        "flags": 4,
        "allowed_mentions": {"parse": []},
    }
    headers = {
        "Authorization": f"Bot {token}",
        "Content-Type": "application/json",
        "User-Agent": _USER_AGENT,
    }
    status, detail = post_json(
        f"https://discord.com/api/v10/channels/{channel_id}/messages",
        payload,
        headers,
    )
    if status < 200 or status >= 300:
        print(f"Discord bot message failed: {status} {detail}", file=sys.stderr)
        return 1
    print(f"Discord bot OK ({status}); issue=#{number}; channel={channel_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
