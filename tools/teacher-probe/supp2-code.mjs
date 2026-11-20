// 第二轮小补跑：收口剩余参数缺口（只读）
import fs from 'node:fs';
import path from 'node:path';
import { call, dump, results } from './code-lib.mjs';

const OUTF = process.env.PROBE_OUT || path.join(process.cwd(), '..', '..', 'data', 'teacher-portal-recon-1120', 'raw', 'code-teacher-probe.json');

await call('user/info', '/server/user/info', {});
await call('home/appList#full', '/server/home/appList', {});

// bllt/querySingleConsumeRank 再要 sortOrder
await call('bllt/querySingleConsumeRank#so0', '/server/bllt/querySingleConsumeRank',
  { starttime: '2026-11-01', endtime: '2026-11-20', sortOrder: '0' });
await call('bllt/querySingleConsumeRank#so1', '/server/bllt/querySingleConsumeRank',
  { starttime: '2026-11-01', endtime: '2026-11-20', sortOrder: '1' });
await call('bllt/querySingleConsumeRank#desc', '/server/bllt/querySingleConsumeRank',
  { starttime: '2026-11-01', endtime: '2026-11-20', sortOrder: 'desc' });

await call('water/device/info#posCode', '/server/water/device/info', { posCode: '0001' });
await call('home/notice#id', '/server/home/notice', { id: '1290256558785036316' });
await call('card/lossList#retry', '/server/card/lossList', {});
await call('user/systemMTradeListByPage#p', '/server/user/systemMTradeListByPage',
  { pageSize: 10, pageNo: 0, tradeType: '1,2,3', fromDate: '2026-09-01', toDate: '2026-11-20' });
await call('user/repayList#p', '/server/user/repayList',
  { pageSize: 10, pageNo: 0, tradeType: '1,2,3', fromDate: '2026-09-01', toDate: '2026-11-20' });
await call('home/tip#recharge', '/server/home/tip', { code: 'recharge' });
await call('auth/organizations#hbut', '/server/auth/organizations', { code: 'hbut' });
await call('consume/paySuccessInfo', '/server/consume/paySuccessInfo', {});
await call('apply/queryProgress#type', '/server/apply/queryProgress', { applyType: '1' });
await call('merchant/report', '/server/merchant/report', {});
await call('merchant/sum', '/server/merchant/sum', {});
await call('recharge/orderStatus', '/server/recharge/orderStatus', { orderNo: '0' });
await call('transFormal/getAuditResult#retry', '/server/transFormal/getAuditResult', {});

// 追加合并
const merged = JSON.parse(fs.readFileSync(OUTF, 'utf8'));
const out = dump();
const fresh = JSON.parse(fs.readFileSync(out, 'utf8'));
fs.writeFileSync(out, JSON.stringify([...merged, ...fresh], null, 2), 'utf8');
console.log('总数 =', merged.length + fresh.length, '本轮 =', fresh.length);
