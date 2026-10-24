import { Y as invoke } from "./runtime-bridge-BimU7Kjk.js";
import "./more-modules-DshM5kk8.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
