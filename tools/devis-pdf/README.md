# Devis PDF à la charte du site

Génère un devis PDF (A4, logo, couleurs et polices du site) à partir d'un devis rédigé en markdown.

```
python3 tools/devis-pdf/build_devis.py mon-devis.md mon-devis.pdf
```

- Le markdown utilise : `# Titre` (« Devis — … »), `## Sections`, tableaux `| … |`, listes `1.` / `-` / `- [ ]`.
- Le premier paragraphe de « Parties et références » doit contenir « Devis n° …, émis le …, valable jusqu'au … » : ces valeurs alimentent l'en-tête.
- Un paragraphe commençant par « Net à payer : … € » alimente l'encart du montant.
- Le tableau « | | Prestataire | Client(e) | » devient deux cartes ; celui qui contient une ligne « Signature » devient le bloc de signature.
- Rendu par Chrome headless (`/usr/bin/google-chrome`) ; polices lues dans `fonts/`, logo dans `logo.png`.

Les devis eux-mêmes (données clients) ne sont jamais ajoutés au dépôt : `tools/` n'est pas publié sur le site, mais le dépôt est public.
