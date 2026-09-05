// categories.test.mjs —— 多分类体系（v3.4.0）：catSplit/catJoin/catFilter/catApply + 操作符集合匹配
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/search.js');
const PassSearch = globalThis.PassSearch;

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

// catSplit 边界
ok(JSON.stringify(PassSearch.catSplit('工作, 个人')) === JSON.stringify(['工作', '个人']), '中英逗号混分 + trim');
ok(JSON.stringify(PassSearch.catSplit('工作，个人')) === JSON.stringify(['工作', '个人']), '中文逗号');
ok(JSON.stringify(PassSearch.catSplit('工作,, 个人 ,工作')) === JSON.stringify(['工作', '个人']), '去空去重保序');
ok(JSON.stringify(PassSearch.catSplit('')) === JSON.stringify([]), '空串');
ok(JSON.stringify(PassSearch.catSplit(null)) === JSON.stringify([]), 'null');
ok(JSON.stringify(PassSearch.catSplit('  ')) === JSON.stringify([]), '纯空白');

// catJoin 边界
ok(PassSearch.catJoin(['工作', '个人']) === '工作,个人', 'join 规范串');
ok(PassSearch.catJoin([]) === '', '空数组');
ok(PassSearch.catJoin(['a', 'a', ' b ']) === 'a,b', 'join 去重去空格');
ok(PassSearch.catJoin('x,,y') === 'x,y', 'join 接受字符串');

// catFilter：any / all / exclude
const items = [
  { id: 1, category: '个人,工作' },
  { id: 2, category: '工作' },
  { id: 3, category: '邮箱' },
  { id: 4, category: '' },
];
ok(JSON.stringify(PassSearch.catFilter(items, ['工作'], 'any').map((i) => i.id)) === '[1,2]', 'any 命中');
ok(JSON.stringify(PassSearch.catFilter(items, ['个人', '邮箱'], 'any').map((i) => i.id)) === '[1,3]', 'any 多选');
ok(JSON.stringify(PassSearch.catFilter(items, ['个人', '工作'], 'all').map((i) => i.id)) === '[1]', 'all 需全部包含');
ok(JSON.stringify(PassSearch.catFilter(items, ['工作'], 'exclude').map((i) => i.id)) === '[3,4]', 'exclude 排除');
ok(PassSearch.catFilter(items, [], 'any').length === 4, '空筛选=全集');
ok(PassSearch.catFilter([{ id: 5, category: 'Work' }, { id: 6, category: '工作' }], ['work'], 'any').length === 1, '大小写不敏感（Work=work）');
ok(PassSearch.catFilter(items, ['个人工作'], 'any').length === 0, '子串不误匹配（个人工作≠个人,工作）');

// catApply：并集 / 差集
ok(PassSearch.catApply('工作', ['个人'], 'add') === '工作,个人', 'add 并集');
ok(PassSearch.catApply('工作,个人', ['工作', '邮箱'], 'add') === '工作,个人,邮箱', 'add 去重');
ok(PassSearch.catApply('工作,个人,邮箱', ['个人'], 'remove') === '工作,邮箱', 'remove 差集');
ok(PassSearch.catApply('工作', ['工作'], 'remove') === '', 'remove 至空');
ok(PassSearch.catApply('', ['工作'], 'add') === '工作', 'add 到空串');

// 搜索操作符 分类:x 按集合匹配（多分类条目命中）
const pq = PassSearch.parseQuery('分类:工作');
const r = PassSearch.searchEntries(items, '分类:工作');
ok(r.length === 2, '操作符命中多分类条目（1 和 2）');
const r2 = PassSearch.searchEntries(items, '分类:个人');
ok(r2.length === 1 && r2[0].entry.id === 1, '操作符命中多值中的第二项');
const r3 = PassSearch.searchEntries(items, '分类:个人工作');
ok(r3.length === 0, '操作符不误匹配子串');

console.log(`${pass}/${pass} 通过 categories`);
