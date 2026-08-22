import { N as invoke } from "./runtime-bridge-BU9jeOXP.js";
import "./more-modules-CfNfahoc.js";
async function keepScreenOn(enable) {
  await invoke("plugin:keep-screen-on|keep_screen_on", {
    enable
  });
}
export {
  keepScreenOn
};
