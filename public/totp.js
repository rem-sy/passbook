/**
 * 密码本 · TOTP 动态验证码（RFC 6238 / RFC 4648）
 * 算法：WebCrypto HMAC-SHA-1，默认 30s / 6 位（业界标准，兼容 Google Authenticator 等）
 * 支持 otpauth:// URI 解析（自动提取 secret / 位数 / 周期）
 * 浏览器 (window.PassTotp) 与 Node (module.exports) 双端可用。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassTotp = factory();
})(globalThis, function () {
  'use strict';

  const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  /** base32 解码（RFC 4648；忽略空格/连字符/填充；小写自动转大写） */
  function base32Decode(input) {
    const clean = String(input || '').toUpperCase().replace(/[\s\-=]/g, '');
    if (!clean) throw new Error('密钥为空');
    let bits = 0, val = 0;
    const out = [];
    for (const ch of clean) {
      const idx = B32_ALPHABET.indexOf(ch);
      if (idx < 0) throw new Error('无效的 base32 字符: ' + ch);
      val = (val << 5) | idx;
      bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
    }
    if (!out.length) throw new Error('密钥为空');
    return new Uint8Array(out);
  }

  /** 校验是否为合法 base32（用于表单） */
  function isValidSecret(input) {
    try { return base32Decode(input).length >= 5; } catch { return false; }
  }

  /** 归一化：去空格/填充、大写（存库格式） */
  function normalizeSecret(input) {
    return String(input || '').toUpperCase().replace(/[\s\-=]/g, '');
  }

  /**
   * 解析 otpauth:// URI
   * otpauth://totp/Issuer:account?secret=XXX&digits=6&period=30&algorithm=SHA1
   */
  function parseOtpauthUri(uri) {
    const u = new URL(String(uri).trim());
    if (u.protocol !== 'otpauth:') throw new Error('不是 otpauth:// 链接');
    const params = u.searchParams;
    const secret = params.get('secret') || '';
    if (!secret) throw new Error('链接缺少 secret 参数');
    const label = decodeURIComponent((u.pathname || '').replace(/^\/+/, ''));
    let issuer = params.get('issuer') || '';
    let account = label;
    const ci = label.indexOf(':');
    if (ci >= 0) { issuer = issuer || label.slice(0, ci); account = label.slice(ci + 1); }
    const algorithm = (params.get('algorithm') || 'SHA1').toUpperCase().replace('-', '');
    if (algorithm !== 'SHA1' && algorithm !== 'SHA256' && algorithm !== 'SHA512') throw new Error('不支持的算法: ' + algorithm);
    return {
      secret: normalizeSecret(secret),
      issuer,
      account: account.trim(),
      digits: Math.min(10, Math.max(6, parseInt(params.get('digits') || '6', 10) || 6)),
      period: Math.min(120, Math.max(5, parseInt(params.get('period') || '30', 10) || 30)),
      algorithm,
    };
  }

  /** 从任意用户输入提取密钥：直接 base32 或 otpauth:// 链接 */
  function extractSecret(input) {
    const s = String(input || '').trim();
    if (!s) return '';
    if (/^otpauth:\/\//i.test(s)) return parseOtpauthUri(s).secret;
    return normalizeSecret(s);
  }

  /**
   * 生成 TOTP 码
   * @param {string} secret base32 密钥
   * @param {{time?:number, step?:number, digits?:number, cryptoObj?:object}} [opts]
   * @returns {Promise<{code:string, remaining:number, period:number}>} code + 本周期剩余秒数
   */
  async function generateTotp(secret, opts = {}) {
    const step = opts.step ?? 30;
    const digits = opts.digits ?? 6;
    const t = opts.time ?? Date.now();
    const c = opts.cryptoObj || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c || !c.subtle) throw new Error('当前环境无 WebCrypto，无法生成验证码');

    const counter = Math.floor(t / 1000 / step);
    const msg = new Uint8Array(8);
    new DataView(msg.buffer).setUint32(4, counter); // 高 32 位恒 0（counter < 2^32）
    const keyBytes = base32Decode(secret);

    const keyObj = await c.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    const sig = new Uint8Array(await c.subtle.sign('HMAC', keyObj, msg));
    const offset = sig[sig.length - 1] & 0x0f;
    const bin = ((sig[offset] & 0x7f) << 24) | (sig[offset + 1] << 16) | (sig[offset + 2] << 8) | sig[offset + 3];
    const code = String(bin % 10 ** digits).padStart(digits, '0');
    return { code, remaining: step - (Math.floor(t / 1000) % step), period: step };
  }

  return { base32Decode, isValidSecret, normalizeSecret, parseOtpauthUri, extractSecret, generateTotp };
});
