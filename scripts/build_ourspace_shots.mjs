#!/usr/bin/env node
/* Rebuilds the OurSpace screenshots on ourspace.html and index.html from the
   capture set OurSpace produces, so the site can be refreshed in one command
   whenever the app is re-shot.

   Two sources, because the capture set has two halves:

     PHONES  the high-DPI captures in the OurSpace repo (1080 x 2433), copied
             through as-is apart from a re-encode.
     DESKTOP the 1440 x 1000 captures in OneDrive. Pages that scrolled were
             written out 15px narrower with the scrollbar drawn in, so those
             get the strip cropped off before the resize.

   Run from the repository root:

     npm i --no-save sharp        # once; skip if sharp is already available
     node scripts/build_ourspace_shots.mjs

   Override either source with OURSPACE_REPO / OURSPACE_CAPTURES. */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'img', 'shots');

const PHONES = path.join(
  process.env.OURSPACE_REPO ?? 'C:/Users/Peter/projects/our-space',
  'public/shots/v2/light');
const DESKTOP = path.join(
  process.env.OURSPACE_CAPTURES ??
    'C:/Users/Peter/OneDrive - Edwards Surfacing/Apps/OurSpace/OurSpace Screenshots/ourspace-page-screenshots-2026-08-29/2026-08-29',
  'desktop-light');

/* The capture set also holds board.webp and kids.webp. Neither is used: the
   kids page was shot on an empty week, and the board had nowhere to go in an
   eight-up grid. Add them here if a future set is worth showing. */
const PHONE_PAGES = ['home', 'calendar', 'lists', 'meals',
  'finance', 'budget', 'contracts', 'birthdays'];
const DESKTOP_PAGES = ['home', 'calendar', 'finance', 'meals'];

/* The hero: three phones staged on the app's purple, each bleeding off the
   bottom edge. Positions are in the finished image's own 1400 x 840 space. */
const HERO = { width: 1400, height: 840, scale: 2, radius: 18 };
const HERO_PHONES = [
  { page: 'calendar', left: 108, top: 185, width: 350 },
  { page: 'home', left: 502, top: 68, width: 396 },
  { page: 'lists', left: 940, top: 185, width: 352 },
];

const kb = (n) => `${Math.round(n / 1024)}KB`;

for (const page of PHONE_PAGES) {
  const to = path.join(OUT, `ourspace-${page}.webp`);
  const { width, height, size } = await sharp(path.join(PHONES, `${page}.webp`))
    .webp({ quality: 80 })
    .toFile(to);
  console.log(`phone   ourspace-${page}.webp ${width}x${height} ${kb(size)}`);
}

for (const page of DESKTOP_PAGES) {
  const from = path.join(DESKTOP, `${page}.png`);
  const meta = await sharp(from).metadata();
  const bar = meta.width < 1440 ? 15 : 0;   // scrollbar strip on pages that scrolled
  const to = path.join(OUT, `ourspace-desktop-${page}.webp`);
  const { width, height, size } = await sharp(from)
    .extract({ left: 0, top: 0, width: meta.width - bar, height: meta.height })
    .resize({ width: 1400 })
    .webp({ quality: 82 })
    .toFile(to);
  console.log(`desktop ourspace-desktop-${page}.webp ${width}x${height} ${kb(size)}`);
}

{
  const S = HERO.scale;
  const W = HERO.width * S, H = HERO.height * S, R = HERO.radius * S;
  const staged = HERO_PHONES.map((p) => ({
    page: p.page,
    x: p.left * S,
    y: p.top * S,
    w: p.width * S,
    h: H - p.top * S,
  }));

  /* Background and all three drop shadows in one rasterise: pushing three
     full-canvas buffers through sharp's own blur is an order slower. */
  const background = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5b1c88"/>
      <stop offset="0.45" stop-color="#452a8b"/>
      <stop offset="1" stop-color="#1d3a89"/>
    </linearGradient>
    <radialGradient id="v" cx="0.5" cy="0.45" r="0.75">
      <stop offset="0" stop-color="#000000" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="${11 * S}"/>
    </filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#v)"/>
  <g filter="url(#s)" fill="#000" fill-opacity="0.45">
    ${staged.map((p) => `<rect x="${p.x}" y="${p.y + 12 * S}" width="${p.w}" height="${p.h}" rx="${R}" ry="${R}"/>`).join('\n    ')}
  </g>
</svg>`);

  const layers = [];
  for (const p of staged) {
    const shot = await sharp(path.join(PHONES, `${p.page}.webp`))
      .resize({ width: p.w })
      .toBuffer();
    const body = await sharp(shot)
      .extract({ left: 0, top: 0, width: p.w, height: p.h })
      .composite([{
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${p.w}" height="${p.h}">
          <rect width="${p.w}" height="${p.h}" rx="${R}" ry="${R}" fill="#fff"/></svg>`),
        blend: 'dest-in',
      }])
      .png()
      .toBuffer();
    layers.push({ input: body, left: p.x, top: p.y });
  }

  // sharp resizes before it composites, so the downsample needs its own pass.
  const composed = await sharp(background).composite(layers).png().toBuffer();
  const { width, height, size } = await sharp(composed)
    .resize({ width: HERO.width, height: HERO.height })
    .webp({ quality: 84 })
    .toFile(path.join(OUT, 'ourspace-hero.webp'));
  console.log(`hero    ourspace-hero.webp ${width}x${height} ${kb(size)}`);
}
