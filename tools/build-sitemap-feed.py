#!/usr/bin/env python3
"""Met à jour le lastmod du sitemap depuis la date du dernier commit de chaque fichier, et génère feed.xml (RSS) depuis les BlogPosting."""
import re, os, json, glob, subprocess, html, datetime
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
B = 'https://francoisleterrier.fr/'
def rd(p): return open(p, encoding='utf-8').read()
def gitdate(f):
    try: return subprocess.check_output(['git', 'log', '-1', '--format=%cs', '--', f], text=True).strip() or None
    except Exception: return None
sm = rd('sitemap.xml'); n = 0
def repl(m):
    global n
    loc, old = m.group(1), m.group(2); f = loc[len(B):] or 'index.html'
    if f.endswith('/'): f += 'index.html'
    d = gitdate(f) if os.path.exists(f) else None
    if d and d != old: n += 1; return f'<loc>{loc}</loc><lastmod>{d}</lastmod>'
    return m.group(0)
sm = re.sub(r'<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>', repl, sm)
open('sitemap.xml', 'w', encoding='utf-8').write(sm); print(f'sitemap : {n} lastmod mis à jour depuis git')
items = []
for f in sorted(glob.glob('blog/*.html')):
    if f.endswith('index.html'): continue
    s = rd(f)
    for blk in re.findall(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', s, re.S):
        try: d = json.loads(blk)
        except: continue
        for nd in (d.get('@graph', [d]) if isinstance(d, dict) else []):
            if isinstance(nd, dict) and nd.get('@type') == 'BlogPosting':
                items.append((nd.get('datePublished', '')[:10], nd.get('headline', ''), B + f, nd.get('description', '')))
items.sort(reverse=True)
def rfc(d):
    try: return datetime.datetime.strptime(d, '%Y-%m-%d').strftime('%a, %d %b %Y 09:00:00 +0200')
    except Exception: return ''
rss = '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n<channel>\n<title>François Leterrier — Blog : réseaux sociaux, Google &amp; site internet</title>\n<link>' + B + 'blog/</link>\n<atom:link href="' + B + 'feed.xml" rel="self" type="application/rss+xml"/>\n<description>Conseils pratiques pour les artisans, commerçants et indépendants de Toulouse et du Sud-Toulousain.</description>\n<language>fr-FR</language>\n'
for d, t, u, desc in items:
    rss += f'<item>\n<title>{html.escape(t)}</title>\n<link>{u}</link>\n<guid isPermaLink="true">{u}</guid>\n<pubDate>{rfc(d)}</pubDate>\n<description>{html.escape(desc)}</description>\n</item>\n'
rss += '</channel>\n</rss>\n'
open('feed.xml', 'w', encoding='utf-8').write(rss); print(f'feed.xml : {len(items)} articles')
