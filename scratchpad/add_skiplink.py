#!/usr/bin/env python3
# Ajoute un lien d'evitement (skip link) accessible en tete de chaque page.
import re, glob, io, os

ROOT="/home/user/francoisleterrier-lab.github.io/"
SKIP_INLINE_STYLE=('<style>.skiplink{position:absolute;left:-9999px;top:0;z-index:9999;'
  'background:#fff;color:#060410;padding:10px 16px;border-radius:0 0 10px 0;font-weight:600;'
  'text-decoration:none;box-shadow:0 4px 16px rgba(0,0,0,.35)}.skiplink:focus{left:0}'
  '.skiplink:focus-visible{outline:3px solid #7c5cff;outline-offset:2px}</style>\n')

def resolve_target(c):
    m=re.search(r'<main\b([^>]*)>',c)
    if m:
        idm=re.search(r'\bid="([^"]+)"',m.group(1))
        if idm: return c, idm.group(1)
        return c[:m.start()]+'<main id="contenu"'+m.group(1)+'>'+c[m.end():], "contenu"
    m=re.search(r'<section\b([^>]*)>',c)
    if m:
        idm=re.search(r'\bid="([^"]+)"',m.group(1))
        if idm: return c, idm.group(1)
        return c[:m.start()]+'<section id="contenu"'+m.group(1)+'>'+c[m.end():], "contenu"
    m=re.search(r'<div class="(box|wrap)"',c)
    if m:
        return c[:m.start()]+'<div id="contenu" class="'+m.group(1)+'"'+c[m.end():], "contenu"
    return c, None

def process(fn):
    base=os.path.basename(fn)
    if base=="audit-seo-gratuit.html":
        return "skip(redirect): "+base
    with io.open(fn,encoding="utf-8") as f: c=f.read()
    # retire l'ancien skip link generateur (bug : reste hors-ecran meme au focus)
    c=re.sub(r'\s*<a class="skip" href="#[^"]+" style="[^"]*">Aller au contenu</a>','',c)
    if 'class="skiplink"' in c:
        return "skip(existant): "+base
    if '<body>' not in c:
        return "ERR no <body>: "+base
    c,target=resolve_target(c)
    if not target:
        return "ERR no target: "+base
    # injecte le CSS inline si ni aurora.css ni commune.css
    if 'aurora.css' not in c and 'commune.css' not in c:
        c=c.replace("</head>",SKIP_INLINE_STYLE+"</head>",1)
    c=c.replace("<body>",'<body>\n  <a class="skiplink" href="#%s">Aller au contenu</a>'%target,1)
    with io.open(fn,"w",encoding="utf-8") as f: f.write(c)
    return "OK -> #%s : %s"%(target,base)

out=[process(fn) for fn in sorted(glob.glob(ROOT+"*.html"))]
# aussi les sous-dossiers (blog, modeles)
for sub in ["blog/*.html","modeles/*.html"]:
    for fn in sorted(glob.glob(ROOT+sub)):
        out.append(process(fn))
for line in out: print(line)
ok=len([o for o in out if o.startswith("OK")])
print("\nOK: %d | skip: %d | err: %d"%(ok,len([o for o in out if o.startswith('skip')]),len([o for o in out if o.startswith('ERR')])))
