// 教师身份校验：确认 jwxt 会话的 currentRoleId / 工号 / 部门 / 学期
import { probe, isLoginPage, mask } from './probe-lib.mjs';

const out = { jwxt: {}, ehbut: {} };

// 1. 教务身份（POST /admin/getMenuList）
const menu = await probe('https://jwxt.hbut.edu.cn/admin/getMenuList', { method: 'POST' });
out.jwxt.menuStatus = menu.status;
out.jwxt.loginPage = isLoginPage(menu);
if (Array.isArray(menu.json) && menu.json.length) {
  const n = menu.json[0];
  out.jwxt.identity = {
    currentRoleId: n.currentRoleId,
    currentUserName: n.currentUserName ? '<工号 len=' + n.currentUserName.length + '>' : null,
    currentDepartmentId: n.currentDepartmentId,
    dataXnxq: n.dataXnxq,
    currentJsId: n.currentJsId ? '<id len=' + String(n.currentJsId).length + '>' : null,
    currentUserId: n.currentUserId ? '<id>' : null,
  };
  out.jwxt.menuCount = menu.json.length;
  // 菜单一级项（功能清单来源）
  out.jwxt.topMenus = menu.json.map(m => ({ id: m.id, name: m.name, url: m.url, children: (m.children || []).length }));
} else {
  out.jwxt.bodySample = mask(menu.text).slice(0, 400);
}

// 2. 教务首页身份兜底
const home = await probe('https://jwxt.hbut.edu.cn/admin/?loginType=1');
out.jwxt.homeStatus = home.status;
out.jwxt.roleIdHidden = (home.text.match(/id="roleId"[^>]*value="([^"]*)"/) || [, null])[1];
out.jwxt.adminNameLen = (home.text.match(/class="admin_name">([^<]*)</) || [, null])[1]?.length ?? null;
out.jwxt.arrowbtLen = (home.text.match(/class="arrowbt">([^<]*)</) || [, null])[1]?.length ?? null;

// 3. 门户身份（e.hbut.edu.cn getLoginUser / user/info）
const eh = await probe('https://e.hbut.edu.cn/getLoginUser');
out.ehbut.getLoginUserStatus = eh.status;
out.ehbut.getLoginUserSample = mask(eh.text).slice(0, 300);

const eh2 = await probe('https://e.hbut.edu.cn/getUserPermissionRouters');
out.ehbut.permStatus = eh2.status;
out.ehbut.permSample = mask(eh2.text).slice(0, 300);

console.log(JSON.stringify(out, null, 2));
