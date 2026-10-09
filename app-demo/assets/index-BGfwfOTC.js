import { V as invoke } from "./runtime-bridge-gQMtwwk6.js";
import "./more-modules-yxgAg-Rh.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
