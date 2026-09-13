import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

require('../public/agent-core.js');
const { TOOLS, SYSTEM_PROMPT, TOOL_LABELS, createExecutor, chat } = globalThis.AgentCore;

// ---------- 测试用假密码库 ----------
function mockStore(items = []) {
  let seq = 1;
  const db = items.map((x) => ({ id: seq++, created_at: '2024-01-01', updated_at: '2024-01-01', ...x }));
  return {
    async list({ q = '' } = {}) {
      const kw = q.trim().toLowerCase();
      const items2 = kw
        ? db.filter((x) => [x.owner, x.account, x.url, x.category, x.note].some((f) => String(f || '').toLowerCase().includes(kw)))
        : db;
      return { items: items2, total: items2.length };
    },
    async create(entry) {
      const row = { id: seq++, created_at: '2024-01-02', updated_at: '2024-01-02', ...entry };
      db.push(row);
      return row;
    },
    async update(id, patch) {
      const row = db.find((x) => x.id === id);
      if (!row) throw new Error('记录不存在');
      Object.assign(row, patch, { updated_at: '2024-01-03' });
      return row;
    },
    dump: () => db,
  };
}

const fakeGen = {
  generate: (o) => 'Xk9$mQ2zLp7Wv4Rt'.slice(0, Math.min(o.length || 16, 18)),
  strength: () => ({ entropy: 90, label: '很强' }),
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('工具清单含九个能力且 schema 合法', () => {
  const names = TOOLS.map((t) => t.function.name);
  assert.deepEqual(names, [
    'search_passwords', 'save_password', 'list_recent_passwords', 'update_password',
    'search_notes', 'search_files', 'create_note', 'tag_items', 'generate_password',
  ]);
  for (const t of TOOLS) {
    assert.equal(t.type, 'function');
    assert.equal(typeof t.function.description, 'string');
    assert.equal(t.function.parameters.type, 'object');
  }
});

test('save_password 落库并触发 onChange', async () => {
  const s = mockStore();
  let changed = 0;
  const exec = createExecutor(s, fakeGen, () => changed++);
  const r = await exec('save_password', { owner: 'GitHub', account: 'tom@x.com', password: 'Abc!2345', note: '工作主力号' });
  assert.equal(r.ok, true);
  assert.equal(s.dump().length, 1);
  assert.equal(s.dump()[0].note, '工作主力号');
  assert.equal(changed, 1);
});

test('save_password 缺必填返回 error 不落库', async () => {
  const s = mockStore();
  const exec = createExecutor(s, fakeGen);
  const r = await exec('save_password', { owner: 'GitHub', password: 'x' });
  assert.ok(r.error);
  assert.equal(s.dump().length, 0);
});

test('search_passwords 命中所属/账户/备注：明文打码，真实值走 onDisplay', async () => {
  const s = mockStore([
    { owner: '微信', account: '138', password: 'p1', note: '老家宽带' },
    { owner: 'GitHub', account: 'tom', password: 'p2' },
  ]);
  const displays = [];
  const exec = createExecutor(s, fakeGen, null, (d) => displays.push(d));
  const r = await exec('search_passwords', { keyword: '宽带' });
  assert.equal(r.matched, 1);
  assert.equal(r.items[0].password, '🔒已打码'); // 给模型的是打码
  assert.equal(displays.length, 1); // 真实明文进应用展示链路
  assert.equal(displays[0].items[0].password, 'p1');
  assert.equal(displays[0].items[0].owner, '微信');
  const r2 = await exec('search_passwords', { keyword: 'github' });
  assert.equal(r2.matched, 1);
  assert.equal(r2.items[0].owner, 'GitHub');
});

test('save_password 返回结果不含明文密码', async () => {
  const s = mockStore();
  const displays = [];
  const exec = createExecutor(s, fakeGen, null, (d) => displays.push(d));
  const r = await exec('save_password', { owner: '网银', account: '张三', password: 'Sec!et9' });
  assert.equal(r.ok, true);
  assert.ok(!JSON.stringify(r).includes('Sec!et9')); // 回传模型的内容无明文
  assert.equal(displays[0].items[0].password, 'Sec!et9'); // 应用展示有明文
});

test('update_password 唯一匹配时改密成功且不回传明文', async () => {
  const s = mockStore([
    { owner: 'GitHub', account: 'tom', password: 'old1' },
    { owner: '微信', account: '138', password: 'wx1' },
  ]);
  const displays = [];
  let changed = 0;
  const exec = createExecutor(s, fakeGen, () => changed++, (d) => displays.push(d));
  const r = await exec('update_password', { owner: 'github', newPassword: 'New!88' });
  assert.equal(r.ok, true);
  assert.equal(r.updated.owner, 'GitHub');
  assert.ok(!JSON.stringify(r).includes('New!88')); // 回传模型无明文
  assert.equal(s.dump()[0].password, 'New!88'); // 库里已更新
  assert.equal(displays[0].items[0].password, 'New!88'); // 应用展示有明文
  assert.equal(changed, 1);
});

test('update_password 多条匹配时返回列表并提示补充账户', async () => {
  const s = mockStore([
    { owner: '微信', account: '138', password: 'a' },
    { owner: '微信', account: '139', password: 'b' },
  ]);
  const exec = createExecutor(s, fakeGen);
  const r = await exec('update_password', { owner: '微信', newPassword: 'x' });
  assert.equal(r.matched, 2);
  assert.ok(r.hint.includes('账户'));
  assert.equal(s.dump()[0].password, 'a'); // 未改动
  // 补充账户后唯一命中
  const r2 = await exec('update_password', { owner: '微信', account: '139', newPassword: 'New2!' });
  assert.equal(r2.ok, true);
  assert.equal(s.dump()[1].password, 'New2!');
});

test('update_password 未找到时报错不落库', async () => {
  const s = mockStore();
  const exec = createExecutor(s, fakeGen);
  const r = await exec('update_password', { owner: '不存在', newPassword: 'x' });
  assert.ok(r.error.includes('未找到'));
});

test('list_recent_passwords 限幅 1-30 且打码', async () => {
  const s = mockStore(Array.from({ length: 40 }, (_, i) => ({ owner: 'o' + i, account: 'a', password: 'p' })));
  const displays = [];
  const exec = createExecutor(s, fakeGen, null, (d) => displays.push(d));
  const r = await exec('list_recent_passwords', { limit: 999 });
  assert.equal(r.total, 40);
  assert.equal(r.items.length, 30);
  assert.ok(r.items.every((x) => x.password === '🔒已打码')); // 给模型打码
  assert.equal(displays.length, 1);
  assert.equal(displays[0].items.length, 30); // 应用拿到真实值
});

test('generate_password 使用注入生成器并带强度', async () => {
  const exec = createExecutor(mockStore(), fakeGen);
  const r = await exec('generate_password', { length: 12 });
  assert.equal(r.password.length, 12);
  assert.equal(r.label, '很强');
});

test('未知工具返回 error', async () => {
  const exec = createExecutor(mockStore(), fakeGen);
  const r = await exec('nope', {});
  assert.ok(r.error.includes('未知工具'));
});
/* ---------- v4.7.0 保险箱四工具（mock hub） ---------- */

function mockHub(over = {}) {
  const calls = { created: [], tagged: [], searched: [] };
  const hub = {
    calls,
    async searchNotes(keyword) {
      calls.searched.push(['notes', keyword]);
      const all = [
        { id: 1, title: '快递单号', content: '顺丰 SF1234567890，上周三到的，放在丰巢柜 03 号格口', tags: '生活', source: 'clipboard', updated_at: '2025-01-01' },
        { id: 2, title: '会议要点', content: '周一同步会：v4.7.0 发布计划 ' + '长正文'.repeat(60), tags: '工作', source: 'manual', updated_at: '2025-01-02' },
      ];
      const kw = String(keyword || '').toLowerCase();
      const items = kw ? all.filter((n) => (n.title + n.content + n.tags).toLowerCase().includes(kw)) : all;
      return { items, total: items.length };
    },
    async searchFiles(keyword) {
      calls.searched.push(['files', keyword]);
      const all = [
        { file: { id: 11, name: '体检报告.pdf', size: 2048, tags: '健康', source: 'saf', created_at: '2025-01-03', ftext: '血常规各项指标正常，体检结论为未见明显异常' }, contentHit: false },
        { file: { id: 12, name: '合同.docx', size: 4096, tags: '工作', source: 'drag', created_at: '2025-01-04', ftext: '劳动合同期限三年，自 2025 年 1 月 1 日起' }, contentHit: true },
      ];
      return { items: all, contentSearch: true };
    },
    async createNote({ content, title, tags }) {
      calls.created.push({ content, title, tags });
      return { id: 99, title: title || '首行', note: { id: 99, title: title || '首行', content, tags, source: 'manual' } };
    },
    async tagItems(tag, targets) {
      calls.tagged.push({ tag, targets });
      return { ok: true, results: targets.map((t) => ({ type: t.type, name: t.query || t.id, ok: true })) };
    },
    ...over,
  };
  return hub;
}

test('search_notes：返回≤80字摘要，全文只走 onDisplay（打码双通道）', async () => {
  const displays = [];
  const exec = createExecutor(mockStore(), fakeGen, null, (d) => displays.push(d), mockHub());
  const r = await exec('search_notes', { keyword: '快递' });
  assert.equal(r.matched, 1);
  assert.equal(r.items[0].title, '快递单号');
  assert.ok(r.items[0].preview.length <= 81); // 80字+省略号
  assert.ok(!r.items[0].content); // 不回传正文全文
  assert.equal(displays.length, 1);
  assert.equal(displays[0].kind, 'notes');
  assert.ok(displays[0].items[0].content.includes('SF1234567890')); // 应用侧拿全文
});

test('search_files：matched_meta/matched_content 双计数 + snippet 片段 + 不回传 ftext 全文', async () => {
  const displays = [];
  const exec = createExecutor(mockStore(), fakeGen, null, (d) => displays.push(d), mockHub());
  const r = await exec('search_files', { keyword: '体检 合同' });
  assert.equal(r.matched, 2);
  assert.equal(r.matched_meta, 1);
  assert.equal(r.matched_content, 1);
  const meta = r.items.find((x) => x.name === '体检报告.pdf');
  const cont = r.items.find((x) => x.name === '合同.docx');
  assert.equal(meta.snippet, null); // 元数据命中无片段
  assert.ok(cont.snippet && cont.snippet.includes('劳动合同')); // 正文命中给片段
  assert.ok(!JSON.stringify(r).includes('血常规各项指标正常，体检结论为未见明显异常')); // ftext 全文不外发
  assert.equal(r.content_search, true);
  assert.equal(displays[0].kind, 'files');
});

test('search_files：正文检索关闭时注明仅元数据', async () => {
  const exec = createExecutor(mockStore(), fakeGen, null, null, mockHub({
    async searchFiles() { return { items: [], contentSearch: false }; },
  }));
  const r = await exec('search_files', { keyword: 'x' });
  assert.equal(r.content_search, false);
  assert.ok(r.hint.includes('关闭'));
});

test('create_note：经 hub 落库并触发 onChange/onDisplay', async () => {
  const hub = mockHub();
  let changed = 0;
  const displays = [];
  const exec = createExecutor(mockStore(), fakeGen, () => changed++, (d) => displays.push(d), hub);
  const r = await exec('create_note', { content: '周三交房租', tags: '生活, 提醒' });
  assert.equal(r.ok, true);
  assert.equal(r.id, 99);
  assert.equal(hub.calls.created[0].content, '周三交房租');
  assert.equal(changed, 1);
  assert.equal(displays[0].kind, 'notes');
  // 空正文拒收
  const r2 = await exec('create_note', { content: '  ' });
  assert.ok(r2.error);
});

test('tag_items：校验后转交 hub，三类型 targets 透传', async () => {
  const hub = mockHub();
  const exec = createExecutor(mockStore(), fakeGen, null, null, hub);
  const r = await exec('tag_items', {
    tag: '工作',
    targets: [
      { type: 'passwords', id: 3 },
      { type: 'notes', query: '快递' },
      { type: 'files', query: '体检报告' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.results.length, 3);
  assert.deepEqual(hub.calls.tagged[0].targets.map((t) => t.type), ['passwords', 'notes', 'files']);
  // 缺 tag / 缺 targets 拒收
  assert.ok((await exec('tag_items', { targets: [{ type: 'notes' }] })).error);
  assert.ok((await exec('tag_items', { tag: 'x' })).error);
});

test('服务器模式：hub 返回仅本地模式支持，原样透传给模型', async () => {
  const err = () => ({ error: '随手记/文件仓仅本地模式支持' });
  const exec = createExecutor(mockStore(), fakeGen, null, null, { searchNotes: err, searchFiles: err, createNote: err, tagItems: err });
  for (const [name, args] of [
    ['search_notes', { keyword: 'x' }], ['search_files', { keyword: 'x' }],
    ['create_note', { content: 'x' }], ['tag_items', { tag: 'x', targets: [{ type: 'notes' }] }],
  ]) {
    const r = await exec(name, args);
    assert.equal(r.error, '随手记/文件仓仅本地模式支持', name);
  }
});

test('hub 缺失时四工具各自报能力不可用', async () => {
  const exec = createExecutor(mockStore(), fakeGen);
  for (const [name, args] of [
    ['search_notes', { keyword: 'x' }], ['search_files', { keyword: 'x' }],
    ['create_note', { content: 'x' }], ['tag_items', { tag: 'x', targets: [{ type: 'notes' }] }],
  ]) {
    const r = await exec(name, args);
    assert.ok(r.error.includes('不可用'), name);
  }
});

// ---------- 对话循环：脚本化假渠道 ----------
function fakeChannel(script) {
  // script: 每次请求依次弹出一个响应（message 或抛错）
  let call = 0;
  const seen = [];
  return {
    fetch: async (url, opts) => {
      seen.push({ url, opts });
      const step = script[Math.min(call++, script.length - 1)];
      if (step instanceof Error) throw step;
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: step }] }),
        text: async () => JSON.stringify({ choices: [{ message: step }] }),
      };
    },
    calls: () => call,
    seen,
  };
}

test('对话循环：工具调用 → 结果回传 → 最终回复', async () => {
  const s = mockStore();
  const exec = createExecutor(s, fakeGen);
  const ch = fakeChannel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'save_password', arguments: JSON.stringify({ owner: '网银', account: '张三', password: 'XyZ!6789', note: '工资卡' }) } }] },
    { role: 'assistant', content: '已存好：网银 / 张三' },
  ]);
  const messages = [{ role: 'user', content: '帮我存：网银，张三，XyZ!6789，工资卡' }];
  const events = [];
  const reply = await chat({
    messages, channelFetch: ch.fetch, url: 'https://fake/v1/chat/completions',
    headers: {}, model: 'fake', exec,
    onEvent: (t, p) => events.push(t),
  });
  assert.equal(reply, '已存好：网银 / 张三');
  assert.equal(ch.calls(), 2);
  assert.equal(s.dump().length, 1);
  // 第二次请求里应携带 tool 结果消息
  const body2 = JSON.parse(ch.seen[1].opts.body);
  const toolMsg = body2.messages.find((m) => m.role === 'tool');
  assert.ok(toolMsg);
  assert.equal(toolMsg.tool_call_id, 'c1');
  assert.ok(JSON.parse(toolMsg.content).ok);
  // 系统提示词在首位
  assert.equal(body2.messages[0].role, 'system');
  assert.ok(body2.messages[0].content.includes('密码本'));
  assert.deepEqual(events.filter((e) => e === 'tool'), ['tool']);
});

test('对话循环：无工具时直接返回文本且只请求一次', async () => {
  const ch = fakeChannel([{ role: 'assistant', content: '你好呀' }]);
  const messages = [{ role: 'user', content: 'hi' }];
  const reply = await chat({ messages, channelFetch: ch.fetch, url: 'u', headers: {}, model: 'm', exec: createExecutor(mockStore(), fakeGen) });
  assert.equal(reply, '你好呀');
  assert.equal(ch.calls(), 1);
});

test('对话循环：渠道报错时抛出并带状态码', async () => {
  const ch = {
    fetch: async () => ({ ok: false, status: 401, text: async () => '{"error":"bad key"}' }),
  };
  await assert.rejects(
    chat({ messages: [{ role: 'user', content: 'x' }], channelFetch: ch.fetch, url: 'u', headers: {}, model: 'm', exec: createExecutor(mockStore(), fakeGen) }),
    /401/
  );
});

test('对话循环：工具执行异常被捕获为 error 结果', async () => {
  const badExec = async () => { throw new Error('库崩了'); };
  const ch = fakeChannel([
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', function: { name: 'search_passwords', arguments: '{"keyword":"x"}' } }] },
    { role: 'assistant', content: '搜索失败了呢' },
  ]);
  const messages = [{ role: 'user', content: '查一下' }];
  const reply = await chat({ messages, channelFetch: ch.fetch, url: 'u', headers: {}, model: 'm', exec: badExec });
  assert.equal(reply, '搜索失败了呢');
  const body2 = JSON.parse(ch.seen[1].opts.body);
  const toolMsg = body2.messages.find((m) => m.role === 'tool');
  assert.ok(JSON.parse(toolMsg.content).error.includes('库崩了'));
});

test('TOOL_LABELS 覆盖全部工具', () => {
  for (const t of TOOLS) assert.ok(TOOL_LABELS[t.function.name], `缺 ${t.function.name}`);
  assert.ok(typeof SYSTEM_PROMPT === 'string' && SYSTEM_PROMPT.length > 50);
});

let failed = 0;
for (const { name, fn } of tests) {
  try { await fn(); console.log(`✔ ${name}`); }
  catch (e) { failed++; console.error(`✘ ${name}\n  ${e.message}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} 通过`);
process.exit(failed ? 1 : 0);
