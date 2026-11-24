/**
 * Duolingo Max 解锁（Surge 脚本）
 * 由 Loon 脚本 lingoDuo-xaM.js / lingoDuo-xaM-enhanced.js 移植
 * 兼容 Surge / Loon / Shadowrocket / Quantumult X 通用格式
 *
 * 模块参数（Surge 模块 → 脚本参数）：
 *   member       会员类型：max（默认，Gold+Max 全部权益）/ super（仅 Super）
 *   xp_boost     经验加倍：true / false（默认 false）
 *   multiplier   经验倍数：2 / 3（默认 2）
 *   unlock_all   解锁当前课程全部关卡：true / false（默认 false）
 *   expires_days 会员有效期（天，默认 365）
 */

const args = (() => {
    try {
        const a = typeof $argument !== 'undefined' ? $argument :
            (typeof $environment !== 'undefined' ? $environment : null);
        if (!a) return {};
        return typeof a === 'string' ? JSON.parse(a) : a;
    } catch (e) { return {}; }
})();

const cfg = {
    member: (args.member || 'max').toString().toLowerCase(),
    xp_boost: args.xp_boost === true || args.xp_boost === 'true' || args.xp_boost === 1 || args.xp_boost === '1',
    multiplier: parseInt(args.multiplier, 10) || 2,
    unlock_all: args.unlock_all === true || args.unlock_all === 'true' || args.unlock_all === 1 || args.unlock_all === '1',
    expires_days: parseInt(args.expires_days, 10) || 365
};

try {
    const obj = JSON.parse($response.body);
    const now = Math.floor(Date.now() / 1000);
    const expire = now + cfg.expires_days * 86400;

    // —— 会员（Max / Super）——
    const applyMembership = (userdata) => {
        if (!Array.isArray(userdata.shopItems)) userdata.shopItems = [];
        let gold = userdata.shopItems.find(i => i && i.id === 'gold_subscription');
        if (!gold) {
            gold = { id: 'gold_subscription' };
            userdata.shopItems.push(gold);
        }
        gold.purchaseDate = now - 172800;
        gold.purchasePrice = 0;
        gold.subscriptionInfo = {
            expectedExpiration: expire,
            productId: 'com.duolingo.DuolingoMobile.subscription.Gold.TwelveMonth.24Q2Max.168',
            renewer: 'APPLE',
            renewing: true,
            tier: 'twelve_month',
            type: 'gold'
        };

        if (!userdata.trackingProperties) userdata.trackingProperties = {};

        if (cfg.member === 'super') {
            userdata.subscriberLevel = 'SUPER';
            userdata.trackingProperties.has_item_premium_subscription = true;
            userdata.trackingProperties.has_item_gold_subscription = true;
            userdata.trackingProperties.has_item_max_subscription = false;
            userdata.trackingProperties.has_item_live_subscription = false;
            userdata.trackingProperties.has_item_immersive_subscription = false;
        } else {
            userdata.subscriberLevel = 'GOLD';
            [
                'has_item_immersive_subscription',
                'has_item_premium_subscription',
                'has_item_live_subscription',
                'has_item_gold_subscription',
                'has_item_max_subscription'
            ].forEach(p => { userdata.trackingProperties[p] = true; });
        }
    };

    // —— 经验加倍 ——
    const applyXpBoost = (userdata) => {
        if (!cfg.xp_boost) return;
        if (!Array.isArray(userdata.shopItems)) userdata.shopItems = [];
        let item = userdata.shopItems.find(i => i && i.id === 'xp_boost_stackable');
        if (!item) {
            item = { id: 'xp_boost_stackable', purchasePrice: 0 };
            userdata.shopItems.push(item);
        }
        item.purchaseDate = now;
        item.expectedExpirationDate = now + 3600;
        item.xpBoostMultiplier = cfg.multiplier;
    };

    // —— 解锁当前课程全部关卡 ——
    const applyUnlockAll = (userdata) => {
        if (!cfg.unlock_all) return;
        const course = userdata.currentCourse;
        if (!course || !Array.isArray(course.pathSectioned)) return;
        course.pathSectioned.forEach(section => {
            (section.units || []).forEach(unit => {
                (unit.levels || []).forEach(level => {
                    if (level.state === 'locked') level.state = 'active';
                });
            });
        });
    };

    const applyAll = (userdata) => {
        if (!userdata || typeof userdata !== 'object') return;
        applyMembership(userdata);
        applyXpBoost(userdata);
        applyUnlockAll(userdata);
    };

    // 1) /batch 接口：responses[0] 为 users 接口原始结果
    if (Array.isArray(obj.responses) && obj.responses.length >= 2) {
        const first = obj.responses[0] || {};
        // 带 etag 说明来自缓存，跳过修改
        if (first.headers && 'etag' in first.headers) {
            $done({});
        } else {
            const b0 = first.body;
            if (typeof b0 === 'string') {
                const userdata = JSON.parse(b0);
                applyAll(userdata);
                first.body = JSON.stringify(userdata);
            } else if (b0 && typeof b0 === 'object') {
                applyAll(b0);
            }
            $done({ body: JSON.stringify(obj) });
        }
    }
    // 2) 单个 userdata 响应
    else if (obj && typeof obj === 'object' &&
        (obj.shopItems !== undefined || obj.subscriberLevel !== undefined || (obj.id && obj.trackingProperties))) {
        applyAll(obj);
        $done({ body: JSON.stringify(obj) });
    }
    // 3) 其它响应不处理
    else {
        $done({});
    }
} catch (e) {
    console.log('[lingoDuo] ' + e);
    $done({});
}
