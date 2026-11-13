/**
 * 公式对话框（2026-11-09 三轮升级：本地 KaTeX 版）
 * - LaTeX 输入 + 实时 KaTeX 预览；行内 / 块级切换
 * - 模板面板：分式、根式、上下标、求和、积分、极限、矩阵、方程组、
 *   希腊字母、关系符、箭头、化学式（mhchem）
 * - 编辑已有公式：lry-math 节点（data-latex）或旧 latexeasy 图片（data-formula-image）
 * - 确定后 editor.execCommand('formula', { latex, display })
 */
var Formula = {
    templates: {
        "分式根式": [
            { t: "a/b", v: "\\frac{a}{b}" },
            { t: "∛", v: "\\sqrt[3]{x}" },
            { t: "√", v: "\\sqrt{x}" },
            { t: "ⁿ√", v: "\\sqrt[n]{x}" },
            { t: "二项式", v: "\\binom{n}{k}" }
        ],
        "上下标": [
            { t: "x²", v: "x^2" },
            { t: "xᵢ", v: "x_i" },
            { t: "上下", v: "x_i^2" },
            { t: "撇", v: "x'" },
            { t: "向量", v: "\\vec{a}" },
            { t: "帽子", v: "\\hat{a}" },
            { t: "上划线", v: "\\overline{a}" },
            { t: "下括号", v: "\\underbrace{a}_{b}" }
        ],
        "求积积分": [
            { t: "Σ", v: "\\sum_{i=1}^{n} a_i" },
            { t: "∏", v: "\\prod_{i=1}^{n} a_i" },
            { t: "∫", v: "\\int_{a}^{b} f(x)\\,dx" },
            { t: "∬", v: "\\iint_{D} f\\,dA" },
            { t: "∮", v: "\\oint_{C} f\\,ds" },
            { t: "lim", v: "\\lim_{x \\to 0} f(x)" }
        ],
        "矩阵": [
            { t: "矩阵", v: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}" },
            { t: "中括号", v: "\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}" },
            { t: "行列式", v: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}" }
        ],
        "方程组": [
            { t: "cases", v: "f(x)=\\begin{cases} x, & x \\ge 0 \\\\ -x, & x < 0 \\end{cases}" },
            { t: "对齐", v: "\\begin{aligned} a &= b + c \\\\ &= d + e \\end{aligned}" }
        ],
        "希腊字母": [
            { t: "α", v: "\\alpha" }, { t: "β", v: "\\beta" }, { t: "γ", v: "\\gamma" },
            { t: "δ", v: "\\delta" }, { t: "ε", v: "\\varepsilon" }, { t: "θ", v: "\\theta" },
            { t: "λ", v: "\\lambda" }, { t: "μ", v: "\\mu" }, { t: "π", v: "\\pi" },
            { t: "σ", v: "\\sigma" }, { t: "φ", v: "\\varphi" }, { t: "ω", v: "\\omega" },
            { t: "Γ", v: "\\Gamma" }, { t: "Δ", v: "\\Delta" }, { t: "Ω", v: "\\Omega" },
            { t: "Π", v: "\\Pi" }
        ],
        "关系符号": [
            { t: "≠", v: "\\neq" }, { t: "≤", v: "\\leq" }, { t: "≥", v: "\\geq" },
            { t: "≈", v: "\\approx" }, { t: "≡", v: "\\equiv" }, { t: "∈", v: "\\in" },
            { t: "⊂", v: "\\subset" }, { t: "∪", v: "\\cup" }, { t: "∩", v: "\\cap" },
            { t: "∅", v: "\\varnothing" }, { t: "∞", v: "\\infty" }, { t: "±", v: "\\pm" },
            { t: "×", v: "\\times" }, { t: "÷", v: "\\div" }, { t: "·", v: "\\cdot" }
        ],
        "箭头": [
            { t: "→", v: "\\to" }, { t: "←", v: "\\leftarrow" }, { t: "⇒", v: "\\Rightarrow" },
            { t: "⇔", v: "\\Leftrightarrow" }, { t: "映射", v: "f\\colon X \\to Y" }
        ],
        "化学式": [
            { t: "H₂O", v: "\\ce{H2O}" },
            { t: "CO₂", v: "\\ce{CO2}" },
            { t: "沉淀", v: "\\ce{CaCl2 + Na2CO3 -> CaCO3 v + 2NaCl}" },
            { t: "可逆", v: "\\ce{N2 + 3H2 <=> 2NH3}" },
            { t: "电荷", v: "\\ce{SO4^2-}" },
            { t: "加热", v: "\\ce{CaCO3 ->[\Delta] CaO + CO2 ^}" },
            { t: "水合", v: "\\ce{CuSO4.5H2O}" }
        ]
    },
    editing: null,   // { latex, display } 初始态

    init: function () {
        this.initValue();
        this.initTemplates();
        this.initEvent();
        this.initSubmit();
        this.renderPreview();
    },

    initValue: function () {
        var latex = "", display = false;
        var rng = editor.selection.getRange();
        var node = rng.startContainer;
        if (node) {
            node = node.nodeType === 1 ? node : node.parentNode;
        }
        var mathEl = null;
        while (node && node !== editor.body) {
            if (node.nodeType === 1 && (node.className || "").indexOf("lry-math") !== -1) {
                mathEl = node;
                break;
            }
            node = node.parentNode;
        }
        if (mathEl) {
            latex = mathEl.getAttribute("data-latex");
            if (latex == null) {
                // 文本形态（未渲染）：剥掉 \( \) / \[ \] 定界符
                var text = (mathEl.textContent || "")
                    .replace(/^\\[\[(]/, "").replace(/[)\]]\\?$/, "").trim();
                latex = text;
            }
            display = /lry-math-block/.test(mathEl.className || "") ||
                mathEl.getAttribute("data-display") === "1";
        } else {
            var img = rng.getClosedNode();
            if (img && img.tagName === "IMG" && img.getAttribute("data-formula-image") !== null) {
                // 旧 latexeasy 图片公式 → 转新格式
                try {
                    latex = decodeURIComponent(img.getAttribute("data-formula-image") || "");
                } catch (e) {
                    latex = img.getAttribute("data-formula-image") || "";
                }
            }
        }
        this.editing = { latex: latex || "", display: !!display };
        document.getElementById("latexInput").value = this.editing.latex;
        var radios = document.getElementsByName("fxmode");
        radios[0].checked = !this.editing.display;
        radios[1].checked = this.editing.display;
    },

    initTemplates: function () {
        var tabs = document.getElementById("tplTabs");
        var items = document.getElementById("tplItems");
        var groups = Object.keys(this.templates);
        var self = this;
        function show(name) {
            items.innerHTML = "";
            var list = self.templates[name] || [];
            list.forEach(function (it) {
                var s = document.createElement("span");
                s.textContent = it.t;
                s.title = it.v;
                s.onclick = function () {
                    self.insertAtCursor(it.v);
                };
                items.appendChild(s);
            });
            for (var i = 0; i < tabs.children.length; i++) {
                tabs.children[i].className = tabs.children[i].textContent === name ? "on" : "";
            }
        }
        groups.forEach(function (name) {
            var t = document.createElement("span");
            t.textContent = name;
            t.onclick = function () {
                show(name);
            };
            tabs.appendChild(t);
        });
        show(groups[0]);
    },

    insertAtCursor: function (text) {
        var ta = document.getElementById("latexInput");
        var s = ta.selectionStart, e = ta.selectionEnd;
        // 选区包裹（如 x^2 选中 x 再点上标）优先；无选区则插入
        var val = ta.value;
        ta.value = val.substring(0, s) + text + val.substring(e);
        var pos = s + text.length;
        ta.focus();
        ta.setSelectionRange(pos, pos);
        this.renderPreview();
    },

    initEvent: function () {
        var self = this;
        var timer = null;
        var ta = document.getElementById("latexInput");
        ta.oninput = function () {
            if (timer) {
                clearTimeout(timer);
            }
            timer = setTimeout(function () {
                timer = null;
                self.renderPreview();
            }, 150);
        };
        document.getElementById("inputDemo").onclick = function () {
            ta.value = "\\ce{2H2 + O2 ->[\\text{点燃}] 2H2O}";
            self.renderPreview();
        };
    },

    renderPreview: function () {
        var box = document.getElementById("previewBox");
        var latex = document.getElementById("latexInput").value.trim();
        var display = document.getElementsByName("fxmode")[1].checked;
        box.innerHTML = "";
        if (!latex) {
            box.innerHTML = '<div class="err">（输入公式后此处实时预览）</div>';
            return;
        }
        if (!window.katex) {
            box.innerHTML = '<div class="err">KaTeX 加载失败，请检查 common/static/plugin/katex/ 是否存在</div>';
            return;
        }
        try {
            box.innerHTML = katex.renderToString(latex, {
                displayMode: display,
                throwOnError: true
            });
        } catch (e) {
            box.innerHTML = '<div class="err">' + (e && e.message ? e.message : String(e)) + "</div>";
        }
    },

    initSubmit: function () {
        var self = this;
        dialog.onclose = function (t, ok) {
            if (!ok) {
                return true;
            }
            var latex = document.getElementById("latexInput").value.trim();
            if (!latex) {
                // 空输入且正在编辑已有公式：删除该公式
                if (self.editing && self.editing.latex) {
                    editor.fireEvent("saveScene");
                    var rng = editor.selection.getRange();
                    var node = rng.startContainer;
                    node = node && node.nodeType === 1 ? node : (node && node.parentNode);
                    while (node && node !== editor.body) {
                        if (node.nodeType === 1 && (node.className || "").indexOf("lry-math") !== -1) {
                            node.parentNode.removeChild(node);
                            editor.fireEvent("contentchange");
                            break;
                        }
                        node = node.parentNode;
                    }
                }
                dialog.close(false);
                return false;
            }
            var display = document.getElementsByName("fxmode")[1].checked;
            editor.execCommand("formula", { latex: latex, display: display });
            editor.fireEvent("saveScene");
            dialog.close(false);
            return false;
        };
    }
};
