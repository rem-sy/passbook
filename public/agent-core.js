/* 密码本 AI 助理核心（UMD：浏览器与 Node 双端可用）
 * 职责：工具定义（OpenAI function calling）、工具执行、对话循环。
 * 不依赖 DOM；store / PassGen / fetch 均由外部注入，便于测试与复用。
 */
(function (root) {
  'use strict';

  /** 提供给大模型的能力清单 */
  const TOOLS = [
    {
      type: 'function',
      function: {
        name: 'search_passwords',
        description: '按关键词搜索密码本。会匹配 所属/账户/网址/分类/备注 字段。用户问"XX的密码是什么"时用这个。',
        parameters: {
          type: 'object',
          properties: { keyword: { type: 'string', description: '搜索关键词，尽量用用户原话里的应用名/账户名' } },
          required: ['keyword'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'save_password',
        description: '保存一条密码到密码本。用户说"帮我存一下/记一下某个密码"时用这个。',
        parameters: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: '所属，应用/网站名，如：GitHub、微信' },
            account: { type: 'string', description: '账户：用户名/邮箱/手机号' },
            password: { type: 'string', description: '密码明文' },
            url: { type: 'string', description: '网址（可选）' },
            category: { type: 'string', description: '分类（可选），如：工作/个人/邮箱' },
            note: { type: 'string', description: '备注·记忆关键词（可选），记用户提到的帮助回忆的信息' },
          },
          required: ['owner', 'account', 'password'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'list_recent_passwords',
        description: '列出密码本里最近更新的条目。用户问"我存了哪些/最近存的"时用这个。',
        parameters: {
          type: 'object',
          properties: { limit: { type: 'number', description: '返回条数，默认 10' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'update_password',
        description: '修改已存的密码条目（换密码/补备注等）。按 所属+账户 定位：唯一匹配时直接更新；没找到或匹配多条时返回匹配列表，此时应让用户补充信息后重试。',
        parameters: {
          type: 'object',
          properties: {
            owner: { type: 'string', description: '所属（应用/网站名），用于定位记录' },
            account: { type: 'string', description: '账户（可选，多条匹配时用它进一步定位）' },
            newPassword: { type: 'string', description: '新密码（用户要改成的密码）' },
            note: { type: 'string', description: '新备注（可选，留空则保持原备注）' },
            url: { type: 'string', description: '新网址（可选，留空则保持原网址）' },
          },
          required: ['owner', 'newPassword'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'generate_password',
        description: '用密码本内置的强密码生成器生成密码。用户要新密码时用；生成后若用户给了所属和账户，可再调用 save_password 保存。',
        parameters: {
          type: 'object',
          properties: {
            length: { type: 'number', description: '长度 4-128，默认 16' },
            upper: { type: 'boolean', description: '含大写，默认 true' },
            lower: { type: 'boolean', description: '含小写，默认 true' },
            digit: { type: 'boolean', description: '含数字，默认 true' },
            symbol: { type: 'boolean', description: '含特殊符号，默认 true' },
            noAmbiguous: { type: 'boolean', description: '排除易混淆字符 0O1lI，默认 true' },
            noAdjacent: { type: 'boolean', description: '键盘布局不连续，默认 false' },
          },
        },
      },
    },
  ];

  const SYSTEM_PROMPT = `你是"密码本"应用的内置 AI 助理，帮用户用自然语言管理本地密码库。规则：
1. 用户要存密码 → 必须调用 save_password 工具落库（尽量把用户提到的额外信息放进 note 备注作为记忆关键词）。禁止不调用工具就口头宣称"已保存"——只有工具返回 ok:true 才算存好。回复中不要复述密码明文。
2. 用户问密码 → 必须调用 search_passwords 查询。工具结果里的 password 字段已打码，真实密码由应用直接展示给用户（含一键复制），你只需说明找到了哪些 所属/账户，让用户在应用展示的卡片里查看复制。禁止编造、猜测或要求用户提供密码内容。
3. 用户要改密码 → 调用 update_password；若返回多条匹配，向用户确认是哪个账户后重试。
4. 用户要新密码 → 必须调用 generate_password；若同时给了所属和账户，生成后接着调 save_password 存好。
5. 回复用简体中文，简洁友好。
6. 数据只存在用户本机，不要输出与密码管理无关的推广或说教。
7. 涉及存、查、改、列、生成密码的意图，一律先调工具再回答；纯闲聊才直接回复。`;

  const TOOL_LABELS = {
    search_passwords: (a) => `搜索「${a.keyword || ''}」`,
    save_password: (a) => `保存 ${a.owner || ''} / ${a.account || ''}`,
    list_recent_passwords: () => '列出最近条目',
    update_password: (a) => `修改 ${a.owner || ''}${a.account ? ' / ' + a.account : ''} 的密码`,
    generate_password: (a) => `生成密码（${a.length || 16} 位）`,
  };

  /**
   * 创建工具执行器
   * @param store 密码库适配器（需提供 list/create/update）
   * @param passGen 生成器（需提供 generate/strength）
   * @param onChange 库变更回调（存入后刷新界面用）
   * @param onDisplay 真实结果展示回调：({name, items}) —— 明文密码只走这条链路（应用内展示），
   *                  绝不进入返回给模型的工具结果，避免明文发给 AI 渠道
   */
  function createExecutor(store, passGen, onChange, onDisplay) {
    const MASK = '🔒已打码';
    return async function exec(name, args) {
      if (name === 'search_passwords') {
        const r = await store.list({ q: String(args.keyword || ''), sort: 'updated' });
        const items = r.items.slice(0, 10);
        if (onDisplay && items.length) onDisplay({ name, keyword: args.keyword, items });
        return {
          matched: r.total,
          items: items.map((x) => ({
            owner: x.owner, account: x.account,
            password: MASK, // 明文不回传模型，由应用卡片展示
            url: x.url, category: x.category, note: x.note, updated_at: x.updated_at,
          })),
          hint: 'password 已打码：真实密码由应用直接展示给用户，请勿编造或索要',
        };
      }
      if (name === 'save_password') {
        const entry = {
          owner: String(args.owner || '').trim(),
          account: String(args.account || '').trim(),
          password: String(args.password || ''),
          url: String(args.url || '').trim(),
          category: String(args.category || '').trim(),
          note: String(args.note || '').trim(),
        };
        if (!entry.owner || !entry.account || !entry.password) {
          return { error: '缺少必填项：所属(owner)、账户(account)、密码(password) 都不能为空' };
        }
        await store.create(entry);
        if (onChange) onChange();
        if (onDisplay) onDisplay({ name, items: [entry] });
        return { ok: true, saved: { owner: entry.owner, account: entry.account } }; // 不回传明文
      }
      if (name === 'list_recent_passwords') {
        const limit = Math.min(Math.max(Number(args.limit) || 10, 1), 30);
        const r = await store.list({ q: '', sort: 'updated' });
        const items = r.items.slice(0, limit);
        if (onDisplay && items.length) onDisplay({ name, items });
        return {
          total: r.total,
          items: items.map((x) => ({
            owner: x.owner, account: x.account, password: MASK, note: x.note, updated_at: x.updated_at,
          })),
          hint: 'password 已打码：真实密码由应用直接展示给用户',
        };
      }
      if (name === 'update_password') {
        const owner = String(args.owner || '').trim();
        const newPassword = String(args.newPassword || '');
        if (!owner || !newPassword) {
          return { error: '缺少必填项：所属(owner) 与 新密码(newPassword) 都不能为空' };
        }
        const r = await store.list({ q: owner, sort: 'updated' });
        let hits = r.items.filter((x) => String(x.owner).toLowerCase() === owner.toLowerCase());
        const account = String(args.account || '').trim();
        if (account) hits = hits.filter((x) => String(x.account).toLowerCase() === account.toLowerCase());
        if (!hits.length) {
          return { error: `未找到所属为「${owner}」${account ? `且账户为「${account}」` : ''}的记录`, matched: 0 };
        }
        if (hits.length > 1) {
          return {
            matched: hits.length,
            hint: '匹配到多条，请让用户补充账户(account)后重试',
            items: hits.slice(0, 10).map((x) => ({ owner: x.owner, account: x.account, note: x.note })),
          };
        }
        const cur = hits[0];
        const patch = { password: newPassword };
        if (args.note !== undefined && args.note !== '') patch.note = String(args.note).trim();
        if (args.url !== undefined && args.url !== '') patch.url = String(args.url).trim();
        const updated = await store.update(cur.id, patch);
        if (onChange) onChange();
        if (onDisplay) onDisplay({ name, items: [updated] });
        return { ok: true, updated: { owner: cur.owner, account: cur.account } }; // 不回传明文
      }
      if (name === 'generate_password') {
        const pw = passGen.generate({
          length: args.length ?? 16,
          upper: args.upper ?? true,
          lower: args.lower ?? true,
          digit: args.digit ?? true,
          symbol: args.symbol ?? true,
          noAmbiguous: args.noAmbiguous ?? true,
          noAdjacent: args.noAdjacent ?? false,
        });
        const info = passGen.strength ? passGen.strength(pw) : null;
        return { password: pw, entropy: info && info.entropy, label: info && info.label };
      }
      return { error: `未知工具：${name}` };
    };
  }

  /**
   * 执行一轮完整对话（含工具循环）
   * @param opts { messages, channelFetch, url, headers, model, exec, onEvent, maxRounds }
   *   channelFetch(url, {method,headers,body}) -> { ok, status, text(), json() }
   *   onEvent(type, payload)：'assistant' | 'tool' | 'tool_result'
   * @returns {Promise<string>} 助理最终回复文本
   */
  async function chat(opts) {
    const {
      messages, channelFetch, url, headers, model, exec,
      onEvent = () => {}, maxRounds = 8,
    } = opts;
    for (let round = 0; round < maxRounds; round++) {
      const resp = await channelFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages.slice(-40),
          ],
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`渠道返回 ${resp.status}：${errText.slice(0, 300)}`);
      }
      const data = await resp.json();
      const msg = data.choices && data.choices[0] && data.choices[0].message;
      if (!msg) throw new Error('渠道响应格式异常（缺少 choices[0].message）');
      messages.push(msg);
      onEvent('assistant', msg);

      if (msg.tool_calls && msg.tool_calls.length) {
        for (const tc of msg.tool_calls) {
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* 容忍空参 */ }
          onEvent('tool', { name: tc.function.name, args });
          let result;
          try {
            result = await exec(tc.function.name, args);
          } catch (e) {
            result = { error: e.message };
          }
          onEvent('tool_result', { name: tc.function.name, args, result });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // 带工具结果进入下一轮
      }
      return msg.content || '（无回复内容）';
    }
    return '⚠️ 工具调用轮次过多，已停止。请换个说法试试。';
  }

  /**
   * 执行一轮完整对话（含工具循环）——流式版
   * @param opts { messages, channelFetch, url, headers, model, exec, onEvent, onDelta, maxRounds }
   *   channelFetch(url, {method,headers,body}, onChunk) -> { ok, status, text(), json() }
   *     onChunk(rawChunk)：SSE 原始文本块，逐块回调（用于渐进渲染）
   *   onEvent(type, payload)：'assistant' | 'tool' | 'tool_result'
   *   onDelta(text)：流式增量内容（完整累积，供 UI 渐进渲染）
   * @returns {Promise<string>} 助理最终回复文本
   */
  async function chatStream(opts) {
    const {
      messages, channelFetch, url, headers, model, exec,
      onEvent = () => {}, onDelta = () => {}, maxRounds = 8, signal,
    } = opts;
    const baseOpts = () => ({
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      signal, // AbortSignal：停止生成时中止底层请求
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.slice(-40),
        ],
        tools: TOOLS,
        tool_choice: 'auto',
        stream: true,
      }),
    });

    /** 增量 SSE 解析器：喂入原始块，产出 {text, toolCalls} 累积结果 */
    function makeParser() {
      let buf = '';
      let text = '';
      let toolCalls = null; // [{id,type,function:{name,arguments}}]
      const idxMap = new Map();
      return {
        push(raw) {
          buf += raw;
          while (true) {
            const nl = buf.indexOf('\n');
            if (nl < 0) break;
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith('data:')) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let obj;
            try { obj = JSON.parse(payload); } catch { continue; }
            const choice = obj.choices && obj.choices[0];
            if (!choice || !choice.delta) continue;
            const delta = choice.delta;
            if (typeof delta.content === 'string' && delta.content) {
              text += delta.content;
            }
            if (Array.isArray(delta.tool_calls)) {
              if (!toolCalls) toolCalls = [];
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let cur = idxMap.get(idx);
                if (!cur) {
                  cur = { id: '', type: 'function', function: { name: '', arguments: '' } };
                  idxMap.set(idx, cur);
                  toolCalls.push(cur);
                }
                if (tc.id) cur.id = tc.id;
                if (tc.type) cur.type = tc.type;
                if (tc.function) {
                  if (tc.function.name) cur.function.name += tc.function.name;
                  if (tc.function.arguments) cur.function.arguments += tc.function.arguments;
                }
              }
            }
          }
        },
        get text() { return text; },
        get toolCalls() { return toolCalls; },
      };
    }

    for (let round = 0; round < maxRounds; round++) {
      if (signal?.aborted) throw new Error('已停止');
      const parser = makeParser();
      const resp = await channelFetch(url, baseOpts(), (raw) => {
        parser.push(raw || '');
        onDelta(parser.text);
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        throw new Error(`渠道返回 ${resp.status}：${errText.slice(0, 300)}`);
      }

      if (parser.toolCalls && parser.toolCalls.length) {
        const toolCalls = parser.toolCalls.map((t) => ({
          id: t.id, type: t.type || 'function',
          function: { name: t.function.name, arguments: t.function.arguments },
        }));
        const msg = { role: 'assistant', content: parser.text || null, tool_calls: toolCalls };
        messages.push(msg);
        onEvent('assistant', msg);
        for (const tc of toolCalls) {
          if (signal?.aborted) throw new Error('已停止');
          let args = {};
          try { args = JSON.parse(tc.function.arguments || '{}'); } catch { /* 容忍空参 */ }
          onEvent('tool', { name: tc.function.name, args });
          let result;
          try {
            result = await exec(tc.function.name, args);
          } catch (e) {
            result = { error: e.message };
          }
          onEvent('tool_result', { name: tc.function.name, args, result });
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        continue; // 带工具结果进入下一轮
      }

      const content = parser.text || '（无回复内容）';
      messages.push({ role: 'assistant', content });
      onEvent('assistant', { content });
      return content;
    }
    return '⚠️ 工具调用轮次过多，已停止。请换个说法试试。';
  }

  const AgentCore = { TOOLS, SYSTEM_PROMPT, TOOL_LABELS, createExecutor, chat, chatStream };
  if (typeof module === 'object' && module.exports) module.exports = AgentCore;
  root.AgentCore = AgentCore;
})(typeof globalThis !== 'undefined' ? globalThis : this);
