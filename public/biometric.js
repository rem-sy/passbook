/* 密码本 · 生物识别解锁（v2.6.0）
 * 桌面：Windows Hello（Rust 命令 bio_available / bio_prompt）
 * Android：RustWebView 注入的 window.__passbook_bio JS 桥（系统指纹/面容/PIN 确认）
 * 纯浏览器 / 不支持时：kind = null，界面回退纯 PIN。
 */
(function (g) {
  function detectKind(win) {
    try {
      const w = win || (typeof window !== 'undefined' ? window : null);
      if (!w) return null;
      if (w.__passbook_bio && typeof w.__passbook_bio.available === 'function') return 'android';
      const t = w.__TAURI__ || w.__TAURI_INTERNALS__;
      if (t && w.__TAURI__ && w.__TAURI__.core && typeof w.__TAURI__.core.invoke === 'function') return 'desktop';
      return null;
    } catch { return null; }
  }

  const Bio = {
    kind: detectKind(),
    _pending: null,

    /** 平台是否可用生物识别（同步探测桥存在性；结果缓存） */
    supported() { return this.kind !== null; },

    /** 进一步确认设备已录入锁屏凭据（Android 桥查询；桌面视作可用） */
    async available() {
      if (this.kind === 'android') return w().__passbook_bio.available() === 'yes';
      if (this.kind === 'desktop') {
        try { return await w().__TAURI__.core.invoke('bio_available'); } catch { return false; }
      }
      return false;
    },

    /** 拉起生物识别验证，resolve(true/false)；不可用 resolve(false) */
    prompt(reason) {
      const self = this;
      return new Promise(async (resolve) => {
        try {
          if (self.kind === 'android') {
            const bridge = w().__passbook_bio;
            if (bridge.available() !== 'yes') return resolve(false);
            // v3.0.5：evaluateJavascript 回调在凭据页遮挡/WebView 暂停时可能丢失，
            // 增加同步轮询兜底（JavascriptInterface 直读结果，时序无关）
            if (typeof bridge.result === 'function') {
              let done = false;
              const finish = (ok) => { if (done) return; done = true; clearInterval(iv); resolve(ok === true); };
              const t0 = Date.now();
              const iv = setInterval(() => {
                let r = 'pending';
                try { r = bridge.result(); } catch { /* 忽略瞬时错误 */ }
                if (r === 'true' || r === 'false') finish(r);
                else if (Date.now() - t0 > 90000) finish('false'); // 超时保底
              }, 400);
              self._pending = finish; // evaluateJavascript 快路径
              bridge.prompt(reason || '解锁密码本');
              return;
            }
            self._pending = resolve;
            bridge.prompt(reason || '解锁密码本');
            return;
          }
          if (self.kind === 'desktop') {
            const ok = await w().__TAURI__.core.invoke('bio_prompt', { reason: reason || '解锁密码本' });
            return resolve(ok === true);
          }
        } catch { /* fallthrough */ }
        resolve(false);
      });
    },

    /** Android 桥回调（BioBridgeActivity evaluateJavascript 调用） */
    _onResult(ok) {
      const cb = this._pending; this._pending = null;
      if (cb) cb(ok === true);
    },
  };

  function w() { return typeof window !== 'undefined' ? window : g; }
  if (typeof w() !== 'undefined') w().__passbookBioResult = (ok) => Bio._onResult(ok);
  Bio.detectKind = detectKind; // 供测试
  g.Bio = Bio;
  if (typeof module !== 'undefined' && module.exports) module.exports = { Bio, detectKind };
})(typeof globalThis !== 'undefined' ? globalThis : this);
