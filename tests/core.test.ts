import { describe, expect, it } from "vitest";
import { BLOCK_META, mk } from "../src/core/blocks.js";
import { renderSite } from "../src/core/render-site.js";
import { BotProject, Project, ROOT, SiteProject, normalizeBot, type BotNode } from "../src/core/schema.js";
import { TEMPLATES, blankProject } from "../src/core/templates.js";
import { clampStrings, esc, readableOn, safeUrl, slugify, videoEmbed, waDigits, waLink } from "../src/core/util.js";

describe("util", () => {
  it("safeUrl bloque les schémas dangereux et accepte les liens normaux", () => {
    for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>", "vbscript:x", "//evil.com", "java\nscript:alert(1)", ""]) {
      expect(safeUrl(bad), bad).toBe("#");
    }
    expect(safeUrl("https://exemple.com/a?b=1")).toBe("https://exemple.com/a?b=1");
    expect(safeUrl("wa.me/237600000000")).toBe("https://wa.me/237600000000");
    expect(safeUrl("#contact")).toBe("#contact");
    expect(safeUrl("mailto:a@b.co")).toBe("mailto:a@b.co");
    expect(safeUrl("/page")).toBe("/page");
  });

  it("WhatsApp : chiffres uniquement, longueur plausible", () => {
    expect(waDigits("+237 6 00 00 00 00")).toBe("237600000000");
    expect(waDigits("abc")).toBe("");
    expect(waLink("123")).toBe("#");
    expect(waLink("237600000000", "Salut & bonjour")).toBe("https://wa.me/237600000000?text=Salut%20%26%20bonjour");
  });

  it("videoEmbed n'accepte que YouTube et Vimeo", () => {
    expect(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://youtu.be/dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(videoEmbed("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789");
    expect(videoEmbed("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(videoEmbed("javascript:alert(1)")).toBeNull();
  });

  it("esc, readableOn, slugify, clampStrings", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    expect(readableOn("#ffffff")).toBe("#14162e");
    expect(readableOn("#1b1f4b")).toBe("#ffffff");
    expect(slugify("Ma Boutique Été !")).toBe("ma-boutique-ete");
    expect(clampStrings({ a: "x".repeat(10), b: ["y".repeat(10)] }, 3)).toEqual({ a: "xxx", b: ["yyy"] });
  });
});

describe("rendu des sites", () => {
  it("échappe tout le contenu utilisateur et neutralise les liens dangereux", () => {
    const p = SiteProject.parse({
      kind: "site",
      name: "<img src=x onerror=alert(1)>",
      settings: { title: "</title><script>alert(1)</script>", emoji: '"><b>' },
      blocks: [
        { type: "hero", title: "<script>alert(1)</script>", text: "<b>x</b>", cta: "Go", link: "javascript:alert(1)", image: 'javascript:alert(1)' },
        { type: "button", label: "<i>", link: "data:text/html,<script>alert(1)</script>" },
        { type: "image", url: "javascript:alert(2)", alt: '" onerror="alert(3)' },
        { type: "list", title: "<u>", items: [{ name: "<s>", price: "<s>", description: "<s>" }] },
        { type: "video", url: "https://evil.com/x" },
        { type: "contact", title: "t", whatsapp: "237600000000", phone: '123"><script>', email: '"><script>@x.co', address: "<b>" },
      ],
    });
    const html = renderSite(p);
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/src="javascript:/i);
    expect(html).not.toMatch(/onerror=alert/);
    expect(html).not.toContain("evil.com");
    for (const raw of ["<b>x</b>", "<s>", "<u>", "<i>", "<script>alert"]) expect(html).not.toContain(raw);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("rejette une couleur d'accent qui n'est pas un hex à 6 chiffres", () => {
    expect(SiteProject.safeParse({ kind: "site", name: "x", settings: { accent: "red;}</style>" }, blocks: [] }).success).toBe(false);
  });

  it("ajoute le script du formulaire de commande seulement quand il sert", () => {
    const base = SiteProject.parse({ kind: "site", name: "x", blocks: [mk({ type: "hero", title: "a", text: "", cta: "", link: "" })] });
    expect(renderSite(base)).not.toContain("<script>");
    const withForm = { ...base, blocks: [...base.blocks, mk({ type: "orderForm", title: "Commande", whatsapp: "237600000000", button: "Go", fields: ["Nom", "Détails"] })] };
    const html = renderSite(withForm);
    expect(html).toContain("form.oform");
    expect(html).toContain('data-wa="237600000000"');
    expect(html).toContain('id="orderForm"');
  });

  it("chaque modèle est valide et se rend en HTML complet", () => {
    for (const t of TEMPLATES) {
      const project = t.build();
      expect(Project.safeParse(project).success, t.id).toBe(true);
      expect(project.kind, t.id).toBe(t.kind);
      if (project.kind !== "bot") {
        const html = renderSite(project);
        expect(html.startsWith("<!doctype html>"), t.id).toBe(true);
        expect(html, t.id).toContain("</html>");
        expect(project.blocks.length, t.id).toBeGreaterThan(2);
      }
    }
  });

  it("chaque type de bloc a une fiche et se rend sans erreur", () => {
    for (const [type, meta] of Object.entries(BLOCK_META)) {
      const p = SiteProject.parse({ kind: "site", name: "t", blocks: [meta.make()] });
      expect(() => renderSite(p), type).not.toThrow();
    }
  });

  it("la page mobile utilise une colonne étroite, le site une colonne large", () => {
    const site = renderSite(blankProject("site") as never);
    const page = renderSite(blankProject("page") as never);
    expect(site).toContain("min(1040px");
    expect(page).toContain("min(480px");
  });
});

describe("normalisation des bots", () => {
  const node = (over: Partial<BotNode> & { id: string }): BotNode => ({ parent: ROOT, label: over.id, type: "message", text: "t", url: "", ...over });
  const bot = (nodes: BotNode[]) => BotProject.parse({ kind: "bot", name: "b", nodes });

  it("remet à la racine les parents inconnus et les auto-références", () => {
    const out = normalizeBot(bot([node({ id: "a", parent: "fantome" }), node({ id: "b", parent: "b" })]));
    expect(out.nodes.map((n) => n.parent)).toEqual([ROOT, ROOT]);
  });

  it("casse les cycles et limite la profondeur", () => {
    const cycle = normalizeBot(bot([node({ id: "a", parent: "b" }), node({ id: "b", parent: "a" })]));
    expect(cycle.nodes.some((n) => n.parent === ROOT)).toBe(true);
    const deep = normalizeBot(bot([node({ id: "1" }), node({ id: "2", parent: "1" }), node({ id: "3", parent: "2" }), node({ id: "4", parent: "3" }), node({ id: "5", parent: "4" })]));
    expect(deep.nodes.find((n) => n.id === "5")?.parent).toBe(ROOT);
  });

  it("corrige les doublons d'id, les liens invalides et les enfants de feuilles", () => {
    const out = normalizeBot(bot([node({ id: "a" }), node({ id: "a" }), node({ id: "l", type: "link", url: "javascript:alert(1)" }), node({ id: "q", type: "ask" }), node({ id: "c", parent: "q" })]));
    expect(new Set(out.nodes.map((n) => n.id)).size).toBe(5);
    expect(out.nodes.find((n) => n.id === "l")?.type).toBe("message");
    expect(out.nodes.find((n) => n.id === "c")?.parent).toBe(ROOT);
  });
});
