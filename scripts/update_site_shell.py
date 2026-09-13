"""Keep the static site's navigation and footer identical on every page."""
from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
apps = [('crewbook','CrewBook','Contractor operations'),('crewqci','CrewQCI','Quotes, contracts & invoices'),('studiobooks','Studiobooks','The studio back office'),('ourspace','OurSpace','Life, shared'),('almoner','Almoner','Charity governance')]

for path in sorted(root.glob('*.html')):
    source = path.read_text(encoding='utf-8')
    def link(href, label, cls=''):
        current = ' aria-current="page"' if path.name == href else ''
        classattr = f' class="{cls}"' if cls else ''
        return f'<a href="/{href}"{classattr}{current}>{label}</a>'
    appitems = '\n'.join(f'<a href="/{key}.html"'+(' aria-current="page"' if path.stem == key else '')+f'><img src="/img/product-{key}.png" alt="" width="40" height="40"><strong>{label}</strong><span>{desc}</span></a>' for key,label,desc in apps)
    nav = f'''  <header class="site-header">
    <nav class="nav" aria-label="Main">
      <a class="brand" href="/"><img src="/img/logo.png" alt="EdwardsApps" width="437" height="68"></a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-links">Menu</button>
      <ul id="nav-links" class="nav-links">
        <li><details class="nav-apps"><summary>Our apps</summary><div class="nav-apps-panel"><div class="nav-app-grid">{appitems}</div><a class="nav-app-help" href="/index.html#products-heading"><span>Not sure which fits? Explore the collection.</span><span aria-hidden="true">↗</span></a></div></details></li>
        <li>{link('services.html','Custom builds')}</li>
        <li>{link('articles.html','Articles')}</li>
        <li>{link('guides.html','Guides')}</li>
        <li>{link('about.html','About')}</li>
        <li>{link('enquiry.html','Let’s talk <span aria-hidden="true">↗</span>','nav-cta')}</li>
      </ul>
    </nav>
  </header>'''
    source = re.sub(r'  <header class="site-header">.*?</header>', lambda _: nav, source, flags=re.S)
    source = re.sub(r'<aside class="articles-discovery".*?</aside>', '<aside class="articles-discovery" aria-label="Latest from the studio"><a href="/building-keystone-sg.html"><span>From the workbench</span><span class="articles-discovery-detail">Building Keystone SG — and the app it inspired</span><span aria-hidden="true">↗</span></a></aside>', source, flags=re.S)
    footer = f'''  <footer class="site-footer">
    <div class="wrap footer-grid">
      <div class="footer-brand"><a href="/" aria-label="EdwardsApps home"><img src="/img/logo.png" alt="EdwardsApps" width="437" height="68"></a><p>Practical software.<br>Built from the inside.</p><p class="footer-note">An independent studio by Peter Edwards.</p></div>
      <nav aria-label="Products"><h3>The apps</h3><ul>{''.join('<li>'+link(key+'.html',label)+'</li>' for key,label,_ in apps)}</ul></nav>
      <nav aria-label="Studio"><h3>The studio</h3><ul><li>{link('services.html','Custom builds')}</li><li>{link('about.html','About Peter')}</li><li>{link('enquiry.html','Start a conversation')}</li><li><a href="https://www.edwardssurfacing.co.uk" rel="noopener">Edwards Surfacing ↗</a></li></ul></nav>
      <nav aria-label="Resources"><h3>Useful things</h3><ul><li>{link('articles.html','Articles & build notes')}</li><li>{link('guides.html','User guides')}</li><li>{link('base44-mfa-guide.html','Base44 MFA guide')}</li><li><a href="mailto:peter@edwardsapps.co.uk">Email Peter ↗</a></li></ul></nav>
    </div>
    <div class="wrap"><div class="footer-signoff"><p class="fineprint">© 2026 EdwardsApps. Built with care, for real work.</p><p class="fineprint">{link('privacy.html','Privacy')} · {link('cookies.html','Cookies')} · <a href="#" data-consent-settings>Cookie settings</a></p></div></div>
  </footer>'''
    source = re.sub(r'  <footer class="site-footer">.*?</footer>', lambda _: footer, source, flags=re.S)
    source = re.sub(r'\s*<link rel="stylesheet" href="/?css/revamp.css(?:\?[^\"]*)?">', '', source)
    # Keep per-page second-pass styles between the shared foundation and finish.
    source = re.sub(r'\s*<link rel="stylesheet" href="/?css/elevate.css(?:\?[^\"]*)?">', '', source)
    extra = re.findall(r'\s*<link rel="stylesheet" href="/?css/resources-elevate.css(?:\?[^\"]*)?">', source)
    source = re.sub(r'\s*<link rel="stylesheet" href="/?css/resources-elevate.css(?:\?[^\"]*)?">', '', source)
    source = source.replace('</head>', '  <link rel="stylesheet" href="/css/revamp.css?v=2">\n' + ''.join(extra) + '\n  <link rel="stylesheet" href="/css/elevate.css?v=2">\n</head>')
    source = re.sub(r'src="(/?js/main.js)(?:\?[^\"]*)?"', 'src="/js/main.js?v=3"', source)
    source = re.sub(r'\s*<script src="/?js/command-menu.js(?:\?[^\"]*)?"(?: defer)?></script>', '', source)
    source = source.replace('</body>', '  <script src="/js/command-menu.js?v=3" defer></script>\n</body>')
    source = source.replace('content="#12161D"', 'content="#111813"')
    path.write_text(source, encoding='utf-8')
print('Shared shell refreshed across all root pages.')
