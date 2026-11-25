#!/usr/bin/env python3
"""Convertit un devis rédigé en markdown (sous-ensemble maîtrisé) en HTML à la charte
francoisleterrier.fr, puis en PDF via Chrome headless.

Usage : python3 build_devis.py <devis.md> <sortie.pdf>
"""
import base64
import html
import re
import subprocess
import sys
from pathlib import Path

REPO = Path("/home/user/francoisleterrier-lab.github.io")
HERE = Path(__file__).resolve().parent

BRAND = {
    "ink": "#060410",      # titres (fond du site)
    "ink2": "#16122a",     # texte principal
    "muted": "#5f5a70",    # texte secondaire
    "line": "#e6e3ee",
    "cyan": "#28c8dd",
    "purple": "#7c3aed",
    "magenta": "#e05bc8",
    "soft": "#f6f4fb",     # fond des encarts
}

PRESTATAIRE = {
    "nom": "François Leterrier",
    "activite": "Entrepreneur individuel (EI) · Community manager & création de sites internet",
    "adresse": "Lavernose-Lacasse (31410) · Sud-Toulousain",
    "siret": "SIRET 499 385 284 00025",
    "tva": "TVA non applicable, art. 293 B du CGI",
    "tel": "06 98 20 02 08",
    "email": "francois.leterrier.cmw@gmail.com",
    "site": "francoisleterrier.fr",
}


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode("ascii")


def font_face(family: str, file: str, weight: str) -> str:
    return (f"@font-face{{font-family:'{family}';src:url(data:font/woff2;base64,{b64(REPO / 'fonts' / file)}) "
            f"format('woff2');font-weight:{weight};font-style:normal;font-display:block;}}")


# ---------- parsing du markdown (sous-ensemble) ----------

def inline(text: str) -> str:
    """Échappe le HTML puis rétablit liens [t](u) et gras **t**."""
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\((https?://[^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    # espaces insécables avant : ; ? ! et dans les nombres « 1 690 € »
    text = re.sub(r" ([:;?!»])", r" \1", text)
    text = re.sub(r"« ", "« ", text)
    text = re.sub(r"(\d) (\d{3})", r"\1 \2", text)
    text = re.sub(r"(\d) (€|%)", r"\1 \2", text)
    return text


def parse(md: str):
    """Retourne (titre, blocs). Blocs : ('h2', txt) ('p', txt) ('table', rows) ('ol'|'ul'|'tasks', items)."""
    title = ""
    blocks = []
    lines = md.splitlines()
    i = 0
    para = []

    def flush():
        nonlocal para
        if para:
            blocks.append(("p", " ".join(para).strip()))
            para = []

    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if s.startswith("# ") and not title:
            title = s[2:].strip(); i += 1; continue
        if s.startswith("## "):
            flush(); blocks.append(("h2", s[3:].strip())); i += 1; continue
        if s.startswith("|"):
            flush()
            rows = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                cells = [c.strip() for c in lines[i].strip().strip("|").split("|")]
                if not all(re.fullmatch(r":?-{3,}:?", c) for c in cells):
                    rows.append(cells)
                i += 1
            blocks.append(("table", rows)); continue
        m = re.match(r"^(\d+)\. (.*)", s)
        if m:
            flush(); items = []
            while i < len(lines) and re.match(r"^\d+\. ", lines[i].strip()):
                items.append(re.sub(r"^\d+\. ", "", lines[i].strip())); i += 1
            blocks.append(("ol", items)); continue
        if s.startswith("- [ ] ") or s.startswith("- [x] "):
            flush(); items = []
            while i < len(lines) and re.match(r"^- \[[ x]\] ", lines[i].strip()):
                items.append(lines[i].strip()[6:]); i += 1
            blocks.append(("tasks", items)); continue
        if s.startswith("- "):
            flush(); items = []
            while i < len(lines) and lines[i].strip().startswith("- "):
                items.append(lines[i].strip()[2:]); i += 1
            blocks.append(("ul", items)); continue
        if not s:
            flush(); i += 1; continue
        para.append(s); i += 1
    flush()
    return title, blocks


# ---------- rendu HTML ----------

PRICE_RE = re.compile(r"(€|Compris|Offert|Hors devis|Selon choix|À fixer|Sur devis)")


def render_table(rows):
    head, body = rows[0], rows[1:]
    # Bloc signature (testé avant les parties : même en-tête de tableau)
    if head[0] == "" and len(head) == 3 and any(r[0] == "Signature" for r in body):
        cells = []
        for col in (1, 2):
            rows_html = "".join(
                f"<div class='sig-row'><span>{inline(r[0])}</span><b>{inline(r[col]) or '&nbsp;'}</b></div>"
                for r in body if len(r) > col and r[0] != "Signature")
            cells.append(f"<div class='sig'><div class='card-t'>{inline(head[col])}</div>{rows_html}<div class='sig-box'></div></div>")
        return f"<div class='signatures'>{''.join(cells)}</div>"
    # Bloc « parties » : deux cartes côte à côte
    if head[0] == "" and len(head) == 3 and head[1] == "Prestataire":
        cards = []
        for col in (1, 2):
            items = "".join(f"<div class='kv'><span>{inline(r[0])}</span><b>{inline(r[col])}</b></div>"
                            for r in body if len(r) > col and r[col])
            cards.append(f"<div class='card'><div class='card-t'>{inline(head[col])}</div>{items}</div>")
        return f"<div class='parties'>{''.join(cards)}</div>"
    ncol = len(head)
    # colonnes numériques : prix / montant / quantité → alignées à droite
    num_cols = {j for j, h in enumerate(head) if re.search(r"Prix|Montant|Quantit|Part|Tarif", h)}
    if head[0] == "" and ncol == 2:
        num_cols = {1}
    ths = "".join(f"<th class='{'num' if j in num_cols else ''}'>{inline(h)}</th>" for j, h in enumerate(head))
    trs = []
    for r in body:
        r = r + [""] * (ncol - len(r))
        cls = ""
        if re.match(r"Geste commercial|Remise", r[0]):
            cls = "gift"
        if re.match(r"Net|Total", r[0]):
            cls = "total"
        tds = "".join(f"<td class='{'num' if j in num_cols else ''}'>{inline(c)}</td>" for j, c in enumerate(r))
        if len(r[1]) > 450:
            cls += ' long'
        trs.append(f"<tr class='{cls}'>{tds}</tr>")
    klass = 'grid recap' if (head[0] == '' and ncol == 2) else 'grid'
    return f"<table class='{klass}'><thead><tr>{ths}</tr></thead><tbody>{''.join(trs)}</tbody></table>"


def render(blocks):
    out = []
    for kind, val in blocks:
        if kind == "h2":
            out.append(f"<h2>{inline(val)}</h2>")
        elif kind == "p":
            if re.match(r"Devis n° ", val):
                continue  # repris dans l'en-tête
            if re.match(r"(Net à payer|Total des prestations)", val):
                out.append(f"<p class='callout'>{inline(val)}</p>")
            elif re.match(r"\d{1,2} \w+ 20\d\d · François Leterrier$", val):
                continue  # ligne de signature du doc, reprise dans l'en-tête
            else:
                out.append(f"<p>{inline(val)}</p>")
        elif kind == "table":
            out.append(render_table(val))
        elif kind == "ol":
            out.append("<ol>" + "".join(f"<li>{inline(x)}</li>" for x in val) + "</ol>")
        elif kind == "ul":
            out.append("<ul>" + "".join(f"<li>{inline(x)}</li>" for x in val) + "</ul>")
        elif kind == "tasks":
            out.append("<ul class='tasks'>" + "".join(f"<li><span class='box'></span>{inline(x)}</li>" for x in val) + "</ul>")
    return "\n".join(out)


def meta_from(blocks):
    """Numéro, date, validité et net à payer, extraits du texte."""
    txt = " ".join(v for k, v in blocks if k == "p")
    num = re.search(r"Devis n° ([\w-]+)", txt)
    date = re.search(r"émis le (\d{1,2} \w+ 20\d\d)", txt)
    val = re.search(r"valable jusqu'au (\d{1,2} \w+ 20\d\d)", txt)
    net = re.search(r"Net à payer : ([\d  ]+€)", txt)
    monthly = re.search(r"puis ([\d  ]+€/mois)", txt)
    return {
        "num": num.group(1) if num else "",
        "date": date.group(1) if date else "",
        "val": val.group(1) if val else "",
        "net": net.group(1) if net else "",
        "monthly": monthly.group(1) if monthly else "",
    }


def build_html(md_path: Path) -> str:
    md = md_path.read_text(encoding="utf-8")
    title, blocks = parse(md)
    meta = meta_from(blocks)
    subtitle = re.sub(r"^Devis\s*—\s*", "", title)
    P, B = PRESTATAIRE, BRAND
    logo = b64(REPO / "logo.png")
    fonts = "\n".join([
        font_face("Montserrat", "montserrat-400-latin.woff2", "100 900"),
        font_face("Montserrat", "montserrat-400-latin-ext.woff2", "100 900"),
        font_face("Fraunces", "fraunces-500-latin.woff2", "100 900"),
        font_face("Fraunces", "fraunces-500-latin-ext.woff2", "100 900"),
    ])
    monthly = f"<small>puis {inline(meta['monthly'])}</small>" if meta["monthly"] else ""
    net_box = (f"<div class='net'><span>Net à payer</span><b>{inline(meta['net'])}</b>{monthly}"
               f"<small>TVA non applicable</small></div>") if meta["net"] else ""
    return f"""<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
{fonts}
@page {{ size: A4; margin: 12mm 12mm 14mm 12mm; }}
* {{ box-sizing: border-box; }}
html, body {{ margin:0; padding:0; }}
body {{ font-family:'Montserrat', Arial, sans-serif; font-size:8.9pt; line-height:1.42; color:{B['ink2']}; }}
a {{ color:{B['purple']}; text-decoration:none; }}
.band {{ height:4mm; background:linear-gradient(90deg,{B['cyan']},{B['purple']} 60%,{B['magenta']}); border-radius:3px; margin-bottom:7mm; }}
header {{ display:flex; justify-content:space-between; align-items:flex-start; gap:10mm; margin-bottom:4mm; }}
.brand {{ display:flex; gap:5mm; align-items:center; flex:1; min-width:0; }}
.brand img {{ width:22mm; height:22mm; border-radius:50%; }}
.brand .who {{ font-size:8.4pt; color:{B['muted']}; line-height:1.45; max-width:92mm; }}
.brand .who b {{ display:block; font-size:12pt; color:{B['ink']}; font-weight:800; letter-spacing:-.01em; }}
.docid {{ text-align:right; flex:none; width:70mm; }}
.docid h1 {{ font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:30pt; margin:0; line-height:1; color:{B['ink']}; letter-spacing:-.02em; }}
.docid .sub {{ font-size:10pt; color:{B['ink2']}; margin:2mm 0 1mm; font-weight:600; }}
.docid .ref {{ font-size:8.4pt; color:{B['muted']}; line-height:1.5; white-space:nowrap; }}
.docid .ref b {{ color:{B['ink']}; font-weight:700; }}
.net {{ display:inline-flex; flex-direction:column; align-items:flex-end; margin-top:3mm; padding:3mm 5mm; border-radius:10px; background:{B['soft']}; border:1px solid {B['line']}; }}
.net span {{ font-size:7.5pt; text-transform:uppercase; letter-spacing:.12em; color:{B['muted']}; }}
.net b {{ font-family:'Fraunces', Georgia, serif; font-size:20pt; color:{B['ink']}; line-height:1.1; }}
.net small {{ font-size:7.5pt; color:{B['muted']}; }}
h2 {{ font-family:'Fraunces', Georgia, serif; font-weight:700; font-size:13pt; color:{B['ink']}; margin:5mm 0 2mm; padding-bottom:1.2mm; border-bottom:2px solid transparent; border-image:linear-gradient(90deg,{B['cyan']},{B['purple']}) 1; break-after:avoid; }}
p {{ margin:0 0 2mm; }}
p.callout {{ background:{B['soft']}; border-left:3px solid {B['cyan']}; padding:2.5mm 4mm; border-radius:0 8px 8px 0; font-weight:600; color:{B['ink']}; }}
ol, ul {{ margin:0 0 2.5mm; padding-left:5.5mm; }}
li {{ margin-bottom:0.8mm; }}
ul.tasks {{ list-style:none; padding-left:0; }}
ul.tasks li {{ display:flex; gap:2.5mm; align-items:flex-start; }}
ul.tasks .box {{ flex:none; width:3.6mm; height:3.6mm; border:1.5px solid {B['purple']}; border-radius:2px; margin-top:.8mm; }}
table.grid {{ width:100%; border-collapse:collapse; margin:0 0 2.5mm; font-size:8.2pt; page-break-inside:auto; }}
table.grid th {{ text-align:left; font-size:7.2pt; text-transform:uppercase; letter-spacing:.08em; color:#fff; background:{B['ink']}; padding:1.8mm 2.2mm; }}
table.grid th:first-child {{ border-radius:6px 0 0 0; }} table.grid th:last-child {{ border-radius:0 6px 0 0; }}
table.grid td {{ padding:1.8mm 2.2mm; border-bottom:1px solid {B['line']}; vertical-align:top; }}
table.grid td:first-child {{ font-weight:700; color:{B['ink']}; width:21%; }}
table.grid th.num, table.grid td.num {{ text-align:right; white-space:nowrap; }}
table.grid tr {{ break-inside:avoid; }}
table.grid tr.long {{ break-inside:auto; }}
table.recap td:first-child {{ width:auto; font-weight:600; }}
table.recap td.num {{ width:28mm; }}
table.grid tr.gift td {{ color:{B['purple']}; font-weight:700; background:#f7f3ff; }}
table.grid tr.total td {{ font-weight:800; color:{B['ink']}; background:{B['soft']}; }}
.parties, .signatures {{ display:flex; gap:5mm; margin:0 0 3mm; }}
.card, .sig {{ flex:1; border:1px solid {B['line']}; border-radius:10px; padding:3.5mm 4mm; background:#fff; }}
.card-t {{ font-size:7.6pt; text-transform:uppercase; letter-spacing:.12em; color:{B['purple']}; font-weight:700; margin-bottom:2mm; }}
.kv {{ display:flex; gap:3mm; margin-bottom:1.4mm; font-size:8.8pt; }}
.kv span {{ flex:none; width:18mm; color:{B['muted']}; }}
.kv b {{ font-weight:600; color:{B['ink2']}; }}
.sig-row {{ display:flex; gap:3mm; margin-bottom:1.4mm; font-size:8.8pt; }}
.sig-row span {{ flex:none; width:18mm; color:{B['muted']}; }}
.sig-box {{ height:22mm; border:1.2px dashed #b9b3c6; border-radius:8px; margin-top:2mm; position:relative; }}
.sig-box::after {{ content:'Signature'; position:absolute; left:3mm; top:2mm; font-size:7pt; color:#b9b3c6; text-transform:uppercase; letter-spacing:.1em; }}
.final {{ break-inside:avoid; }}
.signatures {{ break-inside:avoid; }}
footer {{ margin-top:7mm; font-size:7.4pt; color:{B['muted']}; text-align:center; border-top:1px solid {B['line']}; padding-top:2.5mm; break-inside:avoid; }}
footer b {{ color:{B['ink']}; }}
</style></head>
<body>
<div class="band"></div>
<header>
  <div class="brand">
    <img src="data:image/png;base64,{logo}" alt="Logo FL">
    <div class="who"><b>{P['nom']}</b>{P['activite']}<br>{P['adresse']}<br>{P['tel']} · {P['email']}<br>{P['siret']}<br>{P['tva']}</div>
  </div>
  <div class="docid">
    <h1>Devis</h1>
    <div class="sub">{inline(subtitle)}</div>
    <div class="ref">N° <b>{meta['num']}</b><br>Émis le <b>{meta['date']}</b><br>Valable jusqu'au <b>{meta['val']}</b></div>
    {net_box}
  </div>
</header>
{render(blocks).replace('<h2>Acceptation</h2>', '<div class="final"><h2>Acceptation</h2>')}
<footer><b>{P['nom']}</b> · {P['activite']} · {P['adresse']} · {P['siret']} · {P['tva']} · {P['site']}</footer></div>
</body></html>"""


def to_pdf(html_path: Path, pdf_path: Path):
    cmd = ["/usr/bin/google-chrome", "--headless=new", "--disable-gpu", "--no-sandbox",
           "--no-pdf-header-footer", f"--print-to-pdf={pdf_path}", f"file://{html_path}"]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if not pdf_path.exists():
        raise SystemExit(f"Chrome n'a pas produit le PDF : {r.stderr[-800:]}")


if __name__ == "__main__":
    md_path, pdf_path = Path(sys.argv[1]), Path(sys.argv[2])
    html_path = pdf_path.with_suffix(".html")
    html_path.write_text(build_html(md_path), encoding="utf-8")
    to_pdf(html_path, pdf_path)
    print(f"OK {pdf_path} ({pdf_path.stat().st_size} octets)")
