import { K as invoke } from "./runtime-bridge-Ds80RevU.js";
import "./more-modules-DDZK9iEH.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
