# edwardsapps.github.io

The EdwardsApps marketing site — static HTML/CSS/JS served by GitHub Pages from the root of `main`.

- No framework, no build step. Edit the HTML/CSS directly and push.
- Shared styles live in `css/style.css` (design tokens at the top); the only JS is the mobile nav toggle in `js/main.js`.
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
