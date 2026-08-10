export type FaqItem = {
  question: string;
  answerHtml: string;
};

/** Strip tags/entities for FAQPage JSON-LD text answers. */
export function faqAnswerPlainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export const faqItems: FaqItem[] = [
  {
    question: "What is YARK?",
    answerHtml: `
      <p>
        YARK is a Windows desktop app for managing <strong>local</strong>
        ARK: Survival Ascended dedicated servers — profiles, SteamCMD install/update,
        CurseForge mod IDs, backups, logs, clusters, and INI configuration in one place.
      </p>`,
  },
  {
    question: "Is it production-ready?",
    answerHtml: `
      <p>
        No. Public builds are an <strong>unsigned prerelease</strong>. Expect rough edges
        and breaking changes between versions. Treat it as early tooling, not a finished product.
        Prefer backups before risky updates or restores.
      </p>`,
  },
  {
    question: "What do I need to run it?",
    answerHtml: `
      <p>
        A Windows PC that can run ASA dedicated servers, enough disk for installs and backups,
        and <strong>SteamCMD</strong> pointed in Settings. YARK itself is a desktop manager —
        it does not replace SteamCMD or the ASA server binaries.
      </p>`,
  },
  {
    question: "Does YARK host my servers in the cloud?",
    answerHtml: `
      <p>
        No. YARK is not a cloud host and not an official Wildcard product. You run dedicated
        server binaries on your own Windows machine; the app manages them locally.
      </p>`,
  },
  {
    question: "Can I run multiple servers?",
    answerHtml: `
      <p>
        Yes. Create one profile per install path. Give each profile unique game, query, and
        RCON ports. Clusters share a Cluster ID and directory when you want transfers between maps.
      </p>`,
  },
  {
    question: "Where is my data stored?",
    answerHtml: `
      <p>
        Server profiles and app settings stay on your PC (local SQLite). There is no YARK cloud
        account. Network use covers SteamCMD, Wildcard’s public status CDN for the displayed
        network version, and CurseForge metadata via a small Cloudflare Worker proxy.
      </p>`,
  },
  {
    question: "What happens on a safe update or restart?",
    answerHtml: `
      <p>
        Safe update can stop the instance, take a fail-hard <code>pre_update</code> backup,
        run SteamCMD, then restart or roll back if something goes wrong. Restart follows a
        stop → <code>pre_restart</code> backup → start path under one lock. If a required backup
        step fails, the operation stops instead of continuing blind.
      </p>`,
  },
  {
    question: "Does YARK download CurseForge mods for me?",
    answerHtml: `
      <p>
        No. The Mods tab manages CurseForge Project IDs and enable/disable state. Enabled IDs
        are passed at launch as <code>-mods=</code>. YARK wires launch IDs and metadata — it does
        not download or install mod files for you.
      </p>`,
  },
  {
    question: "Can I run CurseForge Maps / custom ASA worlds?",
    answerHtml: `
      <p>
        Yes. Enable the map pack on the <strong>Mods</strong> tab, then choose it under
        Server Information → <strong>Map</strong> (<strong>Map mods</strong> group, or
        <strong>Custom…</strong> with the author launch token such as
        <code>Svartalfheim_WP</code>). Enabling a Maps mod does not change your current map —
        you pick when to switch. Start is blocked if the custom map’s linked pack is missing or
        disabled. See
        <a href="${import.meta.env.BASE_URL}docs/mods/#maps--custom-worlds">Mods → Maps / custom worlds</a>.
      </p>`,
  },
  {
    question: "How do backups work?",
    answerHtml: `
      <p>
        Backups are ZIP archives per server for <strong>world</strong>, <strong>players</strong>,
        and <strong>INI</strong>. You can create them on demand, schedule world backups, and
        restore from history. Safe update / restart also create pre-operation backups on the
        critical path.
      </p>`,
  },
  {
    question: "Windows SmartScreen / antivirus flags the installer. Is that expected?",
    answerHtml: `
      <p>
        Yes for unsigned prereleases. The installer is not code-signed yet, so Windows may warn
        on first run. Prefer downloading only from the official GitHub Releases page or the
        download button on this site (same release assets). Before running it, compare the file's
        SHA-256 with the digest GitHub shows for that release asset; the Getting started guide has
        the PowerShell command.
      </p>`,
  },
  {
    question: "How do I update the app vs the ASA server files?",
    answerHtml: `
      <p>
        <strong>YARK itself:</strong> Settings → <strong>YARK updates</strong> (or click the
        accented sidebar version when an update is waiting). Check, download, then restart to
        install. Packaged builds use GitHub Releases; you can still grab the installer from
        Releases manually if needed. Windows may warn about an unsigned build until code signing
        ships.
        <strong>ASA dedicated files:</strong> use Update / Verify inside the app — that talks to
        SteamCMD and can run the safe-update path with backups.
      </p>`,
  },
  {
    question: "Can I copy settings between servers?",
    answerHtml: `
      <p>
        Yes. Use <strong>Copy configuration</strong> from a server card or workspace Quick actions.
        Select stopped targets and the categories to copy (INI, mods, launch args, backup policy,
        optional passwords). Identity, ports, cluster, and world saves are never copied.
        See the <a href="${import.meta.env.BASE_URL}docs/copy-configuration/">Copy configuration</a> guide.
      </p>`,
  },
  {
    question: "How do clusters work in YARK?",
    answerHtml: `
      <p>
        Members share a Cluster ID and shared directory. The Clusters page can create a cluster,
        add or remove stopped members, and manage optional INI templates (Promote / Restore / Seed).
        Create-server can also join an existing fleet cluster. Compliance checks are profile math —
        not a live in-game transfer probe. See <a href="${import.meta.env.BASE_URL}docs/clusters/">Clusters</a>.
      </p>`,
  },
  {
    question: "Where can I get help or report a bug?",
    answerHtml: `
      <p>
        Open an issue on
        <a href="https://github.com/gabomarin/yark/issues">GitHub Issues</a>.
        Include the YARK version, what you tried, and relevant logs (avoid pasting admin/RCON
        passwords). Operator guides live under <a href="${import.meta.env.BASE_URL}docs/">Docs</a>.
      </p>`,
  },
];
