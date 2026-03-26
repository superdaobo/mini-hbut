# 反馈与共创生态投递窗 (FeedbackView.vue)

## 1. 模块边界与定位

即使是最健壮的应用，也会遇到不可预知的教务系统接口突变（甚至他们换了一家外包公司）。为了构建低成本的共创开发社区环境，`FeedbackView.vue` 使用了极度精简的方案快速搭建起一条沟通隧道。这是为了在不耗费资金去搭建专门的票务系统（Ticket System）的情况下收集奔溃报告。

## 2. 嵌入式 IFrame 沙箱渲染

相比直接拉取腾讯文档 API 构建表单（这会大量消耗 Token 和研发成本），采用了安全隔离的无头嵌入（IFrame Sandbox）：

```html
      <iframe 
        ref="iframeRef"
        :src="feedbackUrl"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      ></iframe>
```
**安全协议配置解析**：
- `allow-same-origin`：必须要加，否则腾讯文档无法种 Cookie 导致无法校验登录状态。
- `allow-forms`：允许在内部填写和提交数据。
- `allow-popups` 及其同源变种：用户在反馈单里如果点击了“上传图片”，往往会顶出新的文件选择器。沙箱如果不放权，会被拦截导致卡死。

## 3. 防挂死定时器（Fallback Loading）

由于外部链接嵌入最大的风险就是“跨源通信不透明”，且如果用户网络处于半掉线状态，IFrame 的 `@load` 事件可能永远不会触发，导致加载菊花框一直悬浮遮挡。
组件的挂载期实施了基于时效的强行终结机制：
```javascript
  setTimeout(() => {
    loading.value = false
  }, 5000)
```
无论腾讯文档有没有反馈结果，5秒后必须掐断遮罩层，让用户能直指干预其交互。且在 Header 保留了 `copyLink` 功能，一旦 IFrame 跨域失败，用户可借由此逃逸到外部独立浏览器处理。