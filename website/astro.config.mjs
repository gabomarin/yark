import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

// Parallel preview site — does not replace `website/` or GitHub Pages yet.
// When cutover happens, set base: "/yark" for project Pages.
export default defineConfig({
  // Project Pages URL (artifact root mounts at /yark). Local preview still uses base "/".
  site: "https://gabomarin.github.io/yark",
  base: "/yark",
  trailingSlash: "always",
  server: {
    port: 4321,
  },
  integrations: [
    starlight({
      title: "YARK Docs",
      description:
        "Operator docs for YARK — Windows manager for local ARK: Survival Ascended dedicated servers (SteamCMD, backups, mods, INI).",
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
            href: "/yark/favicon-32x32.png",
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
            content: "https://gabomarin.github.io/yark/screenshots/overview.png",
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
            { label: "Updates & SteamCMD", link: "/docs/updates-and-steamcmd/" },
            { label: "Backups", link: "/docs/backups/" },
            { label: "Logs & diagnostics", link: "/docs/logs/" },
          ],
        },
        {
          label: "Configuration",
          items: [
            { label: "INI & configuration assistant", link: "/docs/ini-and-wizard/" },
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
  ],
});
