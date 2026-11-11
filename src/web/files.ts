import { strToU8, zipSync } from "fflate";

function save(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const downloadText = (filename: string, text: string, mime = "text/plain"): void => save(new Blob([text], { type: `${mime};charset=utf-8` }), filename);

export function downloadZip(filename: string, files: Record<string, string>): void {
  const data = zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])));
  save(new Blob([data as BlobPart], { type: "application/zip" }), filename);
}

export const openHtml = (html: string): void => {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Dans l'aperçu, les liens externes s'ouvrent dans un nouvel onglet au lieu de remplacer la page. */
const PREVIEW_SCRIPT =
  "<script>document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('a');if(!a)return;var h=a.getAttribute('href')||'';if(h.charAt(0)==='#')return;e.preventDefault();if(h!=='#')window.open(a.href,'_blank','noopener')})</script>";

export const previewHtml = (html: string): string => html.replace("</body>", `${PREVIEW_SCRIPT}</body>`);
