import { v as t } from "./app-demo-BXR7Wchv.js";
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
