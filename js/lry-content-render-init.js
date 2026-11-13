/* lry-content-render-init.js — 内容渲染器接入初始化（2026-11-09）
 * 默认覆盖 .lry_content 与 .news_con 容器；请按站点正文/预览容器选择器自行调整。
 * 依赖 lry-content-render.js（defer，先于本文件执行）。 */
(function () {
    "use strict";
    function boot() {
        if (!window.LryContentRender) {
            return;
        }
        LryContentRender.auto(".news_con, .lry_content");
    }
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }
})();
