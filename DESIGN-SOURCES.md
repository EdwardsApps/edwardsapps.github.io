# Design references

The September 2026 refresh retains EdwardsApps' wordmark, real product screenshots, Poppins fonts and charcoal/green/lime identity. It remains static HTML/CSS/JavaScript with no new production dependencies.

These components were searched and retrieved through the connected 21st.dev catalog on 13 September 2026:

- [Feature Grid Spotlight Cards by Hirael / Mohammad Shehadeh](https://21st.dev/@hirael/components/feature-08), demo 26797. The pointer-relative radial spotlight was adapted to native event listeners and CSS custom properties in `js/main.js` and `css/revamp.css`. It runs only for a fine pointer when reduced motion is not requested. Original attribution: MIT, Mohammad Shehadeh; [source repository](https://github.com/MohammadShehadeh/hirael).
- [Bento Grid by kokonutd](https://21st.dev/@kokonutd/components/bento-grid), demo 622. Visual reference for asymmetric card spans, restrained hover elevation, status labels and compact metadata. The site's static markup/CSS was authored for its own content; the sample React component was not installed.

All screenshots and logos are existing site assets. No synthetic customer statistics or testimonials were added. Example security screens remain article examples.

## Second pass: a wider catalog search

The second pass searched the full 21st.dev catalog for interactive product showcases, command palettes, grid/beam backgrounds and editorial timelines. It did not limit discovery to saved or liked components. Full component source was retrieved for the references below before adapting their useful ideas to this site's content:

- [Preview Switch Hero by ruixen.ui](https://21st.dev/@ruixen.ui/components/preview-switch-hero), demo 13448: large topic rail and stable product preview. Informed the full-width homepage app workbench and five product showrooms. The original implementation uses real existing screenshots, accessible tabs and direct links; no pinned scrolling or extra blank scroll track.
- [Command Palette by Rafa Porto](https://21st.dev/@rafa-porto/components/command-palette), demo 2075: grouped search and keyboard navigation. Informed the native site-search dialog, which filters 17 real destinations by app, task or topic without a server, search history or fake assistant responses.
- [Background Grid Beam by minhxthanh](https://21st.dev/@minhxthanh/components/background-grid-beam), demo 3202: a quiet directional light over a grid. Informed an original SVG/CSS line treatment in the homepage background, with one finite animation and reduced-motion support.
- [Timeline by manuarora700](https://21st.dev/@manuarora700/components/timeline), demo 857: editorial chapters alongside a sticky progress rail. Informed the About journey, using the existing story and chapter artwork.
- [Code Block by ayushmxxn](https://21st.dev/@ayushmxxn/components/code-block), demo 1361: source selection and a copy toolbar. Informed the article/Builder code workbench with exact copying, excerpt switching and line wrapping.
- [Table of Contents by Hirael](https://21st.dev/@hirael/components/toc), demo 18113: a compact active section rail. Informed the refined reading navigation and progress treatment.

The brief builder, local draft handoff, reading preferences and all new interactions are original native HTML/CSS/JavaScript implementations. No React, animation library, code-highlighting dependency or remote rendering service was added.

## Hirael MIT notice

Copyright (c) Mohammad Shehadeh

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
