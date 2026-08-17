# Security Policy

YARK server manager is a **local Windows Electron** app (no YARK cloud account). This
policy covers how to report vulnerabilities in this repository and what we treat as
in scope.

Operator-facing storage and network expectations live in
[Security & privacy](https://getyark.com/docs/security-privacy/)
(source: [`website/src/content/docs/docs/security-privacy.mdx`](website/src/content/docs/docs/security-privacy.mdx)).

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release on [GitHub Releases](https://github.com/gabomarin/yark/releases) | Yes |
| Older `0.x` releases | Best-effort only — upgrade to the latest installer when possible |
| Unreleased / `main` builds | Not a support channel for production; security fixes land there first |

`0.x` builds are evolving prereleases. Prefer the newest tagged release when verifying a
fix.

## Reporting a vulnerability

**Do not** open a public GitHub issue, discussion, or pull request for security
vulnerabilities (including exploit PoCs, credential-theft paths, or remote-code risks).

Prefer one of:

1. **GitHub private vulnerability reporting** (preferred when enabled on this repo):  
   [Security advisories → Report a vulnerability](https://github.com/gabomarin/yark/security/advisories/new)
2. Contact the maintainer privately via the email on their
   [GitHub profile](https://github.com/gabomarin) if private reporting is unavailable.

Please include:

- YARK version (`vX.Y.Z` from the sidebar or installer name)
- Clear description and impact (what an attacker gains, and from which trust boundary)
- Steps to reproduce on a clean or minimal profile set
- Whether the issue needs a local Windows session, filesystem access, a crafted path, IPC abuse, a malicious ASA tree, or network access
- Sanitized logs or screenshots (strip admin / RCON / server passwords and player PII)

We aim to **acknowledge** private reports within a few business days and to keep you
informed while we investigate. Coordinated disclosure timing can be discussed after a
fix is confirmed.

## Scope

### In scope (examples)

- Privilege escalation or unexpected code execution from the packaged YARK app
- IPC / preload boundary bypasses that expose privileged main-process capabilities to untrusted renderer content
- Path traversal or unsafe wipe/import/move that can destroy or overwrite data **outside** the intended install/backup roots when used through normal UI or documented IPC
- Escape of recursive **copy / restore / move / cache sync** through **Windows directory junctions** or other reparse points under an approved root ([#322](https://github.com/gabomarin/yark/issues/322)). Recursive wipe already removes link entries without following targets (Node `fs.rm`)
- Supply-chain issues in our release artifacts (installer contents vs tagged source) or in first-party release CI that would ship attacker-controlled code
- Secrets inadvertently shipped in the repository or installer (API keys, private credentials)

### Out of scope / known product limits (report only if you find a new escalation)

These are documented product boundaries, not “free pass” bugs by themselves:

- **Local Windows account access** reading the profile SQLite DB, ASA INI files, or backup ZIPs that contain passwords — credentials are not DPAPI-wrapped yet ([#144](https://github.com/gabomarin/yark/issues/144))
- **Unsigned installers** and SmartScreen warnings until Authenticode lands ([#142](https://github.com/gabomarin/yark/issues/142)) — always verify the GitHub Release SHA-256
- Vulnerabilities **only** in ARK / ASA, SteamCMD, CurseForge, or other third-party binaries YARK launches or downloads
- Issues that require the operator to deliberately point `installDir` / backup paths at untrusted trees and then run Install / wipe / restore (still report if the app ignores its own wipe-safety or nested-path guards)
- Social engineering, physical access, or compromised GitHub/npm accounts outside this project’s control

## Safe harbor

We will not pursue legal action against good-faith research that:

- Follows this policy and avoids public disclosure before a fix or agreed date
- Does not destroy other people’s data, pivot off the researcher’s machine, or disrupt GitHub / Steam / third-party services
- Stops testing when asked and keeps credentials or player data private

## Hardening already in product docs

- Prefer official [Releases](https://github.com/gabomarin/yark/releases) / [getyark.com](https://getyark.com) downloads and compare installer SHA-256 digests
- Packaged builds enable Electron fuses and ASAR integrity (see [docs/versioning.md](docs/versioning.md))
- CurseForge API keys are not embedded in the desktop app (metadata Worker)
- In-app external browser opens are host-allowlisted

Thank you for helping keep operators’ hosts and ASA fleets safer.
