/* 密码本 · 数据库文件加密（UMD：浏览器与 Node 双端可用）
 * 文件级 AES-256-GCM 加密 + PBKDF2-SHA256 密钥派生。
 * 文件格式：magic("PBENC1", 6B) + salt(16B) + iv(12B) + ciphertext(含 GCM tag)
 * 解密后的明文只存在于内存（sql.js），搜索/联想等全部功能不受影响。
 */
(function (root) {
  'use strict';

  const MAGIC = 'PBENC1';
  const MAGIC_LEN = 6;
  const SALT_LEN = 16;
  const IV_LEN = 12;
  const HEADER_LEN = MAGIC_LEN + SALT_LEN + IV_LEN; // 34
  const ITERATIONS = 150000;

  const subtle = (typeof crypto !== 'undefined' && crypto.subtle) || null;

  function hasWebCrypto() { return !!subtle; }

  function te(s) { return new TextEncoder().encode(s); }

  /** 判断字节流是否为本格式的加密文件 */
  function isEncrypted(bytes) {
    if (!bytes || bytes.length <= HEADER_LEN) return false;
    // 支持普通 Uint8Array 与 ArrayBuffer 视图
    const b0 = bytes[0], b1 = bytes[1], b2 = bytes[2], b3 = bytes[3], b4 = bytes[4], b5 = bytes[5];
    return b0 === 0x50 && b1 === 0x42 && b2 === 0x45 && b3 === 0x4E && b4 === 0x43 && b5 === 0x31; // "PBENC1"
  }

  /** 生成随机 salt */
  function newSalt() { return crypto.getRandomValues(new Uint8Array(SALT_LEN)); }

  /** 由密钥材料 + salt 派生 AES-GCM 密钥（非导出） */
  async function deriveKey(password, salt) {
    if (!subtle) throw new Error('当前环境不支持 WebCrypto（需 HTTPS 或应用内打开）');
    const km = await subtle.importKey('raw', te(password), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
      km,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /** 加密：用会话内已派生的密钥加密整库字节（随机新 IV，保留原 salt） */
  async function encryptBytes(bytes, key, salt) {
    if (!subtle) throw new Error('当前环境不支持 WebCrypto');
    const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
    const out = new Uint8Array(HEADER_LEN + ct.length);
    out.set(te(MAGIC), 0);
    out.set(salt, MAGIC_LEN);
    out.set(iv, MAGIC_LEN + SALT_LEN);
    out.set(ct, HEADER_LEN);
    return out;
  }

  /** 解密：从文件头取 salt/iv，用已派生密钥解出明文字节。密码错误时抛异常 */
  async function decryptBytes(fileBytes, key) {
    if (!subtle) throw new Error('当前环境不支持 WebCrypto');
    if (!isEncrypted(fileBytes)) throw new Error('文件未加密或格式不正确');
    const iv = fileBytes.slice(MAGIC_LEN + SALT_LEN, HEADER_LEN);
    const ct = fileBytes.slice(HEADER_LEN);
    try {
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
      return new Uint8Array(pt);
    } catch {
      throw new Error('解密失败：密钥错误或文件损坏');
    }
  }

  /** 取文件头里的 salt（用于按文件派生密钥） */
  function saltOf(fileBytes) {
    return fileBytes.slice(MAGIC_LEN, MAGIC_LEN + SALT_LEN);
  }

  const DbCrypto = { isEncrypted, hasWebCrypto, newSalt, deriveKey, encryptBytes, decryptBytes, saltOf, ITERATIONS, HEADER_LEN };
  if (typeof module === 'object' && module.exports) module.exports = DbCrypto;
  root.DbCrypto = DbCrypto;
})(typeof globalThis !== 'undefined' ? globalThis : this);
