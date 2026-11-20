// recon-probe.mjs — 教师端只读接口实测
// 输出: data/teacher-portal-recon-1120/raw/jwxt-teacher-probe.json
import fs from 'node:fs';
import { probe, isLoginPage, mask } from './probe-lib.mjs';

const OUT = 'D:/wt/teacher-portal-probe-1120/data/teacher-portal-recon-1120/raw/jwxt-teacher-probe.json';
const BASE = 'https://jwxt.hbut.edu.cn';
const TID = 'WGEyQ0135AA408FEA5B5E7E134B828608BF94AFBC2D29DAD5C3E866B20C4BEBEF8D16DC200B73B46567C78';
const XNXQ = '2026-2027-1';
const FORM = { 'Content-Type': 'application/x-www-form-urlencoded' };
const JQ = 'gridtype=jqgrid&_search=false';
const PAGE = 'page.pn=1&page.size=20';
const QF = (fields) => `queryFields=${encodeURIComponent(fields)}`;

// 通用 jqGrid POST（页面真实形态）
const post = (url, body) => ({ url, method: 'POST', body, headers: FORM });
const get = (url) => ({ url, method: 'GET' });

const TASKS = [
  // ============ 我的课表 ============
  { page: '我的课表', ...get(`/admin/pkgl/pkgljskb/getJskbByXqid?xnxq=${XNXQ}&id=${TID}&xqdm=&isjsd=0&sftqz=0&xsqbkb=0&zc=`) },
  { page: '我的课表', ...get(`/admin/pkgl/pkgljskb/getJskbByXqid?xnxq=${XNXQ}&id=${TID}&xqdm=&isjsd=0&sftqz=0&xsqbkb=0&zc=7`), note: 'zc=7 单周过滤' },
  { page: '我的课表', ...get(`/admin/pkgl/pkgljskb/ajaxJskbList?xnxq=${XNXQ}&jsid=${TID}`), note: 'jsid 用加密 teacherId 试' },
  { page: '我的课表', ...get(`/admin/api/getZclistByXnxq?xnxq=${XNXQ}&role=&userId=&xqid=`) },
  { page: '我的课表', ...get(`/admin/api/getRqListByWeek?xnxq=${XNXQ}&week=7`) },
  { page: '我的课表', ...get(`/admin/pkgl/pkgljskb/getJxbzcxq?xnxq=${XNXQ}&jxbid=0fa2a700a1d544ca809a91e70b44a6be`), note: 'jxbid 来自上一轮教学班列表' },

  // ============ 班级课表 ============
  { page: '班级课表', ...post(`/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid`, `${QF('id,encodeId,xqdm,xnxq,rxnf,yxmc,zymc,xz,bjmc,bjrs,bjbh,zyfx,zyxz,kbbz')}&${PAGE}`) },
  { page: '班级课表', ...get(`/admin/pkgl/kbcx/bjkb/qryBjxx?qx=1&showLastRxnf=&kyzt=&gridtype=jqgrid`), note: 'GET 形态对照' },
  { page: '班级课表', ...get(`/admin/api/jcsj/bmsj/getYxSelectUnionByStudent`) },
  { page: '班级课表', ...get(`/admin/api/jcsj/zysj/getZySelectUnion`) },
  { page: '班级课表', ...get(`/admin/api/jcsj/bjxx/getBjSelectUnion`) },

  // ============ 教室课表 ============
  { page: '教室课表', ...post(`/admin/pkgl/pkglcroomkb/ajaxListCustom?gridtype=jqgrid`, `${QF('id,xqdm,encodeId,xnxq,xqmc,jsbh,jsmc,jxlmc,zdskrnrs,jslx,jsms,kbbz')}&${PAGE}`) },
  { page: '教室课表', ...get(`/admin/pkgl/pkjssz/getJxlList?xqdm=`) },
  { page: '教室课表', ...get(`/admin/pkgl/pkglqxzkb/getJcinfo?xnxq=${XNXQ}`) },
  { page: '教室课表', ...get(`/admin/system/jxzy/jsxx/getjiaosList1`) },
  { page: '教室课表', ...get(`/admin/pkgl/pkglcroomkb/isOK?checkType=`) },

  // ============ 全校总课表 ============
  { page: '全校总课表', ...post(`/admin/jsd/qxzkb/queryQxkbPage?qx=0&yskb=0&gridtype=jqgrid`, `${QF('id,jxbid,jxbbh,kcbh,kcmc,kcxz,xnxq,xf,skjs,xqmc,nj,kkyxmc,sksjdd,jxbmc,jxbzc,bjrs,ksxs,type,jsmc,jxlmc,skdd,showzc')}&${PAGE}`) },
  { page: '全校总课表', ...get(`/admin/jsd/qxzkb/querylist`), note: '父任务标注 POST 会 500，验证 GET' },
  { page: '全校总课表', ...post(`/admin/jsd/qxzkb/querylist`, `${QF('id,kcmc')}&${PAGE}`), note: '验证 POST 是否 500' },
  { page: '全校总课表', ...get(`/admin/jsd/qxzkb/getXlrqRqRange?xnxq=${XNXQ}`), note: '新发现：校历日期范围' },
  { page: '全校总课表', ...get(`/admin/system/jcsj/zysj/getZyListByAuth`) },
  { page: '全校总课表', ...get(`/admin/system/jcsj/bjxx/getBjListByAuth`) },
  { page: '全校总课表', ...get(`/admin/jsd/qxzkb/tjskqk?xnxq=${XNXQ}`), note: '带 xnxq 重试' },

  // ============ 空教室 ============
  { page: '空教室', ...post(`/admin/system/jxzy/jsxx/getZyKjs?gridtype=jqgrid`, `${QF('id,jsbh,jsmc,jstp,kxjc,jslx,zdskrnrs,ksrnrs,jxlmc,szlc,gnqmc,xqmc,syyx,jyzt,jszt,jsbq,zylx')}&${PAGE}&xnxq=${XNXQ}&type=1&zcStr=7&xqStr=1&jcStr=9,10,11&jxldm=24`), note: '时间维度过滤 3号楼' },
  { page: '空教室', ...post(`/admin/system/jxzy/jsxx/getZcByXnxq`, `xnxq=${XNXQ}`) },
  { page: '空教室', ...post(`/admin/system/jxzy/jsxx/getXqrqxx`, `xnxq=${XNXQ}&zc=7`) },
  { page: '空教室', ...post(`/admin/system/jxzy/jsxx/getSzInfo`, ``) },
  { page: '空教室', ...get(`/admin/system/jxzy/jsxx/getXnxqInformation?xnxq=${XNXQ}`) },
  { page: '空教室', ...get(`/admin/pkgl/jyjs/getZcXqJC?xnxq=${XNXQ}&zc=7`) },
  { page: '空教室', ...get(`/admin/pkgl/jyjs/getXnxqByJcxx?xnxq=${XNXQ}`) },
  { page: '空教室', ...get(`/admin/pkgl/jsjssz/getRqfw`), note: '新发现：借用日期范围' },
  { page: '空教室', ...get(`/admin/system/xtsz/getParam?key=PKGL_JSTJC_SFYXCTTK`), note: 'fe SPA 引用' },

  // ============ 教学任务 ============
  { page: '教学任务', ...post(`/admin/jsd/jxrw/ajaxListJsJxrw?gridtype=jqgrid`, `${QF('id,jxbid,zcxspzid,encodeid,xnxq,kcdm,kcmc,kclb,jxbbh,jxbmc,bjrs,xstype,kkxs,pkxs,kcxz,kklx,name,kkjys,xf,zongxs,llxs,shijianxs,syxs,xskcxs,jxjhzxs,zxs,ksxs,sfsjhj,sfsjhjname,sjzs,jxbjhrs,shzt,tjzt,sfqr,sksjdd')}&${PAGE}`) },
  { page: '教学任务', ...post(`/admin/jsd/kwglJsdJkcx/getZkKsrwByJxbid`, `jxbid=0fa2a700a1d544ca809a91e70b44a6be`), note: 'POST+get 语义' },
  { page: '教学任务', ...get(`/admin/jsd/jxrw/jxbzc?jxbid=0fa2a700a1d544ca809a91e70b44a6be`), note: '教学班组成页' },
  { page: '教学任务', ...get(`/admin/jsd/jxrw/jsdJxrws?zxjhid=`), note: '无参数形态' },

  // ============ 监考/考试/缓考 ============
  { page: '监考安排', ...post(`/admin/jsd/kwglJsdJkcx/ajaxJsjkList?gridtype=jqgrid`, `${QF('id,xnxq,kspcmc,ksfs,kcmc,ksrq,kscc,pcid,currentJsId,jsmc,xqmc,zjk,jkjsxm,kkyx,qjdd,kqkzts,kcbz,ksbj')}&${PAGE}`) },
  { page: '班级考试', ...post(`/admin/jsd/kwglJsdJkcx/ajaxJsrkjxbksList?encodeId=1&gridtype=jqgrid`, `${QF('id,kspcmc,sjbh,kkyx,kcmc,kssj,jsmc,jsname,lxdh,jkjs,jxbmc,skyx,bjmc,ksrs,rwbz,encodeId')}&${PAGE}`) },
  { page: '缓考任务', ...post(`/admin/kw/kwhkgl/hkmdcxjg?lx=`, `${QF('id,kkyx,kclb,kcmc,skyx,rkjs,cjlrjs,bjmc,xh,name,startTime,endTime,hmkyy,xdxz')}&${PAGE}`) },
  { page: '缓考任务', ...get(`/admin/kw/kwkssj/getKspcNew?xnxq=${XNXQ}`) },
  { page: '缓考任务', ...get(`/admin/kwgl/kspc/getKspc?xnxq=${XNXQ}`) },
  { page: '缓考任务', ...get(`/admin/kw/kwkssj/getKspc?xnxq=${XNXQ}`) },

  // ============ 成绩管理 ============
  { page: '教学班成绩查询', ...post(`/admin/jsd/jsdcjcx/jsdQueryJxbList?gridtype=jqgrid`, `${QF('id,jxbid,xnxq,kcbh,kcmc,name,jxbzc,cjfbzt,ksxs,bkbj,bjrs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩录入', ...post(`/admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=0&gridtype=jqgrid`, `${QF('id,sfklr,cjfxlrqssj,cjlrzt,tjzt,kcbh,kcmc,jxbid,jxbmc,sfbhbys,jxbzc,bkbj,jxbbh,cjfxms,jsmc,ylrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩录入', ...post(`/admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=1&gridtype=jqgrid`, `${QF('id,sfklr,cjfxlrqssj,cjlrzt,tjzt,kcbh,kcmc,jxbid,jxbmc,jxbzc,bkbj,jxbbh,cjfxms,jsmc,ylrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩录入', ...post(`/admin/jsd/jsdcjlr/queryCjlrsz/1?bkbj=2&gridtype=jqgrid`, `${QF('id,sfklr,cjfxlrqssj,cjlrzt,tjzt,kcbh,kcmc,jxbid,jxbmc,jxbzc,bkbj,jxbbh,cjfxms,jsmc,ylrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩录入', ...get(`/admin/jsd/jsdcjlr/querycjdlr/1`) },
  { page: '成绩录入', ...get(`/admin/cjgl/cjjdxkz/checkXz?gnym=&gnan=`) },
  { page: '成绩修改', ...post(`/admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=0&gridtype=jqgrid`, `${QF('id,xnxq,kcbh,kcmc,jxbid,jxbmc,bkbj,jxbzc,cjfxms,jsmc,ylrs,zrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩修改', ...post(`/admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=1&gridtype=jqgrid`, `${QF('id,xnxq,kcbh,kcmc,jxbid,jxbmc,bkbj,jxbzc,cjfxms,jsmc,ylrs,zrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩修改', ...post(`/admin/jsd/jsdcjxgsq/listCjxgsq/1?kslx=2&gridtype=jqgrid`, `${QF('id,xnxq,kcbh,kcmc,jxbid,jxbmc,bkbj,jxbzc,cjfxms,jsmc,ylrs,zrs,ksxs,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '成绩修改', ...post(`/admin/jsd/jsdcjxgsq/getCjxgjlByJxbid?kslx=0&gridtype=jqgrid`, `${QF('id,shzt,xh,xm,cjfxms,tscjbzXg,jxbmc,jxbid,xgqtscjbz,tscjbz,xgyy,clyj,sqsj')}&${PAGE}&jxbid=0fa2a700a1d544ca809a91e70b44a6be`), note: '上轮未测' },
  { page: '成绩修改', ...get(`/admin/cjgl/cjxgsjsz/checkCjxgXz?xnxq=${XNXQ}`) },
  { page: '学分统计', ...post(`/admin/xjgl/xftj/getxftjlist?encodeId=1&gridtype=jqgrid`, `${QF('id,encodeId,xh,xm,xbdm,yxdm,sznj,zymc,zyfxmc,bjmc,xfjd,cxxf,cxtgxf,zxfjd,jhwxf')}&${PAGE}`) },
  { page: '学分统计', ...get(`/admin/system/jcsj/zyfx/getZyfxList`) },

  // ============ 试卷 / 评教 ============
  { page: '试卷分析', ...post(`/admin/jsd/sjfx/jsdlistsjfx?gridtype=jqgrid`, `${QF('id,xnxq,kcbh,kcmc,kclb,kcxz,ksxs,sfbx,xf,xs,kkyxmc,kkjysmc')}&${PAGE}`) },
  { page: '剩余试卷', ...post(`/admin/jsd/sjgl/ajaxSysj?gridtype=jqgrid`, `${QF('id,pcId,spindex,rwid,pcmc,kcmc,kcbh,rkjs,skbj,zrs,sjbh,zdsj,fzrxm')}&${PAGE}`) },
  { page: '试卷管理', ...post(`/admin/jsd/sjgl/ajaxOwnList?gridtype=jqgrid`, `${QF('id,pcId,spindex,fileid,sfbk,sfbktext,pcmc,kcmc,kcbh,sjbh,jxbbh,zdsjlx,zrs,sczt,spzt,spyj,skbj,kcxh,sfxyys')}&${PAGE}`) },
  { page: '评教信息', ...post(`/admin/pj/xspjxxcx/acustomList?gridtype=jqgrid`, `${QF('id,bmmc,jsbh,jsxm,kcdm,kcmc,xnxq,sznj,yxmc,zymc,pyccdm,zcdm,zbmbmc,pjsj,kkyxmc,jxbmc,sksjdd,bz')}&${PAGE}`) },
  { page: '评教信息', ...get(`/admin/pj/zbmbwh/getZbmbxx`) },
  { page: '学生评价结果', ...post(`/admin/pj/xspjjgcx/acustomList?gridtype=jqgrid`, `${QF('id,xnxq,ssdw,jsbh,xm,jysksmc,sjtssjysmc,jzglbm,zbmbxxid,jsid,jxbid,jxbbh,jxbmc,sjtssyx,jxbzc,dqzcm,kcbh,kcmc,kkyxmc,kclb,kcxz,cprs,sjcprs,yprs,cpl,pjf,fsdj,medianPjf,kcpjf,createDate')}&${PAGE}`) },
  { page: '学生评价结果', ...get(`/admin/pj/xspjjgcx/getZbmbxx`) },
  { page: '同行评教', ...post(`/admin/pj/thpjcx/acustomList?gridtype=jqgrid`, `${QF('id,xnxq,jsbh,xm,dqzcm,bzlbm,ypjsrs,cpjsrs,wpjsrs,cpjsb,cprs,yprs,wprs,cpb,yxbmmc,pjf,dwpm,qxpm')}&${PAGE}`) },
  { page: '同行评教', ...get(`/admin/pj/thpjcx/getThpjZbmbList?xnxq=${XNXQ}`) },

  // ============ 信息查询其它 ============
  { page: '学生信息查询', ...post(`/admin/xjgl/xsjbxx/xsxxcxListCustom?gridtype=jqgrid`, `${QF('id,xz,mzdm,sfzx,xsdqztdm,xm,sznj,yxdm,zymc,rxnj')}&${PAGE}`), note: '全校学生，size=20，字段名只记录不落值' },
  { page: '校历', ...get(`/admin/system/zy/xlgl/getData/${XNXQ}`) },
  { page: '校历', ...get(`/admin/system/zy/xlgl/selectRows/${XNXQ}`) },
  { page: '校历', ...get(`/admin/system/zy/xlgl/selectJxzxsj/${XNXQ}`) },
  { page: '校历', ...get(`/admin/system/zy/xlgl/selectJxzxsjXq/${XNXQ}`) },
  { page: '校历', ...get(`/admin/system/systemxlzc/getZcbzbyxq/${XNXQ}`) },
  { page: '校历', ...get(`/admin/zy/xlxx/getBz/${XNXQ}`) },
  { page: '学生考勤', ...post(`/admin/jsd/xskq/ajaxListJsJxrw?gridtype=jqgrid`, `${QF('id,jxbid,zcxspzid,xnxq,kcdm,kcmc,jxbmc,jxbzc,bjrs,xstype,zongxs,kcxz,name,xf,skzc,ksxs,sfsjhj,sfsjhjname,sjzs,sksjdd,kqqrzt')}&${PAGE}`) },
  { page: '工作业绩考核登记', ...get(`/admin/jsd/gzyjkhdj`), note: '页面本身，无列表接口' },
  { page: '教师卡片', ...get(`/admin/sz/szjsjbxx/queryJsxxFroJsd`) },
  { page: '移动端/教师查询', ...get(`/admin/jwxtgld/jscx/getJscxYxxx`) },
  { page: '移动端/教师查询', ...get(`/admin/jwxtgld/jscx/jsxxlist?yxid=205`), note: '本院系教师列表' },

  // ============ 通知 ============
  { page: '通知管理', ...post(`/admin/jsd/notice/ajaxList1?gridtype=jqgrid`, `${QF('id,release_status,title,release_status_tag,content,releaseDate')}&${PAGE}`) },
  { page: '通知收件箱', ...post(`/admin/system/tzsjx/ajaxList?gridtype=jqgrid`, `${QF('id,dqstatus,collectstatus,title,content,releaseDate,noticeTypeName')}&${PAGE}`) },

  // ============ 工作流 ============
  { page: '我的申请', ...post(`/admin/activiti/myApply/qryMyApply?zdysq=&processInstanceId=&gridtype=jqgrid`, `${QF('id,busiTypeCode,processInstanceIdEnc,version,processInstanceId,busiType,definitionName,shzt,clyj,createTime,endTime,curName,assigneeName')}&${PAGE}`) },
  { page: '我的待办', ...post(`/admin/activiti/dbsy/listRunningProcessInstaces?zdydb=&showAll=&processInstanceId=&gridtype=jqgrid`, `${QF('id,busiTypeCode,processInstanceId,busiType,sqxx,sqyy,definitionName,startUserId,zymc,version,sqrlxdh,startUserXx,createTime,curName,jsrlxdh,dqspzt,startTime,sqxnxq,processInstanceIdEnc,sffq')}&${PAGE}`) },
  { page: '我的经办', ...post(`/admin/activiti/myApply/qryOperationApply?zdyjb=&gridtype=jqgrid`, `${QF('id,busiTypeCode,version,processInstanceId,processInstanceIdEnc,definitionName,busiType,sqxx,sqyy,startUserId,zymc,sqrlxdh,startUserXx,createTime,endTime,taskEndTime,curName,jsrlxdh,dqspzt,jbdatauser,sqxnxq,checkstatus')}&${PAGE}`) },
  { page: '学生异动申请', ...get(`/admin/xjgl/xsydsq/qryXsydsqByBzr?gridtype=jqgrid&${PAGE}`) },

  // ============ 移动端调停补页面 ============
  { page: '调停补(移动端)', ...get(`/admin/pk/pkttbgl/getTtbPz`) },
  { page: '调停补(移动端)', ...get(`/admin/jsd/ttbgl/ttbxxnew`) },
  { page: '调停补(移动端)', ...post(`/admin/pk/pkttbgl/yddyspList`, `pagesize=10&pageno=1&listtype=js&xnxq=${XNXQ}`), note: '页面真实 POST 查询形态' },

  // ============ SPA: teacherTtbApply（fe）============
  { page: '调停补SPA', ...get(`/admin/jsd/ttbgl/queryJsPkxx`) },
  { page: '调停补SPA', ...get(`/admin/jsd/ttbgl/queryTtbxxList`) },
  { page: '调停补SPA', ...get(`/admin/pk/pkttbgl/queryttbparam`) },
  { page: '调停补SPA', ...get(`/admin/pk/pkttbgl/querysqr`) },
  { page: '调停补SPA', ...get(`/admin/pk/pkttbgl/ttbctxx`) },
  { page: '调停补SPA', ...get(`/admin/pk/pkttbgl/getTtbqxkzcs`) },
  { page: '调停补SPA', ...get(`/admin/pk/pkttbgl/dspList`) },
  { page: '调停补SPA', ...get(`/admin/system/jcsj/njsj/getNjList`) },
  { page: '调停补SPA', ...get(`/admin/system/jcsj/xnxq/getXnxqList`) },
  { page: '调停补SPA', ...get(`/admin/system/jcsj/xqsj/getXqList`) },
  { page: '调停补SPA', ...get(`/admin/system/jcsj/bmsj/getKkYxList`) },
  { page: '调停补SPA', ...get(`/admin/pkgl/jyjs2/initGetTeacherList`) },
  { page: '调停补SPA', ...get(`/admin/pkgl/jyjs2/getTeacherPageList`) },
  { page: '调停补SPA', ...get(`/admin/sjfx/pkgl/pkrcfbtj?xnxq=${XNXQ}`), note: '排课人次分布统计' },
  { page: '调停补SPA', ...get(`/admin/sjfx/pkgl/pkzcfbtj?xnxq=${XNXQ}`) },
  { page: '调停补SPA', ...get(`/admin/sjfx/pkgl/pkjcfbtj?xnxq=${XNXQ}`) },
  { page: '调停补SPA', ...get(`/admin/pkgl/zkb/list?xnxq=${XNXQ}`), note: 'CourseTable 组件' },
  { page: '调停补SPA', ...get(`/admin/pkgl/zkb/getZkb?xnxq=${XNXQ}`) },
  { page: '调停补SPA', ...get(`/admin/pkgl/xqkb/getXqkb?xnxq=${XNXQ}`) },
  { page: '调停补SPA', ...get(`/admin/pkgl/jcsjsz/getJcsz`), note: 'POST 形态存疑,先 GET' },

  // ============ SPA: workloadManage/eduStat ============
  { page: '工作量SPA', ...get(`/admin/twork/jsd/current-user-gzl`) },
  { page: '工作量SPA', ...get(`/admin/twork/jsd/current-user-info`) },
  { page: '工作量SPA', ...get(`/admin/twork/config/current-data`) },
  { page: '工作量SPA', ...get(`/admin/twork/config/current-nd-xnxq`) },
  { page: '工作量SPA', ...get(`/admin/twork/config/currentXnxqList`) },
  { page: '工作量SPA', ...get(`/admin/twork/config/ifLock`) },
  { page: '工作量SPA', ...get(`/admin/twork/system/all-enum`) },
  { page: '工作量SPA', ...get(`/admin/twork/system/jw-system-xnxn`) },
  { page: '工作量SPA', ...get(`/admin/twork/system/xnxq-search-info`) },
  { page: '工作量SPA', ...get(`/admin/twork/system/xy-search-info`) },
  { page: '工作量SPA', ...get(`/admin/api/system/getYxForGzl`) },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const IDENT_FIELDS = new Set(['currentUserId','userRoleId','dataAuth','dataXnxq','currentRoleId','currentJsId','currentUserName','currentDepartmentId','new']);

function summarize(r) {
  const out = { status: r.status, ms: r.ms };
  if (isLoginPage(r)) { out.note = '!!! 会话失效(登录页)'; return out; }
  if (r.json && typeof r.json === 'object') {
    const j = r.json;
    if ('ret' in j) out.ret = j.ret;
    if ('msg' in j) out.msg = String(j.msg).slice(0, 80);
    if ('total' in j) out.total = j.total;
    if ('totalPages' in j) out.totalPages = j.totalPages;
    const rows = j.results || j.rows || j.data || j.extend || (Array.isArray(j) ? j : null);
    if (Array.isArray(rows) && rows.length && typeof rows[0] === 'object' && rows[0] !== null) {
      out.fields = Object.keys(rows[0]).filter(k => !IDENT_FIELDS.has(k));
      out.rowsReturned = rows.length;
    } else if (Array.isArray(rows)) {
      out.fields = [`array(len=${rows.length})`];
      out.rowsReturned = rows.length;
    } else if (j.data && typeof j.data === 'object' && !Array.isArray(j.data)) {
      out.fields = Object.keys(j.data).filter(k => !IDENT_FIELDS.has(k)).slice(0, 40);
    } else if (!Array.isArray(j)) {
      const biz = Object.keys(j).filter(k => !['ret','msg','page','rows','total','totalPages','results','extend','data','success','code'].includes(k));
      if (biz.length) out.fields = biz.slice(0, 40);
      if ('code' in j) out.code = j.code;
    }
    out.shape = 'json';
  } else {
    const t = r.text || '';
    out.shape = t.startsWith('<') ? 'html' : 'text';
    const tm = t.match(/<title>\s*([^<]+)/i);
    if (tm) out.title = tm[1].trim().slice(0, 60);
    out.bytes = t.length;
  }
  return out;
}

const results = [];
let i = 0;
for (const t of TASKS) {
  i++;
  const url = BASE + t.url;
  let r, err = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { r = await probe(url, { method: t.method, body: t.body, headers: t.headers }); break; }
    catch (e) { err = e; await sleep(500); }
  }
  const rec = { page: t.page, url: t.url, method: t.method };
  if (t.note) rec.note = t.note;
  if (t.body) rec.params = t.body.slice(0, 300);
  if (err) { rec.error = String(err.message || err); }
  else Object.assign(rec, summarize(r));
  results.push(rec);
  console.log(`[${i}/${TASKS.length}]`, t.method, t.url, '→', rec.status || rec.error, rec.ret !== undefined ? `ret=${rec.ret}` : '', rec.total !== undefined ? `total=${rec.total}` : '', rec.title || '');
  if (rec.note && rec.note.includes('会话失效')) { console.error('!!! 会话失效，停止'); break; }
  await sleep(120 + Math.random() * 180);
}

fs.writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log('DONE ->', OUT, 'records:', results.length);
