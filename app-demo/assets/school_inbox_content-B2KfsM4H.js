const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ALLOWED_TAGS = /* @__PURE__ */ new Set(["A", "BR", "P", "DIV", "SPAN", "STRONG", "B", "I", "EM", "UL", "OL", "LI"]);
const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(String(value || ""));
const sanitizeSchoolInboxHtml = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";
  if (typeof document === "undefined") {
    return input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
  }
  const template = document.createElement("template");
  template.innerHTML = input;
  const walk = (node) => {
    const children = [...node.childNodes];
    children.forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child;
      if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(document.createTextNode(el.textContent || ""));
        return;
      }
      [...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        if (el.tagName === "A" && name === "href") return;
        if (name === "class") return;
        el.removeAttribute(attr.name);
      });
      if (el.tagName === "A") {
        const href = String(el.getAttribute("href") || "").trim();
        if (!/^https?:\/\//i.test(href)) {
          el.removeAttribute("href");
        } else {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      walk(el);
    });
  };
  walk(template.content);
  return template.innerHTML;
};
const linkifyPlainText = (text) => {
  const escaped = escapeHtml(text);
  return escaped.replace(/\n/g, "<br/>").replace(URL_PATTERN, (url) => {
    const safeUrl = escapeHtml(url);
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
  });
};
const buildSchoolInboxDetailHtml = (body) => {
  const raw = String(body || "").trim();
  if (!raw) return "<p>暂无正文内容</p>";
  if (looksLikeHtml(raw)) return sanitizeSchoolInboxHtml(raw);
  return `<p>${linkifyPlainText(raw)}</p>`;
};
export {
  buildSchoolInboxDetailHtml as b
};
