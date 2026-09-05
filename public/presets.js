/* 预置所属库 + TOTP 分渠道指南（v3.3.0）
 * window.PB_PRESETS：常用站点清单（名称/域名/别名/两步验证获取步骤）
 * window.pbPresetMatch(input)：按名称或别名（不区分大小写，包含即可）命中预置项
 * 注册到 globalThis 以便 Node 测试直接 import 校验 */
(function (g) {
  const PRESETS = [
    {
      name: 'GitHub', domain: 'github.com', aliases: ['github', 'gh'], badge: true,
      totp: {
        supported: true,
        steps: [
          '右上角头像 → Settings（设置）',
          '左侧 Password and authentication（密码与认证）',
          'Two-factor methods（两步验证方式）→ Authenticator app（验证器应用）',
          '扫码或点 setup key（安装密钥）显示密钥',
          '把密钥（otpauth:// 链接或 Base32 串）存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Google', domain: 'google.com', aliases: ['google', '谷歌'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 Google 账户（myaccount.google.com）',
          '左侧安全性（Security）',
          '两步验证（2-Step Verification）',
          '身份验证器（Authenticator app）→ 开始设置',
          '选择"其他"显示密钥（无法扫码时），存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Microsoft', domain: 'account.microsoft.com', aliases: ['microsoft', '微软'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 account.microsoft.com（Microsoft 账户）',
          '安全（Security）→ 高级安全选项（Advanced security options）',
          '两步验证（Two-step verification）→ 开启',
          '身份验证器应用（Authenticator app）',
          '选择"我想使用其他验证器应用"显示二维码/密钥，存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Discord', domain: 'discord.com', aliases: ['discord', 'dc'], badge: true,
      totp: {
        supported: true,
        steps: [
          '用户设置（User Settings，左下角齿轮）',
          '我的账户（My Account）',
          '启用两步验证（Enable Two-Factor Auth）',
          '验证器 App（Authenticator App）查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'OpenAI', domain: 'platform.openai.com', aliases: ['openai', 'chatgpt'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 platform.openai.com 或 chatgpt.com',
          'Settings（设置）',
          'Security（安全）→ 两步验证（Two-factor authentication）',
          '验证器应用（Authenticator application）',
          '查看密钥（View secret key）存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Claude', domain: 'claude.ai', aliases: ['claude', 'anthropic'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 claude.ai',
          'Settings（设置）',
          'Security（安全）→ 两步验证（Two-factor authentication）',
          '验证器应用 → 扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Cloudflare', domain: 'dash.cloudflare.com', aliases: ['cloudflare', 'cf'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 dash.cloudflare.com',
          'My Profile（我的资料）',
          'Authentication（认证）→ Two-Factor Authentication',
          'Authenticator App → 扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'GitLab', domain: 'gitlab.com', aliases: ['gitlab'], badge: true,
      totp: {
        supported: true,
        steps: [
          '右上角头像 → Preferences（偏好设置）',
          'Account（账户）',
          '两步验证（Two-Factor Authentication）→ 启用',
          '验证器应用（Authenticator app）→ 扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Reddit', domain: 'reddit.com', aliases: ['reddit'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入设置（Settings）',
          '隐私安全（Privacy & Security）',
          '高级安全（Advanced Security）→ 用验证器 App（Use authentication app）',
          '扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Twitch', domain: 'twitch.tv', aliases: ['twitch'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入设置（Settings）',
          '安全与隐私（Security and Privacy）',
          '两步验证（Two-Factor Authentication）→ 启用',
          '验证器 App → 扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Binance', domain: 'binance.com', aliases: ['binance', '币安'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入交易所 App 或网页「安全（Security）」',
          '谷歌验证器（Google Authenticator）',
          '按提示开启，扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '交易所开启两步验证后通常需邮箱/短信二次确认，注意保存备份码。',
      },
    },
    {
      name: 'OKX', domain: 'okx.com', aliases: ['okx', 'okex'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 OKX「安全设置（Security）」',
          '验证器（Authenticator）',
          '按提示开启，扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '开启后提币等敏感操作会强制要求动态码。',
      },
    },
    {
      name: '小米', domain: 'account.xiaomi.com', aliases: ['xiaomi', 'mi', '小米账户'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 account.xiaomi.com（小米账户）',
          '安全设置（Security）',
          '身份验证器 App（Authenticator App）',
          '扫码或查看密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Bitwarden', domain: 'vault.bitwarden.com', aliases: ['bitwarden'], badge: true,
      totp: {
        supported: true,
        steps: [
          '进入 vault.bitwarden.com（网页密码库）',
          '设置（Settings）',
          '安全（Security）→ 两步验证（Two-step login）',
          '验证器应用（Authenticator app）→ 查看/扫描密钥',
          '把密钥存入本条目 TOTP 字段',
        ], note: '',
      },
    },
    {
      name: 'Steam', domain: 'store.steampowered.com', aliases: ['steam', '蒸汽'], badge: true,
      totp: {
        supported: false,
        steps: [],
        note: 'Steam 使用自家算法（5 位码），不支持标准 TOTP，无法用本应用的动态验证码功能。',
      },
    },
  ];

  /** 按名称/别名/域名命中预置项：不区分大小写、包含即可（双向）
   *  返回预置对象或 null。input 可以是所属名、别名或 https://host/… URL */
  function pbPresetMatch(input) {
    const s = String(input || '').trim().toLowerCase();
    if (!s) return null;
    let host = '';
    try { host = new URL(s.includes('://') ? s : 'https://' + s).hostname.toLowerCase(); } catch { host = ''; }
    for (const p of PRESETS) {
      const tokens = [p.name, ...p.aliases, p.domain].map((x) => String(x).toLowerCase());
      for (const tk of tokens) {
        if (!tk) continue;
        if (s === tk || s.includes(tk)) return p; // 名称/别名包含
        if (host && (host === tk || host.endsWith('.' + tk) || tk.endsWith('.' + host))) return p; // 域名归一
      }
    }
    return null;
  }

  g.PB_PRESETS = PRESETS;
  g.pbPresetMatch = pbPresetMatch;
})(typeof globalThis !== 'undefined' ? globalThis : this);
