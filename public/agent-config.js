/* 预置渠道默认配置（入库文件，永不包含真实密钥）。
 * 本机如需预置渠道：复制 agent-config.example.js 为 agent-config.local.js
 *（该文件被 .gitignore 忽略），在构建机/开发机上自动生效。
 */
window.AGENT_DEFAULTS = { baseUrl: '', apiKey: '', model: '' };
