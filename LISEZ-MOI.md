# Site vitrine — François Leterrier

Site one-page autonome (aucune installation, aucun framework). Tout tient dans `index.html`.

## 📁 Fichiers
- `index.html` — le site complet (HTML + CSS + JS intégrés)
- `robots.txt` — autorise Google et les bots IA à indexer
- `sitemap.xml` — plan du site pour les moteurs de recherche

## 🚀 Mettre en ligne (gratuit ou presque)
1. Achète un nom de domaine (ex. `francoisleterrier.fr` chez OVH/Gandi, ~10 €/an).
2. Héberge le dossier tel quel sur **Netlify**, **Cloudflare Pages** ou **GitHub Pages** (glisser-déposer le dossier → en ligne en 2 min).
3. Branche le domaine sur l'hébergeur.

## ✏️ À personnaliser avant publication
Ouvre `index.html` et remplace **`https://www.francoisleterrier.fr/`** par ton vrai domaine partout (recherche/remplace). Concerné :
- les balises `<link rel="canonical">`, `og:url`, `og:image`
- les blocs `application/ld+json` (SEO Google)
- `sitemap.xml` et `robots.txt`

Puis crée une image de partage **`og-image.jpg`** (1200×630 px, ton logo + accroche) à déposer à la racine — c'est l'aperçu affiché sur Facebook/LinkedIn/WhatsApp.

## 📬 Le formulaire de contact
Par défaut il ouvre l'application mail du visiteur (pré-rempli vers `francois.leterrier@gmail.com`). Pour recevoir les messages directement par email sans que le visiteur ait à cliquer dans son logiciel mail, crée un compte gratuit **Formspree** ou active **Netlify Forms** — je te branche ça en 5 min si tu veux.

## 🎨 Identité respectée
- Police : Bricolage Grotesque (titres) + Manrope (texte)
- Couleurs : Émeraude #10B981 / Encre #0F1115 — fidèle à ton logo et ta fiche de prestation
- Logo FL en favicon (l'icône dans l'onglet du navigateur)

## ✅ SEO déjà en place
- Title + meta description optimisés « community manager Sud-Toulousain »
- Données structurées `ProfessionalService` (Google Maps / fiche entreprise)
- `FAQPage` (peut afficher tes questions directement dans Google)
- Open Graph (aperçus réseaux sociaux)
- robots.txt + sitemap.xml + balises géolocalisées (Lavernose-Lacasse 31410)
