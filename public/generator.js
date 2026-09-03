/**
 * 密码本 · 密码生成器
 * 支持：指定长度、字符集选择（大小写/数字/符号）、自定义符号集、
 *       排除易混淆字符、键盘布局不连续、防连续相同、防顺序序列、自定义排除字符
 * 浏览器 (window.PassGen) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassGen = factory();
})(globalThis, function () {
  'use strict';

  const CHARSETS = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digit: '0123456789',
    symbol: '!@#$%^&*()-_=+[]{};:,.<>?/~',
  };

  // 易混淆字符：默认排除，避免 0/O、1/l/I 等混淆
  const AMBIGUOUS = new Set('0O1lI|`\'".,:;()[]{}<>');

  // QWERTY 键盘坐标（列带错位偏移），用于"键盘布局不连续"
  const KB_ROWS = [
    { y: 0, x0: 0, chars: '1234567890-=', extras: { '-': 10, '=': 11 } },
    { y: 1, x0: 0.5, chars: 'qwertyuiop[]\\', extras: { '[': 10.5, ']': 11.5, '\\': 12.5 } },
    { y: 2, x0: 1, chars: "asdfghjkl;'", extras: { ';': 10, "'": 11 } },
    { y: 3, x0: 1.5, chars: 'zxcvbnm,./', extras: { ',': 8.5, '.': 9.5, '/': 10.5 } },
  ];
  const KB_MAP = {};
  for (const row of KB_ROWS) {
    for (let i = 0; i < row.chars.length; i++) {
      const ch = row.chars[i];
      if (/[a-z0-9]/.test(ch)) KB_MAP[ch] = { x: row.x0 + i, y: row.y };
    }
    for (const [ch, x] of Object.entries(row.extras || {})) KB_MAP[ch] = { x, y: row.y };
  }

  function kbAdjacent(a, b) {
    const pa = KB_MAP[a], pb = KB_MAP[b];
    if (!pa || !pb) return false; // 不在键盘映射里的字符（如中文/emoji）不参与判断
    return Math.abs(pa.x - pb.x) <= 1.15 && Math.abs(pa.y - pb.y) <= 1;
  }

  function isLetter(c) { return /[a-zA-Z]/.test(c); }
  function isDigit(c) { return /[0-9]/.test(c); }

  // 顺序序列：a→b、1→2 或 b→a、2→1
  function isSequential(a, b) {
    if (a === b) return false;
    if ((isLetter(a) && isLetter(b)) || (isDigit(a) && isDigit(b))) {
      return Math.abs(a.charCodeAt(0) - b.charCodeAt(0)) === 1;
    }
    return false;
  }

  function secureRandomInt(max) {
    // 无偏随机（拒绝采样）
    const limit = Math.floor(0x100000000 / max) * max;
    const buf = new Uint32Array(1);
    let x;
    do {
      crypto.getRandomValues(buf);
      x = buf[0];
    } while (x >= limit);
    return x % max;
  }

  /**
   * 生成密码
   * @param {Object} opts
   *  - length: 长度 (默认 16, 4-128)
   *  - upper/lower/digit/symbol: 是否包含各类 (默认全开)
   *  - symbols: 自定义符号集 (默认 CHARSETS.symbol)
   *  - excludeAmbiguous: 排除易混淆字符 (默认 true)
   *  - excludeChars: 额外排除的字符 (字符串)
   *  - noKeyboardAdjacent: 键盘布局不连续 (默认 false)
   *  - noRepeat: 不允许连续相同字符 (默认 false)
   *  - noSequence: 不允许顺序/倒序字符对 (默认 false)
   *  - ensureEach: 每类至少一个 (默认 true)
   * @returns {string}
   */
  function generate(opts = {}) {
    const rawLen = Number(opts.length);
    if (opts.length !== undefined && (!Number.isFinite(rawLen) || rawLen < 4 || rawLen > 128)) {
      throw new Error('长度需在 4-128 之间');
    }
    const length = clampInt(opts.length, 4, 128, 16);
    const use = {
      upper: opts.upper !== false,
      lower: opts.lower !== false,
      digit: opts.digit !== false,
      symbol: opts.symbol !== false,
    };
    const symbols = typeof opts.symbols === 'string' && opts.symbols ? opts.symbols : CHARSETS.symbol;
    const excludeAmbiguous = opts.excludeAmbiguous !== false;
    const excludeChars = typeof opts.excludeChars === 'string' ? opts.excludeChars : '';
    const noKeyboardAdjacent = !!opts.noKeyboardAdjacent;
    const noRepeat = !!opts.noRepeat;
    const noSequence = !!opts.noSequence;
    const ensureEach = opts.ensureEach !== false;

    const active = [];
    if (use.upper) active.push(CHARSETS.upper);
    if (use.lower) active.push(CHARSETS.lower);
    if (use.digit) active.push(CHARSETS.digit);
    if (use.symbol) active.push(symbols);
    if (!active.length) throw new Error('至少需要选择一种字符类型');

    // 字符池
    const excluded = new Set(excludeChars.split(''));
    if (excludeAmbiguous) for (const c of AMBIGUOUS) excluded.add(c);
    const pool = [...new Set(active.join('').split(''))].filter((c) => !excluded.has(c));
    if (pool.length === 0) throw new Error('字符池为空，请检查排除设置');
    if (ensureEach && length < active.length) {
      throw new Error(`长度 ${length} 不足以容纳 ${active.length} 类字符，请至少设为 ${active.length}`);
    }

    const ok = (prev, c) => {
      if (noRepeat && c === prev) return false;
      if (noSequence && isSequential(prev, c)) return false;
      if (noKeyboardAdjacent && kbAdjacent(prev, c)) return false;
      return true;
    };

    // 构建：ensureEach 时先每类取一个，再补随机，全程校验约束；失败则整体重试
    const MAX_TRIES = 200;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const out = [];
      const used = new Set();
      const classes = active.slice();

      // 阶段一：每类贡献一个字符（乱序保证均匀）
      while (classes.length) {
        const ci = secureRandomInt(classes.length);
        const cls = classes.splice(ci, 1)[0];
        const members = cls.split('').filter((c) => !excluded.has(c));
        if (!members.length) continue;
        // 找满足约束的字符，最多试 50 次，找不到则换一个成员继续
        let picked = null;
        for (let t = 0; t < 60 && !picked; t++) {
          const c = members[secureRandomInt(members.length)];
          if (ok(out[out.length - 1] || '', c)) picked = c;
        }
        if (!picked) break; // 本类无法满足 → 整体重试
        out.push(picked);
        used.add(picked);
      }
      if (classes.length) continue; // 上一轮没走完 → 重试

      // 阶段二：补齐到目标长度
      let okPhase2 = true;
      while (out.length < length) {
        const c = pool[secureRandomInt(pool.length)];
        if (ok(out[out.length - 1] || '', c)) out.push(c);
        else {
          // 连续失败太多次说明约束过紧，直接整体重试
          if (out.length > 0 && !tryFill(pool, ok, out)) { okPhase2 = false; break; }
        }
      }
      if (!okPhase2) continue;
      if (ensureEach) {
        const present = new Set(out);
        if (!active.every((cls) => cls.split('').some((c) => present.has(c)))) continue;
      }
      return out.join('');
    }
    throw new Error('约束过严，无法生成（请放宽选项，如长度或字符类型）');
  }

  function tryFill(pool, ok, out) {
    // 尝试向前补齐：从池中找一个能接在末尾的字符
    for (let i = 0; i < 40; i++) {
      const c = pool[secureRandomInt(pool.length)];
      if (ok(out[out.length - 1] || '', c)) { out.push(c); return true; }
    }
    return false;
  }

  function clampInt(v, min, max, dflt) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /** 熵值估算（比特） */
  function entropy(opts = {}) {
    const length = clampInt(opts.length, 4, 128, 16);
    const symbols = typeof opts.symbols === 'string' && opts.symbols ? opts.symbols : CHARSETS.symbol;
    let poolSize = 0;
    if (opts.upper !== false) poolSize += CHARSETS.upper.length;
    if (opts.lower !== false) poolSize += CHARSETS.lower.length;
    if (opts.digit !== false) poolSize += CHARSETS.digit.length;
    if (opts.symbol !== false) poolSize += symbols.length;
    if (opts.excludeChars) {
      // 粗略扣除排除的字符（可能与池中字符重叠，仅估算）
      for (const c of opts.excludeChars) if (/[a-zA-Z0-9]/.test(c)) poolSize = Math.max(0, poolSize - 1);
    }
    return poolSize > 0 ? Math.round(length * Math.log2(poolSize)) : 0;
  }

  function strengthLabel(bits) {
    if (bits >= 90) return { label: '极强', cls: 's5' };
    if (bits >= 70) return { label: '很强', cls: 's4' };
    if (bits >= 50) return { label: '强', cls: 's3' };
    if (bits >= 35) return { label: '中', cls: 's2' };
    return { label: '弱', cls: 's1' };
  }

  return { generate, entropy, strengthLabel, CHARSETS, AMBIGUOUS };
});
