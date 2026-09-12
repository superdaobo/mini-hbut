import { O as invoke } from "./runtime-bridge-Dt57BD2i.js";
import "./more-modules-DaLSEgdg.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
