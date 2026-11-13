/* 在 form-md-freeze.html 页面上下文执行（browser-run.js 的脚本体，async 函数体）。
   断言：form 内编辑器进入 Markdown 模式快速返回；源码 填写→读取→清空→读取→再填 的完整
   交错序列（历史 bug 的互递归触发链：flushLatest ⇄ setValue ⇄ 包装版 getContent）全程存活，
   预览与表单 textarea 始终同步；退出再进入正常。
   修复缺失时页面主线程被冻结，本脚本的 evaluate 将超时（browser-run 报 FREEZE）。 */
const ue = UE.getEditor('content');
const formTa = document.querySelector('textarea[name="content"]');
const out = {};

const t0 = Date.now();
ue.execCommand('markdown');
out.enterMs = Date.now() - t0;
out.mdActive = !!ue.__mdModeActive;
if (!out.mdActive) {
    out.ok = false;
    out.reason = 'enter failed';
    return out;
}
await new Promise((r) => setTimeout(r, 700));

const ta = document.querySelector('.edui-md-ta');
/* 填写 */
ta.value = '# 回归标题\n\n**加粗**与列表：\n\n- 甲\n- 乙\n';
ta.dispatchEvent(new Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));
out.read1 = ue.getContent().length;
await new Promise((r) => setTimeout(r, 700));

/* 清空（触发空内容渲染 + 脏标记重排，历史 bug 的主触发场景） */
ta.value = '';
ta.dispatchEvent(new Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));
out.read2 = ue.getContent().length;
await new Promise((r) => setTimeout(r, 700));

/* 再填 */
ta.value = '# 回归标题\n\n**加粗**与列表：\n\n- 甲\n- 乙\n';
ta.dispatchEvent(new Event('input', { bubbles: true }));
await new Promise((r) => setTimeout(r, 700));

out.formTaHasHtml = !!formTa && /<h1[^>]*>回归标题/.test(formTa.value);
out.getContentHasHtml = /<h1[^>]*>回归标题/.test(ue.getContent());
out.previewRendered = /回归标题/.test(ue.body.textContent || '');
ue.sync();
out.formTaAfterSync = !!formTa && /<h1[^>]*>回归标题/.test(formTa.value);

/* 退出再进入 */
ue.execCommand('markdown');
await new Promise((r) => setTimeout(r, 300));
ue.execCommand('markdown');
await new Promise((r) => setTimeout(r, 300));
out.reenterActive = !!ue.__mdModeActive;

out.ok = out.enterMs < 3000 && out.read1 > 0 && out.formTaHasHtml && out.getContentHasHtml &&
    out.previewRendered && out.formTaAfterSync && out.reenterActive;
return out;
