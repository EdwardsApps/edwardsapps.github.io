# edwardsapps.github.io

The EdwardsApps marketing site — static HTML/CSS/JS served by GitHub Pages from the root of `main`.

- No framework, no build step. Edit the HTML/CSS directly and push.
- Base styles live in `css/style.css`; the shared refresh tokens/overrides are in `css/revamp.css`, loaded last. Product, company and resource compositions have separate scoped stylesheets.
- `js/main.js` handles menus, screenshot enlargement, homepage app previews/filters and pointer spotlights. `js/resources-revamp.js` adds mobile contents controls and reading progress.
- Analytics and the consent controls live in `js/consent.js`; Google Analytics loads only after a visitor accepts analytics.
- Pages: `index.html`, `securibeacon.html`, `crewbook.html`, `crewqci.html`, `studiobooks.html`, `ourspace.html`, `almoner.html`, `services.html`, `about.html`, `enquiry.html`, `privacy.html`, `cookies.html`, plus `404.html`.
- Custom domain: edwardsapps.co.uk (CNAME added once DNS is live at IONOS).
- User guides: `guides.html` and one `<app>-guide.html` per app (`securibeacon`, `crewbook`, `crewqci`, `studiobooks`, `ourspace`, `almoner`), with their own `css/guide.css` and `js/guide.js`. The downloadable PDFs in `downloads/` are printed from those pages — after editing a guide, regenerate its PDF with `npm i --no-save playwright && node scripts/build_guide_pdfs.mjs <app>-guide.html` (no page name rebuilds them all) and commit the result. A new guide also needs a line in that script's `GUIDES` list, a card on `guides.html` and an entry in `sitemap.xml`.

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
- `scripts/status_publish.sh` runs a check and stores the two files on the `status-data` branch. The page loads `status.json` straight from that branch, so `main` and the built site are untouched by routine checks. The branch gets a new commit only when a problem starts or ends; routine re-checks replace the latest commit. A check only stores its readings if the branch is still as it found it, so two checks that overlap cannot overwrite each other.
- **What starts the checks.** GitHub's scheduler did not fire once in the hours after the page went live, so the checks do not rely on it. `.github/workflows/status-timer.yml` ("Status timer") keeps itself going: each run waits, starts the next run, then checks the services. The wait is a wait timer on a GitHub environment, so no runner is used while it waits. There are two timers so that each can restart the other: `fast` (environment `status-timer-fast`, 10 minutes) keeps the page fresh, and `slow` (environment `status-timer-slow`, 180 minutes) is far enough apart in time that one GitHub outage rarely catches both. The rules are in `scripts/status_timer.py` and tested by `python scripts/status_timer_test.py`: a run that did not really wait starts nothing, an older run gives way to a newer run of the same timer, stuck runs are ignored, and nothing starts when too many runs are going.
- The two waits are settings on those environments (repository Settings > Environments), not files in the repository. Do not delete the environments or their wait timers: without the wait, each run refuses to start the next and the checks stop.
- `.github/workflows/status-check.yml` ("Status check") is the safety net. It runs when GitHub's scheduler does fire, on every push to `main`, and when started by hand. It checks the services if the last check is more than 14 minutes old (always, when started by hand), then starts either timer if it has stopped.
- To stop the checks, disable the "Status timer" workflow in the Actions tab; the runs that are waiting then fail to start their successors and the chain ends. To start them again, enable it and run "Status check" by hand. `GITHUB_REPOSITORY=EdwardsApps/edwardsapps.github.io GITHUB_TOKEN="$(gh auth token)" python scripts/status_timer.py show` prints what is running.
- To preview locally: `python scripts/status_check.py run --data .status-preview`, serve the repository, and open `/status.html`. On localhost the page reads `.status-preview/status.json` (git-ignored).
- `python scripts/status_check_test.py` tests the readers with small made-up feeds.
- HMRC's service pages say "Full service available" even while they list a fault. An entry under "Service issues" counts as a problem only when it is worded as a fault HMRC is working on and the page's own change notes show the issues changed in the last 30 days without being resolved; otherwise it stays a footnote on the card, because HMRC leaves some "under investigation" notes up for years.
- The social images (`img/status-social-v1.png`, 1200×630, used as the page's link preview, and `img/status-social-square-v1.png`, 1080×1080) are screenshots of `scripts/status-social.html` at those window sizes, taken with headless Chromium while the repository is served locally. The readings on them are the real ones from launch night. Give a changed image a new filename.
- Most services come from the company's official feed. A few with no feed (X, Netflix, TikTok and the everyday Meta apps) are tested for reachability only, and the cards say so. A reachability test must fail twice running before it shows, and it never shows as a major problem on its own.
- If a company changes its feed, that card shows "Status unavailable" after about an hour and the job log names the feed. Fix the matching `read_…` function in `scripts/status_check.py`.

