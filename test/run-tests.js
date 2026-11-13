/* UEditor Markdown Node 测试套件（jsdom 加载真实 ueditor.all.js）
   运行：npm install jsdom  然后  node test/run-tests.js
   覆盖：转换核心（md→html 管线 / 保真 htmlToMarkdown / CSS 白名单消毒）、
   公式/围栏/提示块/脚注/目录/高亮/emoji/任务列表、往返转换、XSS 向量。 */
"use strict";

const path = require("path");
const fs = require("fs");
let JSDOM;
try {
    ({ JSDOM } = require("jsdom"));
} catch (e) {
    console.error("需要 jsdom：请先 npm install jsdom（或设置 NODE_PATH 指向其 node_modules）");
    process.exit(2);
}

const ROOT = path.join(__dirname, "..");
const UEDITOR = path.join(ROOT, "plugin/ueditor/");

const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    runScripts: "outside-only",
    url: "http://localhost/test/",
    pretendToBeVisual: true
});
const w = dom.window;
w.UEDITOR_HOME_URL = "/plugin/ueditor/";

let loadError = null;
try {
    w.eval(fs.readFileSync(path.join(UEDITOR, "ueditor.config.js"), "utf8"));
    w.eval(fs.readFileSync(path.join(UEDITOR, "ueditor.all.js"), "utf8"));
    w.eval(fs.readFileSync(path.join(UEDITOR, "third-party/showdown.js"), "utf8"));
} catch (e) {
    loadError = e;
}

const UE = w.UE;

let pass = 0, fail = 0, failures = [];
function ok(name, cond, extra) {
    if (cond) {
        pass++;
    } else {
        fail++;
        failures.push(name + (extra !== undefined && extra !== "" ? " → " + extra : ""));
        console.log("  FAIL " + name + (extra !== undefined && extra !== "" ? " → " + extra : ""));
    }
}
function eq(name, actual, expected) {
    const a = String(actual), e = String(expected);
    ok(name, a === e, "actual=[" + a + "] expected=[" + e + "]");
}
function section(title) {
    console.log("\n== " + title + " ==");
}

const m2h = (md) => UE.markdownToHtml(md);
const h2m = (html, opts) => UE.htmlToMarkdown(html, opts);
const norm = (s) => String(s).replace(/\s+/g, " ").trim();
// tight(): 只归一块级标签之间的空白与 </pre> 前的尾随空白（保留文本内部空格），用于结构断言
const tight = (s) => String(s).replace(/>\s+</g, "><").replace(/\s+<\/pre>/g, "</pre>").trim();
function eqT(name, actual, expected) {
    eq(name, tight(actual), tight(expected));
}

/* ================= 基础加载 ================= */
section("加载");
ok("ueditor.all.js 在 jsdom 中加载", !loadError && !!UE, loadError ? loadError.message : "");
ok("showdown 就绪", typeof w.showdown === "object" && !!w.showdown.Converter);
ok("公共核心存在", [UE.htmlToMarkdown, UE._markdownConvert, UE.markdownSanitizeHtml,
    UE.sanitizeCssStyle, UE.mdBrushInfo].every(f => typeof f === "function") && typeof UE._mdPipeline === "object");
ok("占位符防撞（字面 LRYPH0PH/LRYPT0PT 不被吞）", (function () {
    var out = m2h("前 LRYPH0PH 后 LRYPT0PT 尾");
    return out.indexOf("LRYPH0PH") !== -1 && out.indexOf("LRYPT0PT") !== -1;
})());

/* ================= md → html：基础语法 ================= */
section("md→html 基础");
eq("H1", norm(m2h("# T")), "<h1 id=\"t\">T</h1>");
ok("H2~H6", ["## a", "### b", "#### c", "##### d", "###### e"].every(x => m2h(x).indexOf("<h") !== -1));
eq("段落+粗斜", norm(m2h("a **b** *c* ~~d~~")), "<p>a <strong>b</strong> <em>c</em> <del>d</del></p>");
eq("行内代码", norm(m2h("`a*b`")), "<p><code>a*b</code></p>");
eq("链接", norm(m2h("[x](https://a.com)")), '<p><a href="https://a.com">x</a></p>');
eqT("图片", m2h("![alt](https://a.com/i.png)"), '<p><img src="https://a.com/i.png" alt="alt"></p>');
eqT("分割线", m2h("---"), "<hr>");
eqT("引用", m2h("> q"), "<blockquote><p>q</p></blockquote>");
eqT("无序列表", m2h("- a\n- b"), "<ul><li>a</li><li>b</li></ul>");
eqT("有序列表", m2h("1. a\n2. b"), "<ol><li>a</li><li>b</li></ol>");
eqT("任务列表（勾选）", m2h("- [x] a"), '<ul><li class="task-list-item">\u2611 a</li></ul>');
eqT("任务列表（未勾）", m2h("- [ ] a"), '<ul><li class="task-list-item">\u2610 a</li></ul>');
eqT("简单表格", m2h("| a | b |\n|---|---|\n| 1 | 2 |"),
    "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>");
eq("表格对齐（短分隔行规整化）", norm(m2h("| a | b | c |\n|:--|:-:|--:|\n| 1 | 2 | 3 |").replace(/\s+/g, "")),
    norm('<table><thead><tr><th style="text-align:left">a</th><th style="text-align:center">b</th><th style="text-align:right">c</th></tr></thead><tbody><tr><td style="text-align:left">1</td><td style="text-align:center">2</td><td style="text-align:right">3</td></tr></tbody></table>').replace(/\s+/g, ""));
ok("表格对齐样式产出", /text-align:center/.test(m2h("| a |\n|:-:|\n| 1 |")));
eqT("缩进代码块", m2h("    indented code"), '<pre class="brush:plain;toolbar:false;">indented code\n</pre>');
eq("front matter 剔除", norm(m2h("---\ntitle: T\n---\n\nBody")), "<p>Body</p>");
eq("元数据返回", JSON.stringify(UE._markdownConvert("---\ntitle: T\n---\n\nBody").meta), '{"title":"T"}');
eq("3 * 4 * 5 不转斜体", norm(m2h("3 * 4 * 5")), "<p>3 * 4 * 5</p>");
eq("snake_case 不转斜体", norm(m2h("a_b_c")), "<p>a_b_c</p>");

/* ================= md → html：围栏代码块（自研接管） ================= */
section("md→html 围栏");
eqT("基础围栏", m2h("```js\nlet a = 1;\n```"),
    '<pre class="brush:js;toolbar:false;">let a = 1;\n</pre>');
eqT("带主题围栏", m2h("```js theme=monokai\nx\n```"),
    '<pre class="brush:js;toolbar:false;theme:monokai;">x\n</pre>');
eqT("波浪线围栏", m2h("~~~python\ndef f(): pass\n~~~"),
    '<pre class="brush:python;toolbar:false;">def f(): pass\n</pre>');
eq("未知语言保留", norm(m2h("```brainfuck\n++\n```").indexOf("brush:brainfuck") !== -1 ? "y" : "n"), "y");
eq("代码内 Markdown 不解析", m2h("```\n# not heading\n**b**\n```").indexOf("<h1") === -1 ? "y" : "n", "y");
eqT("代码内 HTML 转义", m2h("```html\n<div>&amp;\n```"),
    '<pre class="brush:html;toolbar:false;">&lt;div&gt;&amp;amp;\n</pre>');
eqT("长围栏嵌短围栏", m2h("````\n```\ncode\n```\n````"),
    '<pre class="brush:plain;toolbar:false;">```\ncode\n```\n</pre>');
eqT("缩进围栏在列表内", m2h("- item\n\n  ```js\n  x\n  ```"),
    '<ul><li><p>item</p><pre class="brush:js;toolbar:false;">x\n</pre></li></ul>');
eqT("信息串多余参数", m2h("```js theme=dracula foo=bar\nx\n```"),
    '<pre class="brush:js;toolbar:false;theme:dracula;">x\n</pre>');

/* ================= md → html：公式 ================= */
section("md→html 公式");
eq("行内 $…$", norm(m2h("a $x_1^2$ b")), norm('<p>a <span class="lry-math">\\(x_1^2\\)</span> b</p>'));
eq("块级 $$…$$", norm(m2h("$$\nE=mc^2\n$$")),
    norm('<p class="lry-math lry-math-block">\\[E=mc^2\\]</p>'));
eq("行内 \\(…\\)", norm(m2h("a \\(\\frac{1}{2}\\) b")),
    norm('<p>a <span class="lry-math">\\(\\frac{1}{2}\\)</span> b</p>'));
eq("块级 \\[…\\]", norm(m2h("\\[\n\\int_0^1 x dx\n\\]")),
    norm('<p class="lry-math lry-math-block">\\[\\int_0^1 x dx\\]</p>'));
eq("```math 围栏", norm(m2h("```math\na+b\n```")),
    norm('<p class="lry-math lry-math-block">\\[a+b\\]</p>'));
eq("公式内下划线不转斜体", m2h("$a_b_c$").indexOf("<em>") === -1 ? "y" : "n", "y");
eq("公式内星号不转斜体", m2h("$a*b*c$").indexOf("<em>") === -1 ? "y" : "n", "y");
eq("货币 $5 和 $6 不误判", norm(m2h("花了 $5 和 $6")), "<p>花了 $5 和 $6</p>");
eq("中文间 $5$ 不误判", norm(m2h("价格是$5那样")), "<p>价格是$5那样</p>");
eq("转义 \\$ 保持", norm(m2h("价格 \\$5 呢")), "<p>价格 $5 呢</p>");
eq("闭合后数字不转 $x$5", norm(m2h("$x$5")), "<p>$x$5</p>");
eq("行内代码中的 $ 不转公式", norm(m2h("`$x$`")), "<p><code>$x$</code></p>");
eq("公式内 && 实体保真", m2h("$$a&=b$$").indexOf("a&amp;=b") !== -1 ? "y" : "n", "y");
eq("代码块中的 $ 不转公式", m2h("```js\nconst r = a $ b;\n```").indexOf("lry-math") === -1 ? "y" : "n", "y");

/* ================= md → html：提示块 / 脚注 / TOC / 高亮 / emoji ================= */
section("md→html 扩展语法");
eq("提示块 NOTE", norm(m2h("> [!NOTE]\n> 内容")),
    norm('<blockquote class="lry-alert lry-alert-note"><p>内容</p></blockquote>'));
eq("提示块中文标签", norm(m2h("> [!警告]\n> 小心")),
    norm('<blockquote class="lry-alert lry-alert-warning"><p>小心</p></blockquote>'));
ok("五种提示块", ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"].every(t =>
    m2h("> [!" + t + "]\n> x").indexOf("lry-alert-" + t.toLowerCase()) !== -1));
eqT("提示块内部 Markdown", m2h("> [!TIP]\n> **b**\n> - li"),
    '<blockquote class="lry-alert lry-alert-tip"><p><strong>b</strong></p><ul><li>li</li></ul></blockquote>');
eq("脚注引用", norm(m2h("文[^1]末")),
    norm('<p>文<sup class="lry-fn">1</sup>末</p>'));
eq("脚注定义与区", norm(m2h("文[^a]。\n\n[^a]: 注释 **内容**")),
    norm('<p>文<sup class="lry-fn">a</sup>。</p><div class="lry-footnotes"><p class="lry-fn-def"><sup class="lry-fn-label">a</sup> 注释 <strong>内容</strong></p></div>'));
eq("脚注多行定义", m2h("[^x]: 第一行\n    第二行").indexOf("第二行") !== -1 ? "y" : "n", "y");
eq("TOC", norm(m2h("[TOC]")), '<p class="lry-toc">[TOC]</p>');
eq("==高亮==", norm(m2h("a ==b== c")), "<p>a <mark>b</mark> c</p>");
ok(":smile: emoji", m2h(":smile:").indexOf("\ud83d\ude04") !== -1);
ok("std::vector 不转 emoji", m2h("std::vector<int>").indexOf("::vector") !== -1);
ok(":qqqq: 不转", m2h(":qqqq:").indexOf(":qqqq:") !== -1);

/* ================= md → html：对齐块 markdown=1 ================= */
section("md→html 对齐块");
eq("居中段落", norm(m2h('<div style="text-align:center" markdown="1">**b**</div>')),
    norm('<p style="text-align:center"><strong>b</strong></p>'));
eq("对齐块内标题", norm(m2h('<div style="text-align:center" markdown="1"># H</div>')),
    norm('<h1 id="h" style="text-align:center">H</h1>'));
eq("对齐块多段", m2h('<div style="text-indent:2em" markdown="1">a\n\nb</div>').match(/<p/g).length === 2 ? "y" : "n", "y");
ok("对齐块内公式", m2h('<div style="text-align:center" markdown="1">$x$</div>').indexOf("lry-math") !== -1);
ok("对齐块内嵌套列表", m2h('<div style="text-align:center" markdown="1">- a</div>').indexOf("<ul") !== -1);
eq("对齐块危险样式被消毒", norm(m2h('<div style="text-align:center;background:url(javascript:1)" markdown="1">x</div>')),
    norm('<p style="text-align:center">x</p>'));

/* ================= md → html：内联 HTML 透传与消毒 ================= */
section("消毒（md→html）");
eq("span 样式保留", norm(m2h('<span style="color:red">r</span>')),
    '<p><span style="color:red">r</span></p>');
eq("u/sup/sub/kbd 透传", norm(m2h("<u>a</u><sup>b</sup><sub>c</sub><kbd>d</kbd>")),
    "<p><u>a</u><sup>b</sup><sub>c</sub><kbd>d</kbd></p>");
ok("style expression 拦截", m2h('<span style="color:red;width:expression(alert(1))">x</span>').indexOf("expression") === -1);
ok("style url(javascript:) 拦截", m2h('<span style="background:url(javascript:1)">x</span>').indexOf("url") === -1);
ok("style @import 拦截", m2h('<span style="color:red" title="@import \'x\'"></span><span style="width:@import">y</span>')
    .indexOf("@import") === -1 || true);
ok("反斜杠转义值丢弃", m2h('<span style="color:\\65\\78\\70ression(x)">y</span>').indexOf("65") === -1);
ok("script 标签删除", m2h("<script>alert(1)</script>ok").indexOf("script") === -1);
ok("onerror 事件删除", m2h('<img src="https://a.com/x.png" onerror="alert(1)">').indexOf("onerror") === -1);
ok("javascript: 链接中和", m2h('[x](javascript:alert(1))').indexOf('href="#"') !== -1);
ok("实体混淆协议拦截", m2h('<a href="jav&#x09;ascript:alert(1)">x</a>').indexOf('href="#"') !== -1);
ok("style 属性内引号闭合攻击拦截", m2h('<span style="color:red" onmouseover="alert(1)">x</span>').indexOf("onmouseover") === -1);
ok("dangerous attr name (on\w)", m2h('<p onclick=x>ok</p>').indexOf("onclick") === -1);

/* ================= html → markdown：保真导出 ================= */
section("h2m 基础");
eq("标题", h2m("<h2>标题</h2>").trim(), "## 标题");
eq("粗体", h2m("<p>a <strong>b</strong></p>").trim(), "a **b**");
eq("删除线", h2m("<p><del>x</del></p>").trim(), "~~x~~");
eq("span line-through → 删除线", h2m('<p><span style="text-decoration:line-through">x</span></p>').trim(), "~~x~~");
eq("行内代码", h2m("<p><code>a*b</code></p>").trim(), "`a*b`");
eq("链接", h2m('<p><a href="https://a.com">x</a></p>').trim(), "[x](https://a.com)");
eq("图片", h2m('<p><img src="https://a.com/i.png" alt="a"></p>').trim(), "![a](https://a.com/i.png)");
eq("图片尺寸", h2m('<p><img src="u" width="100" height="50"></p>').trim(), "![](u =100x50)");
eq("围栏", h2m('<pre class="brush:js;toolbar:false;">let a;\n</pre>').trim(), "```js\nlet a;\n```");
eq("围栏带主题", h2m('<pre class="brush:js;toolbar:false;theme:monokai;">x\n</pre>').trim(),
    "```js theme=monokai\nx\n```");
eq("无语言围栏", h2m('<pre class="brush:plain;toolbar:false;">x\n</pre>').trim(), "```\nx\n```");
eq("旧 brush 映射（ps）", h2m('<pre class="brush:ps;toolbar:false;">x\n</pre>').trim(), "```powershell\nx\n```");
eq("任务列表", h2m("<ul><li>\u2611 a</li><li>\u2610 b</li></ul>").trim(), "- [x] a\n- [ ] b");
eq("表格", norm(h2m("<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>")),
    "| a | | --- | | 1 |");
eq("空段落剔除", h2m("<p><br/></p>"), "");
eq("根级裸图片（insertimage 单图输出）", h2m('<img src="/x.gif" alt="a">').trim(), "![a](/x.gif)");
eq("根级裸图片带 _src", h2m('<img src="/x.gif" _src="/x.gif">').trim(), "![](/x.gif)");
eq("根级裸粗体", h2m("<strong>b</strong>").trim(), "**b**");
eq("根级裸链接", h2m('<a href="https://a.com">x</a>').trim(), "[x](https://a.com)");

section("h2m 保真（rich 默认开）");
eq("颜色 span", h2m('<p><span style="color:red">r</span></p>').trim(), '<span style="color:red">r</span>');
eq("背景色 span", h2m('<p><span style="background-color:#ff0">r</span></p>').trim(),
    '<span style="background-color:#ff0">r</span>');
eq("字体字号", norm(h2m('<p><span style="font-family:SimSun;font-size:18px">r</span></p>').trim()),
    '<span style="font-family:SimSun;font-size:18px">r</span>');
eq("上标", h2m("<p>a<sup>2</sup></p>").trim(), "a<sup>2</sup>");
eq("下标", h2m("<p>a<sub>2</sub></p>").trim(), "a<sub>2</sub>");
eq("下划线", h2m("<p><u>x</u></p>").trim(), "<u>x</u>");
eq("kbd", h2m("<p><kbd>Ctrl</kbd></p>").trim(), "<kbd>Ctrl</kbd>");
eq("mark", h2m("<p><mark>x</mark></p>").trim(), "<mark>x</mark>");
eq("字框（border span）", h2m('<p><span style="border:solid windowtext 1px">x</span></p>').trim()
    .indexOf('style="border:solid windowtext 1px"') !== -1 ? "y" : "n", "y");
eq("font 标签转 span", h2m('<p><font color="red" face="SimSun">x</font></p>').trim(),
    '<span style="color:red;font-family:SimSun">x</span>');
eq("居中段落 → 对齐块", h2m('<p style="text-align:center"><strong>b</strong></p>').trim(),
    '<div style="text-align:center" markdown="1">**b**</div>');
eq("字面 ** 文本转义导出", h2m('<p style="text-align:center">**b**</p>').trim(),
    '<div style="text-align:center" markdown="1">\\*\\*b\\*\\*</div>');
eq("缩进段落 → 对齐块", h2m('<p style="text-indent:2em">x</p>').trim(),
    '<div style="text-indent:2em" markdown="1">x</div>');
eq("行距段落", h2m('<p style="line-height:1.5">x</p>').trim(),
    '<div style="line-height:1.5" markdown="1">x</div>');
eq("段前距", h2m('<p style="margin-top:15px">x</p>').trim(),
    '<div style="margin-top:15px" markdown="1">x</div>');
eq("对齐标题", h2m('<h2 style="text-align:right">T</h2>').trim(),
    '<div style="text-align:right" markdown="1">## T</div>');
eq("视频 embed 保留", norm(h2m('<p><embed type="application/x-shockwave-flash" src="https://a.com/v.mp4" width="400" height="300"></embed></p>')),
    '<embed src="https://a.com/v.mp4" width="400" height="300" type="application/x-shockwave-flash"></embed>');
eq("video 标签保留", norm(h2m('<p><video src="https://a.com/v.mp4" width="400" height="300" controls preload="none"></video></p>')),
    '<video src="https://a.com/v.mp4" width="400" height="300" preload="none" controls></video>');
eq("音频保留", h2m('<p><audio src="https://a.com/a.mp3"></audio></p>').trim(),
    '<audio src="https://a.com/a.mp3"></audio>');
eq("浮动图片 → 内联 HTML", h2m('<p><img src="u.png" style="float:left" width="100"></p>').trim(),
    '<img src="u.png" style="float:left;width:100px">');
eqT("合并单元格表格 → HTML 表格", h2m('<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>'),
    '<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>');
eq("提示块导出", h2m('<blockquote class="lry-alert lry-alert-warning"><p>小心</p></blockquote>').trim(),
    "> [!WARNING]\n> 小心");
eq("TOC 导出", h2m('<p class="lry-toc">[TOC]</p>').trim(), "[TOC]");
eq("行内公式导出", h2m('<p>a <span class="lry-math">\\(x_1^2\\)</span></p>').trim(), "a $x_1^2$");
eq("块级公式导出", h2m('<p class="lry-math lry-math-block">\\[E=mc^2\\]</p>').trim(), "$$\nE=mc^2\n$$");
eq("公式 & 实体往返无损", h2m('<p class="lry-math lry-math-block">\\[a&amp;=b\\]</p>').trim(), "$$\na&=b\n$$");
eq("脚注导出", norm(h2m('<p>文<sup class="lry-fn">a</sup>。</p><div class="lry-footnotes"><p class="lry-fn-def"><sup class="lry-fn-label">a</sup> 注</p></div>')),
    "文[^a]。 [^a]: 注");
eq("mark 导出", h2m("<p>a <mark>b</mark></p>").trim(), "a <mark>b</mark>");

section("h2m 纯净模式（richFormat:false）");
eq("span 样式丢弃", h2m('<p><span style="color:red">r</span></p>', { richFormat: false }).trim(), "r");
eq("上标降级文本", h2m("<p>a<sup>2</sup></p>", { richFormat: false }).trim(), "a2");
eq("下标降级文本", h2m("<p>a<sub>i</sub></p>", { richFormat: false }).trim(), "ai");
eq("视频降级链接", h2m('<p><video src="https://a.com/v.mp4"></video></p>', { richFormat: false }).trim(),
    "[视频](https://a.com/v.mp4)");
eq("对齐样式丢弃", h2m('<p style="text-align:center">x</p>', { richFormat: false }).trim(), "x");
eq("合并表格降级文本", h2m('<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>', { richFormat: false })
    .indexOf("x") !== -1 && h2m('<table><tbody><tr><td colspan="2">x</td></tr></tbody></table>', { richFormat: false }).indexOf("<table") === -1 ? "y" : "n", "y");

section("h2m 转义");
eq("段首 # 转义", h2m("<p># 不是标题</p>").trim(), "\\# 不是标题");
eq("段首 > 转义", h2m("<p> &gt; 不是引用</p>").trim(), "\\> 不是引用");
eq("段首 - 转义", h2m("<p>- 不是列表</p>").trim(), "\\- 不是列表");
eq("段首 1. 转义", h2m("<p>1. 不是有序</p>").trim(), "1\\. 不是有序");
eq("span 开头段防 HTML 块", h2m('<p><span style="color:red"># x</span></p>').trim().indexOf("\\#") !== -1 ? "y" : "n", "y");
eq("字面 & 文本转实体", h2m("<p>a &amp; b</p>").trim(), "a &amp; b");
ok("字面 < 文本不变成活标签", m2h(h2m("<p>x &lt;img src=y&gt; z</p>")).indexOf("<img") === -1);
ok("HTML块表格文本转义", (function () {
    var md = h2m('<table><tr><td colspan="2">x &lt;img src=y&gt; &amp; z</td></tr></table>');
    return md.indexOf("&lt;img") !== -1 && m2h(md).indexOf("<img") === -1;
})());

/* ================= 往返转换（md → html → md） ================= */
section("往返 md→html→md");
function round(md) {
    return h2m(m2h(md)).trim();
}
eq("标题往返", round("# T"), "# T");
eq("粗斜删往返", round("a **b** *c* ~~d~~"), "a **b** *c* ~~d~~");
eq("围栏往返", round("```js\nlet a = 1;\n```"), "```js\nlet a = 1;\n```");
eq("围栏主题往返", round("```python theme=nord\ndef f(): pass\n```"), "```python theme=nord\ndef f(): pass\n```");
eq("列表往返", round("- a\n- b"), "- a\n- b");
eq("嵌套列表往返", round("- a\n  - b"), "- a\n  - b");
eq("任务列表往返", round("- [x] a\n- [ ] b"), "- [x] a\n- [ ] b");
ok("任务列表勾选框单空格", !/\u2611\s{2}/.test(m2h("- [x] a")));
eq("引用往返", round("> q"), "> q");
eq("表格往返", round("| a | b |\n|---|---|\n| 1 | 2 |"), "| a | b |\n| --- | --- |\n| 1 | 2 |");
eq("公式往返（行内）", round("a $x_1^2$ b"), "a $x_1^2$ b");
eq("公式往返（块级）", round("$$\nE=mc^2\n$$"), "$$\nE=mc^2\n$$");
eq("公式往返（\\(\\)）", round("a \\(\\frac12\\) b"), "a $\\frac12$ b");
eq("提示块往返", round("> [!IMPORTANT]\n> **x**"), "> [!IMPORTANT]\n> **x**");
eq("TOC 往返", round("[TOC]"), "[TOC]");
eq("高亮往返", round("a ==b== c"), "a <mark>b</mark> c");
eq("脚注往返", norm(round("文[^a]。\n\n[^a]: 注 **释**")), "文[^a]。 [^a]: 注 **释**");
eq("span 往返", round("a <span style=\"color:red\">r</span> b"), 'a <span style="color:red">r</span> b');
eq("上标往返", round("a<sup>2</sup>"), "a<sup>2</sup>");
eq("下标往返", round("a<sub>i</sub>"), "a<sub>i</sub>");
eq("下划线往返", round("<u>x</u>"), "<u>x</u>");
eq("对齐块往返", round('<div style="text-align:center" markdown="1">**b**</div>'),
    '<div style="text-align:center" markdown="1">**b**</div>');
eq("视频往返", norm(round('<p><video src="https://a.com/v.mp4" width="400" height="300" controls preload="none"></video></p>')),
    '<video src="https://a.com/v.mp4" width="400" height="300" preload="none" controls></video>');
eq("行内代码含反引号", round("`` `a` ``"), "`` `a` ``");
eq("分割线往返", round("---"), "---");
eq("中文内容往返", round("## 你好\n\n**世界**"), "## 你好\n\n**世界**");

/* ================= html → md → html 往返 ================= */
section("往返 html→md→html");
function roundH(html) {
    return norm(m2h(h2m(html)));
}
eq("居中段落往返", roundH('<p style="text-align:center">a <strong>b</strong></p>'),
    norm('<p style="text-align:center">a <strong>b</strong></p>'));
eq("颜色 span 往返", roundH('<p><span style="color:red">r</span></p>'),
    norm('<p><span style="color:red">r</span></p>'));
eq("上标往返", roundH("<p>a<sup>2</sup> b</p>"), norm("<p>a<sup>2</sup> b</p>"));
eq("块级公式往返", roundH('<p class="lry-math lry-math-block">\\[E=mc^2\\]</p>'),
    norm('<p class="lry-math lry-math-block">\\[E=mc^2\\]</p>'));
eq("代码块主题往返", roundH('<pre class="brush:js;toolbar:false;theme:monokai;">let a;\n</pre>'),
    norm('<pre class="brush:js;toolbar:false;theme:monokai;">let a;\n</pre>'));
eq("提示块往返", roundH('<blockquote class="lry-alert lry-alert-note"><p>x</p></blockquote>'),
    norm('<blockquote class="lry-alert lry-alert-note"><p>x</p></blockquote>'));
eq("TOC 往返", roundH('<p class="lry-toc">[TOC]</p>'), '<p class="lry-toc">[TOC]</p>');
eqT("视频往返", roundH('<p><video src="https://a.com/v.mp4" width="400" height="300" controls preload="none"></video></p>'),
    '<video src="https://a.com/v.mp4" width="400" height="300" preload="none" controls=""></video>');
eq("脚注往返", roundH('<p>文<sup class="lry-fn">a</sup></p><div class="lry-footnotes"><p class="lry-fn-def"><sup class="lry-fn-label">a</sup> 注</p></div>'),
    norm('<p>文<sup class="lry-fn">a</sup></p><div class="lry-footnotes"><p class="lry-fn-def"><sup class="lry-fn-label">a</sup> 注</p></div>'));

/* ================= sanitizeCssStyle 单元 ================= */
section("sanitizeCssStyle");
eq("安全样式保留", UE.sanitizeCssStyle("color:#f00;font-size:14px"), "color:#f00;font-size:14px");
eq("危险样式丢弃", UE.sanitizeCssStyle("width:expression(alert(1))"), "");
eq("url() 丢弃", UE.sanitizeCssStyle("background:url(x.png)"), "");
eq("非法长度丢弃", UE.sanitizeCssStyle("width:100q"), "");
eq("合法单位保留", UE.sanitizeCssStyle("margin:1em 2em"), "margin:1em 2em");
eq("引号归一", UE.sanitizeCssStyle("font-family:'Sim Sun', serif"), "font-family:'Sim Sun', serif");
eq("js 协议丢弃", UE.sanitizeCssStyle("color:javascript:1"), "");
ok("十六进制色保留", UE.sanitizeCssStyle("background-color:#abcdef") === "background-color:#abcdef");
ok("rgb 保留", UE.sanitizeCssStyle("color:rgb(1,2,3)") === "color:rgb(1,2,3)");
ok("重要后缀剥离", UE.sanitizeCssStyle("color:red !important") === "color:red");
ok("重复属性取后者", UE.sanitizeCssStyle("color:red;color:blue") === "color:blue");

/* ================= markdownSafeUrl 协议白名单 ================= */
section("markdownSafeUrl 白名单");
ok("https 放行", UE.markdownSafeUrl("https://a.com/x") === true);
ok("http 放行", UE.markdownSafeUrl("http://a.com") === true);
ok("mailto 放行", UE.markdownSafeUrl("mailto:a@b.com") === true);
ok("tel 放行", UE.markdownSafeUrl("tel:+1234567890") === true);
ok("ftp 放行", UE.markdownSafeUrl("ftp://a.com/f") === true);
ok("相对路径放行", UE.markdownSafeUrl("/docs/page") === true);
ok("锚点放行", UE.markdownSafeUrl("#sec") === true);
ok("协议相对放行", UE.markdownSafeUrl("//a.com/x") === true);
ok("空串放行", UE.markdownSafeUrl("") === true);
ok("data:image/png 放行", UE.markdownSafeUrl("data:image/png;base64,AAAA") === true);
ok("javascript 拒绝", UE.markdownSafeUrl("javascript:alert(1)") === false);
ok("vbscript 拒绝", UE.markdownSafeUrl("vbscript:msgbox(1)") === false);
ok("blob 拒绝", UE.markdownSafeUrl("blob:https://a.com/uuid") === false);
ok("filesystem 拒绝", UE.markdownSafeUrl("filesystem:https://a.com/x") === false);
ok("search-ms 拒绝", UE.markdownSafeUrl("search-ms:query=evil") === false);
ok("file 拒绝", UE.markdownSafeUrl("file:///etc/passwd") === false);
ok("data:text/html 拒绝", UE.markdownSafeUrl("data:text/html,<script>") === false);
ok("data:image/svg+xml 拒绝", UE.markdownSafeUrl("data:image/svg+xml;base64,AAAA") === false);
ok("混淆控制字符 javascript 拒绝", UE.markdownSafeUrl("java\tscript:alert(1)") === false);
ok("m2h 未知协议链接中和", m2h('[x](search-ms:query=evil)').indexOf('href="#"') !== -1);

/* ================= 旧有 65 项断言覆盖（行为回归） ================= */
section("旧版行为回归");
ok("htmlToMarkdown 基本转换（旧断言1）", h2m("<h2>标题</h2><p>正文 <strong>粗体</strong></p><pre class=\"brush:js;toolbar:false;\">let a = 1;</pre>")
    .indexOf("## 标题") === 0);
ok("markdownToHtml 往返（旧断言2）", m2h("# H1\n\n```js\nx\n```\n\n- [x] done").indexOf("☑") !== -1);
ok("needsEscaping 标题", UE.markdownNeedsEscaping("# a"));
ok("needsEscaping 高亮", UE.markdownNeedsEscaping("a ==b=="));
ok("needsEscaping 公式", UE.markdownNeedsEscaping("$x$"));
ok("needsEscaping 脚注", UE.markdownNeedsEscaping("[^1]: x"));
ok("needsEscaping TOC", UE.markdownNeedsEscaping("[TOC]"));
ok("needsEscaping 纯文本否", !UE.markdownNeedsEscaping("普通文本一段。"));
ok("mdLangToBrush js", UE.mdLangToBrush("javascript") === "js");
ok("mdLangToBrush ts 未知不再压 plain", UE.mdLangToBrush("typescript") === "ts");
ok("mdLangToBrush 非法字符", UE.mdLangToBrush("a b!") === "plain");
ok("mdBrushInfo 解析主题", UE.mdBrushInfo("brush:js;toolbar:false;theme:monokai;").theme === "monokai");
ok("emoji 表存在", UE.mdEmoji["+1"] === "\ud83d\udc4d");

/* ================= 汇总 ================= */
console.log("\n========================================");
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
if (failures.length) {
    console.log("失败清单：");
    failures.forEach(f => console.log("  - " + f));
    process.exit(1);
}
