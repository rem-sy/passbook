/**
 * 密码本 · 安全体检（Watchtower）
 * 本地检查：重复密码 / 弱密码（常见词典 + 长度 + 字符类别） / 信息不完整 / 陈旧密码
 * 联网检查（可选）：HaveIBeenPwned k-匿名泄露查询（仅上传 SHA-1 前 5 位，密码本体不出本机）
 * 浏览器 (window.PassWatch) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassWatch = factory();
})(globalThis, function () {
  'use strict';

  /* ---------------- 常见弱密码词典（命中即高危） ---------------- */
  const COMMON_PASSWORDS = new Set((
    '123456 password 123456789 12345678 12345 qwerty 1234567 111111 1234567890 123123 ' +
    'abc123 1234 password1 iloveyou 000000 qwerty123 1q2w3e4r aa12345678 654321 555555 ' +
    'dragon sunshine monkey letmein baseball football basketball superman batman trustno1 ' +
    'master welcome shadow ashley michael jennifer jordan harley ranger hunter buster ' +
    'soccer hockey killer george sexy andrew charlie thomas robert access love summer ' +
    'winter secret god money freedom whatever computer internet samsung google android ' +
    'qwertyuiop zaq12wsx 1qaz2wsx p@ssw0rd passw0rd admin root login test guest user ' +
    'a123456 123qwe qwe123 112233 121212 159753 147258 741852 987654321 999999 888888 ' +
    '666666 11111111 123321 123abc 0123456789 abcd1234 asdfgh zxcvbn asdf1234 1q2w3e ' +
    '5201314 woaini woaini520 147258369 987654123456 1234qwer q1w2e3r4 pass123 520520 ' +
    'a123456789 aa111111 qq123456 zxc123 1a2b3c4d abcdef abcdefg a1b2c3 qweasd asd123 ' +
    'test123 temp123 changeme secret123 pass1234 mypass mysql ftp123 sa123456 sa ' +
    'admin123 administrator pass admin@123 Admin123 root123 toor system server '
  ).split(/\s+/).filter(Boolean));

  /* ---------------- 弱密码判定 ---------------- */
  function charClassCount(pw) {
    let n = 0;
    if (/[a-z]/.test(pw)) n++;
    if (/[A-Z]/.test(pw)) n++;
    if (/[0-9]/.test(pw)) n++;
    if (/[^A-Za-z0-9]/.test(pw)) n++;
    return n;
  }

  /**
   * 密码强度分级：
   * 'common'    命中常见词典（高危）
   * 'very_weak' 长度 < 8（高危）
   * 'weak'      长度 < 10 且字符类别 < 3，或单一字符类别（低危）
   * 'ok'        通过
   */
  function strengthLevel(pw) {
    if (!pw) return 'ok';
    if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'common';
    if (pw.length < 8) return 'very_weak';
    const classes = charClassCount(pw);
    if (pw.length < 10 && classes < 3) return 'weak';
    if (classes <= 1) return 'weak';
    return 'ok';
  }

  /* ---------------- 本地体检 ---------------- */
  /**
   * 分析条目列表，产出检查结果。
   * @param {Array<{id,owner,account,password,url,category,note,created_at,updated_at}>} entries
   * @param {{staleMonths?:number, now?:number}} opts  staleMonths<=0 表示不检查陈旧
   * @returns {{findings:Array, summary:{high:number,medium:number,low:number,info:number}}}
   */
  function analyze(entries, opts = {}) {
    const staleMonths = opts.staleMonths ?? 12;
    const now = opts.now ?? Date.now();
    const findings = [];

    // 1. 重复密码：同密码用于多个条目（分组为一条发现）
    const byPw = new Map();
    for (const e of entries) {
      if (!e.password) continue;
      if (!byPw.has(e.password)) byPw.set(e.password, []);
      byPw.get(e.password).push(e);
    }
    for (const list of byPw.values()) {
      if (list.length >= 2) {
        findings.push({
          type: 'reused',
          level: list.length >= 3 ? 'high' : 'medium',
          entryIds: list.map((e) => e.id),
          title: `同一密码用于 ${list.length} 个条目`,
          detail: list.map((e) => label(e)).join('、'),
        });
      }
    }

    // 2. 弱密码（逐条目）
    for (const e of entries) {
      if (!e.password) continue;
      const lv = strengthLevel(e.password);
      if (lv === 'common') {
        findings.push({ type: 'weak', level: 'high', entryIds: [e.id], title: '常见弱密码', detail: `「${label(e)}」的密码在常见弱密码清单中` });
      } else if (lv === 'very_weak') {
        findings.push({ type: 'weak', level: 'high', entryIds: [e.id], title: '密码过短', detail: `「${label(e)}」的密码不足 8 位` });
      } else if (lv === 'weak') {
        findings.push({ type: 'weak', level: 'low', entryIds: [e.id], title: '密码复杂度不足', detail: `「${label(e)}」的密码长度或字符组合单一` });
      }
    }

    // 3. 信息不完整（逐条目）
    for (const e of entries) {
      const missing = [];
      if (!String(e.account || '').trim()) missing.push('账户');
      if (!String(e.password || '').trim()) missing.push('密码');
      if (missing.length) {
        findings.push({
          type: 'incomplete',
          level: missing.includes('密码') ? 'medium' : 'low',
          entryIds: [e.id],
          title: '信息不完整',
          detail: `「${label(e)}」缺少${missing.join('、')}`,
        });
      }
    }

    // 4. 陈旧密码（逐条目，按 updated_at）
    if (staleMonths > 0) {
      const cutoff = now - staleMonths * 30.5 * 864e5;
      for (const e of entries) {
        const t = Date.parse(e.updated_at || e.created_at || '');
        if (!Number.isNaN(t) && t < cutoff) {
          findings.push({ type: 'stale', level: 'info', entryIds: [e.id], title: '长期未更新', detail: `「${label(e)}」超过 ${staleMonths} 个月未修改` });
        }
      }
    }

    const summary = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of findings) summary[f.level]++;
    // 排序：高危在前
    const order = { high: 0, medium: 1, low: 2, info: 3 };
    findings.sort((a, b) => order[a.level] - order[b.level]);
    return { findings, summary };
  }

  function label(e) {
    const owner = String(e.owner || '').trim() || '(未命名)';
    const account = String(e.account || '').trim();
    return account ? `${owner}/${account}` : owner;
  }

  /* ---------------- HIBP k-匿名泄露查询 ---------------- */

  /** SHA-1 十六进制大写（WebCrypto） */
  async function sha1Hex(text, cryptoObj) {
    const c = cryptoObj || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c || !c.subtle) throw new Error('当前环境无 WebCrypto，无法进行泄露查询');
    const buf = await c.subtle.digest('SHA-1', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  /** SHA-1 集合 → { 前缀5位 → 后缀Set } 分桶 */
  function buildRangeBuckets(sha1Set) {
    const m = new Map();
    for (const h of sha1Set) {
      const p = h.slice(0, 5), s = h.slice(5);
      if (!m.has(p)) m.set(p, new Set());
      m.get(p).add(s);
    }
    return m;
  }

  /** 解析 HIBP range API 响应文本 → { 后缀 → 出现次数 } */
  function parsePwnedRange(text) {
    const m = new Map();
    for (const line of String(text).split('\n')) {
      const i = line.indexOf(':');
      if (i <= 0) continue;
      const suffix = line.slice(0, i).trim().toUpperCase();
      const count = parseInt(line.slice(i + 1).trim(), 10);
      if (suffix && Number.isFinite(count)) m.set(suffix, count);
    }
    return m;
  }

  /**
   * 批量泄露查询（k-匿名）。
   * @param {string[]} passwords 待查密码（自动去重）
   * @param {(url:string)=>Promise<string>} fetchFn 返回响应文本（如 agentFetch 包装）
   * @param {object} [cryptoObj] 可选 crypto（默认 globalThis.crypto）
   * @param {(done:number,total:number)=>void} [onProgress]
   * @returns {Promise<Map<string,number>>} 密码 → 泄露次数（仅收录 >0）
   */
  async function checkPwned(passwords, fetchFn, cryptoObj, onProgress) {
    const pwByHash = new Map();
    for (const pw of new Set(passwords)) {
      if (!pw) continue;
      const h = await sha1Hex(pw, cryptoObj);
      if (!pwByHash.has(h)) pwByHash.set(h, []);
      pwByHash.get(h).push(pw);
    }
    const buckets = buildRangeBuckets(pwByHash.keys());
    const result = new Map();
    let done = 0;
    for (const [prefix] of buckets) {
      const text = await fetchFn('https://api.pwnedpasswords.com/range/' + prefix);
      const counts = parsePwnedRange(text);
      for (const [suffix, count] of counts) {
        const h = prefix + suffix;
        if (pwByHash.has(h) && count > 0) for (const pw of pwByHash.get(h)) result.set(pw, count);
      }
      if (onProgress) onProgress(++done, buckets.size);
    }
    return result;
  }

  return { analyze, strengthLevel, charClassCount, sha1Hex, buildRangeBuckets, parsePwnedRange, checkPwned, COMMON_PASSWORDS };
});
