const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi;
const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const ALLOWED_TAGS = /* @__PURE__ */ new Set(["A", "BR", "P", "DIV", "SPAN", "STRONG", "B", "I", "EM", "UL", "OL", "LI"]);
const parseHtmlTag = (raw) => {
  const trimmed = raw.trim();
  const nameMatch = /^\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(trimmed);
  if (!nameMatch) return null;
  return {
    name: nameMatch[1].toUpperCase(),
    closing: trimmed.startsWith("/"),
    rest: trimmed.slice(nameMatch[0].length)
  };
};
const extractSafeHref = (rest) => {
  const match = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rest);
  const rawValue = match ? match[1] ?? match[2] ?? match[3] ?? "" : "";
  const value = rawValue.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return /^https?:\/\//i.test(value) ? value : "";
};
const sanitizeHtmlWithoutDom = (input) => {
  let out = "";
  let index = 0;
  const len = input.length;
  while (index < len) {
    const lt = input.indexOf("<", index);
    if (lt === -1) {
      out += input.slice(index);
      break;
    }
    out += input.slice(index, lt);
    const gt = input.indexOf(">", lt + 1);
    if (gt === -1) {
      out += input.slice(lt);
      break;
    }
    const parsed = parseHtmlTag(input.slice(lt + 1, gt));
    if (!parsed) {
      out += "<";
      index = lt + 1;
      continue;
    }
    const { name, closing, rest } = parsed;
    index = gt + 1;
    if (!ALLOWED_TAGS.has(name)) continue;
    if (closing) {
      out += `</${name.toLowerCase()}>`;
      continue;
    }
    if (name === "A") {
      const href = extractSafeHref(rest);
      out += href ? `<a href="${href.replace(/"/g, "&quot;")}" target="_blank" rel="noopener noreferrer">` : "<a>";
      continue;
    }
    out += `<${name.toLowerCase()}>`;
  }
  return out;
};
const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(String(value || ""));
const sanitizeSchoolInboxHtml = (raw) => {
  const input = String(raw || "").trim();
  if (!input) return "";
  if (typeof document === "undefined") {
    return sanitizeHtmlWithoutDom(input);
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
