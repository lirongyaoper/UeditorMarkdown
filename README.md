# UEditor Markdown

**Enhanced [UEditor](https://github.com/fex-team/ueditor) 4.5.0 with Yuque-style Markdown editing, syntax-highlighted code blocks (10 themes), local KaTeX math, and a standalone front-end content renderer.**

This distribution packages the editor together with the shared libraries it needs and a front-end renderer, so you can drop it into any project — no framework required. Everything new runs client-side; a generic, framework-free PHP upload backend is included for convenience.

> 中文说明见 [README.zh-CN.md](README.zh-CN.md)。

---

## Features

### Editing
- **Yuque-style slash menu** — type `/` or click the `+` gutter on an empty line to pick a tag (headings, lists, tables, code, math, alerts, TOC, inline marks, media…). Filter by Chinese, English, or pinyin initials (`bt`, `h2`, `bg`, `gs`, `code`). Works in both rich-text and Markdown modes. Disable with `slashMenu: false`.
- **True Markdown mode** — source / split / preview three-way view. The preview pane **is the real editable editor iframe** (never moved/reloaded), so you can edit either side. Debounced two-way sync, independent undo in each pane, and **lossless exit**. Fixes the classic "submit in Markdown mode loses content" bug.
- **Full toolbar formatting in Markdown mode** — color, background, font, size, alignment, indent, etc. apply to the active pane; in the source pane they emit Markdown marks or safe inline HTML (`<span style>`, `<div style markdown="1">`).
- **Selection bubble**, keyboard shortcuts (`Ctrl+B/I/U/K`, `Ctrl+Shift+C` code, `Ctrl+Shift+M` math), list/quote auto-continuation, `Tab` indent.

### Yuque highlights (new in 2026-11)
- **Highlight blocks `:::info / :::success / :::warning / :::danger`** (Yuque syntax): colored cards (info blue / success green / warning yellow / danger red, with icon labels). GitHub type aliases (`note/tip/important/caution`) and Chinese aliases are accepted. Insert via slash menu `/glk`; round-trips losslessly in both modes.
- **Colored inline highlight**: toolbar "highlight" button (highlighter icon) opens the Yuque palette (default yellow / red / orange / green / blue / purple / cyan + clear). Main click applies default yellow; clicking again with the same color toggles it off (Yuque behavior); changing color never nests marks.
- **Clean `==highlight==` round-trip**: uncolored marks export as `==…==`; colored marks are preserved as `<mark style="background-color:…">` inline HTML without losing the color.

### Code & Math
- **Code highlighting** via highlight.js 11 (58 languages) with **10 themes**: `github`, `github-dark`, `one-light`, `one-dark`, `monokai`, `dracula`, `nord`, `tokyo-night`, `vscode-dark-plus`, `solarized-light`. Floating code toolbar (language / theme / apply-to-all / copy). Fenced blocks support ```` ```js theme=monokai ````. In-editor coloring uses the CSS Custom Highlight API (no DOM mutation).
- **Local KaTeX math** (no external image service). Supports `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, and ```` ```math ````. Rewritten formula dialog with live preview, inline/block toggle, and a template panel (fractions, radicals, sums, integrals, matrices, Greek, arrows, chemistry via `mhchem`). Double-click a formula to edit. Stored as text delimiters so it survives aggressive server-side filters.

### Markdown extensions
`==highlight==`, Yuque highlight blocks (`:::info / success / warning / danger`), GitHub-style alert blocks (`> [!NOTE] / [TIP] / [IMPORTANT] / [WARNING] / [CAUTION]`), footnotes `[^1]`, `[TOC]`, emoji shortcodes, task lists — all round-trip losslessly.

### Fidelity & safety
- **Fidelity bidirectional conversion** (`UE.htmlToMarkdown` / `UE.markdownToHtml`): styles, alignment blocks, media, merged-cell tables preserved as inline HTML; `richFormat: false` for pure Markdown.
- **CSS whitelist sanitization** (`UE.sanitizeCssStyle`, `UE.markdownSanitizeHtml`) blocks `expression`, `url(javascript:)`, `@import`, escapes, etc.

### Front-end content renderer
`LryContentRender` renders saved editor HTML on **any** page (articles, forums, comments): code highlighting + themes + copy button, KaTeX (including bare text delimiters), alerts / footnotes / TOC styling. Lazy-loads highlight.js and KaTeX only when needed.

---

## Directory layout

```
ueditor-markdown/
├── plugin/
│   ├── ueditor/        # the editor (all.js, config.js, dialogs, lang, themes, third-party, php backend)
│   ├── highlight/      # highlight.js 11 + lry-code-themes.js (shared layer)
│   └── katex/          # KaTeX + mhchem + fonts (shared layer)
├── js/
│   ├── lry-content-render.js       # front-end renderer
│   └── lry-content-render-init.js  # sample auto-init (edit the selector for your theme)
├── css/
│   └── lry-content-render.css      # renderer styles
├── server/php/
│   └── remove_xss.php  # optional standalone HTML/CSS sanitizer (rich mode)
├── examples/           # runnable demos (relative paths)
├── test/               # Node / PHP / browser test suites
├── README.md / README.zh-CN.md
├── LICENSE / THIRD_PARTY_NOTICES.md
```

**Why `highlight/` and `katex/` are siblings of `ueditor/` (not inside it):** they are a *shared public layer* used by **both** the editor and the front-end renderer. The renderer runs on pages that never load the editor, so the libraries must not live inside the editor's tree. Keep this relative layout intact — the editor resolves them as `UEDITOR_HOME_URL + "../katex/"` / `"../highlight/"`, and the renderer resolves them as `<base>/plugin/katex/` / `<base>/plugin/highlight/`.

---

## Quick start

### 1. Copy the assets
Copy `plugin/`, `js/`, and `css/` into your web root (or any static directory), preserving the layout above.

### 2. Add an editor

```html
<link rel="stylesheet" href="plugin/ueditor/themes/default/css/ueditor.css">
<script src="plugin/ueditor/ueditor.config.js"></script>
<script src="plugin/ueditor/ueditor.all.js"></script>
<script src="plugin/ueditor/lang/zh-cn/zh-cn.js"></script>

<script id="editor" type="text/plain" style="width:100%;height:420px;"></script>
<script>
  var ue = UE.getEditor('editor', {
    // new options (all optional):
    slashMenu: true,        // Yuque-style "/" menu
    codeTheme: 'github',    // default code theme
    codeHighlight: true,    // in-editor highlighting + code toolbar
    formulaConfig: { local: true, mhchem: true }  // local KaTeX
  });
</script>
```

The **Markdown mode** button is in the default toolbar. Click it to enter source/split/preview editing.

### 3. Run the demos (with PHP for uploads)

```bash
php -S localhost:8000 -t .
# open http://localhost:8000/examples/index.html
```

`examples/index.html` is the editor regression page (click **运行自动断言** for 51 assertions). `examples/render-test.html` and `examples/forum-pipe-test.html` demonstrate the front-end renderer.

> Without PHP the editor still works fully for editing; only server-side upload/listing needs a backend (see below).

---

## New configuration options

| Option | Default | Description |
|---|---|---|
| `slashMenu` | `true` | Enable the `/` + `+` tag menu (both modes). |
| `codeTheme` | `'github'` | Default theme for code blocks without an explicit theme. |
| `codeHighlight` | `true` | In-editor CSS-highlight coloring + floating code toolbar. |
| `markdownPaste` | `true` | Auto-convert Markdown-looking plain text on paste. |
| `formulaConfig.local` | `true` | Render math with local KaTeX instead of an external image service. |
| `formulaConfig.mhchem` | `true` | Load the `mhchem` extension (`\ce{...}` chemistry). |
| `formulaConfig.throwOnError` | `false` | Show a render error instead of throwing. |

---

## Displaying saved content (front-end renderer)

On any page that shows saved editor HTML:

```html
<link rel="stylesheet" href="css/lry-content-render.css">
<script>
  window.LryContentRenderOptions = {
    defaultTheme: 'github-dark',  // theme for code blocks without one
    katex: true                   // render math (default true)
  };
</script>
<script src="js/lry-content-render.js"></script>
<script>
  // Auto-render on DOMContentLoaded:
  LryContentRender.auto('.article-body, .post-content');
  // Or render a specific element (e.g. after AJAX insert / password unlock):
  // LryContentRender.render(document.getElementById('content'));
</script>
```

The renderer auto-detects its asset base from its own `js/lry-content-render.js` URL, then lazy-loads `plugin/highlight/` and `plugin/katex/`. If you host the script elsewhere, set `LryContentRenderOptions.base` to the directory that contains `plugin/`.

`js/lry-content-render-init.js` is a sample auto-init — change its selector to match your theme, or call `LryContentRender.auto(...)` yourself.

---

## Server-side

### Upload backend (generic PHP, included)
`plugin/ueditor/php/` is a clean, framework-free version of the standard UEditor backend (`controller.php`, `action_upload.php`, `action_list.php`, `action_crawler.php`, `Uploader.class.php`, `config.json`). The editor's `serverUrl` defaults to `UEDITOR_HOME_URL + "php/controller.php"`, so it works out of the box when served by PHP.

- Edit `config.json` to set save paths (`imagePathFormat`, `filePathFormat`, …), size limits, and allowed extensions.
- Make sure the upload target directory is writable by the web server.
- **Security:** this is a reference backend. In production, add authentication/authorization, store uploads outside the executable path or disable script execution in the upload directory, and validate content. You can also point `serverUrl` at your own endpoint and ignore this folder entirely.

### Content sanitization (optional)
`server/php/remove_xss.php` is a standalone, dependency-free sanitizer:

```php
require_once 'server/php/remove_xss.php';
$safe = remove_xss($html);        // default safe baseline
$safe = remove_xss($html, true);  // rich mode: keeps validated style, brush:/theme:/lry- classes,
                                  // blockquote/hr/code/sup/sub/del/s/mark/kbd
```

Use it when storing editor HTML server-side (e.g. forum posts) as defense-in-depth. `true` preserves the safe rich output this editor produces; omitting it keeps the strict legacy baseline.

---

## Browser support
- Editor, conversion, KaTeX, highlight.js: modern evergreen browsers.
- In-editor code coloring uses the **CSS Custom Highlight API** (Chrome/Edge 105+, Safari 17.2+, recent Firefox). On browsers without it, code simply shows without color — editing is unaffected. The front-end renderer uses classic span highlighting and works everywhere.

---

## Testing

```bash
# Conversion core (loads the real ueditor.all.js in jsdom): 241 assertions
npm install jsdom
node test/run-tests.js

# Server-side sanitizer: 51 assertions (legacy byte-compat + rich mode + XSS vectors)
php test/php-xss-test.php

# Browser regression: serve the package, open examples/index.html, click "运行自动断言" (51 assertions)
php -S localhost:8000 -t .
```

`test/browser-run.js` is an optional Puppeteer smoke helper:
```bash
npm install puppeteer-core
CHROME_PATH=/path/to/chrome node test/browser-run.js http://localhost:8000/examples/index.html - --wait 2000
```

It also powers a headless regression for the **editor-inside-a-`<form>` Markdown freeze**: entering Markdown mode inside a form once deadlocked the main thread via a `flushLatest ⇄ setValue` recursion (`test/form-md-freeze.html` + `.js`). The helper reports `FREEZE` when the page stops responding:
```bash
CHROME_PATH=/path/to/chrome node test/browser-run.js http://localhost:8000/test/form-md-freeze.html test/form-md-freeze.js
```

---

## License & attribution
The enhancements and packaging are released under the **MIT License** (see [LICENSE](LICENSE)). Bundled components keep their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md):
- UEditor 4.5.0 — Baidu fex-team (MIT)
- highlight.js 11.12.0 — Ivan Sagalaev (BSD-3-Clause)
- KaTeX 0.19.1 — Khan Academy (MIT)
- showdown, CodeMirror, jQuery, Vue, WebUploader, clipboard.js, ZeroClipboard, SyntaxHighlighter — respective MIT authors
- **Important**: If you use this rich text plugin in a project related to you, please be sure to write to me with a simple thank-you to encourage me to continue updating and optimizing this project(contact@lirongyaoper.com).

---

## Contact

| Channel | Details |
|---|---|
| Author | 轩鸿青 |
| Email | contact@lirongyaoper.com |
| Website / Blog | https://lirongyaoper.com |
| Forum thread (updates & feedback) | https://lirongyaoper.com/forum/index/show/id/6.html |

This package is distributed via the forum thread above. For bug reports, feature requests and version updates, please reply in that thread or contact the author by email.
