import test from 'node:test';
import assert from 'node:assert/strict';

/* agent-check.js 纯函数在 Node 的装载（同 importer.test 惯例） */
globalThis.window = globalThis;
const src = (await import('node:fs')).readFileSync(new URL('../public/agent-check.js', import.meta.url), 'utf8');
(0, eval)(src);
const A = globalThis.window.PassAgentCheck;

/* ---------------- URL 拼接 ---------------- */
test('modelsUrl / chatUrl：去尾部斜杠 + 标准端点（与主管线同规则）', () => {
  assert.equal(A.modelsUrl('https://api.deepseek.com/v1'), 'https://api.deepseek.com/v1/models');
  assert.equal(A.modelsUrl('https://api.deepseek.com/v1/'), 'https://api.deepseek.com/v1/models');
  assert.equal(A.modelsUrl('https://api.deepseek.com/v1///'), 'https://api.deepseek.com/v1/models');
  assert.equal(A.chatUrl('https://x.example/'), 'https://x.example/chat/completions');
  assert.equal(A.modelsUrl('  https://x.example  '), 'https://x.example/models'); // 去首尾空白
  assert.equal(A.modelsUrl(''), '/models'); // 空地址由调用方拦截，这里只保证不抛
});

test('authHeaders：有 Key 加 Bearer，无 Key 不加（本地 Ollama 无需 Key）', () => {
  assert.equal(A.authHeaders('sk-abc')['Authorization'], 'Bearer sk-abc');
  assert.equal(A.authHeaders('  sk-abc  ')['Authorization'], 'Bearer sk-abc');
  assert.equal(A.authHeaders('')['Authorization'], undefined);
  assert.equal(A.authHeaders(null)['Authorization'], undefined);
  assert.equal(A.authHeaders('k', { 'Content-Type': 'application/json' })['Content-Type'], 'application/json');
});

/* ---------------- /models 响应解析 ---------------- */
test('parseModels：OpenAI 标准 {data:[{id}]}', () => {
  const r = A.parseModels(JSON.stringify({ data: [{ id: 'b-model' }, { id: 'a-model' }] }));
  assert.equal(r.ok, true);
  assert.deepEqual(r.models, ['a-model', 'b-model']); // 字典序
  assert.equal(r.total, 2);
});

test('parseModels：裸数组 / Ollama {models:[{name}]} / 字符串项 均兼容', () => {
  assert.deepEqual(A.parseModels(JSON.stringify(['m2', 'm1'])).models, ['m1', 'm2']);
  assert.deepEqual(A.parseModels(JSON.stringify({ models: [{ name: 'llama3' }] })).models, ['llama3']);
});

test('parseModels：去重 + 上限 200 + 空列表/坏 JSON 报错', () => {
  const dup = A.parseModels(JSON.stringify({ data: [{ id: 'm' }, { id: 'm' }] }));
  assert.equal(dup.total, 1);
  const big = A.parseModels(JSON.stringify({ data: Array.from({ length: 260 }, (_, i) => ({ id: 'm' + i })) }));
  assert.equal(big.models.length, 200);
  assert.equal(big.total, 260);
  assert.equal(A.parseModels('{"data":[]}').ok, false);
  assert.equal(A.parseModels('not json').error, '响应不是合法 JSON');
  assert.equal(A.parseModels('{"foo":1}').ok, false);
});

/* ---------------- 探活请求体 ---------------- */
test('buildPingBody：最小非流式对话', () => {
  const b = JSON.parse(A.buildPingBody('deepseek-chat'));
  assert.equal(b.model, 'deepseek-chat');
  assert.equal(b.stream, false);
  assert.equal(b.max_tokens, 8);
  assert.equal(b.messages[0].content, 'ping');
});

/* ---------------- 探活结果判定 ---------------- */
test('evalPing：2xx → 可用 + 延迟 + 回显模型', () => {
  const r = A.evalPing(200, JSON.stringify({ model: 'deepseek-chat', choices: [] }), 523);
  assert.equal(r.ok, true);
  assert.equal(r.latencyMs, 523);
  assert.equal(r.model, 'deepseek-chat');
  assert.ok(r.message.includes('523ms'));
});

test('evalPing：401/403 → 鉴权失败；404 → 地址或模型；429 → 限流；5xx → 通用', () => {
  assert.ok(A.evalPing(401, '{}', 10).message.includes('鉴权失败'));
  assert.ok(A.evalPing(403, '{}', 10).message.includes('鉴权失败'));
  assert.ok(A.evalPing(404, '{}', 10).message.includes('接口地址或模型名'));
  assert.ok(A.evalPing(429, '{}', 10).message.includes('额度'));
  const r500 = A.evalPing(500, JSON.stringify({ error: { message: 'upstream down' } }), 10);
  assert.ok(r500.message.includes('upstream down'));
  assert.equal(r500.ok, false);
});

test('briefError：优先取 error.message，其次 message，非 JSON 截断原文', () => {
  assert.equal(A.briefError(JSON.stringify({ error: { message: 'bad key' } })), 'bad key');
  assert.equal(A.briefError(JSON.stringify({ message: 'quota' })), 'quota');
  assert.equal(A.briefError('plain text error'), 'plain text error');
  assert.equal(A.briefError(''), '');
});
