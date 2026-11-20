// 收尾补跑：带参只读查询，结果【追加】到既有 code-teacher-probe.json
// 运行：$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; node supp-code.mjs
import fs from 'node:fs';
import path from 'node:path';
import { call, dump, results, refresh, TOKEN } from './code-lib.mjs';

const BACKUP = path.join(process.env.PROBE_OUT || path.join(process.cwd(), '..', '..', 'data', 'teacher-portal-recon-1120', 'raw', 'code-teacher-probe.json') + '.bak77');
const OUTF = process.env.PROBE_OUT || path.join(process.cwd(), '..', '..', 'data', 'teacher-portal-recon-1120', 'raw', 'code-teacher-probe.json');
// 备份既有 77 条（只备份一次）
if (!fs.existsSync(BACKUP)) fs.copyFileSync(OUTF, BACKUP);

const FROM = '2026-09-01';
const TO = '2026-11-20';
const MONTH = '2026-11';

// —— 交易流水（参数形态取自学生端实测） ——
await call('user/tradeList#all', '/server/user/tradeList',
  { pageSize: '30', tradeType: '1,2,3', fromDate: FROM, toDate: TO, pageNo: 0 });
await call('user/tradeList#consume', '/server/user/tradeList',
  { pageSize: '30', tradeType: '1', fromDate: FROM, toDate: TO, pageNo: 0 });
await call('user/tradeListConfig#balance', '/server/user/tradeListConfig', { balance: true });
await call('user/balanceTradeList#main', '/server/user/balanceTradeList',
  { pageSize: 20, tradeType: '11,12,13', fromDate: FROM, toDate: TO, pageNo: 0, accType: '0' });
await call('user/balanceTradeList#subsidy', '/server/user/balanceTradeList',
  { pageSize: 20, tradeType: '11,12,13', fromDate: FROM, toDate: TO, pageNo: 0, accType: 'A10004950' });
await call('user/custom/tradeList#consume', '/server/user/custom/tradeList',
  { pageSize: '30', tradeType: '1', fromDate: FROM, toDate: TO, pageNo: 0 });
await call('user/tradeListType', '/server/user/tradeListType', {});
await call('user/systemMTradeListByPage', '/server/user/systemMTradeListByPage',
  { pageSize: 10, pageNo: 0 });
await call('user/payConfig', '/server/user/payConfig', {});
await call('user/repayList', '/server/user/repayList', {});
await call('user/idPhoto', '/server/user/idPhoto', {});
await call('user/idFacePhoto', '/server/user/idFacePhoto', {});

// —— 水电缴费 ——
for (const t of ['water', 'electric', 'broadband']) {
  await call(`utilities/config#${t}`, '/server/utilities/config', { utilityType: t });
}
// location 级联（教师未绑定房间，bigArea 起步能选则继续两级即停）
const loc0 = await call('utilities/location#bigArea',
  '/server/utilities/location',
  { utilityType: 'electric', locationType: 'bigArea', bigArea: '', area: '', building: '', unit: '', level: '', room: '', subArea: '' });
try {
  const j = JSON.parse(loc0.sample.split(' || ')[0]);
  const list = j?.resultData?.locationList || [];
  if (list.length) {
    const area = String(list[0].id);
    const loc1 = await call('utilities/location#building',
      '/server/utilities/location',
      { utilityType: 'electric', locationType: 'building', bigArea: '', area, building: '', unit: '', level: '', room: '', subArea: '' });
    const j1 = JSON.parse(loc1.sample.split(' || ')[0]);
    const b = (j1?.resultData?.locationList || [])[0];
    if (b) {
      await call('utilities/location#unit', '/server/utilities/location',
        { utilityType: 'electric', locationType: 'unit', bigArea: '', area, building: String(b.id), unit: '', level: '', room: '', subArea: '' });
    }
  }
} catch (e) { console.log('location 级联解析失败:', e.message); }
await call('utilities/account#unbound', '/server/utilities/account',
  { bigArea: '', area: '', building: '', unit: '', level: '', room: '', subArea: '', utilityType: 'electric' });
await call('utilities/usageDetails#unbound', '/server/utilities/usageDetails',
  { bigArea: '', area: '', building: '', unit: '', level: '', room: '', subArea: '', utilityType: 'electric', fromDate: FROM, toDate: TO, pageSize: 30, pageNo: 0 });
await call('utilities/packageList#electric', '/server/utilities/packageList', { utilityType: 'electric' });
await call('utilities/packageList#broadband', '/server/utilities/packageList', { utilityType: 'broadband' });

// —— 热水/淋浴 ——
await call('water/tradeList#paged', '/server/water/tradeList', { pageNo: 0, pageSize: '30' });
await call('water/freeWaterQuota', '/server/water/freeWaterQuota', { txdate: TO });
await call('water/freeWatreTradeList#paged', '/server/water/freeWatreTradeList', { pageNo: 0, pageSize: '30' });
await call('water/appointCount', '/server/water/appointCount', {});
await call('water/device/info', '/server/water/device/info', { deviceNo: '0001' });

// —— 账单聚合 bllt（无参全挂，猜常见参数名） ——
await call('bllt/querySingleConsumeRank#date', '/server/bllt/querySingleConsumeRank',
  { starttime: FROM, endtime: TO });
await call('bllt/querySingleConsumeRank#month', '/server/bllt/querySingleConsumeRank',
  { starttime: MONTH + '-01', endtime: TO, typecode: 'restaurant' });
await call('bllt/queryChartList#p', '/server/bllt/queryChartList', { month: MONTH });
await call('bllt/queryConsumeGroupByType#p', '/server/bllt/queryConsumeGroupByType',
  { starttime: FROM, endtime: TO });
await call('bllt/queryConsumeTotalDay#p', '/server/bllt/queryConsumeTotalDay', { txdate: TO });
await call('bllt/queryConsumeTradeTatol#p', '/server/bllt/queryConsumeTradeTatol',
  { starttime: FROM, endtime: TO });
await call('bllt/queryUserMonthlybillHalfOfYear#p', '/server/bllt/queryUserMonthlybillHalfOfYear',
  { month: MONTH });
await call('bllt/queryMealInterestBill#p', '/server/bllt/queryMealInterestBill',
  { starttime: MONTH + '-01', endtime: TO });
await call('bllt/queryCardSelfTradeList#p', '/server/bllt/queryCardSelfTradeList',
  { pageSize: 30, pageNo: 0, fromDate: FROM, toDate: TO });

// —— 退款/充值只读 ——
await call('refund/getRefundList', '/server/refund/getRefundList',
  { startDate: FROM, endDate: TO, pageNo: 0, pageSize: '30' });
await call('refund/page', '/server/refund/page', {});
await call('refund/banklist', '/server/refund/banklist', {});
await call('refund/donateConfig', '/server/refund/donateConfig', {});
await call('refund/getRefundMode', '/server/refund/getRefundMode', {});
await call('recharge/config', '/server/recharge/config', {});
await call('pay/withholdStatus', '/server/pay/withholdStatus', {});

// —— 首页/通知/杂项 ——
await call('home/noticeList#01', '/server/home/noticeList', { type: '01' });
await call('home/noticeList#num', '/server/home/noticeList', { type: 0, typeCode: '' });
await call('home/tip#home', '/server/home/tip', { code: 'home' });
await call('auth/organizations', '/server/auth/organizations', { code: '' });
await call('auth/casConfig#empty', '/server/auth/casConfig', {});
await call('auth/bindCard/config', '/server/auth/bindCard/config', {});
await call('card/lossList', '/server/card/lossList', {});
await call('merchant/tradeList#dates', '/server/merchant/tradeList',
  { fromDate: FROM, toDate: TO, pageNo: 0, pageSize: '30' });

// —— IoT ——
await call('iotdevice/devices', '/server/iotdevice/devices', {});
await call('iotdevice/devicescounts', '/server/iotdevice/devicescounts', {});
await call('iotdevice/devicetype', '/server/iotdevice/devicetype', {});

// —— 校园码只读（绝不生成付款码） ——
await call('virtualCard/config#devCode', '/server/virtualCard/config', { devCode: 'web' });
await call('virtualCard/offlineSeq', '/server/virtualCard/offlineSeq', {});
await call('virtualCard/orderStatus#probe', '/server/virtualCard/orderStatus', { orderNo: '0' });

// —— 班车补充 ——
await call('car/getRoute#probe', '/server/car/getRoute', { routeId: '1' });
await call('car/shiftList#probe', '/server/car/shiftList', { routeId: '1' });

// dump() 会把 results 写到 OUT（覆盖）；先读备份再合并追加
const backup = JSON.parse(fs.readFileSync(BACKUP, 'utf8'));
const out = dump();
const fresh = JSON.parse(fs.readFileSync(out, 'utf8'));
fs.writeFileSync(out, JSON.stringify([...backup, ...fresh], null, 2), 'utf8');
console.log('merged ->', out, '总数 =', backup.length + fresh.length, '本轮 =', fresh.length);
