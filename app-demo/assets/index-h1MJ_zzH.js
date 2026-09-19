import { O as invoke } from "./runtime-bridge-i9KZPKjs.js";
import "./more-modules-rEERMQm_.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
