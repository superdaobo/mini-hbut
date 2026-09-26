import { P as invoke } from "./runtime-bridge-BDjl3Bnt.js";
import "./more-modules-DiLNQOO4.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
