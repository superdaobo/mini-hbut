# 热部署与版本控制台 (UpdateDialog.vue)

## 1. 模块宏观架构与目标定位

由于这是一个经常要响应教务处接口变动进行突发修复（Hotfix）的游击应用。用户手动去 GitHub 漫天找下载包极为痛苦。
`UpdateDialog.vue` 是一个前沿的版本管控中心组件，它接入了后端的 `checkForUpdates`（基于 GitHub Release API 或者自建 OSS 存储分发台），并在 Tauri 端支持增量安装与执行拉起。

## 2. 多源防挂死下载引流

由于中国大陆网络对 GitHub 的极其不稳定特性，它使用了备用分发策略：

```javascript
const handleDownload = async () => {
  if (!updateInfo.value?.downloadUrls || updateInfo.value.downloadUrls.length === 0) {
    // 如果无法获取直链，只能降权用浏览器强行打开大发布页面供用户人工寻找
    openExternal(updateInfo.value.releaseUrl)
    return
  }
  // 传入一整个 array 让底层自己去并发探活或者选择最佳线路
  const result = await downloadUpdate(updateInfo.value.downloadUrls, updateInfo.value.assetName)
}
```
这样的代码赋予了客户端自行寻找最近 CDN 节点的求生本能。

## 3. 跳过机制与防打扰存储

对于不想立刻更新的用户，不仅提供了取消按钮，还给与了永久跳过某特定版本的功能：

```mermaid
graph TD
    A[用户点击“跳过此版本”] --> B[获取当前最新大版本号 latestVersion]
    B --> C[拦截弹窗 Emit]
    C --> D[存入 LocalStorage(hbu_skipped_version)]
    D --> E[在下一次启动时检查机制会将该号对比并绕过拉起逻辑]
```
保证了产品没有强行流氓式的驻留属性，尊重学生的用网自主权。

## 4. 平台架构与资产推断标示

由于应用跨足 Android, Web, Windows，通过传入组件的 `updateInfo.platform` 以确保安装平台和最终下载的文件资产 `updateInfo.assetName` 相互匹配。
并配上了极其完备的加载状态动画和 Markdown 转译器，将 `releaseNotes` 不断行地平铺为直观的更新日志展板。