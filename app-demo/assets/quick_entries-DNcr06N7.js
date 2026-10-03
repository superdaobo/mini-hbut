let pendingModuleId = "";
const requestGameOpen = (moduleId) => {
  const id = String(moduleId ?? "").trim();
  if (!id) return false;
  pendingModuleId = id;
  return true;
};
const consumeGameOpen = () => {
  const id = pendingModuleId;
  pendingModuleId = "";
  return id;
};
const GAME_CENTER_TAB_KEYS = Object.freeze([
  "home",
  "games",
  "rank",
  "globalRank",
  "points",
  "drift",
  "me"
]);
const GAME_CENTER_QUICK_ENTRIES = Object.freeze([
  Object.freeze({
    id: "points",
    icon: "🪙",
    titleKey: "more.quickEntries.points.title",
    descKey: "more.quickEntries.points.desc",
    tab: "points",
    requiredFlags: Object.freeze(["game_center_enabled", "game_economy_enabled"]),
    requiredCapabilities: Object.freeze(["wallet"])
  }),
  Object.freeze({
    id: "rank",
    icon: "🏆",
    titleKey: "more.quickEntries.rank.title",
    descKey: "more.quickEntries.rank.desc",
    tab: "globalRank",
    requiredFlags: Object.freeze(["game_center_enabled", "game_verified_session_enabled"]),
    requiredCapabilities: Object.freeze(["leaderboards"])
  }),
  Object.freeze({
    id: "drift",
    icon: "🍾",
    titleKey: "more.quickEntries.drift.title",
    descKey: "more.quickEntries.drift.desc",
    tab: "drift",
    requiredFlags: Object.freeze(["game_center_enabled", "drift_bottle_enabled"]),
    requiredCapabilities: Object.freeze(["drift_bottle"])
  }),
  Object.freeze({
    id: "games",
    icon: "🎮",
    titleKey: "more.quickEntries.games.title",
    descKey: "more.quickEntries.games.desc",
    tab: "games",
    requiredFlags: Object.freeze(["game_center_enabled"]),
    requiredCapabilities: Object.freeze([])
  })
]);
const isGameCenterQuickEntryVisible = (entry, context = {}) => {
  const flags = context.flags;
  if (!flags || typeof flags !== "object") return false;
  for (const key of entry.requiredFlags) {
    if (flags[key] !== true) return false;
  }
  const capabilities = context.capabilities;
  if (capabilities === void 0 || capabilities === null) return true;
  if (typeof capabilities !== "object") return false;
  for (const key of entry.requiredCapabilities) {
    if (capabilities[key] !== true) return false;
  }
  return true;
};
const listVisibleGameCenterQuickEntries = (context = {}) => GAME_CENTER_QUICK_ENTRIES.filter((entry) => isGameCenterQuickEntryVisible(entry, context));
const findGameCenterQuickEntry = (entryId) => {
  const id = String(entryId ?? "").trim();
  if (!id) return null;
  return GAME_CENTER_QUICK_ENTRIES.find((entry) => entry.id === id) || null;
};
let pendingTab = "";
const requestGameCenterTab = (tab) => {
  const key = String(tab ?? "").trim();
  if (!GAME_CENTER_TAB_KEYS.includes(key)) return false;
  pendingTab = key;
  return true;
};
const requestGameCenterTabForEntry = (entryId) => {
  const entry = findGameCenterQuickEntry(entryId);
  if (!entry) return false;
  return requestGameCenterTab(entry.tab);
};
const consumeGameCenterTab = () => {
  const tab = pendingTab;
  pendingTab = "";
  return tab;
};
export {
  consumeGameCenterTab as a,
  requestGameOpen as b,
  consumeGameOpen as c,
  listVisibleGameCenterQuickEntries as l,
  requestGameCenterTabForEntry as r
};
