// 实测自定义渠道：连通性 → function calling → AgentCore 全链路
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/agent-core.js');
const AgentCore = globalThis.AgentCore;

const BASE = 'https://api.afsmc.cn/v1';
const KEY = 'sk-KtSiq2qwTHzMUqsUjI8FwI9KuVgAuQqIcWvsfw24dtq2xCVC';
const MODEL = 'deepseek-v4-flash';

// 1) 纯连通性
const r1 = await fetch(BASE + '/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
  body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: '只回复两个字：在线' }] }),
});
console.log('连通性:', r1.status);
if (!r1.ok) { console.log(await r1.text()); process.exit(1); }
const j1 = await r1.json();
console.log('模型回复:', j1.choices?.[0]?.message?.content?.trim());

// 2) AgentCore 全链路（真实渠道 + 假密码库）
const db = [];
const store = {
  async list({ q = '' } = {}) {
    const kw = q.trim().toLowerCase();
    const items = kw ? db.filter((x) => [x.owner, x.account, x.note].some((f) => String(f || '').toLowerCase().includes(kw))) : db;
    return { items, total: items.length };
  },
  async create(e) { const row = { id: db.length + 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...e }; db.push(row); return row; },
};
const fakeGen = { generate: () => 'Xk9$mQ2zLp7Wv4Rt', strength: () => ({ entropy: 90, label: '很强' }) };
const exec = AgentCore.createExecutor(store, fakeGen, () => {});
const events = [];

// 存
let reply = await AgentCore.chat({
  messages: [{ role: 'user', content: '帮我存一条：知乎，账户 zhihu@x.com，密码 Zhi#2024hu，备注写作号' }],
  channelFetch: fetch, url: BASE + '/chat/completions',
  headers: { Authorization: 'Bearer ' + KEY }, model: MODEL, exec,
  onEvent: (t) => events.push(t),
});
console.log('存密码回复:', reply.trim());
console.log('落库:', db.map((x) => `${x.owner}/${x.account}/${x.note}`));

// 查
reply = await AgentCore.chat({
  messages: [{ role: 'user', content: '我的写作号密码是多少？' }],
  channelFetch: fetch, url: BASE + '/chat/completions',
  headers: { Authorization: 'Bearer ' + KEY }, model: MODEL, exec,
});
console.log('查密码回复:', reply.trim());

// 生成
reply = await AgentCore.chat({
  messages: [{ role: 'user', content: '给我生成一个 20 位的强密码' }],
  channelFetch: fetch, url: BASE + '/chat/completions',
  headers: { Authorization: 'Bearer ' + KEY }, model: MODEL, exec,
});
console.log('生成密码回复:', reply.trim());
console.log('工具事件序列:', events.join(','));
console.log(db.length === 1 ? '全链路 PASS' : '落库数量异常');
