/* lry-content-render.js — 前台内容渲染器（2026-11-09 UEditor Markdown 三轮升级）
 * 渲染 UEditor 产出的扩展内容：代码块高亮（highlight.js + 主题）、代码块头部（语言名 + 复制）、
 * LaTeX 公式（KaTeX，含 mhchem）、提示块/脚注/目录样式、==高亮==、任务列表。
 * 编辑器与前台共用公共层：plugin/{highlight,katex}/，按需懒加载。
 *
 * 用法：
 *   LryContentRender.render(el)          渲染指定容器（AJAX 插入的内容重新渲染时用）
 *   LryContentRender.render()            渲染整页
 *   LryContentRender.auto('.sel1,.sel2')  自动渲染：文档就绪则同步渲染并返回是否命中选择器，
 *                                         仍在加载则挂到 DOMContentLoaded 并返回 true（已排程）
 * 可配（在引入本文件前定义 window.LryContentRenderOptions）：
 *   base           静态资源根（默认自动探测：本文件所在 js/ 的上级目录）
 *   defaultTheme   未设主题的代码块所用主题（默认 'github'；文章页可设 'github-dark'）
 *   katex          是否渲染公式（默认 true）
 *   copyText/copiedText 复制按钮文案
 */
(function (global) {
    "use strict";

    var opts = {
        base: "",
        defaultTheme: "github",
        katex: true,
        copyText: "复制",
        copiedText: "已复制",
        langNames: null
    };
    if (global.LryContentRenderOptions) {
        for (var k in global.LryContentRenderOptions) {
            if (Object.prototype.hasOwnProperty.call(global.LryContentRenderOptions, k)) {
                opts[k] = global.LryContentRenderOptions[k];
            }
        }
    }

    function detectBase() {
        if (opts.base) {
            return opts.base.replace(/\/?$/, "/");
        }
        var scripts = document.getElementsByTagName("script");
        for (var i = scripts.length - 1; i >= 0; i--) {
            var m = (scripts[i].src || "").match(/^(.*\/)js\/lry-content-render\.js/);
            if (m) {
                return m[1];
            }
        }
        return "";
    }

    var BASE = null;

    /* ---------- 资源懒加载 ---------- */
    var loaded = {};
    function loadScript(src, cb) {
        if (loaded[src]) {
            cb && cb();
            return;
        }
        var s = document.createElement("script");
        s.src = src;
        s.onload = s.onerror = function () {
            loaded[src] = true;
            cb && cb();
        };
        (document.head || document.getElementsByTagName("head")[0]).appendChild(s);
    }

    function loadCss(href) {
        if (loaded[href] || document.querySelector('link[data-lry="' + href + '"]')) {
            loaded[href] = true;
            return;
        }
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = href;
        l.setAttribute("data-lry", href);
        (document.head || document.getElementsByTagName("head")[0]).appendChild(l);
        loaded[href] = true;
    }

    var hljsQueue = [];
    function ensureHljs(cb) {
        if (global.hljs && global.LryCodeThemes) {
            cb(true);
            return;
        }
        hljsQueue.push(cb);
        if (hljsQueue.length > 1) {
            return;
        }
        var done = function () {
            var ok = !!(global.hljs && global.LryCodeThemes);
            var q = hljsQueue.splice(0);
            for (var i = 0; i < q.length; i++) {
                q[i](ok);
            }
        };
        var B = BASE + "plugin/";
        loadScript(B + "highlight/lry-code-themes.js", function () {
            loadScript(B + "highlight/highlight.min.js", done);
        });
    }

    var katexQueue = [];
    function ensureKatex(cb) {
        if (!opts.katex) {
            cb(false);
            return;
        }
        if (global.katex && global.katex.renderToString) {
            cb(true);
            return;
        }
        katexQueue.push(cb);
        if (katexQueue.length > 1) {
            return;
        }
        var done = function () {
            var ok = !!(global.katex && global.katex.renderToString);
            var q = katexQueue.splice(0);
            // mhchem 可选，失败不影响
            if (ok) {
                loadScript(BASE + "plugin/katex/contrib/mhchem.min.js", function () {
                    for (var i = 0; i < q.length; i++) {
                        q[i](true);
                    }
                });
            } else {
                for (var j = 0; j < q.length; j++) {
                    q[j](false);
                }
            }
        };
        loadCss(BASE + "plugin/katex/katex.min.css");
        loadScript(BASE + "plugin/katex/katex.min.js", done);
    }

    /* ---------- 工具 ---------- */
    var BRUSH_LANG = {
        js: "JavaScript", plain: "文本", plaintext: "文本", html: "HTML", xml: "XML",
        vb: "VB", vbnet: "VB.net", as3: "ActionScript", ps: "PowerShell", powershell: "PowerShell",
        pl: "Perl", csharp: "C#", cpp: "C/C++", md: "Markdown", ts: "TypeScript",
        scss: "SCSS", less: "Less", css: "CSS", json: "JSON", yaml: "YAML",
        sql: "SQL", bash: "Bash/Shell", python: "Python", java: "Java", php: "PHP",
        go: "Go", rust: "Rust", dockerfile: "Dockerfile", nginx: "Nginx", latex: "LaTeX",
        matlab: "Matlab", r: "R", ruby: "Ruby", swift: "Swift", kotlin: "Kotlin",
        dart: "Dart", scala: "Scala", groovy: "Groovy", erlang: "Erlang", haskell: "Haskell",
        http: "HTTP", ini: "INI", toml: "INI", properties: "Properties", makefile: "Makefile",
        diff: "Diff", wasm: "WebAssembly", graphql: "GraphQL", protobuf: "Protobuf",
        julia: "Julia", apache: "Apache", cmake: "CMake", clojure: "Clojure", elixir: "Elixir",
        "c#": "C#", "c++": "C/C++", objectivec: "Objective-C", delphi: "Delphi"
    };

    function esc(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    function brushInfo(cls) {
        var s = String(cls || "");
        var bm = s.match(/brush:\s*([^;\s]+)/i);
        var tm = s.match(/theme:\s*([^;\s]+)/i);
        return { brush: bm ? bm[1] : "", theme: tm ? tm[1] : "" };
    }

    /* ---------- 代码块渲染 ---------- */
    var injectedThemes = {};

    function injectThemeCss(theme) {
        if (injectedThemes[theme] || !global.LryCodeThemes) {
            return;
        }
        injectedThemes[theme] = 1;
        var style = document.createElement("style");
        style.setAttribute("data-lry-theme", theme);
        style.textContent = global.LryCodeThemes.css(theme);
        (document.head || document.getElementsByTagName("head")[0]).appendChild(style);
    }

    function renderCodeBlocks(root, done) {
        var pres = root.querySelectorAll("pre[class*='brush:']");
        if (!pres.length) {
            done();
            return;
        }
        ensureHljs(function (ok) {
            if (!ok) {
                done();
                return;
            }
            for (var i = 0; i < pres.length; i++) {
                renderOneCode(pres[i]);
            }
            done();
        });
    }

    function renderOneCode(pre) {
        if (pre.getAttribute("data-lry-rendered")) {
            return;
        }
        pre.setAttribute("data-lry-rendered", "1");
        var info = brushInfo(pre.className);
        var theme = global.LryCodeThemes.normalize(info.theme || opts.defaultTheme);
        injectThemeCss(theme);
        var codeText = pre.textContent.replace(/\u00a0/g, " ").replace(/\n+$/, "");

        var lang = info.brush.toLowerCase();
        var hlLang = mapLang(lang);
        var html;
        try {
            html = hljs.highlight(codeText, { language: hlLang, ignoreIllegals: true }).value;
        } catch (e) {
            html = esc(codeText);
        }

        var langLabel = (opts.langNames && opts.langNames[lang]) || BRUSH_LANG[lang] ||
            (lang && lang !== "plain" ? lang.charAt(0).toUpperCase() + lang.slice(1) : "");

        var box = document.createElement("div");
        box.className = "lry-code";
        var dark = global.LryCodeThemes.palette(theme).dark;
        if (dark) {
            box.className += " lry-code-dark";
        }
        box.setAttribute("data-lry-theme", theme);
        var head = document.createElement("div");
        head.className = "lry-code-head";
        head.innerHTML = '<span class="lry-code-lang">' + esc(langLabel || "CODE") + "</span>";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "lry-code-copy";
        btn.textContent = opts.copyText;
        btn.setAttribute("data-code", encodeURIComponent(codeText));
        head.appendChild(btn);
        var newPre = document.createElement("pre");
        newPre.className = "lry-code-hl theme-" + theme;
        newPre.innerHTML = "<code>" + html + "</code>";
        box.appendChild(head);
        box.appendChild(newPre);
        if (pre.parentNode) {
            pre.parentNode.replaceChild(box, pre);
        }
    }

    function mapLang(brush) {
        var map = { js: "javascript", plain: "plaintext", plaintext: "plaintext", html: "xml", vb: "vbnet",
            as3: "actionscript", ps: "powershell", pl: "perl", "c#": "csharp", md: "markdown", "c++": "cpp" };
        var cands = [brush, map[brush]];
        for (var i = 0; i < cands.length; i++) {
            if (cands[i] && hljs.getLanguage(cands[i])) {
                return cands[i];
            }
        }
        return "plaintext";
    }

    /* ---------- 公式渲染 ---------- */
    /* 三种来源：
       1. <span class="lry-math">\(…\)</span> / <p class="lry-math lry-math-block">\[…\]</p>（编辑器存储格式）
       2. 纯文本定界符（论坛过滤掉 class 后的形态）：文本节点里的 \(…\) \[…\] $…$ $$…$$
       3. 旧 latexeasy 图片 <img data-formula-image> 原样显示 */
    function renderMath(root, done) {
        var nodes = root.querySelectorAll(".lry-math");
        var hasMathNode = nodes.length > 0;
        var needScan = false;
        if (!hasMathNode) {
            // 快速探测是否存在裸定界符（跳过代码块内容）
            var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
                acceptNode: function (n) {
                    if (!n.nodeValue || n.nodeValue.indexOf("\\(") === -1 &&
                        n.nodeValue.indexOf("\\[") === -1 &&
                        n.nodeValue.indexOf("$") === -1) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    var p = n.parentNode;
                    while (p && p !== root) {
                        if (p.nodeType === 1) {
                            var t = p.tagName;
                            if (t === "PRE" || t === "CODE" || t === "SCRIPT" || t === "STYLE" ||
                                (p.className || "").indexOf("lry-code") !== -1) {
                                return NodeFilter.FILTER_REJECT;
                            }
                        }
                        p = p.parentNode;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            });
            while (walker.nextNode()) {
                needScan = true;
                break;
            }
        }
        if (!hasMathNode && !needScan) {
            done();
            return;
        }
        ensureKatex(function (ok) {
            if (!ok) {
                done();
                return;
            }
            // 1. 结构化节点
            var els = root.querySelectorAll(".lry-math:not([data-lry-rendered])");
            for (var i = 0; i < els.length; i++) {
                renderMathEl(els[i]);
            }
            // 2. 裸文本定界符（结构化节点与裸定界符可混排，walker 会跳过 .lry-math 内部）
            scanTextMath(root);
            done();
        });
    }

    function renderMathEl(el) {
        el.setAttribute("data-lry-rendered", "1");
        var text = (el.textContent || "").replace(/^\s+|\s+$/g, "");
        var m = text.match(/^\\([\[(])([\s\S]*?)\\[\])]$/);
        var latex = m ? m[2] : text.replace(/^\$+|\$+$/g, "");
        var display = /lry-math-block/.test(el.className || "") || (m && m[1] === "[");
        try {
            el.innerHTML = katex.renderToString(latex, { displayMode: display, throwOnError: false });
        } catch (e) {
            el.textContent = text;
        }
    }

    /* 文本节点里的定界符 → 就地替换为公式节点（保守判定：\(\) \[\] 必转；$ 单行 LaTeX 特征） */
    function scanTextMath(root) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: function (n) {
                if (!n.nodeValue) {
                    return NodeFilter.FILTER_REJECT;
                }
                var v = n.nodeValue;
                if (v.indexOf("\\(") === -1 && v.indexOf("\\[") === -1 && v.indexOf("$") === -1) {
                    return NodeFilter.FILTER_REJECT;
                }
                var p = n.parentNode;
                while (p && p !== root) {
                    if (p.nodeType === 1) {
                        var t = p.tagName;
                        if (t === "PRE" || t === "CODE" || t === "SCRIPT" || t === "STYLE") {
                            return NodeFilter.FILTER_REJECT;
                        }
                        var cn = p.className || "";
                        if (cn.indexOf && (cn.indexOf("katex") !== -1 || cn.indexOf("lry-math") !== -1)) {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                    p = p.parentNode;
                }
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        var targets = [];
        while (walker.nextNode()) {
            targets.push(walker.currentNode);
        }
        targets.forEach(function (node) {
            var text = node.nodeValue;
            if (text.indexOf("\\(") === -1 && text.indexOf("\\[") === -1 && text.indexOf("$") === -1) {
                return;
            }
            var frag = document.createDocumentFragment();
            var rest = text;
            var consumed = false;
            while (rest) {
                var m = nextMath(rest);
                if (!m) {
                    break;
                }
                if (m.start > 0) {
                    frag.appendChild(document.createTextNode(rest.substring(0, m.start)));
                }
                var span = document.createElement(m.display ? "p" : "span");
                span.className = m.display ? "lry-math lry-math-block" : "lry-math";
                span.setAttribute("data-lry-rendered", "1");
                try {
                    span.innerHTML = katex.renderToString(m.latex, { displayMode: m.display, throwOnError: false });
                } catch (e) {
                    span.textContent = m.raw;
                }
                frag.appendChild(span);
                rest = rest.substring(m.start + m.raw.length);
                consumed = true;
            }
            if (consumed) {
                if (rest) {
                    frag.appendChild(document.createTextNode(rest));
                }
                if (node.parentNode) {
                    node.parentNode.replaceChild(frag, node);
                }
            }
        });
    }

    /* 单 $ 行内公式保守判定（与编辑器 UE._mdPipeline.looksLikeInlineMath 一致）：
       前台不加载 UE，用本地副本避免货币 "$5 … $10" 被误判为公式 */
    function looksLikeInlineMath(content, next) {
        if (!content || /^\s|\s$/.test(content) || /\d/.test(next || "")) {
            return false;
        }
        if (/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]/.test(content) && !/[\\^_{}]/.test(content)) {
            return false;
        }
        return /[\\^_{}]/.test(content) || /[A-Za-z\u0370-\u03ff]/.test(content);
    }

    function nextMath(text) {
        var cands = [];
        var i1 = text.indexOf("\\(");
        if (i1 !== -1) {
            var e1 = text.indexOf("\\)", i1 + 2);
            if (e1 !== -1) {
                cands.push({ start: i1, raw: text.substring(i1, e1 + 2), latex: text.substring(i1 + 2, e1), display: false });
            }
        }
        var i2 = text.indexOf("\\[");
        if (i2 !== -1) {
            var e2 = text.indexOf("\\]", i2 + 2);
            if (e2 !== -1) {
                cands.push({ start: i2, raw: text.substring(i2, e2 + 2), latex: text.substring(i2 + 2, e2), display: true });
            }
        }
        var i3 = text.indexOf("$$");
        if (i3 !== -1) {
            var e3 = text.indexOf("$$", i3 + 2);
            if (e3 !== -1) {
                cands.push({ start: i3, raw: text.substring(i3, e3 + 2), latex: text.substring(i3 + 2, e3), display: true });
            }
        }
        var inlineMathTest = (global.UE && global.UE._mdPipeline && global.UE._mdPipeline.looksLikeInlineMath) || looksLikeInlineMath;
        var i4 = text.indexOf("$");
        while (i4 !== -1) {
            var e4 = text.indexOf("$", i4 + 1);
            if (e4 === -1) {
                break;
            }
            var latex4 = text.substring(i4 + 1, e4);
            if (inlineMathTest(latex4, text.charAt(e4 + 1) || "")) {
                cands.push({ start: i4, raw: text.substring(i4, e4 + 1), latex: latex4, display: false });
                break;
            }
            i4 = text.indexOf("$", e4 + 1);
        }
        if (!cands.length) {
            return null;
        }
        cands.sort(function (a, b) {
            return a.start - b.start;
        });
        return cands[0];
    }

    /* ---------- 目录 ---------- */
    function renderToc(root) {
        var tocs = root.querySelectorAll("p.lry-toc, .lry-toc");
        for (var i = 0; i < tocs.length; i++) {
            var p = tocs[i];
            if (p.getAttribute("data-lry-rendered")) {
                continue;
            }
            p.setAttribute("data-lry-rendered", "1");
            var box = document.createElement("div");
            box.className = "lry-toc-box";
            var title = document.createElement("div");
            title.className = "lry-toc-title";
            title.textContent = "目录";
            box.appendChild(title);
            var list = document.createElement("div");
            list.className = "lry-toc-list";
            var heads = root.querySelectorAll("h1,h2,h3,h4,h5,h6");
            var idx = 0;
            for (var h = 0; h < heads.length; h++) {
                var el = heads[h];
                var level = parseInt(el.tagName.charAt(1), 10);
                if (!el.id) {
                    el.id = "lry-h-" + (++idx);
                }
                var a = document.createElement("a");
                a.href = "#" + el.id;
                a.className = "lry-toc-item lry-toc-l" + level;
                a.textContent = el.textContent;
                list.appendChild(a);
            }
            if (!heads.length) {
                list.innerHTML = '<span class="lry-toc-empty">（无标题）</span>';
            }
            box.appendChild(list);
            if (p.parentNode) {
                p.parentNode.replaceChild(box, p);
            }
        }
    }

    /* ---------- 脚注锚点 ---------- */
    function renderFootnotes(root) {
        var refs = root.querySelectorAll("sup.lry-fn");
        for (var i = 0; i < refs.length; i++) {
            var label = (refs[i].textContent || "").replace(/\s/g, "");
            if (!label) {
                continue;
            }
            var a = document.createElement("a");
            a.href = "#lry-fn-" + encodeURIComponent(label);
            a.className = "lry-fn-link";
            a.textContent = label;
            refs[i].innerHTML = "[" + a.outerHTML + "]";
        }
        var defs = root.querySelectorAll("p.lry-fn-def");
        for (var d = 0; d < defs.length; d++) {
            var sup = defs[d].querySelector("sup.lry-fn-label");
            if (sup && !defs[d].id) {
                defs[d].id = "lry-fn-" + encodeURIComponent((sup.textContent || "").replace(/\s/g, ""));
            }
        }
    }

    /* ---------- 复制按钮（事件委托，一次绑定） ---------- */
    var copyBound = false;
    function bindCopy() {
        if (copyBound) {
            return;
        }
        copyBound = true;
        document.addEventListener("click", function (e) {
            var btn = e.target && e.target.closest ? e.target.closest(".lry-code-copy") : null;
            if (!btn) {
                return;
            }
            var box = btn.closest(".lry-code");
            var code = box ? box.querySelector("pre code") : null;
            var text = decodeURIComponent(btn.getAttribute("data-code") || "") ||
                (code ? code.textContent : "");
            if (!text) {
                return;
            }
            var done = function () {
                btn.textContent = opts.copiedText;
                btn.classList.add("copied");
                setTimeout(function () {
                    btn.textContent = opts.copyText;
                    btn.classList.remove("copied");
                }, 1600);
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, done);
            } else {
                var ta = document.createElement("textarea");
                ta.value = text;
                ta.style.cssText = "position:fixed;opacity:0";
                document.body.appendChild(ta);
                ta.select();
                try {
                    document.execCommand("copy");
                } catch (err) {
                }
                document.body.removeChild(ta);
                done();
            }
        });
    }

    /* ---------- 主入口 ---------- */
    function getRoot(el) {
        if (!el) {
            return document.body || document.documentElement;
        }
        if (typeof el === "string") {
            return document.querySelector(el) || document.body;
        }
        return el;
    }

    function render(el) {
        if (!BASE) {
            BASE = detectBase();
        }
        var root = getRoot(el);
        root.classList.add("lry-rendered");
        renderToc(root);
        renderFootnotes(root);
        bindCopy();
        renderCodeBlocks(root, function () {
            renderMath(root, function () {
            });
        });
    }

    function auto(selector) {
        if (!BASE) {
            BASE = detectBase();
        }
        function init() {
            var found = false;
            if (selector) {
                var els = document.querySelectorAll(selector);
                for (var i = 0; i < els.length; i++) {
                    render(els[i]);
                    found = true;
                }
            }
            if (!found) {
                render();
            }
            return found;
        }
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", init);
            return true;
        }
        return init();
    }

    global.LryContentRender = {
        render: render,
        auto: auto,
        version: "2026-11-09"
    };
})(window);
