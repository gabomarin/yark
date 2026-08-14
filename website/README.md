# YARK website (Astro + Starlight)

Canonical GitHub Pages site for [gabomarin/yark](https://github.com/gabomarin/yark).

**Live:** https://getyark.com/

## Local preview

```bash
cd website
npm install
npm run dev
```

Open **http://localhost:4321/** (`base: "/"` matches getyark.com).

From repo root: `npm run website:dev` / `npm run website:build`.

## What’s included

- Marketing: home, FAQ, changelog (Lenis + Motion on wide desktop pointers only)
- Docs: Starlight under `/docs/` (dark-only, sidebar, Pagefind search)
- Canonical `src/pages/404.astro` → `dist/404.html` (GitHub Pages); Starlight `disable404Route` avoids a duplicate `/404` warning (#149)
- Download URL from root `package.json` version
- SEO: canonical, Open Graph, Twitter, JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList), `robots.txt`, sitemap with `lastmod`
- Optional Cloudflare Web Analytics via `PUBLIC_CF_WEB_ANALYTICS_TOKEN` (see `docs/website.md`)
- Home screenshots: responsive WebP at build (`public/media/`, not committed)

## Deploy

`.github/workflows/pages.yml` builds this package and uploads `dist/` on pushes to `main`.
