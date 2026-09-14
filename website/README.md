# YARK website (Astro + Starlight)

Canonical Cloudflare Pages site for [gabomarin/yark](https://github.com/gabomarin/yark).

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
- Canonical `src/pages/404.astro` → `dist/404.html` (Cloudflare Pages); Starlight `disable404Route` avoids a duplicate `/404` warning (#149)
- Download URL from root `package.json` version
- SEO: canonical, Open Graph, Twitter, JSON-LD (SoftwareApplication, FAQPage, BreadcrumbList), `robots.txt`, sitemap with `lastmod`
- Home screenshots: responsive WebP at build (`public/media/`, not committed)

## Deploy

`.github/workflows/pages.yml` builds this package and uploads `website/dist` to the Cloudflare Pages project **`getyark`** on pushes to `main`.

Required Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
