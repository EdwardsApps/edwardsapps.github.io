"""Synchronise navigation and footer from index.html, preserving page content and assets."""
from pathlib import Path
import re
root = Path(__file__).resolve().parents[1]
source = (root / 'index.html').read_text(encoding='utf-8')
patterns = [r'  <header class="site-header">.*?</header>', r'  <footer class="site-footer">.*?</footer>']
templates = [re.search(pattern, source, re.S).group(0) for pattern in patterns]
for path in sorted(root.glob('*.html')):
    page = path.read_text(encoding='utf-8')
    for pattern, template in zip(patterns, templates):
        shell = re.sub(r' aria-current="page"', '', template)
        shell = shell.replace(f'href="/{path.name}"', f'href="/{path.name}" aria-current="page"')
        page = re.sub(pattern, lambda _: shell, page, flags=re.S)
    path.write_text(page, encoding='utf-8')
print('Shared navigation and footer refreshed across all root pages.')
