# EdwardsApps refresh — 13 September 2026

## Coverage

| Area | Pages |
| --- | --- |
| Home | index.html |
| Products | crewbook.html, crewqci.html, studiobooks.html, ourspace.html, almoner.html |
| Company | services.html, about.html, enquiry.html |
| Resources | articles.html, base44-mfa.html, base44-mfa-guide.html, guides.html, crewbook-guide.html, crewqci-guide.html |
| Utility | privacy.html, cookies.html, 404.html |
| Demo | keystone-demo/index.html |

## Changes

- Shared app menu, resource navigation and footer on all 18 root pages.
- Homepage with a keyboard-accessible five-app screenshot switcher and audience filters.
- Product screenshot stages, workflow summaries, section navigation, feature cards and pricing layouts.
- Company compositions, clearer enquiry form grouping and readable legal navigation.
- Editorial covers, mobile contents controls, guide search styling and reading progress.
- Additive visual refresh of the existing interactive Keystone demo.
- Regenerated CrewBook and CrewQCI guide PDFs using final site styles.

## Verification

- Site structural check: all 18 root pages pass metadata, JSON-LD, image alt, duplicate ID and internal link/fragment checks.
- JavaScript syntax checks cover main, consent, guide, enquiry, MFA-guide, resource, Keystone demo and PDF export scripts.
- Browser layout sweep: 19 routes at 1440, 390 and 320 CSS pixels, 57 combinations. No page overflow or out-of-bounds main headings, copy, figures or grids. Real image references resolved; the empty image reserved for the closed screenshot dialog is not a broken asset.
- Browser interactions: all five app previews; arrow selection and Tab into the selected app link; all four audience filters, returning 5/3/1/1 products; mobile menu and Escape; desktop menu closes when focus leaves; named screenshot dialog opens/closes and restores focus.
- Mobile guide contents expansion, matching and empty guide-search results, and successful Builder-prompt copy confirmation.
- Required-field validity and original form contracts retained. No test enquiry sent to the live service.
- Consent controls retained; local preview used decline analytics. No new analytics/data collection.
- All original product main-content segments, links and images retained; all 72 company-page paragraphs retained; legal copy unchanged. Four longform article/guide bodies retained byte for byte.
- PDFs: CrewBook 73 pages, CrewQCI 86 pages. All 59 chapter headings retained. Rendered cover/interior pages inspected; no empty pages or detected text-edge clipping.

## Release boundary

Prepared in an isolated copy of the existing checkout. Pre-existing article discovery/social assets were preserved in a baseline commit before the redesign. The canonical working copy was not overwritten.

These are local checks. Production publication and real enquiry delivery are separate. See `DESIGN-SOURCES.md` for 21st.dev provenance.
