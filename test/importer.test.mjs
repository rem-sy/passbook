import test from 'node:test';
import assert from 'node:assert/strict';

/* importer.js 纯函数在 Node 的装载（同 qr.test.mjs 惯例：eval + window） */
globalThis.window = globalThis;
const src = (await import('node:fs')).readFileSync(new URL('../public/importer.js', import.meta.url), 'utf8');
(0, eval)(src);
const P = globalThis.window.PassImporter;

/* Chrome 真实导出样例（列头 name,url,username,password,note；含 BOM/CRLF/引号转义/逗号在引号内/空密码行） */
const CHROME_CSV = '\uFEFFname,url,username,password,note\r\n'
  + 'GitHub,https://github.com,me@example.com,"p@ss,""quoted"",w0rd",主力\r\n'
  + '网银,https://bank.example.com/login,zhang3,\r\n'
  + 'Example,https://example.com,user1,plain123,\r\n';

/* Edge 同源（个别版本无 note 列） */
const EDGE_CSV = 'name,url,username,password\r\n'
  + 'Edge Site,https://edge.example.com,e@x.com,edgepw\r\n';

/* Firefox 真实导出样例（url,username,password,httpRealm,formActionOrigin,guid,...） */
const FIREFOX_CSV = '"url","username","password","httpRealm","formActionOrigin","guid","timeCreated","timeLastUsed","timePasswordChanged"\r\n'
  + '"https://firefox.example.com","ff@x.com","ffpw","","","{abc-123}","0","0","0"\r\n';

/* Edge 真实导出含无 name 变体（表头变体：website/login/备注中文表头 + 乱序列序） */
const VARIANT_CSV = '登录地址,用户名,密码,所属,备注\r\n'
  + 'https://zh.example.com,中文用户,zh密码,中文站点,中文备注\r\n';

test('parseCsv：BOM 去除 + CRLF 兼容 + 引号转义 + 逗号在引号内', () => {
  const rows = P.parseCsv(CHROME_CSV);
  assert.equal(rows.length, 4); // 表头 + 3 数据行（全空行不计）
  assert.equal(rows[0][0], 'name'); // BOM 已去
  assert.deepEqual(rows[1], ['GitHub', 'https://github.com', 'me@example.com', 'p@ss,"quoted",w0rd', '主力']);
});

test('parseCsv：CR 单独换行与末尾无换行也能出最后一行', () => {
  const rows = P.parseCsv('a,b\r1,2');
  assert.deepEqual(rows, [['a', 'b'], ['1', '2']]);
});

test('detectColumns：Chrome 列序 + name 不抢占 username', () => {
  const cols = P.detectColumns(['name', 'url', 'username', 'password', 'note']);
  assert.deepEqual(cols, { owner: 0, url: 1, account: 2, password: 3, note: 4 });
});

test('detectColumns：Firefox 长表头（无 name 列）', () => {
  const cols = P.detectColumns(['url', 'username', 'password', 'httpRealm', 'formActionOrigin', 'guid']);
  assert.equal(cols.url, 0);
  assert.equal(cols.account, 1);
  assert.equal(cols.password, 2);
  assert.equal(cols.owner, -1);
});

test('detectColumns：中文表头乱序也能映射', () => {
  const cols = P.detectColumns(['登录地址', '用户名', '密码', '所属', '备注']);
  assert.deepEqual(cols, { url: 0, account: 1, password: 2, owner: 3, note: 4 });
});

test('detectFormat：Chrome/Edge/Firefox/未识别', () => {
  assert.equal(P.detectFormat(['name', 'url', 'username', 'password', 'note']), 'chrome');
  assert.equal(P.detectFormat(['name', 'url', 'username', 'password']), 'chrome'); // Edge 同源
  assert.equal(P.detectFormat(['url', 'username', 'password', 'httpRealm', 'formActionOrigin']), 'firefox');
  assert.equal(P.detectFormat(['foo', 'bar']), null);
});

test('parseBrowserCsv：Chrome 样例（空密码跳过计数 + 引号容错）', () => {
  const r = P.parseBrowserCsv(CHROME_CSV, []);
  assert.ok(r.ok);
  assert.equal(r.format, 'chrome');
  assert.equal(r.total, 2);
  assert.equal(r.skippedEmpty, 1); // 网银行密码为空
  assert.equal(r.rows[0].password, 'p@ss,"quoted",w0rd');
  assert.equal(r.rows[0].note, '主力');
});

test('parseBrowserCsv：Edge 无 note 列', () => {
  const r = P.parseBrowserCsv(EDGE_CSV, []);
  assert.ok(r.ok);
  assert.equal(r.format, 'chrome');
  assert.equal(r.rows[0].note, '');
});

test('parseBrowserCsv：Firefox 样例（无 name 列时用网址兜底所属）', () => {
  const r = P.parseBrowserCsv(FIREFOX_CSV, []);
  assert.ok(r.ok);
  assert.equal(r.format, 'firefox');
  assert.equal(r.rows[0].owner, 'https://firefox.example.com');
  assert.equal(r.rows[0].password, 'ffpw');
});

test('parseBrowserCsv：表头中文变体乱序', () => {
  const r = P.parseBrowserCsv(VARIANT_CSV, []);
  assert.ok(r.ok);
  const row = r.rows[0];
  assert.equal(row.owner, '中文站点');
  assert.equal(row.url, 'https://zh.example.com');
  assert.equal(row.account, '中文用户');
  assert.equal(row.password, 'zh密码');
  assert.equal(row.note, '中文备注');
});

test('重复检测：同网址（协议/www 大小写不敏感）+ 同账户算重复', () => {
  const csv = 'name,url,username,password\r\n'
    + 'A,https://www.Example.com/,u1,pw1\r\n'
    + 'B,http://example.com,u1,pw2\r\n'   // 与上行同站点键 + 同账户 → 文件内重复
    + 'C,https://example.com,u2,pw3\r\n'; // 账户不同 → 不重复
  const r = P.parseBrowserCsv(csv, []);
  assert.equal(r.total, 3);
  assert.equal(r.dupCount, 1);
});

test('重复检测：与库内已有条目（同网址+账户）判重', () => {
  const csv = 'name,url,username,password\r\n'
    + 'A,https://github.com,me@x.com,pw\r\n'
    + 'B,https://github.com,other@x.com,pw\r\n';
  const existing = [{ owner: 'GitHub', account: 'ME@X.com', url: 'https://www.github.com/' }];
  const r = P.parseBrowserCsv(csv, existing);
  assert.equal(r.dupCount, 1); // 第一条与库内重复
  assert.ok(r.dupIndexes[1]);
  assert.ok(!r.dupIndexes[2]);
});

test('无网址条目退化为 所属+账户 判重', () => {
  assert.equal(P.dupKey({ owner: 'GitHub', account: 'a@b.c', url: '' }),
    '#github\u0000a@b.c');
  assert.equal(P.siteKey('https://www.GitHub.com/path?x=1'), 'github.com');
  assert.equal(P.siteKey('firefox.example.com'), 'firefox.example.com'); // 缺协议补全
});

test('未识别表头报错不崩', () => {
  const r = P.parseBrowserCsv('foo,bar\n1,2\n', []);
  assert.ok(!r.ok);
  assert.match(r.error, /账户\/密码列/);
});
