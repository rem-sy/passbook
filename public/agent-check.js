/**
 * 密码本 · AI 渠道检测（v4.10.0）
 * 设置页「获取模型列表 / 检测渠道可用性」的纯逻辑：URL 拼接、/models 响应解析、
 * 最小对话探活的请求构造与结果判定。网络出口由 app.js 的 agentFetch 三路分发
 * （桌面/安卓 Rust 代理 · 服务器 /api/agent/proxy · PWA 直连），本模块零依赖（Node 可测）。
 *
 * 浏览器 (window.PassAgentCheck) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassAgentCheck = factory();
})(globalThis, function () {
  'use strict';

  /** 去尾部斜杠（与主对话管线同规则：baseUrl + '/chat/completions'） */
  function trimBase(baseUrl) {
    return String(baseUrl || '').trim().replace(/\/+$/, '');
  }

  /** 模型列表接口：{base}/models（OpenAI 兼容标准端点） */
  function modelsUrl(baseUrl) {
    return trimBase(baseUrl) + '/models';
  }

  /** 对话接口：与 agent-core 主管线完全一致 */
  function chatUrl(baseUrl) {
    return trimBase(baseUrl) + '/chat/completions';
  }

  /** 请求头：带 Key 时加 Authorization（Bearer） */
  function authHeaders(apiKey, extra) {
    const h = { ...(extra || {}) };
    if (apiKey && apiKey.trim()) h['Authorization'] = 'Bearer ' + apiKey.trim();
    return h;
  }

  /**
   * 解析 /models 响应 → 模型 id 列表。
   * 兼容三种形态：{data:[{id}]}（OpenAI 标准）、[{id}]（部分网关）、{models:[{name}]}（Ollama 变体）。
   * 去重 + 字典序，上限 200 条防巨量渠道撑爆 datalist。
   */
  function parseModels(jsonText) {
    let j;
    try { j = JSON.parse(String(jsonText)); } catch { return { ok: false, error: '响应不是合法 JSON' }; }
    const arr = Array.isArray(j) ? j
      : Array.isArray(j && j.data) ? j.data
      : Array.isArray(j && j.models) ? j.models
      : null;
    if (!arr) return { ok: false, error: '响应里没有模型列表（data / models / 数组）' };
    const ids = [];
    const seen = Object.create(null);
    for (const it of arr) {
      const id = typeof it === 'string' ? it : it && (it.id || it.name);
      if (!id || seen[id]) continue;
      seen[id] = 1;
      ids.push(id);
    }
    if (!ids.length) return { ok: false, error: '模型列表为空' };
    ids.sort();
    return { ok: true, models: ids.slice(0, 200), total: ids.length };
  }

  /** 探活请求体：最小对话（max_tokens 8，非流式；部分渠道拒绝 1） */
  function buildPingBody(model) {
    return JSON.stringify({
      model: String(model || '').trim(),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 8,
      stream: false,
    });
  }

  /** 从错误响应体里尽量抠出人类可读信息（error.message / message / 原文截断） */
  function briefError(jsonText) {
    const raw = String(jsonText || '').trim();
    if (!raw) return '';
    try {
      const j = JSON.parse(raw);
      const m = j && (j.error && (j.error.message || j.error.code) || j.message);
      if (m) return String(m).slice(0, 120);
    } catch { /* 非 JSON */ }
    return raw.slice(0, 120);
  }

  /**
   * 探活结果判定。
   * @param {number} status HTTP 状态码
   * @param {string} jsonText 响应体
   * @param {number} latencyMs 请求耗时
   */
  function evalPing(status, jsonText, latencyMs) {
    const lat = Math.max(0, Math.round(latencyMs || 0));
    if (status >= 200 && status < 300) {
      let model = '';
      try { const j = JSON.parse(String(jsonText)); model = (j && j.model) || ''; } catch { /* 忽略 */ }
      return { ok: true, latencyMs: lat, model, message: '渠道可用（往返 ' + lat + 'ms' + (model ? '，模型 ' + model : '') + '）' };
    }
    let why = 'HTTP ' + status;
    if (status === 401 || status === 403) why = '鉴权失败：API Key 无效或无权限';
    else if (status === 404) why = '404：接口地址或模型名不存在（检查是否漏 /v1）';
    else if (status === 429) why = '429：请求频率/额度受限';
    const brief = briefError(jsonText);
    return { ok: false, latencyMs: lat, message: why + (brief ? '：' + brief : '') };
  }

  return { trimBase, modelsUrl, chatUrl, authHeaders, parseModels, buildPingBody, evalPing, briefError };
});
