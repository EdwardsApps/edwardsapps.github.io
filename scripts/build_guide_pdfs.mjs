#!/usr/bin/env node
/* Regenerates the committed guide PDFs from the guide pages themselves, so the
   web page and the download can never drift apart. The layout is the pages'
   own @media print rules in css/guide.css.

   Run from the repository root:

     npm i --no-save playwright   # once; skip if playwright is already available
     node scripts/build_guide_pdfs.mjs

   Set PLAYWRIGHT_BROWSERS_PATH or PLAYWRIGHT_CHROMIUM if Chromium lives
   somewhere Playwright wouldn't find on its own. */

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const GUIDES = [
  { page: 'crewbook-guide.html', pdf: 'downloads/crewbook-user-guide.pdf', title: 'CrewBook user guide' },
  { page: 'crewqci-guide.html', pdf: 'downloads/crewqci-user-guide.pdf', title: 'CrewQCI user guide' },
];

const { chromium } = await import('playwright');

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
});

try {
  await mkdir(path.join(ROOT, 'downloads'), { recursive: true });
  const page = await browser.newPage();

  for (const guide of GUIDES) {
    const url = pathToFileURL(path.join(ROOT, guide.page)).href;
    await page.goto(url, { waitUntil: 'networkidle' });

    // page.pdf() doesn't fire beforeprint, so open the accordions here and
    // drop the consent banner — neither belongs in the document.
    await page.evaluate(() => {
      document.querySelectorAll('details').forEach((d) => { d.open = true; });
      document.querySelectorAll('.consent-banner').forEach((el) => el.remove());
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
  await browser.close();
}
