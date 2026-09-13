# edwardsapps.github.io

The EdwardsApps marketing site — static HTML/CSS/JS served by GitHub Pages from the root of `main`.

- No framework, no build step. Edit the HTML/CSS directly and push.
- Base styles live in `css/style.css`; the shared refresh tokens/overrides are in `css/revamp.css`, loaded last. Product, company and resource compositions have separate scoped stylesheets.
- `js/main.js` handles menus, screenshot enlargement, homepage app previews/filters and pointer spotlights. `js/resources-revamp.js` adds mobile contents controls and reading progress.
- Analytics and the consent controls live in `js/consent.js`; Google Analytics loads only after a visitor accepts analytics.
- Pages: `index.html`, `crewbook.html`, `crewqci.html`, `studiobooks.html`, `ourspace.html`, `almoner.html`, `services.html`, `about.html`, `enquiry.html`, `privacy.html`, `cookies.html`, plus `404.html`.
- Custom domain: edwardsapps.co.uk (CNAME added once DNS is live at IONOS).
- User guides: `guides.html`, `crewbook-guide.html` and `crewqci-guide.html`, with their own `css/guide.css` and `js/guide.js`. The downloadable PDFs in `downloads/` are printed from those pages — after editing a guide, regenerate them with `npm i --no-save playwright && node scripts/build_guide_pdfs.mjs` and commit the result.

## Preview and checks

Serve the repository locally so root-relative links and the 404 page behave as they do on GitHub Pages:

```sh
python -m http.server 8000
```

Before pushing, run the dependency-free site check and JavaScript syntax checks:

```sh
python scripts/check_site.py
node --check js/main.js
node --check js/consent.js
```

The same checks run automatically for pull requests and changes to `main`.

The header/footer are static HTML on every page. After intentionally changing their template, run `python scripts/update_site_shell.py` to keep all 18 root pages consistent. It preserves page bodies and specific styles. The Keystone demo keeps its own navigation.

PDF exports use a temporary local HTTP server to resolve root-relative assets. To reuse an existing Playwright install, set `PLAYWRIGHT_MODULE` to its `index.mjs`; set `PLAYWRIGHT_CHROMIUM` to an installed Chromium/Edge executable when needed.

See `REVAMP-REVIEW.md` for coverage and verification, and `DESIGN-SOURCES.md` for 21st.dev references and attribution.

## Articles

`articles.html` is the article index; `base44-mfa.html` is the first article. Editorial styles are in `css/articles.css`. The MFA screenshots in `img/articles/` show isolated component previews with synthetic accounts, not live customer data. Code excerpts are explanatory, not a drop-in authentication library. Review copy and hosted-platform claims before publication.
