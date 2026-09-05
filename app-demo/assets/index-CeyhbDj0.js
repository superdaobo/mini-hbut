import { O as invoke } from "./runtime-bridge-HjlgKupV.js";
import "./more-modules-c4l-U-qE.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
