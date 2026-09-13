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
            category: { type: 'string', description: '分类（可选，条目可属于多个分类、逗号分隔，如：工作, 个人）' },
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
        name: 'search_notes',
        description: '搜索随手记便签（标题/正文/标签多词匹配）。用户问"上周记的XX""我记过什么"时用这个。结果只含≤80字摘要，全文由应用卡片展示。',
        parameters: {
          type: 'object',
          properties: { keyword: { type: 'string', description: '搜索关键词，尽量用用户原话里的词（如：快递单号、体检报告）' } },
          required: ['keyword'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_files',
        description: '搜索文件仓文件：匹配文件名/备注/标签（元数据），可选匹配已抽取的正文内容（返回命中片段摘要）。用户问"XX文件放哪了"时用这个。',
        parameters: {
          type: 'object',
          properties: { keyword: { type: 'string', description: '搜索关键词（文件名或文件内容里的词）' } },
          required: ['keyword'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'create_note',
        description: '把一段文字存为便签（随手记）。用户说"帮我记一下XX"时用这个；必须调用本工具落库才算存好。',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string', description: '便签正文（用户要记的完整内容）' },
            title: { type: 'string', description: '标题（可选，留空自动取正文首行）' },
            tags: { type: 'string', description: '标签（可选，逗号分隔，如：工作, 快递）' },
          },
          required: ['content'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'tag_items',
        description: '给密码/便签/文件打标签（跨类型）。targets 数组逐项定位：type 为 passwords|notes|files，用 id 精确定位或 query 关键词搜索定位（命中多个则全部打标）。',
        parameters: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: '要追加的标签名，如：工作' },
            targets: {
              type: 'array',
              description: '打标对象列表',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', description: 'passwords | notes | files' },
                  id: { type: 'number', description: '记录 id（精确）' },
                  query: { type: 'string', description: '关键词（搜索定位，与 id 二选一）' },
                },
                required: ['type'],
              },
            },
          },
          required: ['tag', 'targets'],
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

  const SYSTEM_PROMPT = `你是"密码本"应用的内置 AI 助理——一个本地优先的个人数据保险箱助手，帮用户用自然语言管理三样东西：密码库、随手记便签、文件仓。规则：
1.【密码】用户要存密码 → 必须调用 save_password 工具落库（额外信息放进 note 备注作记忆关键词）。禁止不调用工具就口头宣称"已保存"——只有工具返回 ok:true 才算存好。回复中不要复述密码明文。
2.【密码】用户问密码 → 必须调用 search_passwords 查询。工具结果里的 password 字段已打码，真实密码由应用直接展示给用户（含一键复制），你只需说明找到了哪些 所属/账户，让用户在应用展示的卡片里查看复制。带 has_totp:true 的条目还配有两步验证（TOTP），应用卡片会实时显示 6 位动态验证码——提示用户在卡片里查看即可，禁止编造或推算验证码。禁止编造、猜测或要求用户提供密码内容。
3.【密码】用户要改密码 → 调用 update_password；若返回多条匹配，向用户确认是哪个账户后重试。要新密码 → 必须调用 generate_password；若同时给了所属和账户，生成后接着调 save_password 存好。
4.【便签】用户要记一条便签 → 必须调用 create_note 落库才算存好，禁止口头宣称"记下了"。用户问"我记过什么/上周记的XX" → 调用 search_notes 查询；工具结果只含≤80字摘要，让用户在应用展示的卡片里看全文，禁止编造、补全或臆测便签正文内容。
5.【文件】用户问"XX文件/报告放哪了" → 调用 search_files 查询（元数据+可选正文检索）；结果里的 snippet 只是命中片段摘要，让用户在应用卡片里查看文件，禁止编造文件内容。
6.【标签】用户要给某条密码/便签/文件打标签（可跨类型多项）→ 调用 tag_items，逐项返回结果如实汇报（未找到的要说明）。
7. 服务器存储模式下随手记/文件仓不可用（工具会返回"仅本地模式支持"），如实转述即可。
8. 回复用简体中文，简洁友好。数据只存在用户本机，不要输出与管理无关的推广或说教。
9. 涉及存、查、改、列、记、打标签的意图，一律先调工具再回答；纯闲聊才直接回复。`;

  const TOOL_LABELS = {
    search_passwords: (a) => `搜索「${a.keyword || ''}」`,
    save_password: (a) => `保存 ${a.owner || ''} / ${a.account || ''}`,
    list_recent_passwords: () => '列出最近条目',
    update_password: (a) => `修改 ${a.owner || ''}${a.account ? ' / ' + a.account : ''} 的密码`,
    generate_password: (a) => `生成密码（${a.length || 16} 位）`,
    search_notes: (a) => `搜便签「${a.keyword || ''}」`,
    search_files: (a) => `搜文件「${a.keyword || ''}」`,
    create_note: (a) => `记便签「${(a.title || a.content || '').slice(0, 16)}」`,
    tag_items: (a) => `打标签「${a.tag || ''}」× ${(a.targets || []).length} 项`,
  };

  /** 便签正文摘要：压平空白 + 截 n 字（隐私红线：给模型的永远只是摘要） */
  function previewOf(content, n) {
    const cap = n || 80;
    const s = String(content == null ? '' : content).replace(/\s+/g, ' ').trim();
    return s.length > cap ? s.slice(0, cap) + '…' : s;
  }

  /** 正文命中片段（半径 36）：与 PassFiles.snippetOf 同语义的零依赖实现 */
  function snippetLocal(text, terms) {
    const s = String(text == null ? '' : text);
    const lower = s.toLowerCase();
    let pos = -1, hit = '';
    for (const t of (terms || [])) {
      const tt = String(t).toLowerCase();
      if (!tt) continue;
      const p = lower.indexOf(tt);
      if (p >= 0 && (pos < 0 || p < pos)) { pos = p; hit = tt; }
    }
    if (pos < 0) return null;
    const r = 36;
    const start = Math.max(0, pos - r);
    const end = Math.min(s.length, pos + hit.length + r);
    return (start > 0 ? '…' : '') + s.slice(start, end).replace(/\s+/g, ' ') + (end < s.length ? '…' : '');
  }

  /**
   * 创建工具执行器
   * @param store 密码库适配器（需提供 list/create/update）
   * @param passGen 生成器（需提供 generate/strength）
   * @param onChange 库变更回调（存入后刷新界面用）
   * @param onDisplay 真实结果展示回调：({name, kind?, items}) —— 明文密码/便签全文/文件详情只走这条链路
   *                  （应用内卡片），绝不进入返回给模型的工具结果，避免明文发给 AI 渠道
   * @param hub 保险箱能力包（v4.7.0，app.js 组装，本模块保持零依赖）：
   *   { searchNotes(kw)->{items, total, error?}, searchFiles(kw)->{items:[{file, contentHit}], contentSearch, error?},
   *     createNote({content,title,tags})->{id, title, note, error?}, tagItems(tag, targets)->{ok, results, error?} }
   */
  function createExecutor(store, passGen, onChange, onDisplay, hub) {
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
            has_totp: !!x.totp_secret, // 有两步验证：卡片会实时展示 TOTP 验证码（密钥本身不外发）
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
            owner: x.owner, account: x.account, password: MASK, has_totp: !!x.totp_secret, note: x.note, updated_at: x.updated_at,
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
      /* ---------- v4.7.0 保险箱跨类型四工具（hub 注入，本模块零依赖） ---------- */
      if (name === 'search_notes') {
        if (!hub || typeof hub.searchNotes !== 'function') return { error: '便签检索能力不可用' };
        const r = await hub.searchNotes(String(args.keyword || ''));
        if (r && r.error) return r;
        const notes = (Array.isArray(r.items) ? r.items : []).slice(0, 10);
        if (onDisplay && notes.length) onDisplay({ name, kind: 'notes', items: notes });
        return {
          matched: (r && typeof r.total === 'number') ? r.total : notes.length,
          items: notes.map((n) => ({
            id: n.id, title: n.title || '',
            preview: previewOf(n.content, 80), // 隐私红线：≤80字摘要，全文走应用卡片
            tags: n.tags || '', source: n.source || '', updated_at: n.updated_at || '',
          })),
          hint: 'preview 只是≤80字摘要；全文已由应用卡片展示给用户，请让用户在卡片查看，禁止编造或补全便签内容',
        };
      }
      if (name === 'search_files') {
        if (!hub || typeof hub.searchFiles !== 'function') return { error: '文件检索能力不可用' };
        const r = await hub.searchFiles(String(args.keyword || ''));
        if (r && r.error) return r;
        const hits = Array.isArray(r.items) ? r.items : [];
        const shown = hits.slice(0, 10);
        if (onDisplay && shown.length) onDisplay({ name, kind: 'files', items: shown.map((h) => h.file || h) });
        const terms = String(args.keyword || '').toLowerCase().split(/[\s,，、]+/).filter(Boolean);
        return {
          matched: hits.length,
          matched_meta: hits.filter((h) => !h.contentHit).length,
          matched_content: hits.filter((h) => h.contentHit).length,
          content_search: !(r && r.contentSearch === false),
          items: shown.map((h) => {
            const f = (h && h.file) || h || {};
            return {
              id: f.id, name: f.name || '', size: f.size || 0,
              tags: f.tags || '', source: f.source || '', created_at: f.created_at || '',
              snippet: h.contentHit ? snippetLocal(f.ftext || '', terms) : null, // 正文只回传命中片段摘要
            };
          }),
          hint: (r && r.contentSearch === false)
            ? '文件正文检索已被用户关闭：本次仅匹配文件名/备注/标签（元数据），未搜索文件内容'
            : 'snippet 只是正文命中片段摘要；完整文件请让用户在应用卡片中查看，禁止编造文件内容',
        };
      }
      if (name === 'create_note') {
        if (!hub || typeof hub.createNote !== 'function') return { error: '便签能力不可用' };
        const content = String(args.content || '').trim();
        if (!content) return { error: '便签正文(content)不能为空' };
        const r = await hub.createNote({
          content,
          title: String(args.title || '').trim(),
          tags: String(args.tags || '').trim(),
        });
        if (r && r.error) return r;
        if (onChange) onChange();
        if (onDisplay && r && r.note) onDisplay({ name, kind: 'notes', items: [r.note] });
        return { ok: true, id: r && r.id, title: (r && r.title) || previewOf(content, 30) };
      }
      if (name === 'tag_items') {
        if (!hub || typeof hub.tagItems !== 'function') return { error: '打标签能力不可用' };
        const tag = String(args.tag || '').trim();
        if (!tag) return { error: '标签(tag)不能为空' };
        const targets = Array.isArray(args.targets) ? args.targets : [];
        if (!targets.length) return { error: 'targets 不能为空：[{type: passwords|notes|files, id 或 query}]' };
        const r = await hub.tagItems(tag, targets);
        if (r && r.error) return r;
        if (onChange) onChange();
        return r;
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
