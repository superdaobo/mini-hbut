import { Y as invoke } from "./runtime-bridge-z2ulLxEq.js";
import "./more-modules-DkooyOvE.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
