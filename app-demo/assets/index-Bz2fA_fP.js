import { Q as invoke } from "./runtime-bridge-BJPPshl2.js";
import "./more-modules-BrF98WFH.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
