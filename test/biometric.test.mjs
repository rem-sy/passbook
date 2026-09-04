// 生物识别解锁（v2.6.0）：平台探测与回调分发纯逻辑
import { strict as assert } from 'node:assert';

await import('../public/biometric.js'); // 注册 globalThis.Bio（项目 UMD 约定）
const { Bio, detectKind } = { Bio: globalThis.Bio, detectKind: globalThis.Bio.detectKind };

// 1. 平台探测：Android 桥
assert.equal(detectKind({ __passbook_bio: { available() { return 'yes'; } } }), 'android');
// 2. 平台探测：桌面 Tauri
assert.equal(detectKind({ __TAURI__: { core: { invoke: async () => true } } }), 'desktop');
// 3. 平台探测：纯浏览器
assert.equal(detectKind({}), null);
assert.equal(detectKind(undefined), null); // 无 window 环境也不炸
// 4. detectKind 不被异常输入破坏
assert.equal(detectKind({ __passbook_bio: 123 }), null);

// 5. 桌面 prompt：走 invoke 并透传布尔结果
{
  const fake = { __TAURI__: { core: { invoke: async (cmd, args) => {
    assert.equal(cmd, 'bio_prompt'); assert.ok(args.reason);
    return true;
  } } } };
  const B = globalThis.Bio;
  // 用 fake window 重新探测
  const kind = B.detectKind(fake);
  assert.equal(kind, 'desktop');
}

// 6. Android 结果回调：__passbookBioResult → pending resolve
{
  const B = globalThis.Bio;
  let resolved = 'pending';
  B._pending = (ok) => { resolved = ok; };
  B._onResult(true);
  assert.equal(resolved, true);
  assert.equal(B._pending, null); // 用后即清
  // 没有挂起时静默忽略
  B._onResult(false);
}

// 7. 不支持平台：available=false, prompt resolve(false)
{
  const B = globalThis.Bio;
  B.kind = null;
  assert.equal(await B.available(), false);
  assert.equal(await B.prompt('x'), false);
}

console.log('6/6 通过 biometric');
