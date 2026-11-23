import { Y as invoke } from "./runtime-bridge-D89yarmp.js";
import "./more-modules-CjuZH60i.js";
import "./vue-core-4L5yFbGc.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
