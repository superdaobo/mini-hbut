import { Y as invoke } from "./runtime-bridge-DUXlIKPv.js";
import "./more-modules-db_bOw0h.js";
import "./vue-core-CVT-P0lT.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
