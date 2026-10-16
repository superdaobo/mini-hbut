import { Y as invoke } from "./runtime-bridge-DtTGpr5b.js";
import "./more-modules-DxXoZJOA.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
