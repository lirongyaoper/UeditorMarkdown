/**
 * WebUploader 移动端"文件选择器闪退"修复（2026-10-27）
 *
 * 根因：WebUploader FilePicker 在按钮上覆盖透明点击层（runtime 容器内的 <label>），
 *       并在 label 的 click 处理器里程序化执行 input.trigger('click')。
 *       触摸设备上浏览器对 label 点击的原生转发已激活一次 file input（系统选择器弹出），
 *       紧接着的程序化二次激活会被 Android WebView / iOS Safari 视为"取消当前选择器"，
 *       表现为文件选择框弹出后瞬间闪退（PC 桌面浏览器对双重激活去重，不受影响）。
 *
 * 修复：触摸设备在捕获阶段拦截点击层上的 touchend——preventDefault 阻止浏览器合成
 *       click（webuploader 绑在 label click 里的二次 trigger 不再执行），改由本补丁在
 *       touchend 用户手势上下文内手动触发一次 input.click()。
 *       注：DOM 结构为 [rt_rt_* 容器 > label + input]，input 与 label 是兄弟节点，
 *       不能用 label.querySelector 取 input。
 *
 * 引入位置：attachment/upload_box.html（附件上传框）、
 *           ueditor dialogs/image（多图上传）、dialogs/attachment（附件插入）。
 * 纯原生 JS，无 jQuery/执行顺序依赖；非触摸设备不做任何事。
 */
(function () {
	'use strict';
	if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return;

	var lastActivate = 0;
	document.addEventListener('touchend', function (e) {
		var label = e.target && e.target.closest ? e.target.closest('.webuploader-container label') : null;
		if (!label) return;
		// 阻止合成 click → 切断 webuploader label click 处理器里的二次 input.trigger('click')
		e.preventDefault();
		var now = Date.now();
		if (now - lastActivate < 400) return; // 一次触摸只激活一次
		lastActivate = now;
		// input 与 label 同为 runtime 容器子节点（兄弟关系），兄弟查找失败时退回整个 picker 容器
		var input = label.parentNode.querySelector('input[type=file]');
		if (!input) {
			var container = label.closest('.webuploader-container');
			input = container ? container.querySelector('input[type=file]') : null;
		}
		if (input) input.click();
	}, { capture: true, passive: false });
})();
