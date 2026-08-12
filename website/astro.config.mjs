import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import sitemap from "@astrojs/sitemap";
import { remarkBaseLinks } from "./src/plugins/remark-base-links.mjs";

const siteBase = "/";

/** Canonical public site (`https://getyark.com/` via GitHub Pages custom domain). */
export default defineConfig({
  site: "https://getyark.com",
  base: siteBase,
  trailingSlash: "always",
  vite: {
    // Shared curated changelog lives in the Electron app package (`src/shared`).
    server: {
      fs: {
        allow: [".."],
      },
    },
  },
  server: {
    port: 4321,
  },
  markdown: {
    // Content body links like `/docs/logs/` do not get `base` automatically
    // (Starlight sidebar/prev-next do). Keep authoring root-relative paths.
    remarkPlugins: [remarkBaseLinks(siteBase)],
  },
  integrations: [
    starlight({
      title: "YARK Docs",
      description:
        "Operator docs for YARK — Windows manager for local ARK: Survival Ascended dedicated servers (SteamCMD, backups, mods, INI).",
      // Keep Starlight from injecting its own `/404` — the canonical page is
      // `src/pages/404.astro` → `dist/404.html` for GitHub Pages (#149).
      disable404Route: true,
      favicon: "/favicon.ico",
      logo: {
        src: "./public/favicon-32x32.png",
        alt: "YARK",
        replacesTitle: false,
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/gabomarin/yark",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/gabomarin/yark/edit/main/website/",
      },
      customCss: ["./src/styles/starlight.css"],
      components: {
        Head: "./src/components/starlight/Head.astro",
        ThemeProvider: "./src/components/starlight/ForceDarkTheme.astro",
        ThemeSelect: "./src/components/starlight/EmptyThemeSelect.astro",
        SiteTitle: "./src/components/starlight/SiteTitle.astro",
        SocialIcons: "./src/components/starlight/SocialIcons.astro",
      },
      head: [
        {
          tag: "link",
          attrs: {
            rel: "icon",
            type: "image/png",
            sizes: "32x32",
            href: "/favicon-32x32.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "keywords",
            content:
              "YARK docs, ARK Survival Ascended server manager, ASA SteamCMD, ARK dedicated server backup, ASA mods, ARK Ascended INI",
          },
        },
        {
          tag: "meta",
          attrs: { property: "og:site_name", content: "YARK server manager" },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://getyark.com/screenshots/overview.png",
          },
        },
        {
          tag: "meta",
          attrs: { name: "twitter:card", content: "summary_large_image" },
        },
      ],
      sidebar: [
        {
          label: "Site",
          items: [{ label: "← Product site", link: "/" }],
        },
        {
          label: "Start here",
          items: [
            { label: "Docs overview", link: "/docs/" },
            { label: "Getting started", link: "/docs/getting-started/" },
            { label: "Profiles & ports", link: "/docs/profiles-and-ports/" },
          ],
        },
        {
          label: "Day-to-day operations",
          items: [
            { label: "Start, stop, restart", link: "/docs/lifecycle/" },
            { label: "RCON console", link: "/docs/rcon/" },
            { label: "Updates & SteamCMD", link: "/docs/updates-and-steamcmd/" },
            { label: "Backups", link: "/docs/backups/" },
            { label: "Logs & diagnostics", link: "/docs/logs/" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "INI & configuration assistant", link: "/docs/ini-and-wizard/" },
            { label: "Copy configuration", link: "/docs/copy-configuration/" },
            { label: "Mods", link: "/docs/mods/" },
            { label: "Clusters", link: "/docs/clusters/" },
            { label: "Settings", link: "/docs/settings/" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Troubleshooting", link: "/docs/troubleshooting/" },
            { label: "Security & privacy", link: "/docs/security-privacy/" },
          ],
        },
      ],
    }),
    sitemap({
      serialize(item) {
        return {
          ...item,
          lastmod: new Date(),
        };
      },
    }),
  ],
});
