/* 密码本 · 快捷面板（v4.12.0）
 * 运行在独立 "quick" 小窗（无边框置顶，Alt+P 呼出，鼠标附近定位，可拖动 / 右下角缩放，尺寸记忆）。
 * 数据主权在主窗：所有库操作经 quick-request/quick-response 窗口事件由主窗代执行，
 * 本窗不直接开 SQLite（避免双写冲突）。PIN 门与主窗共享解锁状态（同 profile localStorage）。
 * AI 对话复用 AgentCore（agent-core.js）：channelFetch 走 Rust agent_http_stream 事件流，
 * 工具执行转发主窗 executor（onDisplay 的真实结果随响应带回本窗渲染卡片，不回传 AI 渠道）。
 */
(function () {
  'use strict';

  const IS_TAURI = !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
  const $ = (id) => document.getElementById(id);

  /* ---------- 与主窗的请求桥（id 配对，5s 超时——AI 工具调用可能稍慢） ---------- */
  const pending = new Map();
  let seq = 0;
  async function callMain(action, payload, timeoutMs) {
    if (!IS_TAURI) throw new Error('快捷面板需在桌面应用内使用');
    const id = 'q' + (++seq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error('主窗口响应超时'));
      }, timeoutMs || 5000);
      pending.set(id, { resolve, reject, timer });
      window.__TAURI__.event.emit('quick-request', { id, action, payload: payload || {} });
    });
  }
  if (IS_TAURI) {
    window.__TAURI__.event.listen('quick-response', (ev) => {
      const r = ev.payload || {};
      const p = pending.get(r.id);
      if (!p) return;
      pending.delete(r.id);
      clearTimeout(p.timer);
      if (r.ok) p.resolve(r.data);
      else p.reject(new Error(r.error || '操作失败'));
    });
  }

  /* ---------- 设置（与主窗同 profile 共享 localStorage） ---------- */
  function loadSettings() {
    try { return JSON.parse(localStorage.getItem('passbook-settings') || '{}') || {}; }
    catch { return {}; }
  }
  function loadAgentConfigRaw() {
    try { return JSON.parse(localStorage.getItem('passbook-agent') || '{}') || {}; }
    catch { return {}; }
  }

  /* ---------- 主题 ---------- */
  function applyTheme() {
    const s = loadSettings();
    PassTheme.applyTheme(document, s.theme || 'auto', window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  /* ---------- 剪贴板（复制 + 按设置自动清除） ---------- */
  let clearTimer = null;
  async function copyText(text, silent) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    const ms = PassQuick.clearDelayMs((loadSettings().lock) || {});
    clearTimeout(clearTimer);
    if (ms) {
      clearTimer = setTimeout(async () => {
        try { await navigator.clipboard.writeText(' '); } catch { /* 尽力而为 */ }
        try { await navigator.clipboard.writeText(''); } catch { /* 部分平台不接受空串 */ }
      }, ms);
    }
    if (!silent) msg(String(text.length) + ' 字符已复制' + (ms ? `（${ms / 1000}s 后自动清除）` : ''));
  }

  function msg(text, isErr, elId) {
    const el = $(elId || 'q-gen-msg');
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('err', !!isErr);
  }

  const SVG_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  const SVG_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17.25 6.16 20.4l1.26-6.5-4.72-4.6 6.53-.95L12 2.75l2.77 5.6 6.53.95-4.72 4.6 1.26 6.5Z"/></svg>';
  const SVG_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
  const SVG_MIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>';

  /* ---------- PIN 门 / 视图状态 ---------- */
  let gateState = null; // 最近一次 gate 结果（含 settings 快照）

  function renderGateBox(view) {
    const box = $('q-gate-box');
    if (view === 'loading') {
      box.innerHTML = '<div class="q-spinner"></div>' +
        '<h3 class="q-gate-title">主界面初始化中</h3>' +
        '<p class="q-hint">正在解锁数据库，稍候片刻后自动进入。<br />若长时间无响应，请打开主界面查看。</p>' +
        '<button class="btn" id="q-gate-open">打开主界面</button>';
    } else if (view === 'pin') {
      box.innerHTML = '<h3 class="q-gate-title">' + SVG_LOCK + ' 密码本已锁定</h3>' +
        '<input id="q-pin" type="password" placeholder="输入 PIN" autocomplete="current-password" />' +
        '<p class="q-err" id="q-pin-err"></p>' +
        '<button class="btn primary" id="q-pin-go">解锁</button>' +
        '<p class="q-gate-hint">与主界面启动锁为同一把锁，解锁后两边同时解锁。</p>';
    } else {
      box.innerHTML = '<h3 class="q-gate-title">快捷面板不可用</h3><p class="q-hint">请从桌面应用主界面使用。</p>';
    }
    $('q-pin')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryPinUnlock(); });
    $('q-pin-go')?.addEventListener('click', tryPinUnlock);
    $('q-gate-open')?.addEventListener('click', openMain);
    if (view === 'pin') $('q-pin').focus();
  }

  async function refreshGate() {
    let view = 'ready';
    try {
      gateState = await callMain('gate');
      view = PassQuick.gateView(gateState);
    } catch {
      view = 'unavailable';
    }
    const gate = $('q-gate');
    const app = $('q-app');
    if (view === 'ready') {
      gate.classList.add('hidden');
      app.classList.remove('hidden');
      $('q-rsz').classList.remove('hidden');
      $('q-search').focus();
    } else {
      app.classList.add('hidden');
      $('q-rsz').classList.add('hidden');
      gate.classList.remove('hidden');
      renderGateBox(view);
    }
  }

  async function tryPinUnlock() {
    const pinEl = $('q-pin');
    const errEl = $('q-pin-err');
    if (!pinEl || !pinEl.value) return;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pinEl.value));
    const hash = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    try {
      const r = await callMain('unlock', { hash });
      if (r && r.ok) {
        pinEl.value = '';
        await refreshGate();
        runSearch();
      } else if (errEl) errEl.textContent = 'PIN 错误';
    } catch (e) {
      if (errEl) errEl.textContent = e.message;
    }
  }

  async function openMain() {
    if (!IS_TAURI) return;
    try { await window.__TAURI__.core.invoke('quick_panel_open_main'); } catch { /* 尽力而为 */ }
  }

  function hidePanel() {
    if (IS_TAURI) window.__TAURI__.core.invoke('quick_panel_hide').catch(() => {});
  }

  /* ---------- Tab 切换 ---------- */
  document.querySelectorAll('.q-tabs button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.q-tabs button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      for (const t of ['search', 'gen', 'import', 'ai']) $('tab-' + t).classList.toggle('hidden', t !== b.dataset.tab);
      if (b.dataset.tab === 'search') $('q-search').focus();
      if (b.dataset.tab === 'import') $('q-import-text').focus();
      if (b.dataset.tab === 'ai') $('ai-input').focus();
    });
  });

  /* ---------- 搜索 ---------- */
  let searchTimer = null;
  let lastResults = [];
  $('q-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 160);
  });

  async function runSearch() {
    const q = $('q-search').value.trim();
    const wrap = $('q-results');
    try {
      const r = await callMain('search', { q });
      lastResults = PassQuick.trimResults(r.items, 30);
      renderResults();
    } catch (e) {
      wrap.innerHTML = '<div class="q-empty">' + (e.message || '搜索失败') + '</div>';
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function renderResults() {
    const wrap = $('q-results');
    if (!lastResults.length) {
      wrap.innerHTML = '<div class="q-empty">' + ($('q-search').value.trim() ? '无匹配结果' : '开始输入即搜索全部条目') + '</div>';
      return;
    }
    wrap.innerHTML = lastResults.map((it) => {
      const totp = it.totp_secret
        ? '<button class="q-totp" data-copy-totp="' + esc(it.id) + '" title="复制动态验证码"><span data-totp="' + esc(it.id) + '">······</span></button>'
        : '';
      return '<div class="q-item">' +
        '<div class="q-it-main"><div class="q-it-owner">' + esc(it.owner) + (it.fav ? ' <span class="q-fav">' + SVG_STAR + '</span>' : '') + '</div>' +
        '<div class="q-it-account">' + esc(it.account) + (it.note ? ' · ' + esc(it.note) : '') + '</div></div>' +
        '<div class="q-btns">' + totp +
        '<button data-copy-ac="' + esc(it.id) + '">账号</button>' +
        '<button data-copy-pw="' + esc(it.id) + '" class="q-copy-pw">' + SVG_COPY + ' 密码</button>' +
        '</div></div>';
    }).join('');
  }

  // 按钮事件（委托）
  $('q-results').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.copyPw || btn.dataset.copyAc || (btn.closest('[data-copy-totp]') ? btn.closest('[data-copy-totp]').dataset.copyTotp : '');
    if (!id) return;
    const it = lastResults.find((x) => String(x.id) === String(id));
    if (!it) return;
    try {
      if (btn.dataset.copyPw) await copyText(it.password);
      else if (btn.dataset.copyAc) await copyText(it.account);
      else {
        const { code } = await PassTotp.generateTotp(it.totp_secret);
        await copyText(code);
      }
    } catch (err) { msg(err.message, true); }
  });

  // TOTP 码实时刷新（每秒刷可见行）
  setInterval(async () => {
    for (const el of document.querySelectorAll('[data-totp]')) {
      const it = lastResults.find((x) => String(x.id) === String(el.dataset.totp));
      if (!it || !it.totp_secret) continue;
      try {
        const { code, remaining } = await PassTotp.generateTotp(it.totp_secret);
        el.textContent = code + ' (' + remaining + 's)';
      } catch { /* 密钥异常则保持占位 */ }
    }
  }, 1000);

  /* ---------- 生成器（偏好与主窗共享 settings.gen） ---------- */
  function genOpts() {
    return {
      length: Number($('q-gen-len').value) || 16,
      upper: $('q-gen-upper').checked,
      lower: $('q-gen-lower').checked,
      digit: $('q-gen-digit').checked,
      symbol: $('q-gen-symbol').checked,
    };
  }

  function loadGenPrefs() {
    const g = (loadSettings().gen) || {};
    if (g.length) $('q-gen-len').value = g.length;
    $('q-gen-upper').checked = g.upper !== false;
    $('q-gen-lower').checked = g.lower !== false;
    $('q-gen-digit').checked = g.digit !== false;
    $('q-gen-symbol').checked = g.symbol !== false;
  }

  function saveGenPrefs() {
    // 只更新面板可调的四项 + 长度，保留主窗存的其余偏好键（symbols/ensure/…）
    try {
      const s = loadSettings();
      s.gen = { ...(s.gen || {}), length: Number($('q-gen-len').value) || 16,
        upper: $('q-gen-upper').checked, lower: $('q-gen-lower').checked,
        digit: $('q-gen-digit').checked, symbol: $('q-gen-symbol').checked };
      localStorage.setItem('passbook-settings', JSON.stringify(s));
    } catch { /* 尽力而为 */ }
  }

  $('q-gen-go').addEventListener('click', () => {
    try {
      const pw = PassGen.generate(genOpts());
      $('q-gen-pw').textContent = pw;
      $('q-gen-block').classList.remove('hidden');
      saveGenPrefs();
      msg('');
    } catch (e) { msg(e.message, true); }
  });
  $('q-gen-copy').addEventListener('click', () => copyText($('q-gen-pw').textContent));
  $('q-gen-save-btn').addEventListener('click', () => {
    $('q-gen-save-form').classList.remove('hidden');
    $('q-save-owner').focus();
  });
  $('q-save-cancel').addEventListener('click', () => $('q-gen-save-form').classList.add('hidden'));
  $('q-save-go').addEventListener('click', async () => {
    const owner = $('q-save-owner').value.trim();
    if (!owner) return msg('所属必填', true);
    try {
      const r = await callMain('save', { row: { owner, account: $('q-save-account').value.trim(), password: $('q-gen-pw').textContent } });
      msg('已存入：新增 ' + (r && r.imported) + ' 条');
      $('q-gen-save-form').classList.add('hidden');
      $('q-save-owner').value = ''; $('q-save-account').value = '';
    } catch (e) { msg(e.message, true); }
  });

  /* ---------- 快速导入（粘贴文本，合并模式） ---------- */
  let importTimer = null;
  let importRows = [];
  $('q-import-text').addEventListener('input', () => {
    clearTimeout(importTimer);
    importTimer = setTimeout(() => {
      importRows = PassImporter.parseLines($('q-import-text').value);
      $('q-import-preview').textContent = PassQuick.importPreview(importRows);
      $('q-import-preview').classList.toggle('err', !importRows.length && !!$('q-import-text').value.trim());
    }, 250);
  });
  $('q-import-go').addEventListener('click', async () => {
    if (!importRows.length) { msg('没有可导入的数据', true, 'q-import-preview'); return; }
    try {
      const r = await callMain('import', { rows: importRows });
      $('q-import-preview').classList.remove('err');
      $('q-import-preview').textContent = '导入完成：新增 ' + (r && r.imported) + ' 条' + (r && r.skipped ? '，跳过重复 ' + r.skipped + ' 条' : '');
      $('q-import-text').value = '';
      importRows = [];
    } catch (e) { msg(e.message, true, 'q-import-preview'); }
  });

  /* ================= AI 对话（v4.12.0） ================= */
  const aiState = { messages: [], busy: false, abort: null };

  /** 流式网络出口：Rust agent_http_stream + agent-stream-* 事件（与主窗同一通道） */
  async function aiChannelFetch(url, opts, onChunk) {
    if (!IS_TAURI) throw new Error('AI 对话需在桌面应用内使用');
    const evt = window.__TAURI__.event;
    const signal = opts.signal || null;
    if (signal && signal.aborted) throw new Error('已停止');
    let status = 0;
    let full = '';
    let err = null;
    let resolveDone;
    const done = new Promise((res) => { resolveDone = res; });
    const unlisteners = [];
    const onAbort = () => {
      err = new Error('已停止');
      try { tauriInvokeQ('agent_abort'); } catch { /* 忽略 */ }
      resolveDone();
    };
    if (signal) signal.addEventListener('abort', onAbort);
    unlisteners.push(await evt.listen('agent-stream-status', (e) => { status = Number(e.payload); }));
    unlisteners.push(await evt.listen('agent-stream-chunk', (e) => {
      full += e.payload;
      if (onChunk) onChunk(e.payload);
    }));
    unlisteners.push(await evt.listen('agent-stream-error', (e) => {
      err = new Error(String(e.payload).slice(0, 300) || '渠道流式错误');
      resolveDone();
    }));
    unlisteners.push(await evt.listen('agent-stream-done', () => resolveDone()));
    try {
      await tauriInvokeQ('agent_http_stream', { url, method: opts.method || 'POST', headers: opts.headers || {}, body: opts.body });
    } catch (e) { err = e; resolveDone(); }
    await done;
    if (signal) signal.removeEventListener('abort', onAbort);
    unlisteners.forEach((u) => { try { u(); } catch { /* 忽略 */ } });
    if (err) throw err;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => full,
      json: async () => JSON.parse(full),
    };
  }
  function tauriInvokeQ(cmd, args) {
    return window.__TAURI__.core.invoke(cmd, args);
  }

  /** 工具执行：转发主窗 executor；onDisplay 的真实结果随响应带回（不回传 AI 渠道） */
  async function aiExec(name, args) {
    const r = await callMain('agent:exec', { name, args }, 15000);
    for (const d of (r && r.displays) || []) renderAiCard(d);
    return (r && r.result) || { error: '无结果' };
  }

  function aiScroll() { const log = $('ai-log'); log.scrollTop = log.scrollHeight; }

  function aiBubble(text, cls) {
    const div = document.createElement('div');
    div.className = 'ai-msg ' + cls;
    div.textContent = text;
    $('ai-log').appendChild(div);
    aiScroll();
    return div;
  }

  function aiToolLine(name, args) {
    const div = document.createElement('div');
    div.className = 'ai-tool';
    div.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z"/></svg>' +
      '<span>' + esc(PassQuick.aiToolLabel(name, args)) + '</span>';
    $('ai-log').appendChild(div);
    aiScroll();
    return div;
  }

  /** AI 查询结果的真实数据卡片（与主窗 agentDisplay 同样的隐私分级：默认打码，用户主动显示/复制） */
  function renderAiCard(payload) {
    if (!payload || !Array.isArray(payload.items) || !payload.items.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'ai-msg assistant';
    wrap.style.padding = '6px 8px';
    if (payload.kind === 'confirm_delete') {
      wrap.innerHTML = '<span class="q-hint">删除' + (payload.items[0].type === 'notes' ? '便签' : '文件') + '「' + esc(payload.items[0].title || '') + '」需在主界面 AI 面板确认。</span>';
      $('ai-log').appendChild(wrap);
      aiScroll();
      return;
    }
    if (payload.kind === 'notes' || payload.kind === 'files') {
      const label = payload.kind === 'notes' ? (x) => (x.title || '') : (x) => (x.name || '');
      wrap.innerHTML = payload.items.map((x) =>
        '<div class="q-hint" style="padding:2px 0">· ' + esc(String(label(x)).slice(0, 40)) + '</div>').join('');
      $('ai-log').appendChild(wrap);
      aiScroll();
      return;
    }
    wrap.innerHTML = payload.items.map((x) =>
      '<div class="q-item" style="margin-bottom:4px"><div class="q-it-main">' +
      '<div class="q-it-owner">' + esc(x.owner || '') + '</div>' +
      '<div class="q-it-account">' + esc(x.account || '') + '</div></div>' +
      '<div class="q-btns">' +
      (x.totp_secret ? '<button class="q-totp" data-ai-totp="' + esc(x.totp_secret) + '"><span>' + '······' + '</span></button>' : '') +
      '<button class="q-copy-pw" data-ai-pw="' + esc(String(x.password || '')) + '">' + SVG_COPY + ' 密码</button>' +
      '</div></div>').join('');
    wrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      try {
        if (btn.dataset.aiPw !== undefined) await copyText(btn.dataset.aiPw);
        else if (btn.dataset.aiTotp !== undefined) {
          const { code } = await PassTotp.generateTotp(btn.dataset.aiTotp);
          await copyText(code);
        }
      } catch (err) { toast2(err.message, true); }
    });
    $('ai-log').appendChild(wrap);
    aiScroll();
  }

  function toast2(text, isErr) { msg(text, isErr, 'ai-empty'); }

  /** 发送一轮对话（流式 + 工具循环） */
  async function aiSend() {
    const input = $('ai-input');
    const text = input.value.trim();
    if (!text || aiState.busy) return;
    const cfg = loadAgentConfigRaw();
    if (!cfg.baseUrl || !cfg.model) {
      aiBubble('AI 渠道未配置：请到主界面「设置 → AI 助理」填写接口地址与模型名（可点「获取模型列表」选择），保存后回来即可对话。', 'assistant error');
      return;
    }
    input.value = '';
    aiBubble(text, 'user');
    aiState.busy = true;
    $('ai-send').classList.add('hidden');
    $('ai-stop').classList.remove('hidden');
    const controller = new AbortController();
    aiState.abort = controller;
    const bubble = aiBubble('', 'assistant');
    let shown = '';
    try {
      await AgentCore.chatStream({
        messages: aiState.messages,
        channelFetch: aiChannelFetch,
        url: cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions',
        headers: cfg.apiKey ? { Authorization: 'Bearer ' + cfg.apiKey } : {},
        model: cfg.model,
        exec: aiExec,
        onEvent: (type, p) => { if (type === 'tool') aiToolLine(p.name, p.args); },
        onDelta: (t) => {
          shown = t;
          bubble.textContent = t;
          bubble.insertAdjacentHTML('beforeend', '<span class="ai-caret"></span>');
          aiScroll();
        },
        signal: controller.signal,
      });
      bubble.querySelector('.ai-caret')?.remove();
      if (!shown) bubble.textContent = '（无回复内容）';
    } catch (e) {
      bubble.querySelector('.ai-caret')?.remove();
      const m = String((e && e.message) || e);
      bubble.classList.add('error');
      bubble.textContent = PassQuick.fmtAgentError(m);
    } finally {
      aiState.busy = false;
      aiState.abort = null;
      $('ai-send').classList.remove('hidden');
      $('ai-stop').classList.add('hidden');
      aiScroll();
    }
  }

  $('ai-send').addEventListener('click', aiSend);
  $('ai-stop').addEventListener('click', () => {
    if (aiState.abort) aiState.abort.abort();
    if (IS_TAURI) tauriInvokeQ('agent_abort').catch(() => {});
  });
  $('ai-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      aiSend();
    }
  });

  /* ---------- 面板显隐行为 ---------- */
  $('q-open-main').addEventListener('click', openMain);
  $('q-min').addEventListener('click', hidePanel);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && IS_TAURI) {
      window.__TAURI__.core.invoke('quick_panel_hide').catch(() => {});
    }
  });
  // v4.11.1：不监听 blur——点击其他窗口面板保持打开；收起 = Esc / 再按 Alt+P / 顶部最小化

  // 每次重新显示（Alt+P 唤出）都重查锁定态：托盘期间主窗可能已自动上锁
  window.addEventListener('focus', () => refreshGate());

  /* ---------- v4.12.0：右下角自定义缩放（无边框窗口） + 尺寸记忆 ---------- */
  (function bindResize() {
    const grip = $('q-rsz');
    if (!grip) return;
    let startX = 0, startY = 0, startW = 0, startH = 0, active = false;
    grip.addEventListener('pointerdown', (e) => {
      if (!IS_TAURI) return;
      active = true;
      grip.setPointerCapture(e.pointerId);
      const r = document.body.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startW = r.width; startH = r.height;
      e.preventDefault();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!active) return;
      const w = startW + (e.clientX - startX);
      const h = startH + (e.clientY - startY);
      tauriInvokeQ('quick_panel_apply_size', { w, h }).catch(() => { /* 尽力而为 */ });
    });
    const finish = async () => {
      if (!active) return;
      active = false;
      try {
        const r = document.body.getBoundingClientRect();
        await tauriInvokeQ('quick_panel_save_size', { w: r.width, h: r.height });
      } catch { /* 尽力而为 */ }
    };
    grip.addEventListener('pointerup', finish);
    grip.addEventListener('pointercancel', finish);
  })();

  /* ---------- 启动 ---------- */
  applyTheme();
  loadGenPrefs();
  refreshGate().then(() => { if (PassQuick.gateView(gateState) === 'ready') runSearch(); });
})();
