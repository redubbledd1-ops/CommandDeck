// Startvoorraad voor html-, css- en js-fragmenten in het woordenboek.
//
// Bedoeld voor website-projecten: zoeken, kopiëren, favoriet zetten — naast de
// helpknoppen in de editor. Alles met `snippet: true` is géén shell-commando:
// los "runnen" slaat nergens op. Regeleinden zijn LF (`\n`), zoals moderne
// webbestanden; niet CRLF zoals bij bat.
//
// Tags: html / css / js — filterbaar als thema in het woordenboek.
// "java" in de volksmond = JavaScript hier; JVM-Java hoort niet bij sites.

const WEB_COMMANDS = [

  // ── HTML — skelet en pagina ───────────────────────────────────────────────
  { tags: ['html'], snippet: true, label: 'Minimale html5-pagina',
    note: 'Begin hier. Vervang titel en inhoud; css/js koppel je met link en script.',
    cmd: '<!DOCTYPE html>\n<html lang="nl">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>Titel</title>\n\t<link rel="stylesheet" href="style.css">\n</head>\n<body>\n\t\n\t<script src="script.js"></script>\n</body>\n</html>' },
  { tags: ['html'], snippet: true, label: 'Koppel een stylesheet',
    cmd: '<link rel="stylesheet" href="style.css">' },
  { tags: ['html'], snippet: true, label: 'Koppel een script (onderaan body)',
    note: 'Onderaan de body: de html staat er al als het script draait.',
    cmd: '<script src="script.js"></script>' },
  { tags: ['html'], snippet: true, label: 'Script als module',
    cmd: '<script type="module" src="script.js"></script>' },
  { tags: ['html'], snippet: true, label: 'Favicon',
    cmd: '<link rel="icon" href="favicon.ico" type="image/x-icon">' },
  { tags: ['html'], snippet: true, label: 'Open Graph (deel-voorbeeld)',
    note: 'Voor social media. Vul echte titel, tekst en afbeeldings-url in.',
    cmd: '<meta property="og:title" content="Titel">\n<meta property="og:description" content="Korte tekst">\n<meta property="og:image" content="https://voorbeeld.nl/beeld.jpg">' },

  // ── HTML — structuur ──────────────────────────────────────────────────────
  { tags: ['html'], snippet: true, label: 'Header met navigatie',
    cmd: '<header>\n\t<nav>\n\t\t<a href="/">Home</a>\n\t\t<a href="/over">Over</a>\n\t\t<a href="/contact">Contact</a>\n\t</nav>\n</header>' },
  { tags: ['html'], snippet: true, label: 'Hoofd + aside + footer',
    cmd: '<main>\n\t<article>\n\t\t<h1>Titel</h1>\n\t\t<p>Tekst</p>\n\t</article>\n\t<aside>\n\t\t<p>Zijbalk</p>\n\t</aside>\n</main>\n<footer>\n\t<p>&copy; 2026</p>\n</footer>' },
  { tags: ['html'], snippet: true, label: 'Sectie met kop',
    cmd: '<section>\n\t<h2>Kop</h2>\n\t<p>Inhoud</p>\n</section>' },
  { tags: ['html'], snippet: true, label: 'div met klasse',
    cmd: '<div class="naam">\n\t\n</div>' },
  { tags: ['html'], snippet: true, label: 'Lijst met links',
    cmd: '<ul>\n\t<li><a href="#">Item één</a></li>\n\t<li><a href="#">Item twee</a></li>\n\t<li><a href="#">Item drie</a></li>\n</ul>' },

  // ── HTML — tekst en media ─────────────────────────────────────────────────
  { tags: ['html'], snippet: true, label: 'Koppen h1–h3',
    cmd: '<h1>Hoofdtitel</h1>\n<h2>Tussenkop</h2>\n<h3>Kleine kop</h3>' },
  { tags: ['html'], snippet: true, label: 'Alinea met nadruk',
    cmd: '<p>Gewone tekst met <strong>vet</strong> en <em>cursief</em>.</p>' },
  { tags: ['html'], snippet: true, label: 'Link',
    cmd: '<a href="https://voorbeeld.nl" target="_blank" rel="noopener">tekst</a>',
    note: 'rel="noopener" hoort bij target="_blank" — voorkomt dat de nieuwe tab bij jouw pagina kan.' },
  { tags: ['html'], snippet: true, label: 'Afbeelding',
    cmd: '<img src="beeld.jpg" alt="Korte omschrijving" width="800" height="450">',
    note: 'alt is verplicht voor toegankelijkheid. width/height voorkomt layout-sprongen.' },
  { tags: ['html'], snippet: true, label: 'Figure met bijschrift',
    cmd: '<figure>\n\t<img src="beeld.jpg" alt="Omschrijving">\n\t<figcaption>Bijschrift</figcaption>\n</figure>' },
  { tags: ['html'], snippet: true, label: 'Video',
    cmd: '<video controls width="640" poster="poster.jpg">\n\t<source src="film.mp4" type="video/mp4">\n\tJe browser ondersteunt geen video.\n</video>' },

  // ── HTML — formulieren ────────────────────────────────────────────────────
  { tags: ['html'], snippet: true, label: 'Formulier (post)',
    cmd: '<form action="/verstuur" method="post">\n\t<label for="naam">Naam</label>\n\t<input id="naam" name="naam" type="text" required>\n\t<button type="submit">Verstuur</button>\n</form>' },
  { tags: ['html'], snippet: true, label: 'E-mailveld',
    cmd: '<label for="email">E-mail</label>\n<input id="email" name="email" type="email" autocomplete="email" required>' },
  { tags: ['html'], snippet: true, label: 'Keuzelijst',
    cmd: '<label for="keuze">Kies</label>\n<select id="keuze" name="keuze">\n\t<option value="">—</option>\n\t<option value="a">Optie A</option>\n\t<option value="b">Optie B</option>\n</select>' },
  { tags: ['html'], snippet: true, label: 'Checkbox',
    cmd: '<label>\n\t<input type="checkbox" name="akkoord" value="ja">\n\tIk ga akkoord\n</label>' },
  { tags: ['html'], snippet: true, label: 'Tekstvak',
    cmd: '<label for="bericht">Bericht</label>\n<textarea id="bericht" name="bericht" rows="5" cols="40"></textarea>' },
  { tags: ['html'], snippet: true, label: 'Knop (geen submit)',
    note: 'type="button" voorkomt dat een form per ongeluk verstuurt.',
    cmd: '<button type="button">Klik</button>' },

  // ── HTML — tabel en toegankelijkheid ──────────────────────────────────────
  { tags: ['html'], snippet: true, label: 'Eenvoudige tabel',
    cmd: '<table>\n\t<thead>\n\t\t<tr><th>Naam</th><th>Prijs</th></tr>\n\t</thead>\n\t<tbody>\n\t\t<tr><td>Appel</td><td>€1</td></tr>\n\t\t<tr><td>Peer</td><td>€2</td></tr>\n\t</tbody>\n</table>' },
  { tags: ['html'], snippet: true, label: 'Skip-link (toegankelijk)',
    cmd: '<a class="skip-link" href="#inhoud">Ga naar inhoud</a>' },
  { tags: ['html'], snippet: true, label: 'aria-label op knop zonder tekst',
    cmd: '<button type="button" aria-label="Menu openen">☰</button>' },

  // ── CSS — reset en basis ──────────────────────────────────────────────────
  { tags: ['css'], snippet: true, label: 'Eenvoudige reset',
    note: 'box-sizing voorkomt dat padding de breedte stukmaakt.',
    cmd: '*, *::before, *::after {\n\tbox-sizing: border-box;\n}\n\nbody {\n\tmargin: 0;\n\tfont-family: system-ui, sans-serif;\n\tline-height: 1.5;\n\tcolor: #1a1a1a;\n\tbackground: #fff;\n}' },
  { tags: ['css'], snippet: true, label: 'CSS-variabelen (kleuren)',
    cmd: ':root {\n\t--tekst: #1a1a1a;\n\t--muted: #666;\n\t--vlak: #f5f5f5;\n\t--accent: #2563eb;\n\t--rand: #e5e5e5;\n}' },
  { tags: ['css'], snippet: true, label: 'Afbeeldingen nooit breder dan de kolom',
    cmd: 'img, video {\n\tmax-width: 100%;\n\theight: auto;\n\tdisplay: block;\n}' },
  { tags: ['css'], snippet: true, label: 'Links zonder standaardblauw',
    cmd: 'a {\n\tcolor: var(--accent, #2563eb);\n\ttext-decoration: none;\n}\na:hover {\n\ttext-decoration: underline;\n}' },

  // ── CSS — layout ──────────────────────────────────────────────────────────
  { tags: ['css'], snippet: true, label: 'Flex-rij met ruimte ertussen',
    cmd: '.rij {\n\tdisplay: flex;\n\talign-items: center;\n\tjustify-content: space-between;\n\tgap: 1rem;\n}' },
  { tags: ['css'], snippet: true, label: 'Flex-kolom',
    cmd: '.kolom {\n\tdisplay: flex;\n\tflex-direction: column;\n\tgap: 0.75rem;\n}' },
  { tags: ['css'], snippet: true, label: 'Grid: twee kolommen',
    cmd: '.grid-2 {\n\tdisplay: grid;\n\tgrid-template-columns: repeat(2, 1fr);\n\tgap: 1.5rem;\n}' },
  { tags: ['css'], snippet: true, label: 'Grid: auto-fit kaarten',
    note: 'Kolommen zo breed mogelijk vanaf 16rem; past vanzelf op smalle schermen.',
    cmd: '.kaarten {\n\tdisplay: grid;\n\tgrid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));\n\tgap: 1rem;\n}' },
  { tags: ['css'], snippet: true, label: 'Gecentreerde inhoudsbreedte',
    cmd: '.wrap {\n\twidth: min(100% - 2rem, 70rem);\n\tmargin-inline: auto;\n}' },
  { tags: ['css'], snippet: true, label: 'Sticky header',
    cmd: 'header {\n\tposition: sticky;\n\ttop: 0;\n\tz-index: 10;\n\tbackground: #fff;\n\tborder-bottom: 1px solid var(--rand, #e5e5e5);\n}' },
  { tags: ['css'], snippet: true, label: 'Volledige viewport-hoogte',
    cmd: '.scherm {\n\tmin-height: 100vh;\n\tmin-height: 100dvh;\n}' },

  // ── CSS — tekst en look ───────────────────────────────────────────────────
  { tags: ['css'], snippet: true, label: 'Koptypografie',
    cmd: 'h1, h2, h3 {\n\tline-height: 1.2;\n\tmargin: 0 0 0.5em;\n}\nh1 { font-size: clamp(1.8rem, 4vw, 2.75rem); }\nh2 { font-size: 1.5rem; }' },
  { tags: ['css'], snippet: true, label: 'Knop-stijl',
    cmd: '.knop {\n\tdisplay: inline-flex;\n\talign-items: center;\n\tgap: 0.4rem;\n\tpadding: 0.6rem 1.1rem;\n\tborder: 0;\n\tborder-radius: 0.5rem;\n\tbackground: var(--accent, #2563eb);\n\tcolor: #fff;\n\tfont: inherit;\n\tcursor: pointer;\n}\n.knop:hover { filter: brightness(1.05); }' },
  { tags: ['css'], snippet: true, label: 'Kaart met schaduw',
    cmd: '.kaart {\n\tpadding: 1.25rem;\n\tborder: 1px solid var(--rand, #e5e5e5);\n\tborder-radius: 0.75rem;\n\tbackground: #fff;\n\tbox-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);\n}' },
  { tags: ['css'], snippet: true, label: 'Badge / label',
    cmd: '.badge {\n\tdisplay: inline-block;\n\tpadding: 0.15rem 0.5rem;\n\tborder-radius: 999px;\n\tbackground: var(--vlak, #f5f5f5);\n\tcolor: var(--muted, #666);\n\tfont-size: 0.8rem;\n}' },
  { tags: ['css'], snippet: true, label: 'Visueel verbergen (wel voor screenreaders)',
    cmd: '.sr-only {\n\tposition: absolute;\n\twidth: 1px;\n\theight: 1px;\n\toverflow: hidden;\n\tclip: rect(0, 0, 0, 0);\n\twhite-space: nowrap;\n}' },
  { tags: ['css'], snippet: true, label: 'Smooth scroll',
    cmd: 'html { scroll-behavior: smooth; }' },

  // ── CSS — responsive en states ────────────────────────────────────────────
  { tags: ['css'], snippet: true, label: 'Media query: smalle schermen',
    cmd: '@media (max-width: 640px) {\n\t.rij {\n\t\tflex-direction: column;\n\t\talign-items: stretch;\n\t}\n}' },
  { tags: ['css'], snippet: true, label: 'Hover én focus zichtbaar',
    note: 'Focus-visible: toetsenbordgebruikers zien wél een ring, muisklikkers niet altijd.',
    cmd: '.knop:focus-visible {\n\toutline: 2px solid var(--accent, #2563eb);\n\toutline-offset: 2px;\n}' },
  { tags: ['css'], snippet: true, label: 'Reduced motion respecteren',
    cmd: '@media (prefers-reduced-motion: reduce) {\n\t*, *::before, *::after {\n\t\tanimation: none !important;\n\t\ttransition: none !important;\n\t}\n}' },
  { tags: ['css'], snippet: true, label: 'Dark mode via systeem',
    cmd: '@media (prefers-color-scheme: dark) {\n\t:root {\n\t\t--tekst: #f2f2f2;\n\t\t--vlak: #1a1a1a;\n\t\t--rand: #333;\n\t}\n\tbody {\n\t\tcolor: var(--tekst);\n\t\tbackground: #0d0d0d;\n\t}\n}' },
  { tags: ['css'], snippet: true, label: 'Transitie op kleur/opacity',
    cmd: '.fade {\n\ttransition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;\n}' },

  // ── JavaScript — DOM ──────────────────────────────────────────────────────
  { tags: ['js'], snippet: true, label: 'Element zoeken',
    cmd: "const el = document.querySelector('.naam')" },
  { tags: ['js'], snippet: true, label: 'Alle elementen van een klasse',
    cmd: "const lijst = document.querySelectorAll('.item')\nlijst.forEach((el) => {\n\t// …\n})" },
  { tags: ['js'], snippet: true, label: 'Element maken en toevoegen',
    cmd: "const p = document.createElement('p')\np.textContent = 'Hallo'\np.classList.add('intro')\ndocument.body.appendChild(p)" },
  { tags: ['js'], snippet: true, label: 'Klasse aan/uit',
    cmd: "el.classList.toggle('open')\nel.classList.add('actief')\nel.classList.remove('verborgen')" },
  { tags: ['js'], snippet: true, label: 'data-attribuut lezen/zetten',
    cmd: "const id = el.dataset.id\nel.dataset.status = 'klaar'" },
  { tags: ['js'], snippet: true, label: 'Wachten tot de DOM klaar is',
    cmd: "document.addEventListener('DOMContentLoaded', () => {\n\t// start hier\n})" },

  // ── JavaScript — events ───────────────────────────────────────────────────
  { tags: ['js'], snippet: true, label: 'Klik-handler',
    cmd: "document.querySelector('.knop')?.addEventListener('click', (e) => {\n\te.preventDefault()\n\t// …\n})" },
  { tags: ['js'], snippet: true, label: 'Event delegation (één listener op de lijst)',
    note: 'Werkt ook voor knoppen die je later toevoegt.',
    cmd: "document.querySelector('.lijst')?.addEventListener('click', (e) => {\n\tconst knop = e.target.closest('[data-actie]')\n\tif (!knop) return\n\tconsole.log(knop.dataset.actie)\n})" },
  { tags: ['js'], snippet: true, label: 'Formulier-submit onderscheppen',
    cmd: "document.querySelector('form')?.addEventListener('submit', (e) => {\n\te.preventDefault()\n\tconst data = new FormData(e.target)\n\tconsole.log(Object.fromEntries(data))\n})" },
  { tags: ['js'], snippet: true, label: 'Toets Escape',
    cmd: "document.addEventListener('keydown', (e) => {\n\tif (e.key === 'Escape') {\n\t\t// sluit dialoog / menu\n\t}\n})" },
  { tags: ['js'], snippet: true, label: 'Debounce (zoekveld)',
    note: 'Roept fn pas aan als je even stopt met typen.',
    cmd: 'function debounce(fn, ms = 300) {\n\tlet t\n\treturn (...args) => {\n\t\tclearTimeout(t)\n\t\tt = setTimeout(() => fn(...args), ms)\n\t}\n}\n\nconst zoek = debounce((q) => {\n\tconsole.log(q)\n}, 300)\n\ndocument.querySelector(\'#zoek\')?.addEventListener(\'input\', (e) => {\n\tzoek(e.target.value)\n})' },

  // ── JavaScript — data en netwerk ───────────────────────────────────────────
  { tags: ['js'], snippet: true, label: 'fetch JSON',
    cmd: "async function haalData(url) {\n\tconst r = await fetch(url)\n\tif (!r.ok) throw new Error('HTTP ' + r.status)\n\treturn r.json()\n}\n\nhaalData('/api/data.json')\n\t.then((data) => console.log(data))\n\t.catch((err) => console.error(err))" },
  { tags: ['js'], snippet: true, label: 'fetch POST JSON',
    cmd: "async function stuur(url, lichaam) {\n\tconst r = await fetch(url, {\n\t\tmethod: 'POST',\n\t\theaders: { 'Content-Type': 'application/json' },\n\t\tbody: JSON.stringify(lichaam),\n\t})\n\tif (!r.ok) throw new Error('HTTP ' + r.status)\n\treturn r.json()\n}" },
  { tags: ['js'], snippet: true, label: 'localStorage bewaren',
    cmd: "localStorage.setItem('voorkeur', JSON.stringify({ thema: 'donker' }))\nconst voorkeur = JSON.parse(localStorage.getItem('voorkeur') || 'null')" },
  { tags: ['js'], snippet: true, label: 'URL-parameters lezen',
    cmd: "const params = new URLSearchParams(location.search)\nconst id = params.get('id')" },
  { tags: ['js'], snippet: true, label: 'JSON netjes loggen',
    cmd: 'console.log(JSON.stringify(data, null, 2))' },

  // ── JavaScript — modules en patroon ───────────────────────────────────────
  { tags: ['js'], snippet: true, label: 'ES-module: exporteren',
    cmd: "export function groet(naam) {\n\treturn 'Hallo ' + naam\n}\n\nexport const VERSIE = 1" },
  { tags: ['js'], snippet: true, label: 'ES-module: importeren',
    cmd: "import { groet, VERSIE } from './lib.js'\n\nconsole.log(groet('wereld'), VERSIE)" },
  { tags: ['js'], snippet: true, label: 'try / catch rond async',
    cmd: 'async function main() {\n\ttry {\n\t\tconst data = await haalData(\'/api.json\')\n\t\tconsole.log(data)\n\t} catch (err) {\n\t\tconsole.error(err)\n\t}\n}\n\nmain()' },
  { tags: ['js'], snippet: true, label: 'Klasse met constructor',
    cmd: 'class Teller {\n\tconstructor(start = 0) {\n\t\tthis.waarde = start\n\t}\n\tplus() {\n\t\tthis.waarde += 1\n\t\treturn this.waarde\n\t}\n}' },
  { tags: ['js'], snippet: true, label: 'Array filter / map / sort',
    cmd: "const actief = items\n\t.filter((x) => x.aan)\n\t.map((x) => x.naam)\n\t.sort((a, b) => a.localeCompare(b))" },

  // ── Recepten (meerdere stukken samen) ─────────────────────────────────────
  { tags: ['html', 'css', 'js', 'recept'], snippet: true, label: 'Recept: mobiel menu (html + css + js)',
    note: 'Plak de drie blokken in je html/css/js. Pas klassen aan als je wilt.',
    cmd: '<!-- HTML -->\n<button type="button" class="menu-knop" aria-expanded="false" aria-controls="menu">Menu</button>\n<nav id="menu" class="menu" hidden>\n\t<a href="/">Home</a>\n\t<a href="/over">Over</a>\n</nav>\n\n/* CSS */\n.menu[hidden] { display: none; }\n.menu { display: flex; flex-direction: column; gap: 0.5rem; }\n@media (min-width: 768px) {\n\t.menu-knop { display: none; }\n\t.menu[hidden] { display: flex; flex-direction: row; }\n}\n\n// JS\nconst knop = document.querySelector(\'.menu-knop\')\nconst menu = document.querySelector(\'#menu\')\nknop?.addEventListener(\'click\', () => {\n\tconst open = menu.hasAttribute(\'hidden\')\n\tmenu.toggleAttribute(\'hidden\', !open)\n\tknop.setAttribute(\'aria-expanded\', String(open))\n})' },
  { tags: ['js', 'recept'], snippet: true, label: 'Recept: tabs zonder library',
    cmd: "document.querySelectorAll('[data-tabs]').forEach((root) => {\n\tconst knoppen = root.querySelectorAll('[role=\"tab\"]')\n\tconst panelen = root.querySelectorAll('[role=\"tabpanel\"]')\n\tknoppen.forEach((knop) => {\n\t\tknop.addEventListener('click', () => {\n\t\t\tconst id = knop.getAttribute('aria-controls')\n\t\t\tknoppen.forEach((k) => k.setAttribute('aria-selected', String(k === knop)))\n\t\t\tpanelen.forEach((p) => p.hidden = p.id !== id)\n\t\t})\n\t})\n})" },
  { tags: ['css', 'recept'], snippet: true, label: 'Recept: sticky footer (flex)',
    note: 'Body vult het scherm; footer blijft onderaan als de inhoud kort is.',
    cmd: 'html, body { height: 100%; }\nbody {\n\tdisplay: flex;\n\tflex-direction: column;\n\tmin-height: 100vh;\n\tmin-height: 100dvh;\n\tmargin: 0;\n}\nmain { flex: 1; }' },

  // ── Losse nuttige site-commando's (wél uitvoerbaar in de shell) ────────────
  // npm install / npm run staan al onder node in cmd-library.js — hier alleen
  // wat specifiek is voor een kale html/css/js-map.
  { cmd: 'npx --yes serve .', label: 'Map serveren in de browser (serve)', tags: ['js', 'web'],
    note: 'Geen installatie nodig. Handig om even file:// te vermijden — absolute paden en modules werken dan.' },
  { cmd: 'npx --yes live-server --port=5500', label: 'Live-reload servertje', tags: ['js', 'web'], template: true,
    note: 'Herlaadt de pagina bij opslaan. Stoppen met Ctrl+C.' },
]

module.exports = { WEB_COMMANDS }
