import { n as normalizeTeacherText, b as normalizeSemester } from "./teacherApi-BZ56ekcn.js";
import { X as readLoginFormAccount } from "./runtime-bridge-gQMtwwk6.js";
const TEACHER_SCOPE_PREFIX = "teacher";
const UNKNOWN_SCOPE_PART = "_";
const TEACHER_ACCOUNT_KEY = "hbu_teacher_account";
const resolveTeacherAccountId = (fallback) => {
  let dedicated = "";
  try {
    dedicated = globalThis.localStorage?.getItem(TEACHER_ACCOUNT_KEY) ?? "";
  } catch {
    dedicated = "";
  }
  return normalizeScopeAccountId(readLoginFormAccount("teacher")) || normalizeScopeAccountId(dedicated) || normalizeScopeAccountId(fallback);
};
const canPersistTeacherState = (accountId) => normalizeScopeAccountId(accountId) !== "";
const normalizeScopeAccountId = (accountId) => normalizeTeacherText(accountId);
const buildTeacherScopeKey = (accountId, semester) => {
  const account = normalizeScopeAccountId(accountId) || UNKNOWN_SCOPE_PART;
  const term = normalizeSemester(semester) || UNKNOWN_SCOPE_PART;
  return `${TEACHER_SCOPE_PREFIX}:${account}:${term}`;
};
const buildTeacherScopedKey = (kind, accountId, semester) => `${buildTeacherScopeKey(accountId, semester)}:${normalizeTeacherText(kind) || UNKNOWN_SCOPE_PART}`;
export {
  buildTeacherScopedKey as b,
  canPersistTeacherState as c,
  normalizeScopeAccountId as n,
  resolveTeacherAccountId as r
};
