import type { ReactNode } from "react";
import type { BlockType, Project } from "../core/schema.js";

const W = 132;
const H = 92;
const INK = "#1b1f4b";
const LINE = "#d8dbec";
const SOFT = "#e7e9f6";

/** Silhouette d'un bloc : [hauteur, dessin à la position y]. */
const SHAPES: Record<BlockType, (y: number, a: string) => [number, ReactNode]> = {
  hero: (y, a) => [30, <g key={y}><rect x="0" y={y} width={W} height="30" fill={a} /><rect x="14" y={y + 8} width="64" height="5" rx="2" fill="#fff" /><rect x="14" y={y + 17} width="40" height="3" rx="1.5" fill="#fff" opacity=".7" /></g>],
  heading: (y) => [8, <rect key={y} x="12" y={y} width="54" height="5" rx="2" fill={INK} opacity=".8" />],
  text: (y) => [10, <g key={y}><rect x="12" y={y} width="104" height="3" rx="1.5" fill={LINE} /><rect x="12" y={y + 6} width="78" height="3" rx="1.5" fill={LINE} /></g>],
  image: (y) => [20, <rect key={y} x="12" y={y} width="108" height="20" rx="3" fill={SOFT} />],
  button: (y, a) => [11, <rect key={y} x="12" y={y} width="48" height="8" rx="4" fill={a} />],
  list: (y) => [20, <g key={y}>{[0, 7, 14].map((d) => <rect key={d} x="12" y={y + d} width="108" height="5" rx="1.5" fill="none" stroke={LINE} />)}</g>],
  features: (y) => [20, <g key={y}>{[0, 1, 2].map((i) => <rect key={i} x={12 + i * 37} y={y} width="34" height="18" rx="3" fill="none" stroke={LINE} />)}</g>],
  testimonials: (y) => [18, <g key={y}>{[0, 1].map((i) => <rect key={i} x={12 + i * 55} y={y} width="52" height="16" rx="3" fill={SOFT} />)}</g>],
  faq: (y) => [20, <g key={y}>{[0, 7, 14].map((d) => <rect key={d} x="12" y={y + d} width="108" height="5" rx="1.5" fill={SOFT} />)}</g>],
  contact: (y) => [11, <rect key={y} x="12" y={y} width="56" height="8" rx="4" fill="#1fa855" />],
  orderForm: (y) => [24, <g key={y}><rect x="12" y={y} width="108" height="22" rx="3" fill="none" stroke={LINE} /><rect x="18" y={y + 5} width="50" height="4" rx="2" fill={SOFT} /><rect x="18" y={y + 13} width="36" height="5" rx="2.5" fill="#1fa855" /></g>],
  video: (y) => [22, <g key={y}><rect x="12" y={y} width="108" height="22" rx="3" fill={INK} /><path d={`M62 ${y + 6}l10 5-10 5z`} fill="#fff" /></g>],
  footer: (y) => [8, <rect key={y} x="38" y={y + 2} width="56" height="3" rx="1.5" fill={LINE} />],
};

export function Thumb({ project, accent }: { project: Project; accent: string }) {
  const parts: ReactNode[] = [];
  if (project.kind === "bot") {
    const labels = project.nodes.filter((n) => n.parent === "root").slice(0, 4);
    parts.push(<rect key="b" x="10" y="9" width="84" height="22" rx="8" fill={SOFT} />, <rect key="b1" x="18" y="16" width="58" height="3" rx="1.5" fill={INK} opacity=".55" />, <rect key="b2" x="18" y="23" width="38" height="3" rx="1.5" fill={LINE} />);
    labels.forEach((_, i) => parts.push(<rect key={`k${i}`} x="10" y={38 + i * 12} width="112" height="9" rx="4" fill="none" stroke={accent} strokeWidth="1.5" />));
  } else {
    let y = 0;
    for (const b of project.blocks) {
      if (y > H - 6) break;
      const [h, node] = SHAPES[b.type](y + (b.type === "hero" ? 0 : 4), accent);
      parts.push(node);
      y += h + (b.type === "hero" ? 0 : 4);
    }
  }
  return (
    <svg className="thumb" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aperçu de la structure" preserveAspectRatio="xMidYMin slice">
      <rect width={W} height={H} fill="#fff" />
      {parts}
    </svg>
  );
}
