/* 密码本 · 强搜索引擎（v2.1.0）
 * 能力：多词 AND 模糊匹配（子序列，大小写不敏感）、全字段检索、
 *       操作符过滤（分类:xx、有验证码/无验证码）、命中高亮区间。
 * 零依赖 UMD：浏览器挂 window.PassSearch，Node 测试走 module.exports。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassSearch = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------- 查询解析 ---------- */
  // 操作符（可带引号）：分类:工作 / category:work / 有验证码 / 无验证码 / 有收藏 / 无收藏
  var FILTER_RE = /^(?:分类|分类名|category|cat):(.+)$/i;
  var HAS_TOTP_RE = /^(?:有验证码|有动态码|有totp|totp)$/i;
  var NO_TOTP_RE = /^(?:无验证码|无动态码|无totp)$/i;
  var HAS_FAV_RE = /^(?:有收藏|星标|收藏|fav|favorite)$/i;
  var NO_FAV_RE = /^(?:无收藏|非收藏|unfav|nofav)$/i;

  /** 解析查询串 → { terms: [词], filters: { category?, hasTotp?, hasFav? }, unknown: [未识别操作符] } */
  function parseQuery(q) {
    var terms = [], filters = {}, unknown = [];
    var raw = String(q == null ? '' : q).trim();
    if (!raw) return { terms: [], filters: filters, unknown: [] };
    // 按空白切词（保留引号内整体："分类:工作 生活"）
    var parts = raw.match(/"[^"]*"|\S+/g) || [];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].replace(/^"|"$/g, '');
      if (!p) continue;
      var m = FILTER_RE.exec(p);
      if (m) { filters.category = m[1].toLowerCase(); continue; }
      if (HAS_TOTP_RE.test(p)) { filters.hasTotp = true; continue; }
      if (NO_TOTP_RE.test(p)) { filters.hasTotp = false; continue; }
      if (HAS_FAV_RE.test(p)) { filters.hasFav = true; continue; }
      if (NO_FAV_RE.test(p)) { filters.hasFav = false; continue; }
      if (p.indexOf(':') > 0 && /^[a-z\u4e00-\u9fa5]+:.+$/i.test(p)) { unknown.push(p); continue; }
      terms.push(p.toLowerCase());
    }
    return { terms: terms, filters: filters, unknown: unknown };
  }

  /* ---------- 子序列模糊匹配 ---------- */
  /**
   * term 是否为 text 的子序列（大小写不敏感）。
   * 命中策略：贪心但优先连续段——先找整体子串，找不到再做子序列。
   * 返回 { score, ranges } 或 null。ranges 为 [start,end) 半开区间数组（按字符）。
   * 评分：子串命中 100 + 前缀奖励 30 + 词首奖励 10；子序列 = 60 - 跳跃惩罚。
   */
  function fuzzyMatch(term, text) {
    if (!term) return { score: 0, ranges: [] };
    term = String(term).toLowerCase();
    var t = String(text == null ? '' : text).toLowerCase();
    if (!t) return null;
    // 1) 整体子串（最优）
    var idx = t.indexOf(term);
    if (idx >= 0) {
      var score = 100;
      if (idx === 0) score += 30;
      else if (isWordStart(t, idx)) score += 10;
      return { score: score, ranges: [[idx, idx + term.length]] };
    }
    // 2) 子序列：贪心收集，记录每个命中字符位置
    var pos = [], j = 0;
    for (var i = 0; i < t.length && j < term.length; i++) {
      if (t[i] === term[j]) { pos.push(i); j++; }
    }
    if (j < term.length) return null;
    // 合并相邻位置为区间，跳跃越多惩罚越重
    var ranges = [], gaps = 0, start = pos[0], prev = pos[0];
    for (var k = 1; k < pos.length; k++) {
      if (pos[k] === prev + 1) { prev = pos[k]; continue; }
      ranges.push([start, prev + 1]);
      gaps += pos[k] - prev - 1;
      start = prev = pos[k];
    }
    ranges.push([start, prev + 1]);
    var sub = Math.max(10, 60 - gaps * 2);
    if (start === 0) sub += 20;
    return { score: sub, ranges: ranges };
  }

  function isWordStart(t, idx) {
    if (idx === 0) return true;
    var c = t[idx - 1];
    return /[\s/@._\-·]/.test(c) || /[\u4e00-\u9fa5]/.test(c);
  }

  /* ---------- 条目打分 ---------- */
  // 参与检索的字段与权重
  var FIELDS = [
    ['owner', 3], ['account', 2], ['url', 1.5],
    ['category', 1.5], ['note', 1], ['totp_secret', 0.5],
  ];

  /**
   * 单条目对全部词打分（词间 AND：每词至少命中一个字段）。
   * filters 过滤：category 精确（不区分大小写）、hasTotp 布尔。
   * 返回 { score, fields: {字段名: ranges[] } } 或 null（不命中/被过滤）。
   */
  function scoreEntry(entry, terms, filters) {
    if (!entry) return null;
    if (filters) {
      if (filters.category != null) {
        // v3.4.0：多分类——命中的是集合中任一分类（大小写不敏感），不再整串精确比较
        var cats = catSplit(entry.category).map(function (c) { return c.toLowerCase(); });
        if (cats.indexOf(filters.category) < 0) return null;
      }
      if (filters.hasTotp != null) {
        var has = !!entry.totp_secret;
        if (has !== filters.hasTotp) return null;
      }
      if (filters.hasFav != null) {
        var favd = !!(entry.fav === 1 || entry.fav === true);
        if (favd !== filters.hasFav) return null;
      }
    }
    if (!terms || !terms.length) return { score: 0, fields: {} };
    var total = 0, fields = {};
    for (var i = 0; i < terms.length; i++) {
      var best = null, bestField = null;
      for (var f = 0; f < FIELDS.length; f++) {
        var name = FIELDS[f][0], w = FIELDS[f][1];
        var v = entry[name];
        if (v == null || v === '') continue;
        var m = fuzzyMatch(terms[i], v);
        if (m && (!best || m.score * w > best.score)) {
          best = { score: m.score * w, ranges: m.ranges };
          bestField = name;
        }
      }
      if (!best) return null; // AND 语义：任一词未命中即淘汰
      total += best.score;
      if (bestField) {
        fields[bestField] = (fields[bestField] || []).concat(best.ranges);
      }
    }
    return { score: total, fields: fields };
  }

  /**
   * 搜索条目数组。返回按分降序的 [{ entry, score, fields }]。
   * 空 query（无词无过滤）返回 null 表示"不过滤"。
   */
  function searchEntries(entries, query) {
    var pq = parseQuery(query);
    var noFilter = !pq.terms.length && !Object.keys(pq.filters).length;
    if (noFilter) return null;
    var out = [];
    for (var i = 0; i < (entries || []).length; i++) {
      var r = scoreEntry(entries[i], pq.terms, pq.filters);
      if (r) out.push({ entry: entries[i], score: r.score, fields: r.fields });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /* ---------- 高亮 ---------- */
  /** 区间排序 + 合并重叠 */
  function normalizeRanges(ranges) {
    var rs = (ranges || []).slice().sort(function (a, b) { return a[0] - b[0]; });
    var out = [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i];
      if (out.length && r[0] <= out[out.length - 1][1]) {
        out[out.length - 1][1] = Math.max(out[out.length - 1][1], r[1]);
      } else out.push([r[0], r[1]]);
    }
    return out;
  }

  /** 把 text 按 ranges 分段 → [{ text, hit }]（不转义，调用方负责） */
  function highlightSegments(text, ranges) {
    var s = String(text == null ? '' : text);
    var rs = normalizeRanges(ranges);
    if (!rs.length) return s ? [{ text: s, hit: false }] : [];
    var segs = [], cur = 0;
    for (var i = 0; i < rs.length; i++) {
      if (rs[i][0] > cur) segs.push({ text: s.slice(cur, rs[i][0]), hit: false });
      segs.push({ text: s.slice(rs[i][0], rs[i][1]), hit: true });
      cur = rs[i][1];
    }
    if (cur < s.length) segs.push({ text: s.slice(cur), hit: false });
    return segs;
  }

  /** HTML 版：hit 段包 <mark class="hl">，文本经 escapeHtml 转义 */
  function highlightHtml(text, ranges, escapeHtml) {
    var esc = escapeHtml || function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    };
    return highlightSegments(text, ranges).map(function (seg) {
      return seg.hit ? '<mark class="hl">' + esc(seg.text) + '</mark>' : esc(seg.text);
    }).join('');
  }

  /** 从条目 url 提取域名（v2.7.0 favicon 用）；非法/为空返回 '' */
  function extractDomain(url) {
    var s = String(url == null ? '' : url).trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    try {
      var host = new URL(s).hostname;
      return host && /\.[a-z\u4e00-\u9fa5]/i.test(host) ? host : '';
    } catch (e) { return ''; }
  }

  /* ---------- 多分类体系（v3.4.0）----------
   * category 列存逗号分隔多值（如 "个人,工作"）；旧单值天然兼容。 */
  /** 拆分分类串 → 去空格、去空、去重（保序）数组；catSplit('工作, 个人,,工作') → ['工作','个人'] */
  function catSplit(s) {
    var out = [], seen = {};
    var arr = String(s == null ? '' : s).split(/[,，]/);
    for (var i = 0; i < arr.length; i++) {
      var t = arr[i].trim();
      if (!t || seen[t]) continue;
      seen[t] = 1;
      out.push(t);
    }
    return out;
  }
  /** 数组 → 规范逗号串（同样去空去重保序）；catJoin([]) → '' */
  function catJoin(arr) {
    return catSplit(Array.isArray(arr) ? arr.join(',') : arr).join(',');
  }
  /** 条目集合过滤：mode='any'（含任一）| 'all'（含全部）| 'exclude'（都不含）；大小写不敏感 */
  function catFilter(items, cats, mode) {
    var want = (cats || []).map(function (c) { return String(c || '').trim().toLowerCase(); }).filter(Boolean);
    if (!want.length) return items || [];
    return (items || []).filter(function (it) {
      var set = catSplit(it.category).map(function (c) { return c.toLowerCase(); });
      var hit = want.filter(function (w) { return set.indexOf(w) >= 0; }).length;
      if (mode === 'all') return hit === want.length;
      if (mode === 'exclude') return hit === 0;
      return hit > 0; // any
    });
  }
  /** 批量标签运算：oldStr 应用 add/remove 后的新串（纯函数） */
  function catApply(oldStr, cats, op) {
    var cur = catSplit(oldStr);
    var delta = catSplit(Array.isArray(cats) ? cats.join(',') : cats);
    var set = {}, out = [];
    var src = op === 'remove' ? cur.filter(function (c) { return delta.map(function (d) { return d; }).indexOf(c) < 0; }) : cur.concat(delta);
    for (var i = 0; i < src.length; i++) {
      if (set[src[i]]) continue;
      set[src[i]] = 1;
      out.push(src[i]);
    }
    return out.join(',');
  }

  /* ---------- 主页自定义排序（v3.4.2）----------
   * sortEntries(items, key, order)：收藏始终置顶（优先于排序键，与服务端 fav DESC 一致），
   * 组内按 key 排：updated|created（时间，desc=最新在前）|category（catJoin 后 localeCompare zh，
   * 空分类排最后）|totp（desc=有码在前）|owner（localeCompare zh）。
   * order='asc'|'desc'，翻转各键比较结果；现代引擎 sort 稳定，同键保持原相对顺序。 */
  function timeVal(v) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    var t = Date.parse(v);
    return isNaN(t) ? (Number(v) || 0) : t;
  }
  function sortEntries(items, key, order) {
    var k = key || 'updated', desc = order !== 'asc'; // 默认倒序（最新在前）
    var arr = (items || []).slice();
    var cmpKey = function (a, b) {
      var r = 0;
      if (k === 'updated') r = timeVal(a.updated_at) - timeVal(b.updated_at);
      else if (k === 'created') r = timeVal(a.created_at) - timeVal(b.created_at);
      else if (k === 'category') {
        var ca = catJoin(a.category), cb = catJoin(b.category);
        if (!ca && cb) return 1; // 空分类排最后（不受 order 翻转）
        if (ca && !cb) return -1;
        r = ca.localeCompare(cb, 'zh');
      } else if (k === 'totp') r = (a.totp_secret ? 1 : 0) - (b.totp_secret ? 1 : 0);
      else r = String(a.owner || '').localeCompare(String(b.owner || ''), 'zh');
      return desc ? -r : r;
    };
    arr.sort(function (a, b) {
      var fa = a.fav === 1 || a.fav === true ? 1 : 0;
      var fb = b.fav === 1 || b.fav === true ? 1 : 0;
      if (fa !== fb) return fb - fa; // 收藏置顶，优先于排序键
      return cmpKey(a, b);
    });
    return arr;
  }

  return {
    parseQuery: parseQuery,
    fuzzyMatch: fuzzyMatch,
    scoreEntry: scoreEntry,
    searchEntries: searchEntries,
    highlightSegments: highlightSegments,
    highlightHtml: highlightHtml,
    normalizeRanges: normalizeRanges,
    extractDomain: extractDomain,
    catSplit: catSplit,
    catJoin: catJoin,
    catFilter: catFilter,
    catApply: catApply,
    sortEntries: sortEntries,
  };
});
