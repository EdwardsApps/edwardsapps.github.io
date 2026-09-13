#!/usr/bin/env node
/* Regenerates the committed guide PDFs from the guide pages themselves, so the
   web page and the download can never drift apart. The layout is the pages'
   own @media print rules in css/guide.css.

   Run from the repository root:

     npm i --no-save playwright   # once; skip if playwright is already available
     node scripts/build_guide_pdfs.mjs

   Set PLAYWRIGHT_BROWSERS_PATH or PLAYWRIGHT_CHROMIUM if Chromium lives
   somewhere Playwright wouldn't find on its own. PLAYWRIGHT_MODULE can point
   to an existing Playwright entry module to reuse a local installation. */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GUIDES = [
  { page: 'crewbook-guide.html', pdf: 'downloads/crewbook-user-guide.pdf', title: 'CrewBook user guide' },
  { page: 'crewqci-guide.html', pdf: 'downloads/crewqci-user-guide.pdf', title: 'CrewQCI user guide' },
];

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href
  : 'playwright');

// A private temporary origin resolves root-relative styles, scripts and images
// exactly as GitHub Pages does. file:// would resolve /css/ at the drive root.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.png': 'image/png',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.resolve(ROOT, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;

try {
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  });
  await mkdir(path.join(ROOT, 'downloads'), { recursive: true });
  const page = await browser.newPage();

  for (const guide of GUIDES) {
    const url = `${origin}/${guide.page}`;
    await page.goto(url, { waitUntil: 'networkidle' });

    // page.pdf() doesn't fire beforeprint, so open the accordions here and
    // drop the consent banner — neither belongs in the document.
    await page.evaluate(async () => {
      document.querySelectorAll('details').forEach((d) => { d.open = true; });
      document.querySelectorAll('.consent-banner').forEach((el) => el.remove());
      document.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (img) => img.decode().catch(() => {})));
    });

    const out = path.join(ROOT, guide.pdf);
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '13mm', right: '13mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%; padding:0 13mm; font-size:8px; color:#666; ' +
        'font-family:system-ui,sans-serif; display:flex; justify-content:space-between;">' +
        `<span>${guide.title} — edwardsapps.co.uk</span>` +
        '<span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>',
      tagged: true,
      outline: true,
    });
    console.log(`Wrote ${guide.pdf}`);
  }
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
