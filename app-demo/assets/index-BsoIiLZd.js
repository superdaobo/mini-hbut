import { Y as invoke } from "./runtime-bridge-BViGMv5P.js";
import "./more-modules-6OuVUGvL.js";
import "./vue-core-CVT-P0lT.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
