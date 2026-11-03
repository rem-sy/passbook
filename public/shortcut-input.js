/**
 * 密码本 · 快捷键录入组件（v4.10.0）
 * 设置页的快捷键配置改为「录入模式」：点按钮 → 按组合键 → 自动识别，
 * 不再手敲文本（手敲格式易错：大小写、加号顺序、键名拼写）。
 *
 * accelFromKeyboardEvent(ev) 为纯函数（Node 可测）：KeyboardEvent → {ok, accel, error}
 * bindShortcutRecorder(btn, input) 绑定录入交互（设置弹窗内使用）。
 *
 * 浏览器 (window.PassShortcut) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassShortcut = factory();
})(globalThis, function () {
  'use strict';

  /** 主键白名单：字母 / 数字 / F1-F12（Tauri 加速器稳妥可解析、且不易与系统全局冲突的集合） */
  function mainKeyName(ev) {
    const k = ev.key || '';
    if (/^[a-zA-Z]$/.test(k)) return k.toUpperCase();
    if (/^[0-9]$/.test(k)) return k;
    const f = /^F([1-9]|1[0-2])$/i.exec(k);
    if (f) return 'F' + Number(f[1]);
    return null; // 其余键（方向键/标点/Tab…）不支持
  }

  /**
   * 从 KeyboardEvent 生成 Tauri 加速器字符串。
   * 规则：必须含 Ctrl / Alt / Super(Meta) 至少一个修饰键（裸字母会拦截正常打字，拒绝）；
   * Shift 只能搭配其他修饰键使用。输出形如 "Ctrl+Alt+N"、"Alt+P"。
   */
  function accelFromKeyboardEvent(ev) {
    if (!ev || typeof ev !== 'object') return { ok: false, error: '无效按键事件' };
    const main = mainKeyName(ev);
    if (!main) return { ok: false, error: '主键仅支持字母、数字、F1-F12' };
    const mods = [];
    if (ev.ctrlKey) mods.push('Ctrl');
    if (ev.altKey) mods.push('Alt');
    if (ev.shiftKey) mods.push('Shift');
    if (ev.metaKey) mods.push('Super');
    if (!mods.length) return { ok: false, error: '需搭配 Ctrl / Alt / Win 修饰键（裸按键会拦截正常输入）' };
    if (mods.length === 1 && mods[0] === 'Shift') return { ok: false, error: 'Shift 需搭配 Ctrl / Alt / Win 使用' };
    return { ok: true, accel: mods.join('+') + '+' + main };
  }

  /**
   * 录入交互：点击按钮进入录入态（按钮文字变「按下组合键…」），
   * 按下合法组合 → 写入 input 并触发 change；Esc 取消；非法组合 → 短暂提示原因。
   * @param {HTMLButtonElement} btn 录入按钮（显示当前快捷键）
   * @param {HTMLInputElement} input 保存值的隐藏输入（设置保存读取它）
   */
  function bindShortcutRecorder(btn, input) {
    if (!btn || !input) return;
    btn.addEventListener('click', () => {
      if (btn.dataset.recording === '1') return; // 已在录入态
      const prevText = btn.textContent;
      btn.dataset.recording = '1';
      btn.textContent = '按下组合键（Esc 取消）…';
      btn.classList.add('recording');
      let finished = false;
      const detach = () => {
        document.removeEventListener('keydown', onKey, { capture: true });
        observer.disconnect();
      };
      const done = () => {
        if (finished) return;
        finished = true;
        detach();
        delete btn.dataset.recording;
        btn.textContent = prevText;
        btn.classList.remove('recording');
      };
      const onKey = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape') { done(); return; }
        const r = accelFromKeyboardEvent(ev);
        if (!r.ok) {
          btn.textContent = r.error;
          setTimeout(() => { if (!finished) btn.textContent = '按下组合键（Esc 取消）…'; }, 1200);
          return;
        }
        input.value = r.accel;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        done();
        btn.textContent = r.accel; // 显示新快捷键（done 恢复的是旧文案，这里覆盖）
      };
      const observer = new MutationObserver(() => {
        // 设置弹窗被关闭（按钮已不在文档）时清理，避免监听残留
        if (!document.contains(btn)) done();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      document.addEventListener('keydown', onKey, { capture: true });
    });
  }

  return { accelFromKeyboardEvent, bindShortcutRecorder, mainKeyName };
});
