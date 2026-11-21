import { Y as invoke } from "./runtime-bridge-BNc94E8M.js";
import "./more-modules-_ebfrMaq.js";
import "./vue-core-4L5yFbGc.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
