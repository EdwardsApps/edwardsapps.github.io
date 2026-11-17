# edwardsapps.github.io

The EdwardsApps marketing site — static HTML/CSS/JS served by GitHub Pages from the root of `main`.

- No framework, no build step. Edit the HTML/CSS directly and push.
- Base styles live in `css/style.css`; the shared refresh tokens/overrides are in `css/revamp.css`, loaded last. Product, company and resource compositions have separate scoped stylesheets.
- `js/main.js` handles menus, screenshot enlargement, homepage app previews/filters and pointer spotlights. `js/resources-revamp.js` adds mobile contents controls and reading progress.
- Analytics and the consent controls live in `js/consent.js`; Google Analytics loads only after a visitor accepts analytics.
- Pages: `index.html`, `securibeacon.html`, `crewbook.html`, `crewqci.html`, `studiobooks.html`, `ourspace.html`, `almoner.html`, `services.html`, `about.html`, `enquiry.html`, `privacy.html`, `cookies.html`, plus `404.html`.
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

The header/footer are static HTML on every page. The homepage is the source for their shared template. After intentionally changing its header or footer, run `python scripts/update_site_shell.py` to keep all root pages consistent. It preserves page bodies and specific styles. The former public Keystone demo has been removed.

PDF exports use a temporary local HTTP server to resolve root-relative assets. To reuse an existing Playwright install, set `PLAYWRIGHT_MODULE` to its `index.mjs`; set `PLAYWRIGHT_CHROMIUM` to an installed Chromium/Edge executable when needed.

See `REVAMP-REVIEW.md` for coverage and verification, and `DESIGN-SOURCES.md` for 21st.dev references and attribution.

## Articles

`articles.html` is the article index; `base44-mfa.html` is the first article. Editorial styles are in `css/articles.css`. The MFA screenshots in `img/articles/` show isolated component previews with synthetic accounts, not live customer data. Code excerpts are explanatory, not a drop-in authentication library. Review copy and hosted-platform claims before publication.

## SecuriBeacon screenshots

The four `img/shots/securibeacon-*.png` images are unaltered captures of the working web development client, using isolated demonstration records. They cover the control-room overview, scheduling, officer workspace and client reports on mobile web. The public captions identify them as development screenshots with demonstration data; they do not show released native apps or live customer records. Keep those captions when reusing the images.

## Service status page

`status.html` shows whether the services people rely on are working ("Is it them, or is it me?").

- `status/services.json` is the list of services and how each one is read. After changing it, run `python scripts/status_check.py render` to rebuild the cards inside `status.html` (the pull-request checks fail if the two are out of step).
- `scripts/status_check.py run --data DIR` reads every feed and writes `status.json` (what the page shows) and `history.json` (the record of every problem, used for "Recent problems" and the reliability table).
- `.github/workflows/status-check.yml` stores the two files on the `status-data` branch through `scripts/status_publish.sh`. GitHub's timer often runs late and sometimes skips a slot, so the job is triggered every five minutes and does nothing unless the last check is at least nine minutes old: a check about every ten minutes when the timer behaves. Starting the job by hand always runs a check. The page loads `status.json` straight from that branch, so `main` and the built site are untouched by routine checks. The branch gets a new commit only when a problem starts or ends; routine re-checks replace the latest commit.
- To preview locally: `python scripts/status_check.py run --data .status-preview`, serve the repository, and open `/status.html`. On localhost the page reads `.status-preview/status.json` (git-ignored).
- `python scripts/status_check_test.py` tests the readers with small made-up feeds.
- Most services come from the company's official feed. A few with no feed (X, Netflix, TikTok and the everyday Meta apps) are tested for reachability only, and the cards say so. A reachability test must fail twice running before it shows, and it never shows as a major problem on its own.
- If a company changes its feed, that card shows "Status unavailable" after about an hour and the job log names the feed. Fix the matching `read_…` function in `scripts/status_check.py`.

