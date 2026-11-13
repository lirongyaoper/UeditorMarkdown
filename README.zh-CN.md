# UEditor Markdown 增强版

**基于 [UEditor](https://github.com/fex-team/ueditor) 4.5.0 的增强发行版：语雀式 Markdown 编辑、代码块语法高亮（10 套主题）、本地 KaTeX 公式，以及独立的前台内容渲染器。**

本发行版把编辑器、它依赖的公共库、前台渲染器打包在一起，可直接放进任意项目使用，无需任何框架。所有新功能都在浏览器端运行；另附一份通用、无框架依赖的 PHP 上传后端，开箱即用。

> English: [README.md](README.md)

---

## 功能一览

### 编辑
- **语雀式斜杠菜单**：空行输入 `/` 或点行首 `+` 弹出标签菜单（标题、列表、表格、代码、公式、提示块、目录、行内标记、媒体等），支持中文 / 英文 / 拼音首字母过滤（`bt`、`h2`、`bg`、`gs`、`code`）。富文本与 Markdown 模式都生效，`slashMenu: false` 可关闭。
- **真正的 Markdown 模式**：源码 / 分栏 / 预览三态切换。预览栏**就是编辑器本身的 iframe**（绝不移动/重载），两侧都能直接编辑；防抖双向同步、两栏各自独立撤销、**退出零失真**。修复了「Markdown 模式下直接提交会丢稿」的老 bug。
- **Markdown 模式下工具栏格式全可用**：颜色、背景、字体、字号、对齐、缩进等作用于当前激活栏；源码栏会输出 Markdown 标记或安全内联 HTML（`<span style>`、`<div style markdown="1">`）。
- **选区气泡**、快捷键（`Ctrl+B/I/U/K`、`Ctrl+Shift+C` 代码、`Ctrl+Shift+M` 公式）、列表/引用回车续写、`Tab` 缩进。

### 代码与公式
- **代码高亮**：highlight.js 11（58 种语言），**10 套主题**：`github`、`github-dark`、`one-light`、`one-dark`、`monokai`、`dracula`、`nord`、`tokyo-night`、`vscode-dark-plus`、`solarized-light`。代码块浮动工具条（语言 / 主题 / 应用到全部 / 复制）；围栏支持 ```` ```js theme=monokai ````。编辑器内着色用 CSS Custom Highlight API，不改 DOM。
- **本地 KaTeX 公式**（不依赖外网图片服务）：支持 `$…$`、`$$…$$`、`\(…\)`、`\[…\]`、```` ```math ````。重写的公式对话框带实时预览、行内/块级切换、模板面板（分式、根式、求和、积分、矩阵、希腊字母、箭头、`mhchem` 化学式）。双击公式即可编辑。公式以文本定界符存储，即便服务端过滤剥掉 class 也能在前台渲染。

### Markdown 扩展
`==高亮==`、GitHub 提示块（`> [!NOTE] / [TIP] / [IMPORTANT] / [WARNING] / [CAUTION]`）、脚注 `[^1]`、`[TOC]`、emoji 短码、任务列表——双向往返都不丢失。

### 保真与安全
- **保真双向转换**（`UE.htmlToMarkdown` / `UE.markdownToHtml`）：样式、对齐块、媒体、合并单元格表格保留为内联 HTML；`richFormat: false` 可退纯净 Markdown。
- **CSS 白名单消毒**（`UE.sanitizeCssStyle`、`UE.markdownSanitizeHtml`）：拦截 `expression`、`url(javascript:)`、`@import`、反斜杠转义等。

### 前台内容渲染器
`LryContentRender` 可在**任意页面**（文章、论坛、评论）渲染已保存的编辑器 HTML：代码高亮 + 主题 + 复制按钮、KaTeX（含裸文本定界符扫描）、提示块/脚注/目录样式。按需懒加载 highlight.js 与 KaTeX。

---

## 目录结构

```
ueditor-markdown/
├── plugin/
│   ├── ueditor/        # 编辑器本体（all.js、config.js、dialogs、lang、themes、third-party、php 后端）
│   ├── highlight/      # highlight.js 11 + lry-code-themes.js（公共层）
│   └── katex/          # KaTeX + mhchem + 字体（公共层）
├── js/
│   ├── lry-content-render.js       # 前台渲染器
│   └── lry-content-render-init.js  # 自动初始化示例（按你的主题改选择器）
├── css/
│   └── lry-content-render.css      # 渲染器样式
├── server/php/
│   └── remove_xss.php  # 可选的独立 HTML/CSS 消毒函数（rich 模式）
├── examples/           # 可直接运行的演示（相对路径）
├── test/               # Node / PHP / 浏览器测试套件
├── README.md / README.zh-CN.md
├── LICENSE / THIRD_PARTY_NOTICES.md
```

**为什么 `highlight/`、`katex/` 与 `ueditor/` 平级（而不放进 ueditor 里面）：** 它们是**编辑器与前台渲染器共用**的公共层。前台渲染器运行在根本不加载编辑器的页面上，所以这两个库不能塞进编辑器目录树。请保持这个相对布局——编辑器用 `UEDITOR_HOME_URL + "../katex/"` / `"../highlight/"` 定位，渲染器用 `<base>/plugin/katex/` / `<base>/plugin/highlight/` 定位。

---

## 快速开始

### 1. 拷贝静态资源
把 `plugin/`、`js/`、`css/` 拷进你的站点根目录（或任意静态目录），保持上面的相对布局。

### 2. 放置编辑器

```html
<link rel="stylesheet" href="plugin/ueditor/themes/default/css/ueditor.css">
<script src="plugin/ueditor/ueditor.config.js"></script>
<script src="plugin/ueditor/ueditor.all.js"></script>
<script src="plugin/ueditor/lang/zh-cn/zh-cn.js"></script>

<script id="editor" type="text/plain" style="width:100%;height:420px;"></script>
<script>
  var ue = UE.getEditor('editor', {
    // 新增选项（均可选）：
    slashMenu: true,        // 语雀式「/」菜单
    codeTheme: 'github',    // 代码块默认主题
    codeHighlight: true,    // 编辑器内高亮 + 代码工具条
    formulaConfig: { local: true, mhchem: true }  // 本地 KaTeX
  });
</script>
```

**Markdown 模式**按钮在默认工具栏里，点击即可进入源码/分栏/预览编辑。

### 3. 运行演示（用 PHP 提供上传能力）

```bash
php -S localhost:8000 -t .
# 打开 http://localhost:8000/examples/index.html
```

`examples/index.html` 是编辑器回归页（点 **运行自动断言** 跑 33 条断言）；`examples/render-test.html`、`examples/forum-pipe-test.html` 演示前台渲染器。

> 不用 PHP 编辑器也能完整编辑；只有服务端上传/列表需要后端（见下文）。

---

## 新增配置项

| 选项 | 默认 | 说明 |
|---|---|---|
| `slashMenu` | `true` | 启用 `/` + `+` 标签菜单（两种模式）。 |
| `codeTheme` | `'github'` | 未单独设主题的代码块所用默认主题。 |
| `codeHighlight` | `true` | 编辑器内 CSS 高亮着色 + 代码块浮动工具条。 |
| `markdownPaste` | `true` | 粘贴纯文本时识别 Markdown 特征并自动转换。 |
| `formulaConfig.local` | `true` | 用本地 KaTeX 渲染公式，而非外网图片服务。 |
| `formulaConfig.mhchem` | `true` | 加载 `mhchem` 扩展（`\ce{...}` 化学式）。 |
| `formulaConfig.throwOnError` | `false` | 渲染失败时显示错误而非抛异常。 |

---

## 展示已保存的内容（前台渲染器）

在任意展示编辑器 HTML 的页面：

```html
<link rel="stylesheet" href="css/lry-content-render.css">
<script>
  window.LryContentRenderOptions = {
    defaultTheme: 'github-dark',  // 未设主题的代码块所用主题
    katex: true                   // 是否渲染公式（默认 true）
  };
</script>
<script src="js/lry-content-render.js"></script>
<script>
  // DOMContentLoaded 后自动渲染：
  LryContentRender.auto('.article-body, .post-content');
  // 或渲染指定元素（如 AJAX 插入 / 密码解锁后）：
  // LryContentRender.render(document.getElementById('content'));
</script>
```

渲染器会从自身 `js/lry-content-render.js` 的 URL 自动探测资源根，再懒加载 `plugin/highlight/` 与 `plugin/katex/`。若把脚本放到别处，请用 `LryContentRenderOptions.base` 指向包含 `plugin/` 的目录。

`js/lry-content-render-init.js` 是自动初始化样例——把其中的选择器改成你的主题类名，或自行调用 `LryContentRender.auto(...)`。

---

## 服务端

### 上传后端（通用 PHP，已附带）
`plugin/ueditor/php/` 是标准 UEditor 后端的干净、无框架依赖版本（`controller.php`、`action_upload.php`、`action_list.php`、`action_crawler.php`、`Uploader.class.php`、`config.json`）。编辑器 `serverUrl` 默认就是 `UEDITOR_HOME_URL + "php/controller.php"`，用 PHP 伺服时开箱即用。

- 修改 `config.json` 设置保存路径（`imagePathFormat`、`filePathFormat`…）、大小限制、允许扩展名。
- 确保上传目标目录对 Web 服务器可写。
- **安全提示**：这是一份参考后端。生产环境请加上鉴权/授权、把上传目录放在可执行路径之外或禁止上传目录执行脚本、并校验内容。也可以把 `serverUrl` 指向你自己的接口，完全忽略此目录。

### 内容消毒（可选）
`server/php/remove_xss.php` 是独立、零依赖的消毒函数：

```php
require_once 'server/php/remove_xss.php';
$safe = remove_xss($html);        // 默认安全基线
$safe = remove_xss($html, true);  // rich 模式：保留校验过的 style、brush:/theme:/lry- class、
                                  // blockquote/hr/code/sup/sub/del/s/mark/kbd
```

在服务端存储编辑器 HTML（如论坛发帖）时用作纵深防御。传 `true` 保留本编辑器产出的安全富文本；不传则保持严格的旧版基线。

---

## 浏览器支持
- 编辑器、转换、KaTeX、highlight.js：现代常绿浏览器。
- 编辑器内代码着色用 **CSS Custom Highlight API**（Chrome/Edge 105+、Safari 17.2+、较新 Firefox）。不支持的浏览器只是不显示颜色，编辑不受影响。前台渲染器用经典 span 着色，全浏览器可用。

---

## 测试

```bash
# 转换核心（jsdom 加载真实 ueditor.all.js）：217 条断言
npm install jsdom
node test/run-tests.js

# 服务端消毒：51 条断言（旧版逐字节兼容 + rich 模式 + XSS 向量）
php test/php-xss-test.php

# 浏览器回归：伺服本包，打开 examples/index.html，点「运行自动断言」（33 条断言）
php -S localhost:8000 -t .
```

`test/browser-run.js` 是可选的 Puppeteer 冒烟工具：
```bash
npm install puppeteer-core
CHROME_PATH=/path/to/chrome node test/browser-run.js http://localhost:8000/examples/index.html - --wait 2000
```

它同时驱动一个无头回归：**编辑器位于 `<form>` 内进入 Markdown 模式的卡死**（历史 bug：`flushLatest ⇄ setValue` 互递归冻结主线程，见 `test/form-md-freeze.html` + `.js`）。页面失去响应时工具会报 `FREEZE`：
```bash
CHROME_PATH=/path/to/chrome node test/browser-run.js http://localhost:8000/test/form-md-freeze.html test/form-md-freeze.js
```

---

## 许可与署名
增强部分与打包以 **MIT 许可证** 发布（见 [LICENSE](LICENSE)）。捆绑组件保留各自许可——见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)：
- UEditor 4.5.0 — 百度 fex-team（MIT）
- highlight.js 11.12.0 — Ivan Sagalaev（BSD-3-Clause）
- KaTeX 0.19.1 — Khan Academy（MIT）
- showdown、CodeMirror、jQuery、Vue、WebUploader、clipboard.js、ZeroClipboard、SyntaxHighlighter — 各自 MIT 作者
- **重要**：  如果你在与你相关的项目中使用该富文本插件，请你务必与我来信((contact@lirongyaoper.com))表示简单的感谢，以鼓励我继续本项目的更新及优化。

---

## 联系方式

| 渠道 | 信息 |
|---|---|
| 作者 | 轩鸿青 |
| 邮箱 | contact@lirongyaoper.com |
| 个人网站/博客 | https://lirongyaoper.com |
| 论坛交流帖（更新/反馈） | https://lirongyaoper.com/forum/index/show/id/6.html |

本包通过上述论坛帖子分发。Bug 反馈、功能建议与版本更新请在交流帖回复，或邮件联系作者。
