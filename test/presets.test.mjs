// presets.test.mjs —— 预置所属库 + TOTP 分渠道指南数据结构与匹配逻辑（v3.3.0）
import assert from 'node:assert/strict';

await import('../public/presets.js');

const PRESETS = globalThis.PB_PRESETS;
const match = globalThis.pbPresetMatch;

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// 结构校验
ok(Array.isArray(PRESETS) && PRESETS.length === 15, '共 15 条预置（14 + Steam）');
for (const p of PRESETS) {
  ok(typeof p.name === 'string' && p.name.length > 0, p.name + ' 有名称');
  ok(typeof p.domain === 'string' && p.domain.includes('.'), p.name + ' 有域名');
  ok(Array.isArray(p.aliases) && p.aliases.length > 0, p.name + ' 有别名');
  ok(p.totp && typeof p.totp.supported === 'boolean', p.name + ' totp.supported 是布尔');
  if (p.totp.supported) ok(p.totp.steps.length >= 4, p.name + ' 有步骤');
}
const steam = PRESETS.find((p) => p.name === 'Steam');
ok(steam && steam.totp.supported === false, 'Steam 不支持标准 TOTP');
ok(steam.totp.note && steam.totp.note.includes('5 位'), 'Steam 说明含自家算法提示');
ok(new Set(PRESETS.map((p) => p.name)).size === 15, '名称不重复');

// 匹配：名称/别名（不区分大小写、包含）
ok(match('GitHub') === PRESETS[0], '精确名称 GitHub');
ok(match('github 主账号') && match('github 主账号').name === 'GitHub', '包含 github');
ok(match('GH 工作号') && match('GH 工作号').name === 'GitHub', '别名 gh 大写');
ok(match('谷歌邮箱') && match('谷歌邮箱').name === 'Google', '中文别名 谷歌');
ok(match('小米') && match('小米').name === '小米', '中文名称 小米');
ok(match('Steam 主') && match('Steam 主').name === 'Steam', 'Steam 命中');

// 匹配：域名/URL 归一
ok(match('https://github.com') && match('https://github.com').name === 'GitHub', 'URL github.com');
ok(match('https://www.google.com/search') && match('https://www.google.com/search').name === 'Google', 'www 子域名归一');
ok(match('account.xiaomi.com') && match('account.xiaomi.com').name === '小米', '域名 account.xiaomi.com');
ok(match('https://chatgpt.com') && match('https://chatgpt.com').name === 'OpenAI', 'chatgpt 别名域名');

// 不命中
ok(match('') === null, '空串不命中');
ok(match(null) === null, 'null 不命中');
ok(match('本地测试站') === null, '未收录不命中');

console.log(`${pass}/${pass} 通过 presets`);
