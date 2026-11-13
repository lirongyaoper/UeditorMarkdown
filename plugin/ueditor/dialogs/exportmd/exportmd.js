/**
 * 导出 Markdown：将编辑器内容转换为 Markdown 文本，支持复制与下载。
 * 转换器优先复用父页面 UE.htmlToMarkdown（ueditor.all.js 公共核心）；
 * 父页面为旧版本时退回本地实现，保证对话框自身可用。
 * 依赖 internal.js 提供的 editor（父页面编辑器实例）。
 */
(function () {

    /* ---------- 父页面公共核心 ---------- */

    function parentUE() {
        return window.parent && window.parent.UE;
    }

    function convertToMarkdown(html, opts) {
        var UE2 = parentUE();
        if (UE2 && UE2.htmlToMarkdown) {
            return UE2.htmlToMarkdown(html, opts);
        }
        return localConvert(html, opts);
    }

    /* ---------- 本地兜底转换器（父页面旧版本时使用） ---------- */

    var localConvert = (function () {
    var INLINE_BLOCK = {
        p: 1, div: 1, blockquote: 1, pre: 1, table: 1, hr: 1,
        h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, ul: 1, ol: 1, dl: 1, figure: 1
    };

    function escText(text, ctx) {
        text = String(text).replace(/([*_~[\]`\\])/g, "\\$1");
        if (!ctx || !ctx.preserveNbsp) {
            text = text.replace(/\u00a0/g, " ");
        }
        return text;
    }

    // 单元格文本：| 转义、换行转 <br>（输入已是行内转换结果）
    function escCell(text) {
        return text.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
    }

    // 行内代码：内容含反引号时加长围栏并留空格衬垫（GFM 规则）
    function codeSpan(text) {
        text = String(text).replace(/\u00a0/g, " ");
        if (/`/.test(text)) {
            var fence = "``";
            while (text.indexOf(fence) !== -1 && fence.length < 10) {
                fence += "`";
            }
            if (/^`/.test(text)) { text = " " + text; }
            if (/`$/.test(text)) { text = text + " "; }
            return fence + text + fence;
        }
        return "`" + text + "`";
    }

    // 含空白/圆括号的 URL 用 <…> 包裹
    function safeUrl(url) {
        url = String(url == null ? "" : url).replace(/^\s+|\s+$/g, "");
        return /[\s()]/.test(url) ? "<" + url.replace(/</g, "%3C").replace(/>/g, "%3E") + ">" : url;
    }

    // 代码围栏长度须长于内容里已出现的反引号串
    function fenceFor(text) {
        var n = 3;
        var m = text.match(/^`{3,}/m) || text.match(/`{3,}/);
        if (m) {
            n = Math.max(n, m[0].length + 1);
        }
        return new Array(n + 1).join("`");
    }

    // pre[brush] 还原语言标识
    function brushToLang(cls) {
        var m = String(cls || "").match(/brush:\s*([^;\s]+)/i);
        if (!m) {
            return "";
        }
        var brush = m[1].toLowerCase();
        var map = {
            js: "js", javascript: "js", css: "css", java: "java", php: "php",
            python: "python", bash: "bash", sql: "sql", cpp: "cpp", xml: "xml",
            html: "html", plain: "", text: ""
        };
        return map[brush] !== undefined ? map[brush] : brush;
    }

    function stripTaskText(text) {
        var m = text.match(/^\s*([\u2610\u2611☐☑])\s?/);
        if (m) {
            return {
                checked: m[1] === "\u2611" || m[1] === "☑",
                rest: text.substring(m[0].length)
            };
        }
        return null;
    }

    // 行内强调：内容首尾空白移到标记外侧（CommonMark 侧贴规则下 "** x **" 不构成强调）
    function wrapInline(inner, delim) {
        var lead = (inner.match(/^[ \t\n]+/) || [""])[0];
        var tail = (inner.match(/[ \t\n]+$/) || [""])[0];
        var core = inner.substring(lead.length, inner.length - tail.length);
        return core ? lead + delim + core + delim + tail : inner;
    }

    function inlineNodes(node, ctx) {
        var out = "";
        for (var child = node.firstChild; child; child = child.nextSibling) {
            out += inlineNode(child, ctx);
        }
        return out;
    }

    function inlineNode(node, ctx) {
        if (node.nodeType === 3) {
            return escText(node.nodeValue, ctx);
        }
        if (node.nodeType !== 1) {
            return "";
        }
        var tag = node.tagName.toLowerCase();
        var inner = function () {
            return inlineNodes(node, ctx);
        };
        var href, text, src, alt, size, w, h, style, deco, msrc;
        switch (tag) {
            case "br":
                // 硬换行用哨兵占位（段内行尾空白清理后再还原为 "  \n"，避免被剥掉）
                return ctx && ctx.keepLineBreaks === false ? " " : "\u0001";
            case "strong":
            case "b":
                return wrapInline(inner(), "**");
            case "em":
            case "i":
                return wrapInline(inner(), "*");
            case "u":
                return inner();
            case "del":
            case "s":
            case "strike":
                return wrapInline(inner(), "~~");
            case "code":
                return codeSpan(node.textContent);
            case "sup":
                return "^(" + inner() + ")";
            case "sub":
                return "~(" + inner() + ")";
            case "kbd":
                return "<kbd>" + inner() + "</kbd>";
            case "mark":
                return "<mark>" + inner() + "</mark>";
            case "q":
                return '"' + inner() + '"';
            case "a":
                href = node.getAttribute("href") || "";
                text = inner().replace(/\s+/g, " ").replace(/^ | $/g, "");
                if (!text) {
                    return href ? "<" + safeUrl(href) + ">" : "";
                }
                if (href && href !== "#" && !/^\s*javascript:/i.test(href)) {
                    return "[" + text + "](" + safeUrl(href) + ")";
                }
                return text;
            case "img":
                src = node.getAttribute("src") || node.getAttribute("_src") || "";
                alt = node.getAttribute("alt") || "";
                size = "";
                w = node.getAttribute("width");
                h = node.getAttribute("height");
                style = node.getAttribute("style") || "";
                if ((!w || !h) && style) {
                    var sw = style.match(/width\s*:\s*(\d+)/i);
                    var sh = style.match(/height\s*:\s*(\d+)/i);
                    w = w || (sw && sw[1]);
                    h = h || (sh && sh[1]);
                }
                if (w && h && parseInt(w, 10) > 0 && parseInt(h, 10) > 0) {
                    size = " =" + parseInt(w, 10) + "x" + parseInt(h, 10);
                }
                return "![" + alt + "](" + safeUrl(src) + size + ")";
            case "span":
                // UEditor 内部用 span+line-through 表示删除线，导出还原为 ~~text~~
                deco = (node.getAttribute("style") || "").replace(/\s/g, "");
                if (/text-decoration:line-through/i.test(deco)) {
                    return wrapInline(inner(), "~~");
                }
                return inner();
            case "font":
            case "label":
            case "cite":
            case "small":
            case "big":
            case "tt":
            case "abbr":
                return inner();
            case "embed":
            case "video":
            case "audio":
            case "iframe":
                msrc = node.getAttribute("src") || node.getAttribute("_url") || "";
                var mname = {embed: "视频", video: "视频", audio: "音频", iframe: "嵌入页"}[tag];
                return msrc ? "[" + mname + "](" + safeUrl(msrc) + ")" : "";
            default:
                // 未知行内元素按文本展开，避免内容丢失
                return node.textContent || "";
        }
    }

    function tableToMd(table) {
        var rows = [];
        var trs = table.rows;
        for (var i = 0; i < trs.length; i++) {
            var cells = [];
            for (var j = 0; j < trs[i].cells.length; j++) {
                var cellMd = inlineNodes(trs[i].cells[j], {keepLineBreaks: false})
                    .replace(/\s+/g, " ").replace(/^ | $/g, "");
                cells.push(escCell(cellMd));
            }
            rows.push(cells);
        }
        if (!rows.length) {
            return "";
        }
        var colCount = 0;
        for (var r = 0; r < rows.length; r++) {
            colCount = Math.max(colCount, rows[r].length);
        }
        if (!colCount) {
            return "";
        }
        var firstRowIsTh = trs[0].cells.length > 0 &&
            trs[0].cells[0].tagName.toLowerCase() === "th";
        // 无 th 时首行若为纯短文本（≤12字），提为表头提高可读性；否则补空表头
        var useFirstRowAsHeader = false;
        if (!firstRowIsTh && trs.length >= 2) {
            var tds = trs[0].cells;
            var allShort = tds.length > 0;
            for (var c = 0; c < tds.length; c++) {
                var t = (tds[c].textContent || "").replace(/\s+/g, " ").replace(/^ | $/g, "");
                if (!t || t.length > 12) {
                    allShort = false;
                    break;
                }
            }
            useFirstRowAsHeader = allShort;
        }
        var header = firstRowIsTh || useFirstRowAsHeader ? rows[0] : [];
        while (header.length < colCount) {
            header.push("");
        }
        var lines = [];
        lines.push("| " + header.join(" | ") + " |");
        // 表头对齐方式（th 或被提为表头的那行）
        var aligns = [];
        var headRow = firstRowIsTh || useFirstRowAsHeader ? trs[0] : null;
        for (var a = 0; a < colCount; a++) {
            var al = "";
            if (headRow && headRow.cells[a]) {
                var st = (headRow.cells[a].getAttribute("align") || "") +
                    (headRow.cells[a].getAttribute("style") || "");
                if (/text-align\s*:\s*center|^center$/i.test(st)) {
                    al = "center";
                } else if (/text-align\s*:\s*right|^right$/i.test(st)) {
                    al = "right";
                }
            }
            aligns.push(al);
        }
        var sep = [];
        for (var s = 0; s < colCount; s++) {
            sep.push(aligns[s] === "center" ? ":---:" : aligns[s] === "right" ? "---:" : "---");
        }
        lines.push("| " + sep.join(" | ") + " |");
        var bodyStart = firstRowIsTh || useFirstRowAsHeader ? 1 : 0;
        for (var b = bodyStart; b < rows.length; b++) {
            var row = rows[b].slice();
            while (row.length < colCount) {
                row.push("");
            }
            row.length = colCount;
            lines.push("| " + row.join(" | ") + " |");
        }
        return lines.join("\n") + "\n\n";
    }

    function hasBlockChild(node) {
        for (var c = node.firstChild; c; c = c.nextSibling) {
            if (c.nodeType === 1 && INLINE_BLOCK[c.tagName.toLowerCase()]) {
                return true;
            }
        }
        return false;
    }

    function listToMd(listEl, indent, ctx) {
        var ordered = listEl.tagName.toLowerCase() === "ol";
        var childIndent = indent + (ordered ? "   " : "  ");
        var out = "";
        var index = parseInt(listEl.getAttribute("start") || "1", 10) || 1;
        for (var li = listEl.firstChild; li; li = li.nextSibling) {
            if (li.nodeType !== 1 || li.tagName.toLowerCase() !== "li") {
                continue;
            }
            var marker = ordered ? (index + ". ") : "- ";
            index++;
            // 任务列表勾选态（input 形态或历史导入的 ☑/☐ 前缀）
            var task = null;
            var checkbox = li.getElementsByTagName("input")[0];
            if (checkbox && /checkbox/i.test(checkbox.getAttribute("type") || "")) {
                task = checkbox.getAttribute("checked") !== null;
                checkbox.parentNode && checkbox.parentNode.removeChild(checkbox);
            }
            var liInline = "";
            var liBlocks = "";
            for (var c = li.firstChild; c; c = c.nextSibling) {
                if (c.nodeType === 3) {
                    liInline += escText(c.nodeValue, ctx);
                } else if (c.nodeType === 1) {
                    var ct = c.tagName.toLowerCase();
                    if (ct === "ul" || ct === "ol") {
                        liBlocks += "\n" + listToMd(c, childIndent, ctx);
                    } else if (ct === "p" || ct === "div") {
                        // UEditor 的 li 内容通常包一层 <p>，展开为行内文本保持 "- 文字" 单行形态；
                        // 内部含块级元素（表格/代码块等）时按缩进块展开
                        if (hasBlockChild(c)) {
                            liBlocks += "\n" + blocksToMd(c, childIndent, ctx);
                        } else {
                            liInline += inlineNodes(c, ctx);
                        }
                    } else if (INLINE_BLOCK[ct]) {
                        liBlocks += "\n" + indentBlock(blockToMd(c, ctx), childIndent);
                    } else {
                        liInline += inlineNode(c, ctx);
                    }
                }
            }
            var content = liInline.replace(/^[\s]+/, "").replace(/[\s]+$/, "");
            var tk = stripTaskText(content);
            if (task !== null) {
                content = tk ? tk.rest : content;
            } else if (tk) {
                task = tk.checked;
                content = tk.rest;
            }
            if (content) {
                // 行首 Markdown 语法字符转义，避免反向误判
                content = content
                    .replace(/^(\s{0,3})(#{1,6})(\s)/, "$1\\$2$3")
                    .replace(/^(\s{0,3})([-*+])(\s)/, "$1\\$2$3")
                    .replace(/^(\s{0,3})(\d{1,3})([.)])(\s)/, "$1$2\\$3$4")
                    .replace(/^(\s{0,3})(>)(\s?)/, "$1\\$2$3");
            }
            var prefix = marker + (task !== null ? (task ? "[x] " : "[ ] ") : "");
            out += indent + prefix + content;
            if (liBlocks) {
                out += "\n" + liBlocks.replace(/^\n/, "");
            }
            out += "\n";
        }
        return out;
    }

    // 非空行前加缩进（用于列表项内的块级内容）
    function indentBlock(block, indent) {
        if (!indent || !block) {
            return block;
        }
        return block.replace(/^(.+)$/gm, indent + "$1");
    }

    function paraToMd(node, ctx) {
        var pt = inlineNodes(node, ctx).replace(/[ \t]+$/gm, "");
        // 还原硬换行哨兵（此时行尾真实空白已清理，不会误伤）
        pt = pt.replace(/\u0001/g, "  \n");
        if (!pt.replace(/\s/g, "")) {
            return "";
        }
        if (!ctx.preserveNbsp) {
            pt = pt.replace(/^[ \t]+/mg, "");
        } else {
            pt = pt.replace(/^[ \u00a0]+/mg, function (lead) {
                return new Array(lead.length + 1).join("\u00a0");
            });
        }
        // 行首 Markdown 语法字符转义
        pt = pt
            .replace(/^[ \t]*(#{1,6})([ \t])/mg, "\\$1$2")
            .replace(/^[ \t]*(>)([ \t]?)/mg, "\\$1$2")
            .replace(/^[ \t]*([-*+])([ \t])/mg, "\\$1$2")
            .replace(/^[ \t]*(\d{1,3})([.)])([ \t])/mg, "$1\\$2$3")
            .replace(/^[ \t]*(`{3,})/mg, function (x) {
                return x.replace(/`/g, "\\`");
            });
        return pt + "\n\n";
    }

    function blockToMd(node, ctx) {
        var tag = node.tagName.toLowerCase();
        switch (tag) {
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
                var level = parseInt(tag.charAt(1), 10);
                var ht = inlineNodes(node, ctx).replace(/^[\s]+|[\s]+$/g, "");
                return ht ? new Array(level + 1).join("#") + " " + ht + "\n\n" : "";
            case "p":
                return paraToMd(node, ctx);
            case "div":
                if (hasBlockChild(node)) {
                    return blocksToMd(node, "", ctx);
                }
                return paraToMd(node, ctx);
            case "blockquote":
                var bq = blocksToMd(node, "", ctx).replace(/\s+$/, "");
                if (!bq) {
                    return "";
                }
                return bq.split("\n").map(function (l) {
                    return l ? "> " + l : ">";
                }).join("\n") + "\n\n";
            case "pre":
                var lang = brushToLang(node.getAttribute("class"));
                // pre 内 &nbsp; 是缩进/空格占位（insertcode 序列化约定），还原为普通空格
                var codeText = node.textContent.replace(/\u00a0/g, " ").replace(/\n+$/, "");
                var fence = fenceFor(codeText);
                return fence + lang + "\n" + codeText + "\n" + fence + "\n\n";
            case "table":
                return tableToMd(node);
            case "ul":
            case "ol":
                return listToMd(node, "", ctx);
            case "dl":
                var dlOut = "";
                for (var d = node.firstChild; d; d = d.nextSibling) {
                    if (d.nodeType !== 1) {
                        continue;
                    }
                    var dt = d.tagName.toLowerCase();
                    if (dt === "dt") {
                        dlOut += inlineNodes(d, ctx).replace(/^[\s]+|[\s]+$/g, "") + "\n\n";
                    } else if (dt === "dd") {
                        dlOut += indentBlock(blockToMd(d, ctx), "  ");
                    }
                }
                return dlOut;
            case "dt":
            case "dd":
                return inlineNodes(node, ctx).replace(/^[\s]+|[\s]+$/g, "") + "\n\n";
            case "hr":
                return "---\n\n";
            case "figure":
                return blocksToMd(node, "", ctx);
            case "figcaption":
                var fc = inlineNodes(node, ctx).replace(/^[\s]+|[\s]+$/g, "");
                return fc ? "*" + fc + "*\n\n" : "";
            default:
                var t = inlineNodes(node, ctx).replace(/^[\s]+|[\s]+$/g, "");
                return t ? t + "\n\n" : "";
        }
    }

    function blocksToMd(container, indent, ctx) {
        var out = "";
        for (var child = container.firstChild; child; child = child.nextSibling) {
            if (child.nodeType === 3) {
                var txt = child.nodeValue.replace(/\s+/g, " ");
                if (txt.replace(/^ | $/g, "")) {
                    out += indent + escText(txt.replace(/^ | $/g, ""), ctx) + "\n\n";
                }
            } else if (child.nodeType === 1) {
                out += indentBlock(blockToMd(child, ctx), indent);
            }
        }
        return out;
    }

    return function (html, opts) {
        opts = opts || {};
        var ctx = {
            preserveNbsp: opts.preserveLeadingNbsp === true,
            keepLineBreaks: opts.keepLineBreaks !== false
        };
        var div = document.createElement("div");
        div.innerHTML = String(html == null ? "" : html);
        var md = blocksToMd(div, "", ctx);
        // 压缩 3+ 连续空行为 2 个，收尾整洁
        md = md.replace(/\n{3,}/g, "\n\n").replace(/^[ \t\n]+/, "");
        md = md.replace(/\s+$/, "");
        return md + (md ? "\n" : "");
    };
})();

    /* ---------- 对话框逻辑 ---------- */

    var tipTimeout = null;

    function showTip(msg) {
        var tip = document.getElementById("tip");
        tip.textContent = msg;
        if (tipTimeout) {
            clearTimeout(tipTimeout);
        }
        tipTimeout = setTimeout(function () {
            tip.textContent = "";
        }, 3000);
    }

    function currentOpts() {
        var rich = true;
        var el = document.getElementById("optRich");
        if (el) {
            rich = el.checked;
        }
        return {
            preserveLeadingNbsp: document.getElementById("optNbsp").checked,
            keepLineBreaks: true,
            // 保留富文本格式：颜色/字体/对齐/视频/复杂表格等导出为内联 HTML（可无损往返）
            richFormat: rich
        };
    }

    // 从正文一级标题推断文件名（无则回退日期名）
    function buildFilename(markdown) {
        var m = markdown.match(/^#\s+(.+)$/m);
        var name = m ? m[1] : "";
        name = name.replace(/[\\/:*?"<>|\r\n\t]/g, "").replace(/\s+/g, "-").substring(0, 40);
        var now = new Date();
        var pad = function (n) {
            return n < 10 ? "0" + n : "" + n;
        };
        var stamp = "" + now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) +
            "-" + pad(now.getHours()) + pad(now.getMinutes());
        return (name || "ueditor-" + stamp) + ".md";
    }

    function regenerate() {
        var textarea = document.getElementById("mdContent");
        var markdown;
        try {
            markdown = convertToMarkdown(editor.getContent(), currentOpts());
        } catch (e) {
            markdown = "# 转换失败\n\n" + (e && e.message ? e.message : "");
        }
        textarea.value = markdown;
    }

    function initExport() {
        regenerate();

        document.getElementById("optNbsp").onchange = regenerate;
        var optRich = document.getElementById("optRich");
        if (optRich) {
            optRich.onchange = regenerate;
        }

        document.getElementById("btnCopy").onclick = function () {
            var textarea = document.getElementById("mdContent");
            textarea.select();
            var done = function () {
                showTip("已复制到剪贴板");
            };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(textarea.value).then(done, function () {
                    fallbackCopy(textarea, done);
                });
            } else {
                fallbackCopy(textarea, done);
            }
        };

        document.getElementById("btnDownload").onclick = function () {
            var textarea = document.getElementById("mdContent");
            var blob = new Blob([textarea.value], {type: "text/markdown;charset=utf-8"});
            var a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = buildFilename(textarea.value);
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                URL.revokeObjectURL(a.href);
                a.parentNode && a.parentNode.removeChild(a);
            }, 100);
            showTip("已开始下载");
        };
    }

    function fallbackCopy(textarea, done) {
        try {
            textarea.focus();
            textarea.select();
            if (document.execCommand("copy")) {
                done();
            } else {
                showTip("复制失败，请手动全选复制");
            }
        } catch (e) {
            showTip("复制失败，请手动全选复制");
        }
    }

    utils.domReady(function () {
        initExport();
    });

})();
