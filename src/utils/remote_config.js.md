# 云指令与热配置中心聚合器 (remote_config.js)

## 1. 模块定位与职责

随着服务端或者教务系统偶尔抽风或修改接口，纯静态打包的 App 很容易全体阵亡。
`remote_config.js` 就是为了引入“云控能力 (Remote Config)”的配置收敛中心。通常该文件连接部署在 Gitee/GitHub 或者 HuggingFace 这种高可用免费 CDN 的远端 JSON 文件。当 App 冷启动时，就会获取最新的 `remote_config.json` 来刷新本地的请求基址、强制更新提示或者 OCR 参数等。

## 2. Remote Namespace 的分治管理

整个云端设置囊括了以下几个命名空间：
```javascript
const REMOTE_CONFIG_KEYS = [
  'announcements',    // 包含置顶、滚动、长列表、二次弹窗提醒的校级公告数据
  'force_update',     // 用于封杀存在严重漏洞或被教务系统拉黑的远古版本，提供下载跳转URL以及最旧版本号
  'ocr',              // 教务平台验证码攻防前线。如果主节点被打挂，可以热切 localFallbackEndpoints 
  'temp_file_server', // 资源短链上传服务
  'resource_share',   // PPT、学术资料与 WebDAV 相关的公用云盘节点信息
  'cloud_sync'        // 控制 cloud_sync.js 中描述的私有备份频次规则避免服务器过载
]
```

## 3. 防崩降级容错提取器 (`normalizeRemoteConfig`)

当云端配置员打错 JSON 的字段大小写或误用类型时，如果不加以捕捉，直接赋值可能导致 Vue 的 `template` 层在解构时抛出 undefined `is not iterable`。
这个模块中写下了一组严酷的数据宽容漏斗。

以解析端点为例：
```javascript
const normalizeEndpointList = (value) => {
  const array = toArray(value)  // 无视传错类型强变数组
  const seen = new Set()        // 用此 Set 保障后续网络发起时去除同一备用主机的重试耗损
  for(const i of array) { .add() }
}
```

针对多种旧版本命名，也有强大的合并提取：
```javascript
// 兼容云后台维护者无论是配置 ocr.url, ocr.endpoint 甚至错写在外部时的泛合并
const endpointCandidates = [
    ...toArray(cfg.ocr?.endpoints),
    cfg.ocr?.endpoint, 
    cfg.ocr?.url, 
    cfg.ocr_endpoint, 
    cfg.ocrUrl
]
```

## 4. 远控重载闭环

当通过远程请求拿到并经过此 `normalizeRemoteConfig` 彻底清洗后，对象被格式化成**一模一样完全不包含意外属性的数据树**。它可由后续的启动业务直接存储到 LocalStorage(`hbu_remote_config_snapshot`) 里，供相关 SDK (例如 `getStoredOcrConfig()`) 在初始化自身模块单例时消费。