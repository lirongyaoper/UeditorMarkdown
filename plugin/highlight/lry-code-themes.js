/*!
 * lry-code-themes.js — 代码块主题调色板（2026-11-09 UEditor Markdown 三轮升级）
 * 编辑器（CSS Custom Highlight API）与前台（hljs class 着色）共用同一份调色板数据。
 * 依赖 highlight.js 11.x（highlight.min.js，本目录）；无其他依赖。
 *
 * 用法：
 *   LryCodeThemes.list()                       → [{id, name, dark}]
 *   LryCodeThemes.has(id) / .normalize(id)     → 主题 id 校验（未知回退 github）
 *   LryCodeThemes.palette(id)                  → {bg,border,fg,token:{...}}
 *   LryCodeThemes.css(id)                      → 前台 <style> 文本（.hljs-* 着色 + 容器底色变量）
 *   LryCodeThemes.cssAll()                     → 全部主题合并的 <style> 文本（一次注入）
 *   LryCodeThemes.highlightCss(doc)            → ::highlight() 规则文本（注入编辑器 iframe）
 *   LryCodeThemes.tokenColors(id)              → {tokenClass: color}（编辑器 Highlight 注册用）
 */
(function (global) {
    "use strict";

    /* 每套主题 14 个语义色槽（覆盖 highlight.js 常见 class，未列出的 class 落到 fg）。
       色值参考各官方主题，手工对齐到本站观感。 */
    var T = {
        comment: 1, keyword: 1, string: 1, number: 1, title: 1, attr: 1,
        symbol: 1, meta: 1, literal: 1, built_in: 1, type: 1,
        addition: 1, deletion: 1, link: 1
    };

    var themes = {
        "github": {
            name: "GitHub 浅色", dark: false, bg: "#f6f8fa", border: "#d0d7de", fg: "#1f2328",
            token: {
                comment: "#6e7781", keyword: "#cf222e", string: "#0a3069", number: "#0550ae",
                title: "#8250df", attr: "#0550ae", symbol: "#1f2328", meta: "#6e7781",
                literal: "#0550ae", built_in: "#0550ae", type: "#953800",
                addition: "#1a7f37", deletion: "#cf222e", link: "#0969da"
            }
        },
        "github-dark": {
            name: "GitHub 深色", dark: true, bg: "#161b22", border: "#30363d", fg: "#e6edf3",
            token: {
                comment: "#8b949e", keyword: "#ff7b72", string: "#a5d6ff", number: "#79c0ff",
                title: "#d2a8ff", attr: "#79c0ff", symbol: "#e6edf3", meta: "#8b949e",
                literal: "#79c0ff", built_in: "#79c0ff", type: "#ffa657",
                addition: "#aff5b4", deletion: "#ffdcd7", link: "#a5d6ff"
            }
        },
        "one-light": {
            name: "One Light", dark: false, bg: "#fafafa", border: "#e0e0e0", fg: "#383a42",
            token: {
                comment: "#a0a1a7", keyword: "#a626a4", string: "#50a14f", number: "#b76b01",
                title: "#4078f2", attr: "#e45649", symbol: "#383a42", meta: "#383a42",
                literal: "#0184bb", built_in: "#0184bb", type: "#c18401",
                addition: "#50a14f", deletion: "#e45649", link: "#4078f2"
            }
        },
        "one-dark": {
            name: "One Dark", dark: true, bg: "#282c34", border: "#3e4451", fg: "#abb2bf",
            token: {
                comment: "#5c6370", keyword: "#c678dd", string: "#98c379", number: "#d19a66",
                title: "#61afef", attr: "#d19a66", symbol: "#abb2bf", meta: "#abb2bf",
                literal: "#56b6c2", built_in: "#56b6c2", type: "#e5c07b",
                addition: "#98c379", deletion: "#e06c75", link: "#61afef"
            }
        },
        "monokai": {
            name: "Monokai", dark: true, bg: "#272822", border: "#3e3d32", fg: "#f8f8f2",
            token: {
                comment: "#88846f", keyword: "#f92672", string: "#e6db74", number: "#ae81ff",
                title: "#a6e22e", attr: "#a6e22e", symbol: "#f8f8f2", meta: "#75715e",
                literal: "#ae81ff", built_in: "#66d9ef", type: "#66d9ef",
                addition: "#a6e22e", deletion: "#f92672", link: "#a6e22e"
            }
        },
        "dracula": {
            name: "Dracula", dark: true, bg: "#282a36", border: "#44475a", fg: "#f8f8f2",
            token: {
                comment: "#6272a4", keyword: "#ff79c6", string: "#f1fa8c", number: "#bd93f9",
                title: "#50fa7b", attr: "#ff79c6", symbol: "#f8f8f2", meta: "#8be9fd",
                literal: "#bd93f9", built_in: "#8be9fd", type: "#8be9ff",
                addition: "#50fa7b", deletion: "#ff5555", link: "#8be9fd"
            }
        },
        "nord": {
            name: "Nord", dark: true, bg: "#2e3440", border: "#3b4252", fg: "#d8dee9",
            token: {
                comment: "#616e88", keyword: "#81a1c1", string: "#a3be8c", number: "#b48ead",
                title: "#88c0d0", attr: "#8fbcbb", symbol: "#d8dee9", meta: "#81a1c1",
                literal: "#81a1c1", built_in: "#8fbcbb", type: "#8fbcbb",
                addition: "#a3be8c", deletion: "#bf616a", link: "#88c0d0"
            }
        },
        "tokyo-night": {
            name: "Tokyo Night", dark: true, bg: "#1a1b26", border: "#292e42", fg: "#a9b1d6",
            token: {
                comment: "#565f89", keyword: "#bb9af7", string: "#9ece6a", number: "#ff9e64",
                title: "#7aa2f7", attr: "#7dcfff", symbol: "#c0caf5", meta: "#9aa5ce",
                literal: "#ff9e64", built_in: "#2ac3de", type: "#2ac3de",
                addition: "#9ece6a", deletion: "#f7768e", link: "#7aa2f7"
            }
        },
        "vscode-dark-plus": {
            name: "VS Code Dark+", dark: true, bg: "#1e1e1e", border: "#333333", fg: "#d4d4d4",
            token: {
                comment: "#6a9955", keyword: "#569cd6", string: "#ce9178", number: "#b5cea8",
                title: "#dcdcaa", attr: "#9cdcfe", symbol: "#d4d4d4", meta: "#c586c0",
                literal: "#569cd6", built_in: "#4ec9b0", type: "#4ec9b0",
                addition: "#81b88b", deletion: "#ca7a70", link: "#4ec9b0"
            }
        },
        "solarized-light": {
            name: "Solarized 浅色", dark: false, bg: "#fdf6e3", border: "#eee8d5", fg: "#657b83",
            token: {
                comment: "#93a1a1", keyword: "#859900", string: "#2aa198", number: "#d33682",
                title: "#268bd2", attr: "#b58900", symbol: "#657b83", meta: "#586e75",
                literal: "#268bd2", built_in: "#6c71c4", type: "#b58900",
                addition: "#859900", deletion: "#dc322f", link: "#268bd2"
            }
        }
    };

    var DEFAULT = "github";

    function normalize(id) {
        id = String(id || "").toLowerCase();
        return themes[id] ? id : DEFAULT;
    }

    function palette(id) {
        return themes[normalize(id)];
    }

    function list() {
        var out = [];
        for (var k in themes) {
            if (Object.prototype.hasOwnProperty.call(themes, k)) {
                out.push({ id: k, name: themes[k].name, dark: !!themes[k].dark });
            }
        }
        return out;
    }

    /* 前台 CSS：.lry-code-hl.theme-x 容器（供 lry-content-render 包裹使用）。
       同时兼容直接给 pre 加 .hljs.lry-code-hl.theme-x 的用法。
       盒级规则让头部行与代码体同色（盒上有 data-lry-theme 属性）。 */
    function css(id) {
        id = normalize(id);
        var p = themes[id];
        var lines = [];
        lines.push('.lry-code-hl.theme-' + id + '{background:' + p.bg + ';color:' + p.fg + ';}');
        lines.push('.lry-code[data-lry-theme="' + id + '"]{background:' + p.bg + ';color:' + p.fg + ';}');
        for (var cls in p.token) {
            if (!Object.prototype.hasOwnProperty.call(p.token, cls)) {
                continue;
            }
            lines.push('.lry-code-hl.theme-' + id + ' .hljs-' + cls + '{color:' + p.token[cls] + ';}');
        }
        return lines.join("\n");
    }

    function cssAll() {
        var out = [];
        for (var k in themes) {
            if (Object.prototype.hasOwnProperty.call(themes, k)) {
                out.push(css(k));
            }
        }
        return out.join("\n");
    }

    /* 编辑器 ::highlight() 规则：每个（主题 × 色槽）一个命名高亮组。
       Range 注册名 = lryc-<theme>-<slot>，与 code-highlight 插件约定一致。 */
    function highlightCss() {
        var out = [];
        for (var k in themes) {
            if (!Object.prototype.hasOwnProperty.call(themes, k)) {
                continue;
            }
            var p = themes[k];
            for (var cls in p.token) {
                if (!Object.prototype.hasOwnProperty.call(p.token, cls)) {
                    continue;
                }
                out.push('::highlight(lryc-' + k + '-' + cls + '){color:' + p.token[cls] + ';}');
            }
        }
        return out.join("\n");
    }

    function tokenColors(id) {
        return palette(id).token;
    }

    var API = {
        list: list,
        has: function (id) { return !!themes[String(id || "").toLowerCase()]; },
        normalize: normalize,
        palette: palette,
        css: css,
        cssAll: cssAll,
        highlightCss: highlightCss,
        tokenColors: tokenColors,
        slots: T,
        default: DEFAULT
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = API;
    }
    global.LryCodeThemes = API;
})(typeof window !== "undefined" ? window : this);
