const LOGIN_METHOD_KEY = "hbu_login_method";
const LOGIN_TEMP_FLAG_KEY = "hbu_login_temporary";
const isTemporaryLoginSession = () => {
  try {
    const method = String(localStorage.getItem(LOGIN_METHOD_KEY) || "").trim();
    const marked = localStorage.getItem(LOGIN_TEMP_FLAG_KEY) === "1";
    return marked || method.endsWith("_temp");
  } catch {
    return false;
  }
};
const resolveSessionExpiryAction = (hasCachedData) => {
  if (isTemporaryLoginSession()) return "logout";
  return hasCachedData ? "degrade" : "error";
};
export {
  resolveSessionExpiryAction as r
};
