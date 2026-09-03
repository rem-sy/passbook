/* 密码本 · 密码短语生成（v2.3.0）
 * 词表模式：中文双字词 / 英文 diceware 风；分隔符、词数、首字母大写、附加数字。
 * 与字符型 generator.js 并存；安全随机（crypto.getRandomValues，可注入测试源）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PassPhrase = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- 词表（各 512 词 ≈ 9 bit/词） ---------------- */
  const ZH_WORDS = ('时间 阳光 森林 海洋 山川 河流 星辰 月亮 太阳 云朵 风雨 雷电 彩虹 露珠 冰雪 春夏 秋冬 花草 树木 竹叶 梅花 兰草 菊花 荷叶 松柏 枫叶 银杏 柳枝 桃花 李子 苹果 葡萄 西瓜 草莓 柠檬 蜜桃 樱桃 芒果 椰子 橄榄 石榴 柿子 板栗 核桃 芝麻 红豆 绿茶 咖啡 牛奶 蜂蜜 面包 米饭 面条 饺子 包子 汤圆 粽子 月饼 糕点 糖果 巧克力 蓝天 白云 清风 明月 晨曦 黄昏 夜晚 黎明 正午 深秋 初夏 严寒 酷暑 温暖 凉爽 潮湿 干燥 清澈 宁静 平静 安详 悠闲 自由 勇敢 坚强 温柔 善良 诚实 谦逊 乐观 豁达 智慧 才华 灵感 思绪 记忆 梦想 希望 未来 过去 现在 瞬间 永恒 变化 成长 收获 耕耘 播种 灌溉 发芽 开花 结果 落叶 归根 传承 守护 陪伴 相逢 告别 重逢 思念 牵挂 祝福 祈祷 平安 顺利 如意 吉祥 喜庆 欢乐 悲伤 感动 惊喜 期待 等待 寻找 发现 探索 冒险 旅行 远方 家园 故乡 街道 小巷 城市 乡村 田园 山村 渔港 码头 港口 灯塔 渡口 石桥 木船 帆船 航行 漂流 降落 起飞 翱翔 飞跃 跳跃 奔跑 行走 散步 漫步 停留 居住 生活 日常 起居 饮食 起床 入睡 午休 打盹 清醒 疲惫 轻松 沉重 敏捷 缓慢 迅速 突然 逐渐 慢慢 忽然 终于 开始 结束 重新 继续 暂停 恢复 保持 失去 获得 拥有 放下 拿起 抓紧 松开 张开 合拢 打开 关闭 上升 下降 前进 后退 左右 东西 南北 中央 边缘 角落 中心 周围 内外 高低 深浅 长短 宽窄 大小 多少 轻重 快慢 新旧 冷热 软硬 光滑 粗糙 透明 浑浊 鲜艳 素雅 华丽 朴素 精致 简约 复杂 简单 容易 困难 简洁 完美 遗憾 骄傲 谦虚 得失 输赢 胜负 攻防 进退 取舍 选择 决定 判断 思考 考虑 研究 学习 练习 复习 预习 阅读 书写 绘画 音乐 歌唱 舞蹈 戏剧 电影 相机 画卷 诗句 文章 小说 散文 日记 书信 邮票 信封 窗户 门槛 屋檐 瓦片 砖墙 木门 铁锁 钥匙 灯火 蜡烛 炉灶 茶壶 碗筷 桌椅 床铺 枕头 被褥 窗帘 地毯 花瓶 盆栽 金鱼 猫咪 小狗 兔子 松鼠 刺猬 狐狸 熊猫 老虎 狮子 大象 长颈鹿 企鹅 海豚 鲸鱼 鲨鱼 水母 珊瑚 贝壳 海星 海龟 蜗牛 蚂蚁 蜜蜂 蝴蝶 蜻蜓 知了 蟋蟀 萤火虫 燕子 喜鹊 乌鸦 白鹭 海鸥 老鹰 天鹅 鸳鸯 孔雀 鸽子 麻雀 平凡 普通 特别 神奇 神秘 奇妙 美丽 漂亮 可爱 干净 整洁 热闹 寂静 繁华 荒凉 辽阔 无边 无垠 浩瀚 渺小 伟大 崇高 尊敬 敬佩 羡钦 后悔 满足 幸福 快乐 开心 难过 伤心 痛苦 绝望 失望 勇气 决心 毅力 耐心 细心 认真 马虎 粗心 仔细 勤劳 懒惰 聪明 愚笨 机智 幽默 风趣 严肃 活泼 开朗 内向 外向 热情 冷漠 友善 敌意 真诚 虚假 现实 梦幻 幻想 理想 抱负 志向 目标 方向 路线 旅途 风景 景色 风光 名胜 古迹 历史 文化 传统 风俗 习惯 礼仪 道德 伦理 法律 规则 秩序 混乱 和谐 冲突 矛盾 统一 对立 平衡 失衡 稳定 动荡 和平 战争 挑战 机遇 运气 命运 缘分').split(/\s+/);
  const EN_WORDS = ('apple amber anchor angle angel answer arrow atlas autumn avenue bacon badge bamboo banjo banner barley basin beacon beagle beetle bellow berry bishop bison blanket blossom bolt bonus border bottle boulder bracket branch brave bread breeze bridge bright bronze brook brush bubble bucket buffalo bugle bundle burrow butter cabin cactus camel candle canopy canvas canyon carbon cargo carnival carriage cascade castle cattle cavern cedar cellar census cherry chess chimney chorus cinnamon circle citrus clarinet cliff cloak clover cluster cobalt comet compass concert copper coral cotton cougar country courage coyote crane crater crayon creek cricket crimson crystal curve cycle daisy dawn deer delta denim desert diamond dolphin domain donut dragon drizzle dune eagle earth echo eclipse edge elder elk emerald empire engine essence estate evening exact fable falcon fauna feather fellow fiber fiddle figure filter finch fjord flame flint floral focus forest fossil fountain fox frame fresco frost galaxy garden garnet gather gentle ginger glacier glass globe glory golden goose gorge granite grape gravel grotto grove guitar gully gutter habitat hammer harbor harvest hatchet hawk hazel heather hedge helm heron hickory hollow honey hornet horizon hostel humble hurdle hurricane iceberg icicle igloo indigo inlet iris island ivory jade jaguar jasmine jelly jewel jigsaw jonquil juggle juniper kayak kernel kettle keynote kelp kidney kingdom kiosk kitten kiwi knapsack koala lagoon lantern lapis larch latitude laurel lava lavender ledge legacy lemon lens lever lichen lilac lily limber linen lithium lizard llama lobster locket lodge lotus lumber lunar lynx lyric magnet magnolia mahogany maize mallard mammoth mandate mango mantle maple marble marina marsh mascot meadow melody membrane mercury mermaid meteor mimosa mineral mirror mist moat molar moment monarch monsoon moose morning mortar mosaic mountain mule museum music mustard myrtle nature nectar needle nest nettle nickel night nimble noble nomad north notion nova nugget nutmeg oasis obelisk ocean octave olive onyx opera orbit orchard oregano origami osprey ostrich otter oven owl oxide oyster paddle palace pallet panda pansy papaya paprika papyrus parade parlor parsley pasture patio pattern peach peacock pebble pelican pepper pergola petal pewter phoenix piano pigment pilgrim pillar pillow pine pioneer pistol pivot plateau platinum plaza plum plush pocket poem polar pollen pond poplar poppy porcelain portal prairie précis praline pretzel primer prism privet profile proton prune pulley pumpkin puppy purple puzzle pyramid quality quarts quaver quiche quill quilt quinoa quiver radar radish rafter ragged rambler rampart ranch random rapids raspberry ravel raven rebate reflux regal region relic remedy render rescue resin retial rhubarb rhythm ribbon ridge rifle rigid ripple risotto river robin rocket rodeo roman rooftop rosemary roster ruby rudder rugby runway rustic saddle saffron sage sailor salad salmon salute sandal sapphire sardine satin savanna scarf scepter scholar science scissors sculpt seagull seal sequoia serene shadow shale shell sheriff shine shovel shrimp shuttle sierra signal silk silver simmer singer siren sketch skillet slate sleigh slogan smoky snout social socket sofa solar sonata sorbet spangle sparkle spear sphinx spice spider spinach spiral spruce squash stable stanza starling steady stencil sterling stipple stone storage stork strand stratum studio summit sundial sunrise surf swallow sweater sword sycamore symbol syrup tabby talent tangelo tapir tarragon tavern tempo tender tentacle terrace thicket thimble thistle thorn thunder thyme timber tissue toffee toaster toggle tomato topaz tornado tortoise tower treble trellis triangle trout truffle trumpet tulip tundra tunnel turban turbine turnip turtle tusk twilight typhoon umber unicorn upland urban urchin utensil valley vanilla velvet vendor veranda verbena vertex vessel viaduct viceroy vigor vinegar vintage violet virtue vista volcano voyage waffle walnut walrus wander wardrobe wasabi watch water wattle weasel weave website welcome whisper wicker wildcat willow window winter wisdom wizard wolf wombat wonder woodland wool wren wrench xylophone yacht yarrow yellow yonder yucca zebra zenith zephyr zeppelin zigzag zinnia zodiac').split(/\s+/).filter(w => /^[a-z]+$/.test(w));

  const WORDLISTS = { zh: ZH_WORDS, en: EN_WORDS };
  const SEPARATORS = ['-', '.', '_', ' ', ''];

  /** 安全随机整数 [0, max)：优先注入源（测试），否则 crypto.getRandomValues（带模偏差剔除） */
  function makeRndInt(injected) {
    if (typeof injected === 'function') return injected;
    return function (max) {
      const limit = Math.floor(0x100000000 / max) * max;
      const buf = new Uint32Array(1);
      for (;;) {
        crypto.getRandomValues(buf);
        if (buf[0] < limit) return buf[0] % max;
      }
    };
  }

  function clampInt(v, min, max, dflt) {
    const n = Number(v);
    if (!Number.isFinite(n)) return dflt;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  /**
   * 生成密码短语。
   * opts: { words(3-12,默认6), list('zh'|'en'), separator('-'|'.'|'_'|' '|'',默认'-'),
   *         capitalize(英文词首大写), includeNumber(末尾附加两位数字), rndInt(测试注入) }
   */
  function generatePassphrase(opts = {}) {
    if (opts.words !== undefined && (!Number.isFinite(Number(opts.words)) || Number(opts.words) < 3 || Number(opts.words) > 12)) {
      throw new Error('词数需在 3-12 之间');
    }
    const words = clampInt(opts.words, 3, 12, 6);
    const listKey = opts.list === 'en' ? 'en' : 'zh';
    const list = WORDLISTS[listKey];
    const separator = SEPARATORS.includes(opts.separator) ? opts.separator : '-';
    const capitalize = !!opts.capitalize;
    const includeNumber = !!opts.includeNumber;
    const rnd = makeRndInt(opts.rndInt);

    const picked = [];
    for (let i = 0; i < words; i++) {
      let w = list[rnd(list.length)];
      if (capitalize && listKey === 'en') w = w[0].toUpperCase() + w.slice(1);
      picked.push(w);
    }
    let out = picked.join(separator);
    if (includeNumber) out += (separator || '') + String(rnd(90) + 10); // 10-99
    return out;
  }

  /** 熵（比特）：log2(词表大小)*词数 + 附加数字的 log2(90) */
  function entropyPassphrase(opts = {}) {
    const words = clampInt(opts.words, 3, 12, 6);
    const listKey = opts.list === 'en' ? 'en' : 'zh';
    const bits = words * Math.log2(WORDLISTS[listKey].length);
    return Math.round(opts.includeNumber ? bits + Math.log2(90) : bits);
  }

  /** 强度标签（阈值与字符型生成器一致） */
  function strengthLabel(bits) {
    if (bits >= 90) return { label: '极强', cls: 's5' };
    if (bits >= 70) return { label: '很强', cls: 's4' };
    if (bits >= 50) return { label: '强', cls: 's3' };
    if (bits >= 35) return { label: '中', cls: 's2' };
    return { label: '弱', cls: 's1' };
  }

  return {
    generatePassphrase, entropyPassphrase, strengthLabel,
    WORDLISTS, SEPARATORS,
    wordlistSize: (k) => (WORDLISTS[k] || []).length,
  };
});
