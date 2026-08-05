#!/usr/bin/env python3
# Ajoute une section FAQ localisée (bloc visible .cfaq + JSON-LD FAQPage)
# aux pages villes qui ne l'ont pas encore, en calquant les 8 pages de reference.
# Aucun fait geographique nouveau : uniquement des faits business vrais sur tout
# le site (290 EUR/mois sans engagement ; site vitrine des 590 EUR, ref-local inclus ;
# sur place ou a distance ; 06 98 20 02 08 ; premier echange offert).
import re, sys, io, html

ROOT = "/home/user/francoisleterrier-lab.github.io/"

CM = ["auterive","carbonne","cazeres","cugnaux","eaunes","fonsorbes","frouzins",
      "labarthe-sur-leze","lavernose-lacasse","le-fauga","lezat-sur-leze","lherm",
      "longages","muret","noe","portet-sur-garonne","rieumes","roquettes",
      "saint-lys","saubens","seysses","villeneuve-tolosane"]
CREA = CM[:]  # meme liste de communes

VOWELS = "AEIOUYÉÈÊÀÂÎÏÔÛ"

def prepos(name, slug):
    """retourne (a, de) : ex ('a Auterive','d\\'Auterive'), ('au Fauga','du Fauga')"""
    if slug == "le-fauga":
        return ("au Fauga", "du Fauga")
    a = "à " + name
    de = ("d'" + name) if name[0] in VOWELS else ("de " + name)
    return (a, de)

def tagname(content):
    m = re.search(r'<span class="tagloc">([^·<]+?)\s*·', content)
    return m.group(1).strip() if m else None

# ---- pools de Q/R (V = "a X"/"au Fauga" ; DE = "de X"/"d'X"/"du Fauga") ----
CM_POOL = [
 ("Est-ce vraiment utile de gérer mes réseaux sociaux quand mon activité est {V} ?",
  "Oui : une présence régulière sur Facebook, Instagram et Google Business vous garde visible auprès de vos clients {V} et des communes voisines. Je m'occupe des visuels et des textes pour vous, dès 290 € par mois et sans engagement."),
 ("Combien coûte la gestion de mes réseaux sociaux {V}, et suis-je engagé ?",
  "La gestion de vos réseaux démarre à 290 € par mois, sans engagement : vous restez libre d'arrêter quand vous le souhaitez. Le premier échange est offert pour cadrer une présence adaptée à votre activité {V}."),
 ("Travaillez-vous sur place {V} ou à distance pour animer mes réseaux ?",
  "Les deux, selon votre préférence : je peux vous rencontrer {V} ou gérer vos publications entièrement à distance. Dans tous les cas, vous gardez un seul interlocuteur, joignable directement au 06 98 20 02 08."),
 ("Combien de publications par mois prévoyez-vous pour un commerce {V} ?",
  "En général 2 à 4 publications par mois : un rythme régulier qui vous garde présent dans l'esprit de vos clients sans les lasser. Le contenu — visuels et textes — est créé pour vous, à partir de 290 € par mois et sans engagement."),
 ("Je débute sur les réseaux {V} : par où commencer ?",
  "On commence par un échange offert pour comprendre votre activité et vos clients {V}. Ensuite je crée et publie pour vous sur Facebook, Instagram et votre fiche Google Business — vous n'avez rien à gérer techniquement. Dès 290 € par mois, sans engagement."),
 ("Faut-il déjà avoir beaucoup d'abonnés pour que ça serve {V} ?",
  "Non : l'objectif n'est pas le nombre d'abonnés mais la visibilité locale auprès de vos vrais clients {V}. Une fiche Google Business soignée et des publications régulières comptent bien plus que la taille de la communauté. On en parle lors du premier échange offert, au 06 98 20 02 08."),
]

CREA_POOL = [
 ("Combien coûte un site internet pour un professionnel {DE} ?",
  "Un site vitrine démarre à 590 €, avec le référencement local inclus et sans frais cachés. Le premier échange est offert pour définir ensemble votre projet {V}."),
 ("Mon site va-t-il me faire ressortir sur Google {V} ?",
  "Je ne promets aucune position, personne ne peut la garantir honnêtement. En revanche, votre site est optimisé pour le référencement local (structure, vitesse, Google Business) afin d'être trouvable quand un habitant cherche votre métier {V}. On en parle lors du premier échange offert."),
 ("Est-il possible de créer mon site à distance, sans que je me déplace {V} ?",
  "Oui, tout peut se faire à distance : échanges par téléphone et par mail, envoi de vos textes et photos, validation en ligne. Et si vous préférez qu'on se voie {V}, c'est possible aussi. Vous gardez un seul interlocuteur, au 06 98 20 02 08."),
 ("En combien de temps mon site sera-t-il en ligne {V} ?",
  "Pour un site vitrine, comptez généralement quelques semaines une fois vos textes et photos réunis — je vous accompagne pour les préparer. On fixe un calendrier réaliste dès le premier échange offert, adapté à votre activité {V}."),
 ("Mon site sera-t-il lisible sur mobile pour mes clients {DE} ?",
  "Oui : chaque site est responsive, c'est-à-dire pensé d'abord pour le mobile, sur lequel la majorité de vos clients {V} vous consultent. Design à vos couleurs, chargement rapide et référencement local sont inclus, à partir de 590 €."),
 ("Je repars de zéro : pouvez-vous gérer aussi le nom de domaine et l'hébergement {V} ?",
  "Oui, je vous accompagne de bout en bout : nom de domaine, hébergement, mise en ligne et référencement local, sans jargon. Un site vitrine démarre à 590 €, sans frais cachés — on cadre tout au premier échange offert, au 06 98 20 02 08."),
]

def fill(s, V, DE):
    return s.replace("{V}", V).replace("{DE}", DE)

def build_blocks(name, V, DE, pool, idx):
    i1, i2 = idx % 6, (idx + 2) % 6
    qa = [(fill(pool[i1][0], V, DE), fill(pool[i1][1], V, DE)),
          (fill(pool[i2][0], V, DE), fill(pool[i2][1], V, DE))]
    # bloc visible
    vis = ['    <div class="cfaq">',
           '      <h2>Questions fréquentes — %s</h2>' % name]
    for q, a in qa:
        vis.append('      <details><summary>%s</summary><div class="a">%s</div></details>' % (q, a))
    vis.append('    </div>')
    vis_block = "\n".join(vis)
    # JSON-LD
    items = []
    for q, a in qa:
        items.append('    { "@type": "Question", "name": "%s", "acceptedAnswer": { "@type": "Answer", "text": "%s" } }'
                     % (q.replace('"', '\\"'), a.replace('"', '\\"')))
    ld = ('<script type="application/ld+json">\n'
          '{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n'
          '  "mainEntity": [\n' + ",\n".join(items) + '\n  ]\n}\n</script>\n')
    return vis_block, ld

def process(slug, kind, idx):
    fn = ROOT + ("community-manager-%s.html" if kind == "cm" else "creation-site-internet-%s.html") % slug
    with io.open(fn, encoding="utf-8") as f:
        c = f.read()
    if "FAQPage" in c:
        return "skip(existant): " + fn
    name = tagname(c)
    if not name:
        return "ERR no tagloc: " + fn
    V, DE = prepos(name, slug)
    pool = CM_POOL if kind == "cm" else CREA_POOL
    vis, ld = build_blocks(name, V, DE, pool, idx)
    # inject visible juste avant tools-cta
    if '<div class="tools-cta"' not in c:
        return "ERR no tools-cta: " + fn
    c = c.replace('    <div class="tools-cta"', vis + "\n\n    <div class=\"tools-cta\"", 1)
    # inject JSON-LD juste avant </head>
    c = c.replace("</head>", ld + "</head>", 1)
    with io.open(fn, "w", encoding="utf-8") as f:
        f.write(c)
    return "OK [%s #%d %s+%d]: %s" % (kind, idx, name, (idx+2)%6, fn.split("/")[-1])

out = []
for i, s in enumerate(sorted(CM)):
    out.append(process(s, "cm", i))
for i, s in enumerate(sorted(CREA)):
    out.append(process(s, "crea", i))
print("\n".join(out))
print("\nTotal traite:", len([o for o in out if o.startswith("OK")]), "/ 44")
