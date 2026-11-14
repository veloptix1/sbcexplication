import type { Block, PageLike, SiteLike, SiteSettings, ThemeId } from "./schema.js";
import { esc, isHex, readableOn, safeUrl, videoEmbed, waDigits, waLink } from "./util.js";

export interface Theme {
  label: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  line: string;
}

export const THEMES: Record<ThemeId, Theme> = {
  clean: { label: "Clair", bg: "#f6f7fc", surface: "#ffffff", text: "#16182e", muted: "#5b6080", line: "#e1e4f1" },
  paper: { label: "Papier", bg: "#faf6ee", surface: "#fffdf8", text: "#2a2118", muted: "#74685a", line: "#e8dfcf" },
  midnight: { label: "Nuit", bg: "#0e1020", surface: "#181b33", text: "#eceefb", muted: "#9aa0c6", line: "#2a2e52" },
  forest: { label: "Forêt", bg: "#0f1f18", surface: "#172a21", text: "#e8f3ec", muted: "#94b3a2", line: "#25402f" },
};

export const RADIUS = { sm: "6px", md: "12px", lg: "22px" } as const;
export const FONTS = {
  sans: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",sans-serif',
  serif: 'Georgia,"Iowan Old Style","Times New Roman",serif',
  rounded: 'ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
} as const;

const I18N = {
  fr: { wa: "Écrire sur WhatsApp", call: "Appeler", mail: "Envoyer un e-mail", send: "Envoyer sur WhatsApp", open: "Ouvrir" },
  en: { wa: "Message on WhatsApp", call: "Call", mail: "Send an email", send: "Send on WhatsApp", open: "Open" },
} as const;

const WA_ICON =
  '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6-.3.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2.1 1.3 2.4 1.4.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4Z"/></svg>';

function css(s: SiteLike["settings"], kind: SiteLike["kind"]): string {
  const t = THEMES[s.theme] ?? THEMES.clean;
  const accent = isHex(s.accent) ? s.accent : "#4b3fd1";
  const page = kind === "page";
  return `
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:${t.bg};color:${t.text};font:16px/1.6 ${FONTS[s.font]};-webkit-font-smoothing:antialiased}
:root{--accent:${accent};--on:${readableOn(accent)};--surface:${t.surface};--muted:${t.muted};--line:${t.line};--r:${RADIUS[s.radius]}}
img,iframe{max-width:100%}a{color:var(--accent)}
.wrap{width:min(${page ? "480px" : "1040px"},100% - 32px);margin-inline:auto}
section.blk{padding:${page ? "14px 0" : "36px 0"}}
h1,h2,h3{line-height:1.15;margin:0}h1{font-size:clamp(${page ? "26px,7vw,32px" : "32px,6vw,52px"})}
h2{font-size:clamp(22px,4vw,${page ? "24px" : "32px"})}h3{font-size:18px}p{margin:0 0 .8em}
.hero{background:var(--accent);color:var(--on);padding:${page ? "44px 0 36px" : "84px 0 76px"};text-align:${page ? "center" : "left"};background-size:cover;background-position:center;position:relative}
.hero.img::before{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.62))}
.hero .wrap{position:relative}.hero h1{margin-bottom:12px}.hero p{font-size:1.1rem;max-width:56ch;margin:0 ${page ? "auto" : "0"} 22px;opacity:.94}
.btn{display:${page ? "block" : "inline-block"};text-align:center;background:var(--accent);color:var(--on);text-decoration:none;font-weight:600;padding:13px 22px;border-radius:calc(var(--r) * 3);border:2px solid var(--accent);margin:4px 8px 4px 0}
.btn.outline{background:transparent;color:var(--accent)}.hero .btn{background:var(--on);color:var(--accent);border-color:var(--on)}
.btn.wa{background:#1fa855;border-color:#1fa855;color:#fff}${page ? ".btn{margin-right:0}" : ""}
.center{text-align:center}.title{margin-bottom:16px}
.muted{color:var(--muted)}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(${page ? "100%" : "230px"},1fr))}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px}
.card .ico{font-size:28px;line-height:1;margin-bottom:8px}
.card p{margin:6px 0 0;color:var(--muted)}
.quote{font-style:italic}.who{font-style:normal;font-weight:600;margin-top:10px;font-size:.9rem}
ul.items{list-style:none;margin:0;padding:0;display:grid;gap:10px}
ul.items li{display:flex;justify-content:space-between;gap:16px;align-items:baseline;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:14px 16px}
ul.items small{display:block;color:var(--muted)}ul.items b{color:var(--accent);white-space:nowrap}
figure{margin:0}figure img{display:block;width:100%;height:auto;border-radius:var(--r)}figcaption{color:var(--muted);font-size:.9rem;margin-top:6px}
details{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:12px 16px;margin-bottom:8px}
summary{cursor:pointer;font-weight:600}details p{margin:10px 0 0;color:var(--muted)}
.video{position:relative;aspect-ratio:16/9;border-radius:var(--r);overflow:hidden;background:#000}.video iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
form.oform{display:grid;gap:12px;background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:18px}
form.oform label{display:grid;gap:4px;font-weight:600;font-size:.92rem}
form.oform input,form.oform textarea{font:inherit;color:inherit;background:var(--bg);border:1px solid var(--line);border-radius:calc(var(--r) / 1.6);padding:11px 12px}
form.oform button{font:inherit;cursor:pointer;margin:0}
.contact-lines{margin:10px 0 0;color:var(--muted)}
footer{padding:30px 0 ${page ? "40px" : "56px"};text-align:center;color:var(--muted);font-size:.9rem}
.wa-float{position:fixed;right:16px;bottom:16px;width:54px;height:54px;border-radius:50%;background:#1fa855;color:#fff;display:grid;place-items:center;box-shadow:0 6px 18px rgba(0,0,0,.28);z-index:9}
a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
`.replace(/\n/g, "");
}

function heading(title: string, center = false): string {
  return title ? `<h2 class="title${center ? " center" : ""}">${esc(title)}</h2>` : "";
}

const lines = (text: string) => esc(text).replace(/\r?\n/g, "<br>");

function renderBlock(b: Block, s: SiteSettings, anchor: string): string {
  const L = I18N[s.lang] ?? I18N.fr;
  const wrap = (inner: string) => `<section${anchor ? ` id="${anchor}"` : ""} class="blk blk-${b.type}"><div class="wrap">${inner}</div></section>`;
  switch (b.type) {
    case "hero": {
      const img = b.image ? safeUrl(b.image) : "#";
      const style = img !== "#" ? ` style="background-image:url(&quot;${esc(img)}&quot;)"` : "";
      return `<header class="hero${style ? " img" : ""}"${style}><div class="wrap"><h1>${esc(b.title)}</h1>${b.text ? `<p>${lines(b.text)}</p>` : ""}${
        b.cta ? `<a class="btn" href="${esc(safeUrl(b.link))}">${esc(b.cta)}</a>` : ""
      }</div></header>`;
    }
    case "heading":
      return wrap(`<h2>${esc(b.text)}</h2>`);
    case "text":
      return wrap(`<p>${lines(b.text)}</p>`);
    case "image": {
      const src = safeUrl(b.url);
      if (src === "#") return "";
      return wrap(`<figure><img src="${esc(src)}" alt="${esc(b.alt)}" loading="lazy">${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ""}</figure>`);
    }
    case "button":
      return wrap(`<a class="btn${b.style === "outline" ? " outline" : ""}" href="${esc(safeUrl(b.link))}">${esc(b.label || L.open)}</a>`);
    case "list":
      return wrap(
        `${heading(b.title)}<ul class="items">${b.items
          .map((i) => `<li><span><strong>${esc(i.name)}</strong>${i.description ? `<small>${esc(i.description)}</small>` : ""}</span>${i.price ? `<b>${esc(i.price)}</b>` : ""}</li>`)
          .join("")}</ul>`,
      );
    case "features":
      return wrap(
        `${heading(b.title)}<div class="grid">${b.items
          .map((i) => `<div class="card">${i.icon ? `<div class="ico" aria-hidden="true">${esc(i.icon)}</div>` : ""}<h3>${esc(i.title)}</h3>${i.text ? `<p>${esc(i.text)}</p>` : ""}</div>`)
          .join("")}</div>`,
      );
    case "testimonials":
      return wrap(
        `${heading(b.title)}<div class="grid">${b.items
          .map((i) => `<figure class="card"><blockquote class="quote" style="margin:0">“${esc(i.text)}”</blockquote><figcaption class="who">${esc(i.name)}${i.role ? ` <span class="muted">· ${esc(i.role)}</span>` : ""}</figcaption></figure>`)
          .join("")}</div>`,
      );
    case "faq":
      return wrap(`${heading(b.title)}${b.items.map((i) => `<details><summary>${esc(i.q)}</summary><p>${lines(i.a)}</p></details>`).join("")}`);
    case "contact": {
      const phone = b.phone.replace(/[^\d+]/g, "");
      const email = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(b.email.trim()) ? b.email.trim() : "";
      const buttons = [
        waDigits(b.whatsapp) ? `<a class="btn wa" href="${esc(waLink(b.whatsapp))}" rel="noopener">${L.wa}</a>` : "",
        phone.length >= 5 ? `<a class="btn outline" href="tel:${esc(phone)}">${L.call} ${esc(b.phone)}</a>` : "",
        email ? `<a class="btn outline" href="mailto:${esc(email)}">${L.mail}</a>` : "",
      ].join("");
      return wrap(`${heading(b.title)}<div>${buttons}</div>${b.address ? `<p class="contact-lines">${lines(b.address)}</p>` : ""}`);
    }
    case "orderForm": {
      const fields = b.fields.filter((f) => f.trim());
      const list = fields.length ? fields : s.lang === "fr" ? ["Nom", "Votre commande"] : ["Name", "Your order"];
      return wrap(
        `${heading(b.title)}<form class="oform" data-wa="${esc(waDigits(b.whatsapp))}">${list
          .map((f, i) => {
            const input = i === list.length - 1 && list.length > 1 ? `<textarea rows="3" data-l="${esc(f)}" required></textarea>` : `<input data-l="${esc(f)}" required>`;
            return `<label>${esc(f)}${input}</label>`;
          })
          .join("")}<button class="btn wa" type="submit">${esc(b.button || L.send)}</button></form>`,
      );
    }
    case "video": {
      const src = videoEmbed(b.url);
      return src ? wrap(`<div class="video"><iframe src="${esc(src)}" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`) : "";
    }
    case "footer":
      return `<footer><div class="wrap">${lines(b.text)}</div></footer>`;
    default: {
      const never: never = b;
      return never;
    }
  }
}

const FORM_SCRIPT =
  "document.querySelectorAll('form.oform').forEach(function(f){f.addEventListener('submit',function(e){e.preventDefault();" +
  "var n=f.getAttribute('data-wa');if(!n){return}var t=Array.prototype.map.call(f.querySelectorAll('[data-l]'),function(i){return i.getAttribute('data-l')+' : '+i.value}).join('\\n');" +
  "window.open('https://wa.me/'+n+'?text='+encodeURIComponent(t),'_blank','noopener')})})";

/** La première section de chaque type reçoit une ancre : #contact, #orderForm, #faq… */
function anchorsFor(blocks: Block[]): Map<string, string> {
  const anchors = new Map<string, string>();
  const taken = new Set<string>();
  for (const b of blocks) if (!taken.has(b.type)) { taken.add(b.type); anchors.set(b.id, b.type); }
  return anchors;
}

const layoutOf = (p: PageLike): SiteLike["kind"] => (p.kind === "app" ? "page" : p.kind);

/**
 * Le contenu d'une page sans le document autour : style et HTML, à insérer dans un Shadow DOM.
 * Même rendu, même échappement que renderSite.
 */
export function renderFragment(p: PageLike): { css: string; html: string; script: string } {
  const anchors = anchorsFor(p.blocks);
  return {
    css: css(p.settings, layoutOf(p)),
    html: p.blocks.map((b) => renderBlock(b, p.settings, anchors.get(b.id) ?? "")).join("\n"),
    script: p.blocks.some((b) => b.type === "orderForm") ? FORM_SCRIPT : "",
  };
}

/** Génère un document HTML autonome (aucune dépendance externe). */
export function renderSite(p: PageLike): string {
  const s = p.settings;
  const kind = layoutOf(p);
  const firstHero = p.blocks.find((b): b is Extract<Block, { type: "hero" }> => b.type === "hero");
  const title = s.title || firstHero?.title || p.name || "Mon site";
  const description = s.description || firstHero?.text || "";
  const emoji = s.emoji.trim().slice(0, 4);
  const favicon = emoji
    ? `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${esc(emoji)}</text></svg>`)}">`
    : "";
  const anchors = anchorsFor(p.blocks);
  const hasForm = p.blocks.some((b) => b.type === "orderForm");
  const float = waDigits(s.whatsappFloat)
    ? `<a class="wa-float" href="${esc(waLink(s.whatsappFloat))}" aria-label="WhatsApp" rel="noopener">${WA_ICON}</a>`
    : "";
  return `<!doctype html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
${description ? `<meta name="description" content="${esc(description.slice(0, 160))}">` : ""}
<meta property="og:title" content="${esc(title)}">
${description ? `<meta property="og:description" content="${esc(description.slice(0, 200))}">` : ""}
<meta name="theme-color" content="${esc(isHex(s.accent) ? s.accent : "#4b3fd1")}">
${favicon}
<style>${css(s, kind)}</style>
</head>
<body class="k-${kind}">
<main>
${p.blocks.map((b) => renderBlock(b, s, anchors.get(b.id) ?? "")).join("\n")}
</main>
${float}
${hasForm ? `<script>${FORM_SCRIPT}</script>` : ""}
</body>
</html>
`;
}
