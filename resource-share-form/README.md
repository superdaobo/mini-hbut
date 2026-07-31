# 资源共享提交表单（Netlify Forms）

深色锐角 UI（对齐 Stitch Aether 设计：炭黑底 + 金色强调 + 网格 + Mono 标签），移动端优先。

字段：`title` / `contact` / `qq` / `drive_link` / `note`  
表单名：`resource-share`

线上：https://mini-hbut-resource-share.netlify.app

## 内嵌

```html
<iframe
  src="https://mini-hbut-resource-share.netlify.app/"
  title="资源共享提交"
  style="width:100%;min-height:720px;border:0;"
  loading="lazy"
></iframe>
```

## 部署

在仓库根目录外单独部署本目录（避免 monorepo 误检）：

```bash
# 使用 NETLIFY_AUTH_TOKEN 环境变量
npx netlify-cli deploy --prod --dir . --site <site-id>
```
