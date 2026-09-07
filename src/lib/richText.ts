const ALLOWED_TAGS = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H1", "H2", "H3",
  "I", "LI", "OL", "P", "PRE", "S", "SPAN", "STRONG", "U", "UL",
]);

export function sanitizeRichText(html: string): string {
  if (typeof DOMParser === "undefined") return html;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  if (!root) return "";
  for (const element of [...root.querySelectorAll("*")]) {
    if (!ALLOWED_TAGS.has(element.tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const keepHref = element.tagName === "A" && attribute.name === "href";
      if (!keepHref) element.removeAttribute(attribute.name);
    }
    if (element.tagName === "A") {
      const href = element.getAttribute("href")?.trim() ?? "";
      if (!/^(https?:|mailto:)/i.test(href)) element.removeAttribute("href");
      else {
        element.setAttribute("target", "_blank");
        element.setAttribute("rel", "noreferrer");
      }
    }
  }
  return root.innerHTML;
}

/** Keep portable backups from persisting active HTML in rich-text memos. */
export function sanitizeImportedMemoContent(
  content: string,
  format: string | null | undefined,
): string {
  return format === "richtext" ? sanitizeRichText(content) : content;
}

export function richTextToPlainText(html: string): string {
  if (typeof DOMParser === "undefined") return html.replace(/<[^>]*>/g, " ");
  return new DOMParser().parseFromString(html, "text/html").body.textContent?.replace(/\s+/g, " ").trim() ?? "";
}
