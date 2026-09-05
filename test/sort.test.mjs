// sort.test.mjs —— 主页自定义排序（v3.4.2）：sortEntries 各键正倒序、收藏置顶、边界
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/search.js');
const S = globalThis.PassSearch;

let pass = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); pass++; };

const T = (s) => `2024-01-${String(s).padStart(2, '0')}T00:00:00Z`;
const items = [
  { id: 1, owner: 'b', category: '工作', updated_at: T(3), created_at: T(1), totp_secret: '', fav: 0 },
  { id: 2, owner: 'a', category: '', updated_at: T(1), created_at: T(3), totp_secret: 'K', fav: 0 },
  { id: 3, owner: 'c', category: '个人,工作', updated_at: T(2), created_at: T(2), totp_secret: '', fav: 1 },
  { id: 4, owner: 'a', category: '个人', updated_at: T(4), created_at: T(4), totp_secret: 'M', fav: 1 },
];
const ids = (arr) => arr.map((x) => x.id).join(',');

// 修改时间：desc=最新在前（默认）；asc=最旧在前；收藏（3,4）始终置顶优先于键
ok(ids(S.sortEntries(items, 'updated', 'desc')) === '4,3,1,2', 'updated desc 最新在前，收藏置顶');
ok(ids(S.sortEntries(items, 'updated', 'asc')) === '3,4,2,1', 'updated asc 最旧在前，收藏仍置顶');

// 创建时间
ok(ids(S.sortEntries(items, 'created', 'desc')) === '4,3,2,1', 'created desc');
ok(ids(S.sortEntries(items, 'created', 'asc')) === '3,4,1,2', 'created asc');

// 所属名称 localeCompare zh：a<c，同 owner 稳定保持原相对顺序（1 在 4 前? 收藏优先分组内 4 是收藏）
ok(ids(S.sortEntries(items, 'owner', 'asc')) === '4,3,2,1', 'owner asc 收藏组内 a(4) 先于非收藏组');
// 全非收藏时 owner asc：2(a),1(b),3? 3 是收藏置顶 → 3,2,1
ok(ids(S.sortEntries(items, 'owner', 'asc')) === '4,3,2,1', 'owner asc 稳定');

// TOTP：desc=有码在前（组内 4 有码→收藏组唯一），非收藏组有码(2)先于无码(1)
ok(ids(S.sortEntries(items, 'totp', 'desc')) === '4,3,2,1', 'totp desc 有码在前');
ok(ids(S.sortEntries(items, 'totp', 'asc')) === '3,4,1,2', 'totp asc 无码在前');

// 分类：catJoin 后比较；空分类排最后（不受 order 翻转）
// asc：工作(1) < 个人(4) < 个人,工作(3)？localeCompare: '个人'vs'个人,工作'：'个人'<'个人,工作'；空(2)最后 → 收藏组 4,3 再 1,2
ok(ids(S.sortEntries(items, 'category', 'asc')) === '4,3,1,2', 'category asc 空分类最后');
ok(ids(S.sortEntries(items, 'category', 'desc')) === '3,4,1,2', 'category desc 翻转但空仍最后');

// 收藏置顶优先于一切：给最旧条目加收藏
const items2 = [
  { id: 1, updated_at: T(1), fav: 1 },
  { id: 2, updated_at: T(9), fav: 0 },
];
ok(ids(S.sortEntries(items2, 'updated', 'desc')) === '1,2', '收藏(旧)仍置顶于最新非收藏');

// 边界：空列表 / undefined 字段
ok(ids(S.sortEntries([], 'updated', 'desc')) === '', '空列表');
ok(ids(S.sortEntries([{ id: 7 }], 'updated', 'desc')) === '7', '缺字段不炸');
ok(ids(S.sortEntries([{ id: 8, updated_at: null }], 'updated', 'desc')) === '8', 'null 时间不炸');

// 不改变原数组（纯函数）
const before = items.map((x) => x.id).join(',');
S.sortEntries(items, 'owner', 'desc');
ok(items.map((x) => x.id).join(',') === before, '不改变原数组');

// 默认参数：key 缺省 updated、order 缺省 desc
ok(ids(S.sortEntries(items)) === '4,3,1,2', '默认 updated desc');

console.log(`${pass}/${pass} 通过 sort`);
