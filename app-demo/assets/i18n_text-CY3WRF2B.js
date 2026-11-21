import { e as t } from "./more-modules-_ebfrMaq.js";
const tf = (key, params) => {
  let text = t(key);
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
};
export {
  tf as t
};
