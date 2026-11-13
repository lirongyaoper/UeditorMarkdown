/* 前台渲染器 lry-content-render.js 的 Node 测试（jsdom + KaTeX mock）
   运行：npm install jsdom  然后  node test/render-tests.js
   覆盖：公式渲染（结构化节点 / 裸定界符 / 混排 / 前台单 $ / 货币不误判 / 代码块排除）。 */
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
const dom = new JSDOM("<!DOCTYPE html><html><head></head><body></body></html>", {
    runScripts: "outside-only", url: "http://localhost/test/", pretendToBeVisual: true
});
const w = dom.window;
w.LryContentRenderOptions = { base: "/test/", katex: true };
// KaTeX mock：同步可用，输出可识别标记（:D 表示 displayMode）
w.katex = {
    renderToString: (latex, o) => '<span class="katex">MATH:' + latex + (o && o.displayMode ? ":D" : "") + "</span>"
};
w.eval(fs.readFileSync(path.join(ROOT, "js/lry-content-render.js"), "utf8"));

let pass = 0, fail = 0;
function ok(name, cond, extra) {
    if (cond) { pass++; }
    else { fail++; console.log("  FAIL " + name + (extra !== undefined && extra !== "" ? " → " + extra : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }
function renderHTML(html) {
    const c = w.document.createElement("div");
    c.innerHTML = html;
    w.document.body.appendChild(c);
    w.LryContentRender.render(c);
    return c;
}

section("公式：结构化 + 裸定界符混排");
const c1 = renderHTML('<span class="lry-math">\\(a^2\\)</span><p>裸 \\(b^2\\) 文本</p>');
ok("结构化节点渲染", c1.querySelector(".lry-math .katex") !== null);
ok("裸定界符也渲染", c1.innerHTML.indexOf("MATH:b^2") !== -1, c1.innerHTML);
ok("无残留裸定界符", c1.textContent.indexOf("\\(") === -1, c1.textContent);

section("公式：前台单 $（不加载 UE）");
const c2 = renderHTML('<p>行内 $x^2$ 公式</p>');
ok("单 $ 行内公式渲染", c2.innerHTML.indexOf("MATH:x^2") !== -1, c2.innerHTML);

section("公式：货币不误判");
const c3 = renderHTML('<p>价格 $5 和 $10 元</p>');
ok("货币不渲染为公式", c3.querySelector(".lry-math") === null, c3.innerHTML);
ok("货币文本保留", c3.textContent.indexOf("$5") !== -1 && c3.textContent.indexOf("$10") !== -1);

section("公式：结构化节点不二次处理");
const c4 = renderHTML('<span class="lry-math">\\(a^2\\)</span>');
ok("结构化节点唯一", c4.querySelectorAll(".lry-math").length === 1, c4.innerHTML);
ok("katex 输出唯一", c4.querySelectorAll(".katex").length === 1, c4.innerHTML);

section("公式：$$ 显示公式 / 代码块排除");
const c5 = renderHTML('<p>$$y^2$$</p>');
ok("$$ 显示公式渲染", c5.innerHTML.indexOf("MATH:y^2:D") !== -1, c5.innerHTML);
const c6 = renderHTML('<pre><code>\\(z^2\\) $w$</code></pre>');
ok("代码块内定界符不渲染", c6.querySelector(".lry-math") === null, c6.innerHTML);

console.log("\n========================================");
console.log("结果：" + pass + " 通过 / " + fail + " 失败");
process.exit(fail ? 1 : 0);