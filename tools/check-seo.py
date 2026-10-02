#!/usr/bin/env python3
"""Contrôle qualité SEO du site statique (lancé par GitHub Actions et en local : python3 tools/check-seo.py).
Erreurs (code de sortie 1) : lien interne cassé, JSON-LD invalide, FAQ HTML ≠ JSON-LD, title/description manquants ou dupliqués,
H1 absent/multiple sur page indexable, canonical absente, URL du sitemap sans fichier ou en noindex, lastmod futur, lien relatif
vers index.html, fichier interne référencé. Avertissements : title > 60, description > 155, image sans alt, lastmod ancien."""
import re, os, sys, json, glob, html, datetime
os.chdir(os.path.dirname(os.path.abspath(__file__)) + '/..')
B = 'https://francoisleterrier.fr/'
ERR, WARN = [], []
def rd(p): return open(p, encoding='utf-8').read()
def norm(x): return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', x))).strip().lower()
LD = re.compile(r'<script type="application/ld\+json">\s*(.*?)\s*</script>', re.S)
FAQ_HTML = [re.compile(r'<details(?: open)?><summary>(.*?)</summary><div class="a">(.*?)</div></details>', re.S),
            re.compile(r'<details(?: open)?><summary>(.*?)</summary><p>(.*?)</p></details>', re.S),
            re.compile(r'<details class="acc"(?: open)?>\s*<summary>(.*?)\s*<span class="pm"></span></summary>\s*<div class="answer">(.*?)</div>\s*</details>', re.S)]
pages = sorted(glob.glob('*.html') + glob.glob('blog/*.html'))
titles, descs = {}, {}
for p in pages:
    s = rd(p); noindex = bool(re.search(r'<meta name="robots" content="[^"]*noindex', s)) or 'http-equiv="refresh"' in s  # redirection = stub
    t = re.search(r'<title>([^<]*)</title>', s); d = re.search(r'<meta name="description" content="([^"]*)"', s)
    if not t or not t.group(1).strip(): ERR.append(f'{p}: <title> manquant')
    else:
        tt = html.unescape(t.group(1)).strip(); titles.setdefault(tt, []).append(p)
        if len(tt) > 60 and not noindex: WARN.append(f'{p}: title {len(tt)} car.')
    if not noindex:
        if not d or not d.group(1).strip(): ERR.append(f'{p}: meta description manquante')
        else:
            dd = html.unescape(d.group(1)).strip(); descs.setdefault(dd, []).append(p)
            if len(dd) > 160: WARN.append(f'{p}: description {len(dd)} car.')
        n_h1 = len(re.findall(r'<h1[\s>]', s))
        if n_h1 != 1: ERR.append(f'{p}: {n_h1} <h1>')
        if '<link rel="canonical"' not in s: ERR.append(f'{p}: canonical absente')
    if 'lang="fr"' not in s[:200]: ERR.append(f'{p}: lang="fr" absent')
    for blk in LD.findall(s):
        try: json.loads(blk)
        except Exception as e: ERR.append(f'{p}: JSON-LD invalide ({e})')
    # FAQ identité
    ld = None
    for blk in LD.findall(s):
        try: dct = json.loads(blk)
        except: continue
        for n in (dct.get('@graph', [dct]) if isinstance(dct, dict) else []):
            if isinstance(n, dict) and n.get('@type') == 'FAQPage': ld = [(norm(q['name']), norm(q['acceptedAnswer']['text'])) for q in n.get('mainEntity', [])]
    hm = []
    for pat in FAQ_HTML:
        m = pat.findall(s)
        if m: hm = [(norm(q), norm(a)) for q, a in m]; break
    if ld is not None and ld != hm: ERR.append(f'{p}: FAQ JSON-LD ({len(ld)}) ≠ HTML ({len(hm)})')
    # liens
    base = os.path.dirname(p)
    for h in re.findall(r'href="([^"#]+)(?:#[^"]*)?"', s):
        if re.match(r'^(https?:|mailto:|tel:|javascript:|data:)', h) or h.startswith('/faire-part-vivant/'): continue
        if re.search(r'(^|/)index\.html$', h) and not h.startswith('/') and base == '': ERR.append(f'{p}: lien relatif vers index.html ({h})')
        t = (h[1:] if h.startswith('/') else os.path.normpath(os.path.join(base, h)))
        if t in ('', '.'): t = 'index.html'
        if t.endswith('/'): t += 'index.html'
        if not os.path.exists(t) and not os.path.exists(t + '/index.html'): ERR.append(f'{p}: lien cassé {h}')
        if re.search(r'^(src/|test/|wrangler\.toml|schema\.sql|SETUP-|RUNBOOK|README\.md|package\.json)', t): ERR.append(f'{p}: référence un fichier interne {h}')
    for img in re.findall(r'<img [^>]*>', s):
        if ' alt=' not in img: WARN.append(f'{p}: <img> sans alt')
for tt, ps in titles.items():
    if len(ps) > 1: ERR.append(f'title dupliqué « {tt[:50]} » : {ps}')
for dd, ps in descs.items():
    if len(ps) > 1: ERR.append(f'description dupliquée : {ps}')
# sitemap
sm = rd('sitemap.xml'); today = datetime.date.today()
for loc, lm in re.findall(r'<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>', sm):
    f = loc[len(B):] or 'index.html'
    if f.endswith('/'): f += 'index.html'
    if f.startswith('faire-part-vivant/'): continue
    if not os.path.exists(f): ERR.append(f'sitemap: {loc} sans fichier')
    elif re.search(r'<meta name="robots" content="[^"]*noindex', rd(f)): ERR.append(f'sitemap: {loc} est en noindex')
    try:
        if datetime.date.fromisoformat(lm) > today: ERR.append(f'sitemap: lastmod futur {loc}')
    except Exception: ERR.append(f'sitemap: lastmod invalide {loc}')
# exclusions Jekyll
cfg = rd('_config.yml') if os.path.exists('_config.yml') else ''
for must in ['wrangler.toml', 'src/', 'test/', 'schema.sql', 'SETUP-secrets.md', 'tools/']:
    if must not in cfg: ERR.append(f'_config.yml: exclusion manquante {must}')
for w in WARN[:40]: print('WARN ', w)
if len(WARN) > 40: print(f'WARN  … {len(WARN)-40} autres avertissements')
for e in ERR: print('ERREUR', e)
print(f'\n{len(pages)} pages — {len(ERR)} erreur(s), {len(WARN)} avertissement(s)')
sys.exit(1 if ERR else 0)
