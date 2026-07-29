/**
 * generate.js — génération de la page sur-mesure (Chantier 1).
 * Workers AI produit un JSON structuré ; repli curaté crédible si l'IA échoue.
 * Aucune clé externe : le modèle est appelé via le binding env.AI.
 */

// Modèles Workers AI essayés dans l'ordre (bascule si déprécié / indisponible).
const MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/meta/llama-3.1-70b-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
];

/** Normalise le métier saisi vers une clé de secteur (direction artistique). */
export function sectorOf(metier) {
  const m = (metier || "").toLowerCase();
  const has = (...w) => w.some((x) => m.includes(x));
  if (has("restau", "bar", "vin", "café", "cafe", "brasserie", "tapas", "cave", "traiteur")) return "restaurant";
  if (has("plomb", "artisan", "btp", "chauff", "électric", "electric", "maçon", "macon", "menuis", "couvreur", "peintre", "bâtiment", "batiment", "rénov", "renov")) return "artisan";
  if (has("boutique", "commerce", "mode", "prêt-à-porter", "pret-a-porter", "concept store", "déco", "deco", "fleur", "bijou", "accessoire")) return "commerce";
  if (has("bien-être", "bien être", "bien-etre", "sophro", "yoga", "massage", "thérap", "therap", "naturo", "méditation", "meditation", "relax", "spa")) return "bien-etre";
  if (has("coiff", "beauté", "beaute", "esthé", "esthe", "barbier", "ongle", "salon")) return "coiffure";
  if (has("mariage", "faire-part", "événement", "evenement", "wedding", "réception", "reception", "traiteur mariage")) return "evenementiel";
  return "default";
}

/** Libellés lisibles par secteur. */
export const SECTOR_LABEL = {
  restaurant: "Restaurant / bar",
  artisan: "Artisan / BTP",
  commerce: "Commerce / boutique",
  "bien-etre": "Bien-être / thérapie",
  coiffure: "Coiffure / beauté",
  evenementiel: "Événementiel",
  default: "Établissement",
};

/* ---------------------------------------------------------------------------
 * Repli curaté : contenu crédible par secteur, interpolé avec nom/ville/ton.
 * Sert aussi de référence de schéma pour le front (renderer).
 * ------------------------------------------------------------------------- */
const PACKS = {
  restaurant: {
    eyebrow: (v) => `Bar à vin · Cuisine de partage · ${v}`,
    title: () => "Le goût du <em>partage</em>",
    subtitle: (n) => `Chez ${n}, une cave vivante, une cuisine franche et des soirées qui s'étirent. Bienvenue à table.`,
    services: (n) => [
      { title: "La carte du moment", desc: "Produits de saison, cuisine du marché qui change chaque semaine.", price: "Menu dès 24 €" },
      { title: "La cave", desc: "Vignerons choisis, verres au comptoir, conseils sans chichi.", price: "Verre dès 5 €" },
      { title: "Privatisation", desc: "Anniversaires, équipes, moments à fêter — on s'occupe de tout.", price: "Sur devis" },
    ],
    about: (n, v) => ({ title: "Une maison, une ambiance", body: `${n} est né d'une envie simple : recevoir comme à la maison, à ${v}. Une salle chaleureuse, une équipe qui aime son métier, et une carte qui met les producteurs d'ici à l'honneur.` }),
    proofs: () => [
      { quote: "La meilleure adresse du coin. Accueil au top, assiettes généreuses.", author: "Camille R." },
      { quote: "Une cave incroyable et des conseils toujours justes. On revient !", author: "Thomas L." },
      { quote: "Cadre chaleureux, cuisine soignée. Parfait pour une soirée entre amis.", author: "Léa M." },
    ],
    faq: () => [
      { q: "Faut-il réserver ?", a: "C'est conseillé le week-end et pour les groupes — un appel ou un message suffit." },
      { q: "Proposez-vous des options végétariennes ?", a: "Oui, la carte change chaque semaine et comporte toujours un plat végétarien." },
      { q: "Peut-on privatiser la salle ?", a: "Oui, pour vos événements. On construit le menu avec vous." },
    ],
    cta: () => ({ title: "Réservez votre table", subtitle: "On garde la meilleure place pour vous.", button: "Réserver" }),
    hours: "Mar–Sam · 12h–14h30 · 19h–23h",
  },
  artisan: {
    eyebrow: (v) => `Intervention rapide · Devis gratuit · ${v} et alentours`,
    title: () => "Un travail <em>bien fait</em>, sans mauvaise surprise",
    subtitle: (n) => `${n} intervient chez vous rapidement, avec des tarifs annoncés d'avance et une garantie sur chaque chantier.`,
    services: () => [
      { title: "Dépannage rapide", desc: "Une urgence ? On se déplace vite, 7j/7, dans tout le secteur.", price: "Déplacement dès 45 €" },
      { title: "Installation & rénovation", desc: "Travaux propres, matériel de qualité, chantier respecté.", price: "Sur devis" },
      { title: "Entretien & conseil", desc: "On vous conseille sur les aides et l'entretien pour durer.", price: "Dès 90 €" },
    ],
    about: (n, v) => ({ title: "Le sérieux d'un artisan local", body: `Basé à ${v}, ${n} met un point d'honneur à faire du travail propre et durable. Devis clair, délais tenus, chantier laissé nickel. Un interlocuteur unique, joignable, de confiance.` }),
    proofs: () => [
      { quote: "Rapide, propre, honnête. Devis respecté à l'euro près.", author: "Michel D." },
      { quote: "Intervention le jour même pour une fuite. Sauvé !", author: "Sophie V." },
      { quote: "Du travail soigné et de bons conseils. Je recommande.", author: "Karim B." },
    ],
    faq: () => [
      { q: "Le devis est-il gratuit ?", a: "Oui, et il est déduit du chantier si vous confirmez les travaux." },
      { q: "Intervenez-vous en urgence ?", a: "Oui, 7j/7 dans le secteur pour les dépannages." },
      { q: "Êtes-vous assuré ?", a: "Oui, garantie décennale et assurance responsabilité professionnelle." },
    ],
    cta: () => ({ title: "Un projet, une urgence ?", subtitle: "Devis gratuit sous 24h.", button: "Demander un devis" }),
    hours: "Lun–Sam · 8h–19h · Urgences 7j/7",
  },
  commerce: {
    eyebrow: (v) => `Boutique · Conseil personnalisé · ${v}`,
    title: () => "Des pièces qu'on <em>aime porter</em>",
    subtitle: (n) => `Chez ${n}, une sélection pointue, un accueil qui prend le temps, et le plaisir de trouver la pièce qui vous ressemble.`,
    services: () => [
      { title: "La sélection", desc: "Des marques choisies avec soin, renouvelées chaque saison.", price: "" },
      { title: "Conseil en style", desc: "On prend le temps, sans pression, autour d'un café.", price: "Offert" },
      { title: "Click & Collect", desc: "Réservez en ligne, récupérez en boutique le jour même.", price: "" },
    ],
    about: (n, v) => ({ title: "Une boutique à part", body: `${n}, c'est une adresse à ${v} où l'on vient autant pour les pièces que pour le conseil. Une sélection sincère, un accueil chaleureux, et l'envie de faire de chaque visite un bon moment.` }),
    proofs: () => [
      { quote: "Toujours de belles pièces et des conseils justes. Ma boutique préférée.", author: "Julie P." },
      { quote: "Accueil adorable, sélection top. On ressort toujours ravie.", author: "Marine T." },
      { quote: "Enfin une boutique avec du goût et du service. Bravo !", author: "Claire F." },
    ],
    faq: () => [
      { q: "Peut-on réserver un article ?", a: "Oui, en boutique ou en ligne — on le garde pour vous." },
      { q: "Faites-vous les retouches ?", a: "Ourlets et ajustements sont possibles, demandez en boutique." },
      { q: "Y a-t-il une carte de fidélité ?", a: "Oui, avec des avantages dès le 5ᵉ achat et des ventes privées." },
    ],
    cta: () => ({ title: "Passez nous voir", subtitle: "On a hâte de vous accueillir.", button: "Nous trouver" }),
    hours: "Mar–Sam · 10h–19h",
  },
  "bien-etre": {
    eyebrow: (v) => `Sophrologie · Accompagnement · ${v}`,
    title: () => "Reprenez votre <em>souffle</em>",
    subtitle: (n) => `${n} vous accueille dans un espace calme pour relâcher la pression, retrouver le sommeil et avancer plus sereinement.`,
    services: () => [
      { title: "Séance individuelle", desc: "Un accompagnement sur-mesure, à votre rythme.", price: "Dès 55 €" },
      { title: "Gestion du stress", desc: "Des outils concrets pour apaiser le quotidien.", price: "Forfait dès 240 €" },
      { title: "Séances en groupe", desc: "Respiration, relaxation, dans une ambiance douce.", price: "Dès 15 €" },
    ],
    about: (n, v) => ({ title: "Un espace pour souffler", body: `À ${v}, ${n} propose un cadre apaisant et bienveillant. Sans jugement, à votre rythme, pour reprendre pied et retrouver de l'énergie. La première rencontre sert simplement à faire connaissance.` }),
    proofs: () => [
      { quote: "J'ai retrouvé le sommeil en quelques séances. Merci infiniment.", author: "Nathalie G." },
      { quote: "Douceur, écoute, professionnalisme. Un vrai bol d'air.", author: "Élodie R." },
      { quote: "Des outils simples qui changent le quotidien. Je recommande.", author: "Paul M." },
    ],
    faq: () => [
      { q: "Comment se passe la première séance ?", a: "On fait connaissance et on définit ensemble un objectif, sans engagement." },
      { q: "Combien de séances faut-il ?", a: "Cela dépend de vous — souvent quelques séances suffisent pour sentir un mieux." },
      { q: "Est-ce remboursé ?", a: "Certaines mutuelles participent, on vous fournit un justificatif." },
    ],
    cta: () => ({ title: "Offrez-vous une pause", subtitle: "Premier échange sans engagement.", button: "Prendre rendez-vous" }),
    hours: "Lun–Sam · sur rendez-vous",
  },
  coiffure: {
    eyebrow: (v) => `Coiffure · Coloriste · ${v}`,
    title: () => "Votre style, <em>sublimé</em>",
    subtitle: (n) => `Chez ${n}, une coupe pensée pour vous, une couleur maîtrisée et un moment rien qu'à vous.`,
    services: () => [
      { title: "Coupe & coiffage", desc: "Un diagnostic, une coupe sur-mesure, un coiffage impeccable.", price: "Dès 32 €" },
      { title: "Couleur & balayage", desc: "Techniques douces, résultat lumineux et naturel.", price: "Dès 65 €" },
      { title: "Soins sur-mesure", desc: "Rituels adaptés à votre cheveu pour une vraie santé capillaire.", price: "Dès 20 €" },
    ],
    about: (n, v) => ({ title: "Un salon, une signature", body: `À ${v}, ${n} allie technique et écoute pour révéler ce qui vous va vraiment. Un lieu élégant, une équipe passionnée, et le souci du détail à chaque geste.` }),
    proofs: () => [
      { quote: "La meilleure coloriste de la ville. Toujours parfait.", author: "Amandine C." },
      { quote: "À l'écoute et de très bons conseils. Je ne vais plus ailleurs.", author: "Sarah D." },
      { quote: "Un vrai moment de détente et un résultat au top.", author: "Inès B." },
    ],
    faq: () => [
      { q: "Faut-il prendre rendez-vous ?", a: "Oui, pour vous garantir le meilleur créneau et le temps qu'il faut." },
      { q: "Proposez-vous un diagnostic ?", a: "Oui, avant chaque prestation, pour un résultat qui vous ressemble." },
      { q: "Utilisez-vous des produits doux ?", a: "Oui, des gammes respectueuses du cheveu et du cuir chevelu." },
    ],
    cta: () => ({ title: "Réservez votre moment", subtitle: "On s'occupe de tout.", button: "Prendre rendez-vous" }),
    hours: "Mar–Sam · 9h–19h",
  },
  evenementiel: {
    eyebrow: (v) => `Événementiel · Sur-mesure · ${v} et partout en France`,
    title: () => "Des moments <em>inoubliables</em>",
    subtitle: (n) => `${n} imagine et orchestre vos plus beaux événements, avec le souci du détail qui fait toute la différence.`,
    services: () => [
      { title: "Mariages", desc: "De la première idée au dernier verre, on est à vos côtés.", price: "Sur devis" },
      { title: "Événements pros", desc: "Séminaires, lancements, soirées d'entreprise clés en main.", price: "Sur devis" },
      { title: "Coordination jour J", desc: "Vous profitez, on gère les coulisses.", price: "Dès 900 €" },
    ],
    about: (n, v) => ({ title: "L'émotion, dans le détail", body: `Basé à ${v}, ${n} conçoit des événements qui vous ressemblent. Écoute, créativité et rigueur : chaque détail est pensé pour que vous n'ayez qu'à savourer l'instant.` }),
    proofs: () => [
      { quote: "Un mariage de rêve, orchestré à la perfection. Merci pour tout.", author: "Émilie & Julien" },
      { quote: "Professionnalisme et créativité. Notre séminaire a marqué les esprits.", author: "Direction, PME locale" },
      { quote: "Rien à redire, tout était parfait. On recommande les yeux fermés.", author: "Claire & Antoine" },
    ],
    faq: () => [
      { q: "Travaillez-vous partout ?", a: "Oui, dans la région et partout en France selon le projet." },
      { q: "Quel budget prévoir ?", a: "Chaque projet est unique — on construit une proposition adaptée à votre enveloppe." },
      { q: "Peut-on vous confier juste le jour J ?", a: "Oui, la coordination jour J est une prestation à part entière." },
    ],
    cta: () => ({ title: "Parlons de votre projet", subtitle: "Premier échange offert.", button: "Nous contacter" }),
    hours: "Sur rendez-vous",
  },
  default: {
    eyebrow: (v) => `Votre établissement · ${v}`,
    title: () => "Bienvenue chez <em>nous</em>",
    subtitle: (n) => `${n} met son savoir-faire à votre service, avec exigence et proximité.`,
    services: () => [
      { title: "Notre savoir-faire", desc: "Un métier maîtrisé, au service de vos besoins.", price: "" },
      { title: "L'accompagnement", desc: "À l'écoute, pour un résultat qui vous ressemble.", price: "" },
      { title: "La proximité", desc: "Un interlocuteur unique, disponible et de confiance.", price: "" },
    ],
    about: (n, v) => ({ title: "Qui sommes-nous", body: `${n}, à ${v}, c'est l'exigence du travail bien fait et le goût du contact. On prend le temps de comprendre vos besoins pour y répondre au mieux.` }),
    proofs: () => [
      { quote: "Sérieux, à l'écoute, efficace. Je recommande vivement.", author: "Un client satisfait" },
      { quote: "Un accompagnement de qualité du début à la fin.", author: "Une cliente fidèle" },
      { quote: "Professionnalisme et proximité. Rien à redire.", author: "Client local" },
    ],
    faq: () => [
      { q: "Comment vous contacter ?", a: "Par téléphone ou via le formulaire — on répond rapidement." },
      { q: "Où êtes-vous situés ?", a: "Nous sommes basés dans votre secteur et intervenons alentour." },
      { q: "Proposez-vous un premier échange ?", a: "Oui, sans engagement, pour faire connaissance." },
    ],
    cta: () => ({ title: "Contactez-nous", subtitle: "On sera ravis d'échanger.", button: "Nous contacter" }),
    hours: "Sur rendez-vous",
  },
};

export function curatedPage({ metier, nom, ville, ton }) {
  const sector = sectorOf(metier);
  const p = PACKS[sector] || PACKS.default;
  const n = nom || "Votre établissement";
  const v = ville || "votre ville";
  return {
    brand: n,
    sector,
    ton: ton || "chaleureux",
    ville: v,
    hero: {
      eyebrow: p.eyebrow(v),
      title: p.title(),
      subtitle: p.subtitle(n),
      ctaPrimary: p.cta().button,
      ctaSecondary: "En savoir plus",
    },
    services: p.services(n),
    about: p.about(n, v),
    proofs: p.proofs(),
    faq: p.faq(),
    cta: p.cta(),
    contact: { ville: v, phone: "", hours: p.hours },
    _source: "curated",
  };
}

/* ---------------------------------------------------------------------------
 * Génération IA (Workers AI) → JSON structuré, avec repli curaté.
 * ------------------------------------------------------------------------- */
function buildMessages({ metier, nom, ville, ton }) {
  const sector = SECTOR_LABEL[sectorOf(metier)];
  const sys =
    "Tu es un directeur de création et concepteur-rédacteur français d'élite. " +
    "Tu écris des textes de site web haut de gamme, sur-mesure, jamais génériques, " +
    "sobres et crédibles (pas de superlatifs creux, pas d'emoji). " +
    "Tu réponds STRICTEMENT en JSON valide, sans texte autour, sans balises Markdown.";
  const user =
    `Rédige le contenu d'une page d'accueil pour cet établissement :\n` +
    `- Nom : ${nom}\n- Métier : ${metier} (secteur : ${sector})\n- Ville : ${ville}\n- Ton souhaité : ${ton}\n\n` +
    `Réponds avec CE schéma JSON exact (français, textes calibrés au métier et au ton) :\n` +
    `{"hero":{"eyebrow":"courte sur-ligne","title":"titre accrocheur, 2-5 mots, avec <em>...</em> autour du mot fort","subtitle":"1-2 phrases","ctaPrimary":"verbe d'action court","ctaSecondary":"texte court"},` +
    `"services":[{"title":"","desc":"1 phrase","price":"prix indicatif ou vide"}] (exactement 3),` +
    `"about":{"title":"","body":"2-3 phrases à la 1re personne du pluriel"},` +
    `"proofs":[{"quote":"avis client crédible","author":"Prénom N."}] (exactement 3),` +
    `"faq":[{"q":"","a":""}] (exactement 3),` +
    `"cta":{"title":"","subtitle":"","button":""},` +
    `"contact":{"ville":"${ville}","phone":"","hours":"horaires plausibles"}}`;
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

function extractJson(text) {
  if (!text) return null;
  let t = String(text).trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const s = t.indexOf("{");
  const e = t.lastIndexOf("}");
  if (s === -1 || e === -1 || e < s) return null;
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch (_) {
    return null;
  }
}

/** Fusionne la sortie IA sur la base curatée (garantit un objet complet et sûr). */
function mergeOntoCurated(base, ai) {
  if (!ai || typeof ai !== "object") return base;
  const out = { ...base, _source: "ai" };
  const str = (x, f) => (typeof x === "string" && x.trim() ? x.trim() : f);
  if (ai.hero) {
    out.hero = {
      eyebrow: str(ai.hero.eyebrow, base.hero.eyebrow),
      title: str(ai.hero.title, base.hero.title),
      subtitle: str(ai.hero.subtitle, base.hero.subtitle),
      ctaPrimary: str(ai.hero.ctaPrimary, base.hero.ctaPrimary),
      ctaSecondary: str(ai.hero.ctaSecondary, base.hero.ctaSecondary),
    };
  }
  const arr = (a, b, keys) =>
    Array.isArray(a) && a.length
      ? a.slice(0, b.length).map((it, i) => {
          const o = { ...b[i] };
          for (const k of keys) o[k] = str(it && it[k], b[i][k]);
          return o;
        })
      : b;
  out.services = arr(ai.services, base.services, ["title", "desc", "price"]);
  out.proofs = arr(ai.proofs, base.proofs, ["quote", "author"]);
  out.faq = arr(ai.faq, base.faq, ["q", "a"]);
  if (ai.about) out.about = { title: str(ai.about.title, base.about.title), body: str(ai.about.body, base.about.body) };
  if (ai.cta) out.cta = { title: str(ai.cta.title, base.cta.title), subtitle: str(ai.cta.subtitle, base.cta.subtitle), button: str(ai.cta.button, base.cta.button) };
  if (ai.contact) out.contact = { ville: base.contact.ville, phone: str(ai.contact.phone, base.contact.phone), hours: str(ai.contact.hours, base.contact.hours) };
  return out;
}

export async function generatePage(env, input, opts) {
  opts = opts || {};
  const base = curatedPage(input);
  if (!env || !env.AI) {
    if (opts.debug) base._debug = { hasAI: false };
    return base; // pas d'IA (dev local) → curaté
  }
  const messages = buildMessages(input);
  const tries = [];
  let ai = null, usedModel = null;
  for (const model of MODELS) {
    try {
      const res = await env.AI.run(model, { messages: messages, max_tokens: 1024 });
      const raw = res && (res.response != null ? res.response : res.output_text != null ? res.output_text : res.result != null ? res.result : res);
      const parsed = extractJson(typeof raw === "string" ? raw : JSON.stringify(raw));
      tries.push({ model: model, ok: true, parsed: !!parsed });
      if (parsed) { ai = parsed; usedModel = model; break; }
    } catch (e) {
      tries.push({ model: model, ok: false, err: (e && e.message) || String(e) });
    }
  }
  const out = mergeOntoCurated(base, ai);
  if (usedModel) out._model = usedModel;
  if (opts.debug) out._debug = { hasAI: true, usedModel: usedModel, tries: tries };
  return out;
}
