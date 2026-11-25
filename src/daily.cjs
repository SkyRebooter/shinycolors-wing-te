module.exports = (function () {
  'use strict';
  const VERSION = '0.7.0';
  const STORAGE = 'sc.daily.v1.journal';
  const DAY_MS = 86400000;
  const DEFAULTS = Object.freeze({ moneyLimit: 1000, supportIdolId: '' });
  const TERMINAL = new Set(['cleared', 'received']);

  function ensure(ok, message) { if (!ok) throw new Error(message); }
  // 05:00 JST = 04:00 Asia/Shanghai. Do not use the host timezone.
  function gameDay(now = Date.now()) {
    return new Date(now + 4 * 3600000).toISOString().slice(0, 10);
  }
  function walk(root) {
    const result = [], seen = new Set(), stack = root ? [root] : [];
    while (stack.length) {
      const node = stack.pop();
      if (!node || seen.has(node) || node._destroyed) continue;
      ensure(seen.size < 30000, '场景结构异常，已停止');
      seen.add(node); result.push(node);
      const children = Array.isArray(node.children) ? node.children : [];
      for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
    }
    return result;
  }
  function under(node, ancestor) {
    const seen = new Set();
    for (let n = node; n && !seen.has(n); n = n.parent) {
      if (n === ancestor) return true;
      seen.add(n);
    }
    return false;
  }
  function visible(node, root) {
    if (!under(node, root)) return false;
    for (let n = node; n; n = n.parent) {
      if (n._destroyed || n.visible === false || n.renderable === false ||
          (typeof n.alpha === 'number' && n.alpha <= 0) ||
          (n.scale && (n.scale.x <= 0 || n.scale.y <= 0))) return false;
      if (n === root) return true;
    }
    return false;
  }
  function modals(root) {
    return walk(root).filter(n => n._overlay && n._base && n._buttons && visible(n, root));
  }
  function textureNames(node) {
    return walk(node).flatMap(n => {
      const t = n.texture;
      return t ? [...(Array.isArray(t.textureCacheIds) ? t.textureCacheIds : []),
        t.baseTexture && t.baseTexture.imageUrl || ''] : [];
    }).filter(x => typeof x === 'string');
  }
  function imageIs(node, pattern) { return textureNames(node).some(x => pattern.test(x)); }
  function ownImageIs(node, pattern) {
    const texture = node?.texture;
    return [...(texture?.textureCacheIds || []), texture?.baseTexture?.imageUrl || '']
      .some(x => typeof x === 'string' && pattern.test(x));
  }
  function unique(nodes, label) {
    ensure(nodes.length === 1, `${label}：预期找到一个，实际 ${nodes.length} 个，已停止`);
    return nodes[0];
  }
  function taskKey(row) {
    const mission = row.mission;
    return JSON.stringify([mission.transitionDestination || '', mission.title,
      row.progressMax, mission.sort ?? null]);
  }
  function dailyRows(scene) {
    const rows = scene && scene._missionGroup && scene._missionGroup.daily;
    ensure(Array.isArray(rows) && rows.length > 0, '未读到每日任务列表，请等待加载或返回主页');
    for (const row of rows) {
      ensure(row && row.id != null && row.mission && typeof row.mission.title === 'string' &&
        ['progress', 'cleared', 'received', 'not_joined'].includes(row.status), '每日任务数据结构已变化');
    }
    // Unstarted user missions can share id=0. Their master mission identity is stable.
    ensure(new Set(rows.map(taskKey)).size === rows.length,
      `每日任务内容重复或结构已变化：${JSON.stringify(rows.map(x => ({ title: x.mission.title,
        destination: x.mission.transitionDestination, max: x.progressMax, sort: x.mission.sort })))}`);
    return rows;
  }
  function taskKind(row) {
    const destination = row.mission.transitionDestination;
    if (destination === 'enhancement') return 'training';
    if (destination === 'moneyShop') return 'money';
    if (['fes', 'jointFes'].includes(destination)) return 'fes';
    return null;
  }
  function chooseMoney(store, cap) {
    ensure(Number.isSafeInteger(cap) && cap >= 1 && cap <= 1000, '马尼上限必须为 1–1000 的整数');
    ensure(store && Array.isArray(store.userShops) && typeof store.getShopCategoryOf === 'function' &&
      typeof store.getPossessionCurrencyFor === 'function', '商店数据结构已变化');
    const candidates = [];
    for (const shop of store.userShops) {
      if (shop.category !== 'money' || !Array.isArray(shop.shopMerchandises)) continue;
      for (const item of shop.shopMerchandises) {
        const category = store.getShopCategoryOf(item);
        if (!category || category.walletKey !== 'money' || item.walletKey !== 'money' ||
            !Number.isSafeInteger(item.price) || item.price < 1 || item.price > cap ||
            item.isNotPurchasable === true || item.isPremium !== false ||
            typeof item.purchasableLimitReached !== 'function' || item.purchasableLimitReached() ||
            typeof item.calcPurchasableCountWithinPossessionNumLimit !== 'function' ||
            !(item.calcPurchasableCountWithinPossessionNumLimit() >= 1) ||
            !Array.isArray(item.shopContents) || item.shopContents.length !== 1 ||
            item.shopContents[0].contentType !== 'enhancement_item' ||
            !Number.isFinite(store.getPossessionCurrencyFor(item)) ||
            store.getPossessionCurrencyFor(item) < item.price) continue;
        candidates.push({ shop, item });
      }
    }
    candidates.sort((a, b) => a.item.price - b.item.price || String(a.item.id).localeCompare(String(b.item.id)));
    ensure(candidates.length, '没有找到预算内可购买的马尼训练券；请手动购物后重新开始');
    return candidates[0];
  }
  function chooseBronze(items, idol) {
    ensure(Array.isArray(items) && idol && !idol.isLevelMax, '没有可训练的支援偶像');
    const candidates = items.filter(x => x && x.enhancementItem &&
      /ブロンズ|青铜|青銅|bronze/i.test(x.enhancementItem.name || '') &&
      x.isEnhancementTypeExp === true && Number.isFinite(x.num) && x.num > 0 &&
      x.isUsableWithSupportIdolRarity === true && x.isUsableWithSupportIdolLevel === true &&
      Number.isFinite(x.enhancementItem.expGain) && x.enhancementItem.expGain > 0);
    candidates.sort((a, b) => a.enhancementItem.expGain - b.enhancementItem.expGain);
    ensure(candidates.length, '没有可用的青铜训练券；不会自动改用银券、金券或等级券');
    ensure(items.every(x => x.selectedNum === 0), '训练页已有选中的道具，请先清空后重试');
    return candidates[0];
  }

  const PRODUCE_SCENARIOS = [
    { type: 'wing', name: 'W.I.N.G.', text: /w\.?i\.?n\.?g\.?/g },
    { type: 'fan_meeting', name: 'Fan 感谢祭', text: /ファン感謝祭|(?:fan|粉丝|粉絲|歌迷)感[谢謝]祭|fanmeeting/g },
    { type: '3rd_produce_area', name: 'G.R.A.D.', text: /g\.?r\.?a\.?d\.?/g },
    { type: '4th_produce_area', name: 'Landing Point', text: /landingpoint|l\.p\.?/g },
    { type: '5th_produce_area', name: 'S.T.E.P.', text: /s\.?t\.?e\.?p\.?/g },
    { type: '6th_produce_area', name: 'Say “Halo”', text: /say[「『"'“]?halo[」』"'”]?/g }
  ];
  const GROWTH_GOALS = [
    { policy: 'vocal', text: /(?:vocal|vo\.?|歌唱|声乐|聲樂)(?:値|值|能力)?(?:を|が|达到|達到)?[0-9,]+(?:以上|或更高)?/g },
    { policy: 'dance', text: /(?:dance|da\.?|舞蹈)(?:値|值|能力)?(?:を|が|达到|達到)?[0-9,]+(?:以上|或更高)?/g },
    { policy: 'visual', text: /(?:visual|vi\.?|表现力|表現力|表现|表現)(?:値|值|能力)?(?:を|が|达到|達到)?[0-9,]+(?:以上|或更高)?/g }
  ];
  const AUTO_RUN_MS = 3600000;
  const PRODUCE_UNIT_NAMES = {
    1: ['イルミネーションスターズ', 'illuminationstars'],
    2: ['アンティーカ', 'lantica', "l’antica", "l'antica"],
    3: ['放課後クライマックスガールズ', '放学后高潮女孩', '放課後高潮女孩'],
    4: ['アルストロメリア', 'alstroemeria'],
    5: ['ストレイライト', 'straylight'],
    6: ['ノクチル', 'noctchill'],
    7: ['シーズ', 'shhis'],
    8: ['コメティック', 'cometik', 'co-metik']
  };

  function produceText(value) {
    return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, '')
      .replace(/[樱桜]/g, '櫻').replace(/风/g, '風').replace(/织/g, '織')
      .replace(/仓/g, '倉').replace(/优/g, '優').replace(/泽/g, '沢')
      .replace(/圆/g, '円').replace(/华/g, '華').replace(/结/g, '結')
      .replace(/树/g, '樹').replace(/岛/g, '島').replace(/鸟/g, '鳥')
      .replace(/绿/g, '緑').replace(/铃/g, '鈴').replace(/叶/g, '葉');
  }

  function readProduceGoal(row, actorNames) {
    const title = row.mission.title;
    let rest = produceText(title);
    const scenarios = PRODUCE_SCENARIOS.filter(scenario => {
      const prior = rest;
      rest = rest.replace(scenario.text, '');
      return prior !== rest;
    });
    const actors = [];
    // Longest matches first so a full character name takes precedence over a short alias.
    for (const name of actorNames) {
      if (!rest.includes(name)) continue;
      actors.push(name);
      rest = rest.replaceAll(name, '');
    }
    const growth = GROWTH_GOALS.filter(goal => {
      const prior = rest;
      rest = rest.replace(goal.text, '');
      return prior !== rest;
    });
    if (scenarios.length > 1 || growth.length > 1 || actors.length > 1) return null;
    const win = /優勝|冠军|冠軍|夺冠|奪冠/.test(rest);
    const season = /(?:シーズン|赛季|賽季|季节|季節)[1-4]|第[一二三四1-4](?:季|赛季|賽季)/.test(rest);
    const fan = /(?:ファン(?:数)?|粉丝(?:数)?|粉絲(?:數)?|歌迷(?:数)?)(?:を|が|达到|達到)?[0-9,]+(?:万|萬)?人?(?:以上|或更多)/.test(rest);
    const rank = /(?:アイドルランク|偶像(?:等级|等級|评级|評級)|ランク|rank)[sabcdef]+(?:以上)?/.test(rest);
    const finish = /クリア|プロデュース|誕生|诞生|培育|培养|培養|通关|通關|育成/.test(rest) ||
      (scenarios.length === 1 && /完成|終了|结束|結束/.test(rest));
    if (!(win || season || fan || rank || finish || growth.length)) return null;
    // Keep qualifiers we cannot interpret out of the automatic schedule.
    rest = rest.replace(/(?:ファン(?:数)?|粉丝(?:数)?|粉絲(?:數)?|歌迷(?:数)?)(?:を|が|达到|達到)?[0-9,]+(?:万|萬)?人?(?:以上|或更多)/g, '')
      .replace(/(?:アイドルランク|偶像(?:等级|等級|评级|評級)|ランク|rank)[sabcdef]+(?:以上)?/g, '')
      .replace(/(?:シーズン|赛季|賽季|季节|季節)[1-4]|第[一二三四1-4](?:季|赛季|賽季)/g, '')
      .replace(/(?:フェスアイドル|fes偶像|メンバー|成员|成員|偶像|アイドル|優勝|冠军|冠軍|夺冠|奪冠|クリア|通关|通關|プロデュース|誕生|诞生|培育|培养|培養|育成|達成|完成|終了|结束|結束|进行|進行|最終|編|篇|剧本|劇本|模式下|普通|中級|middle|オート|auto|上記|成功|獲得|获得|させよう|しよう|しろ|すること|している|する|した|させる|終える|を|で|の|が|に|と|まで|して|へ|なろう|成为|成為|达成|达到|達到|使用|指定|用|以|将|將|让|讓|使|于|於|在)/g, '')
      .replace(/[0-9,]+(?:回|次|人|名|位|体)/g, '')
      .replace(/[一二三四五六七八九十]+(?:回|次|人|名|位|体)/g, '')
      .replace(/[【】〖〗「」『』()[\]、，,.。!！:：・]/g, '');
    if (rest) return null;
    const scenario = scenarios[0]?.type;
    if ((win || season) && scenario && !['wing', '3rd_produce_area'].includes(scenario)) return null;
    return {
      title, actor: actors[0], scenario: scenario || (win || season ? 'wing' : null),
      policy: growth[0]?.policy, prefersWing: fan || rank,
      closeAt: Math.min(row.gameEvent.closeAt, Number(row.closeAt) > 0 ? Number(row.closeAt) : Infinity) * 1000,
      remaining: row.progressMax - row.progress
    };
  }

  function planEventProduce(eventRows, store, now) {
    const decks = store.decks.map((deck, index) => {
      const idol = deck?.userIdol;
      if (!idol?.id || String(idol.id) === '0') return null;
      const unitNames = PRODUCE_UNIT_NAMES[idol.unitId ?? idol.idol?.unitId] || [];
      const names = [idol.characterName, idol.idol?.characterName, idol.idol?.name, idol.name, ...unitNames]
        .filter(Boolean).map(produceText).filter(name => name.length >= 2);
      return { deck, index, idol, names, name: idol.characterName || idol.idol?.characterName || idol.name };
    }).filter(Boolean);
    const names = [...new Set(decks.flatMap(deck => deck.names))].sort((a, b) => b.length - a.length);
    const goals = [], skipped = [];
    for (const row of eventRows) {
      const goal = readProduceGoal(row, names);
      if (goal) goals.push(goal);
      else skipped.push(`${row.mission.title}（目标或指定偶像未能匹配）`);
    }
    const candidates = [];
    for (const area of store.userProduceAreas) {
      const scenario = PRODUCE_SCENARIOS.find(item => item.type === area.produce?.produceType);
      if (!scenario || area.autoplayEnabled !== true || area.isLocked === true || area.produce.id == null) continue;
      for (const roster of decks) {
        const draft = store.schedules[0].copy();
        draft.selectedProduceId = area.produce.id;
        draft.selectedProduceArea = area;
        draft.produceExcludedCharacters = area.produce.produceExcludedCharacters || { idols: [], supportIdols: [] };
        draft.targetDeckIndex = roster.index;
        draft.times = 1;
        if (!store.isValidScheduleIdols(draft)) continue;
        if (draft.isKnowHowBookRequired) {
          const preset = (store.userKnowHowBookPresets || []).find(preset => {
            const books = preset.userKnowHowBooks;
            if (!Array.isArray(books) || books.some(book => !book?.id)) return false;
            draft.selectedUserKnowHowBooks = books.slice();
            return store.isValidScheduleKnowHowBooks(draft);
          });
          if (!preset) continue;
          draft.selectedUserKnowHowBookPreset = preset;
        }
        if (!store.isScheduleAlreadySetUp(draft)) continue;
        for (const policy of ['vocal', 'dance', 'visual']) {
          const covers = goals.filter(goal => (!goal.scenario || goal.scenario === scenario.type) &&
            (!goal.actor || roster.names.includes(goal.actor)) && (!goal.policy || goal.policy === policy));
          if (covers.length) candidates.push({ scenario, roster, draft, policy, covers });
        }
      }
    }
    const slots = [], covered = new Set();
    const slotLimit = store.schedules.length;
    const timesLimit = store.scheduleTimesLimit;
    const totalLimit = Math.min(store.totalTimesLimit, slotLimit * timesLimit);
    for (let run = 1; run <= totalLimit; run++) {
      const finishingAt = now + run * AUTO_RUN_MS;
      const last = slots.at(-1);
      const choices = candidates.map(candidate => ({
        candidate,
        extend: last?.candidate === candidate && last.count < timesLimit,
        goals: candidate.covers.filter(goal => goal.remaining > 0 && goal.closeAt >= finishingAt)
      })).filter(choice => choice.goals.length && (choice.extend || slots.length < slotLimit));
      const preference = choice => {
        const type = choice.candidate.scenario.type;
        if (choice.goals.some(goal => goal.prefersWing)) return type === 'wing' ? 2 : 0;
        if (choice.goals.some(goal => goal.policy)) return type === '5th_produce_area' ? 2 : 0;
        return type === 'wing' ? 1 : 0;
      };
      choices.sort((a, b) => b.goals.length - a.goals.length ||
        Math.min(...a.goals.map(goal => goal.closeAt)) - Math.min(...b.goals.map(goal => goal.closeAt)) ||
        Number(b.extend) - Number(a.extend) ||
        preference(b) - preference(a) ||
        a.candidate.roster.index - b.candidate.roster.index);
      const choice = choices[0];
      if (!choice) break;
      const slot = choice.extend ? last : { candidate: choice.candidate, count: 0, goals: new Set() };
      if (!choice.extend) slots.push(slot);
      slot.count++;
      for (const goal of choice.goals) {
        goal.remaining--;
        covered.add(goal);
        slot.goals.add(goal.title);
      }
    }
    for (const goal of goals) {
      if (goal.remaining > 0) skipped.push(`${goal.title}（${covered.has(goal) ? '排程未覆盖全部次数' : '缺少可用剧本、匹配编队或剩余时间'}，剩余 ${goal.remaining}）`);
    }
    return { slots, skipped };
  }

  class Runner {
    constructor(env, options = {}) {
      this.env = env;
      this.options = { ...DEFAULTS, ...options };
      this.now = env.now || Date.now;
      this.day = gameDay(this.now());
      this.deadline = this.now() + 8 * 60000;
      this.stopped = false;
      this.journal = null;
      this.navigate = null;
    }
    stop() { this.stopped = true; }
    check() {
      ensure(!this.stopped, '已停止；已发出的游戏操作仍可能完成，请以任务页为准');
      ensure(gameDay(this.now()) === this.day, '已跨过每日重置时间，已停止');
      ensure(this.now() < this.deadline, '运行超过 8 分钟，已停止');
      ensure(!this.env.hidden(), '游戏标签页已隐藏，已停止；返回游戏后重新开始');
    }
    scene() { this.check(); return this.env.engine().sceneManager.currentScene; }
    log(message) { this.env.log(message); }
    save() { this.env.save(this.journal); }
    async wait(predicate, label, timeout = 25000) {
      const end = this.now() + timeout;
      while (this.now() < end) {
        this.check();
        const result = predicate();
        if (result) return result;
        await this.env.sleep(180);
      }
      throw new Error(`${label}超时，已停止；不会重复提交操作`);
    }
    async settle() { await this.env.sleep(450); this.check(); }
    safe(scene, target = scene) {
      ensure(this.scene() === scene, '当前场景已变化，已停止');
      ensure(visible(target, scene), '目标已隐藏或不属于当前场景');
      for (let n = target.parent; n; n = n.parent) {
        ensure(n.interactiveChildren !== false, '页面正在加载或暂不允许操作');
        if (n === scene) break;
      }
      ensure(scene.interactiveChildren !== false, '页面正在加载');
      const popup = modals(scene).at(-1);
      ensure(!popup || under(target, popup), '有其他弹窗遮挡，请先手动处理后重新开始');
      ensure(!walk(scene).some(n => n._tutorialLayer && visible(n._tutorialLayer, scene)), '请先手动完成游戏教学');
    }
    tap(scene, button, label) {
      this.safe(scene, button);
      ensure(button.interactive === true && typeof button.emit === 'function', `${label}按钮不可用`);
      this.log(label);
      button.emit('tap');
    }
    async go(path, predicate, label) {
      const current = this.scene();
      this.safe(current);
      this.log(label);
      this.navigate(path);
      const scene = await this.wait(() => {
        const s = this.scene();
        return s !== current && s.interactiveChildren !== false && predicate(s) && s;
      }, label);
      await this.settle();
      return scene;
    }
    async missionPage() {
      return this.go('/mission', s => Array.isArray(s._missionGroup?.daily) && s._mainObject?.daily,
        '读取每日任务');
    }
    attachJournal(rows) {
      const fingerprint = rows.map(taskKey).sort().join(',');
      const old = this.env.load();
      this.journal = old && old.day === this.day && old.fingerprint === fingerprint ? old :
        { version: VERSION, day: this.day, fingerprint, attempts: {}, complete: false };
      this.save();
    }
    beginAttempt(kind, row, details) {
      this.check();
      ensure(!this.journal.attempts[kind], `${kind} 今日已有一次提交记录；请先手动核对任务状态，防止重复消耗`);
      this.journal.attempts[kind] = { missionId: String(row.id), missionKey: taskKey(row), at: this.now(), state: 'submitted', ...details };
      // Save BEFORE the click. Interrupted or timed-out requests never auto-retry.
      this.save();
    }
    verifyAttempt(kind, rows, key) {
      const row = rows.find(x => taskKey(x) === key);
      ensure(row && TERMINAL.has(row.status), `${kind} 操作后任务尚未达成；已停止，请手动核对`);
      this.journal.attempts[kind].state = 'verified'; this.save();
      this.log(`已核验：${row.mission.title}`);
    }
    async freshPopup(scene, before, predicate, label) {
      const popup = await this.wait(() => {
        ensure(this.scene() === scene, '等待弹窗时场景已变化');
        const fresh = modals(scene).filter(x => !before.has(x));
        const top = fresh.at(-1);
        return top && predicate(top) && top;
      }, label);
      await this.settle();
      return popup;
    }
    async closeResult(scene, popup) {
      const buttons = popup._buttons?.children || [];
      ensure(buttons.length === 1 && imageIs(buttons[0], /(?:close|ok)_button\.png(?:$|[?#])/),
        '结果弹窗结构不符，请手动处理');
      this.tap(scene, buttons[0], '关闭结果');
      await this.wait(() => !visible(popup, scene), '关闭结果');
    }
    async lobbyStep(clicked = new WeakSet()) {
      const scene = this.scene();
      const nodes = walk(scene);
      const usable = b => b && !clicked.has(b) && visible(b, scene) && b.interactive === true &&
        typeof b.listeners === 'function' && b.listeners('tap').length > 0;
      let target, label;
      if (Array.isArray(scene._userMissions) && scene._completedMissions &&
          typeof scene._reportFinish === 'function') {
        const buttons = nodes.filter(b => usable(b) && ownImageIs(b, /(?:^|\/)ok_button\.png(?:$|[?#])/));
        if (buttons.length !== 1) return false;
        target = buttons[0]; label = '关闭登录任务完成提示';
      } else if (Array.isArray(scene._specialLoginBonuses) && scene._specialLoginBonusLayer &&
          typeof scene._endLoginBonus === 'function') {
        const modal = modals(scene).at(-1);
        if (modal) {
          const buttons = modal._buttons.children;
          if (buttons.length !== 1 || !ownImageIs(buttons[0], /(?:^|\/)ok_button\.png(?:$|[?#])/)) return false;
          target = buttons[0]; label = '确认登录奖励到账提示';
        } else {
          const loginLayers = nodes.filter(n => n._normalLoginBonus || n._specialLoginBonus);
          const candidates = loginLayers.flatMap(walk).filter(b => usable(b) &&
            ownImageIs(b, /(?:^|\/)skip_button\.png(?:$|[?#])/));
          if (candidates.length !== 1) return false;
          target = candidates[0]; label = '跳过登录奖励演出';
        }
      } else if (scene._announceState && scene._announceIdsMap && scene._pickupButton && scene._tab) {
        // Only the notice scene's normal Back button; no generic "OK" handling.
        if (modals(scene).length) return false;
        const buttons = nodes.map(n => n._backButton).filter(b => usable(b) &&
          ownImageIs(b, /(?:^|\/)back_button\.png(?:$|[?#])/));
        if (buttons.length !== 1) return false;
        target = buttons[0]; label = '关闭登录公告';
      } else {
        const notices = nodes.filter(n => Array.isArray(n._popupParams) && typeof n._showPopUp === 'function');
        const dismiss = notices.flatMap(walk).filter(b => usable(b) &&
          ownImageIs(b, /(?:^|\/)(?:later|close)_button\.png(?:$|[?#])/));
        if (dismiss.length === 1 && modals(scene).length === 0) {
          this.tap(scene, dismiss[0], '关闭主页信息提示');
          clicked.add(dismiss[0]);
          await this.settle();
          return true;
        }
        const movies = nodes.filter(n => Array.isArray(n._updateInformations) && Array.isArray(n._movies));
        const buttons = movies.flatMap(n => n._movies).map(n => n._skipAllButton)
          .filter(b => usable(b) && ownImageIs(b, /(?:^|\/)skip_all_movie_button\.png(?:$|[?#])/));
        if (buttons.length !== 1) return false;
        target = buttons[0]; label = '跳过更新信息演出';
      }
      if (!usable(target)) return false;
      this.tap(scene, target, label);
      clicked.add(target);
      await this.settle();
      return true;
    }
    async claim(scene) {
      const rows = dailyRows(scene);
      if (!rows.some(x => x.status === 'cleared')) return false;
      const previous = rows.filter(x => x.status === 'received').length;
      const before = new Set(modals(scene));
      this.tap(scene, scene._mainObject.daily._allReceiveButton, '领取每日任务奖励');
      const confirm = await this.freshPopup(scene, before,
        p => p._buttons.children.length === 2 && imageIs(p._buttons.children[1], /ok_button\.png(?:$|[?#])/),
        '每日奖励确认');
      const next = new Set(modals(scene));
      this.tap(scene, confirm._buttons.children[1], '确认领取每日奖励');
      const result = await this.freshPopup(scene, next, p => p._buttons.children.length === 1,
        '每日奖励结果');
      await this.closeResult(scene, result);
      await this.wait(() => dailyRows(scene).filter(x => x.status === 'received').length > previous,
        '核验奖励领取状态');
      await this.wait(() => scene._mainObject.daily && scene.interactiveChildren !== false,
        '等待每日任务刷新');
      await this.settle();
      return true;
    }
    async money(row) {
      const scene = await this.go('/shop/money', s => s._shopStore && s._dialogLayer &&
        typeof s._showPurchaseConfirmationDialog === 'function', '打开马尼商店');
      this.safe(scene);
      const { shop, item } = chooseMoney(scene._shopStore, this.options.moneyLimit);
      const before = new Set(modals(scene));
      // This opens the normal game's confirmation UI; it does not purchase.
      scene._showPurchaseConfirmationDialog(shop, item);
      const confirm = await this.freshPopup(scene, before, p => walk(p).some(n =>
        n._shopMerchandise === item && n.purchaseCount === 1), '马尼购买确认');
      // The real confirmation can expose both a wrapper and a child control for
      // the same merchandise. Validate every exposed count instead of assuming
      // exactly one object owns the count getter.
      const purchases = walk(confirm).filter(n => n._shopMerchandise === item &&
        typeof n.purchaseCount === 'number');
      ensure(purchases.length > 0 && purchases.every(n => n.purchaseCount === 1) && confirm._buttons.children.length === 2,
        '购买数量不为一件');
      const button = confirm._buttons.children[1];
      ensure(imageIs(button, /(?:exchange|purchase)_button\.png(?:$|[?#])/), '不是马尼购买确认按钮');
      // Recheck currency, price and count at the point of submission.
      ensure(chooseMoney(scene._shopStore, this.options.moneyLimit).item === item && purchases.every(n => n.purchaseCount === 1),
        '商品或购买数量发生变化');
      this.safe(scene, button);
      this.beginAttempt('money', row, { itemId: item.id, money: item.price, count: 1 });
      const next = new Set(modals(scene));
      this.tap(scene, button, `购买一件训练券（${item.price} 马尼）`);
      const result = await this.freshPopup(scene, next, p => p._buttons.children.length === 1,
        '马尼购物结果');
      await this.closeResult(scene, result);
    }
    async training(row) {
      const listScene = await this.go('/training', s => s._idolListContainer &&
        Array.isArray(s._userEnhancementItems), '打开支援偶像训练列表');
      this.safe(listScene);
      ensure(!listScene._isTutorialPlaying, '请先手动完成训练教学');
      const list = listScene._idolListContainer;
      await this.wait(() => Array.isArray(list._idols) && list._idols.length > 0, '加载支援偶像');
      const idol = await this.wait(() => list._idols.filter(x => {
        const icon = list._idolIconMap?.[x.id];
        return x.isLevelMax === false && Number.isFinite(x.level) && icon &&
          visible(icon, listScene) && icon.interactive === true &&
          (!this.options.supportIdolId || String(x.id) === String(this.options.supportIdolId));
      }).sort((a, b) => a.level - b.level || String(a.id).localeCompare(String(b.id)))[0],
      '等待当前筛选中可见且未满级的支援偶像');
      this.tap(listScene, list._idolIconMap[idol.id], `选择未满级支援偶像（Lv.${idol.level}）`);
      const scene = await this.wait(() => {
        const s = this.scene();
        return s !== listScene && s._userSupportIdol && s._trainingButton && s;
      }, '打开训练页');
      await this.settle();
      this.safe(scene);
      ensure(String(scene._userSupportIdol.id) === String(idol.id), '训练偶像与选择不符');
      const ticket = chooseBronze(scene._userEnhancementItems, scene._userSupportIdol);
      ensure(typeof scene._plusItemNum === 'function', '训练道具选择结构已变化');
      scene._plusItemNum(ticket);
      ensure(ticket.selectedNum === 1 && scene._userEnhancementItems.filter(x => x.selectedNum > 0).length === 1,
        '训练道具数量异常');
      const before = new Set(modals(scene));
      const trainingButton = scene._trainingButton.button || scene._trainingButton._button || scene._trainingButton;
      ensure(under(trainingButton, scene._trainingButton), '训练按钮结构已变化');
      this.tap(scene, trainingButton, '使用一张青铜训练券');
      const confirm = await this.freshPopup(scene, before, p => p._buttons.children.length === 2 &&
        imageIs(p._buttons.children[1], /training_start_button\.png(?:$|[?#])/), '训练确认');
      ensure(ticket.selectedNum === 1 && scene._userEnhancementItems.every(x => x === ticket || x.selectedNum === 0),
        '训练数量已变化');
      const button = confirm._buttons.children[1];
      this.safe(scene, button);
      const numBefore = ticket.num;
      this.beginAttempt('training', row, { idolId: idol.id, ticketId: ticket.id, count: 1 });
      const next = new Set(modals(scene));
      this.tap(scene, button, '确认训练一次');
      const result = await this.freshPopup(scene, next, p => p._buttons.children.length === 1,
        '训练结果');
      ensure(ticket.num === numBefore - 1, '未核验到青铜券减少一张；请手动核对');
      await this.closeResult(scene, result);
      // A fortune bonus can open one additional informational result dialog.
      await this.settle();
      const extra = modals(scene).at(-1);
      if (extra && !before.has(extra)) {
        const title = extra._title?.text || '';
        ensure(/トレーニングチケット|训练券|訓練券/.test(title), '存在额外训练弹窗，请手动处理');
        await this.closeResult(scene, extra);
      }
    }
    async fes(row) {
      const scene = await this.go('/matchLiveTop', s => s._ticketRecuperator &&
        typeof s._showSkipStagePop === 'function', '打开 Match Live');
      for (const popup of modals(scene).slice(-1)) {
        const title = popup._title?.text || '';
        if (/^マッチライブ更新$|Match.?Live.*(?:更新|换季|換季)/i.test(title)) {
          await this.closeResult(scene, popup);
          await this.settle();
        }
      }
      this.safe(scene);
      ensure(scene._isPlayingFes === false, '已有进行中的 Fes；请手动完成，不会自动放弃');
      const tickets = scene._ticketRecuperator.count + scene._ticketRecuperator.exceed;
      ensure(Number.isFinite(tickets) && tickets >= 1, 'Fes 参加券不足；不会自动恢复');
      const before = new Set(modals(scene));
      scene._showSkipStagePop();
      const list = await this.freshPopup(scene, before, p => Array.isArray(p._skippableStages),
        '可跳过的 Match Live 关卡');
      if (list._skippableStages.length === 0) {
        this.log('没有三星关卡，改为完成一次基础 Match Live');
        await this.closeResult(scene, list);
        return this.basicFes(scene, row);
      }
      ensure(Array.isArray(list.skipStages) && list.skipStages.length === 0, '关卡已有跳过次数选择');
      const stage = list._skippableStages.find(x => visible(x, scene) && x._objs?.plusButtonS?.interactive === true);
      ensure(stage, '当前筛选中没有可用关卡；请清除游戏内的关卡筛选后重试');
      this.tap(scene, stage._objs.plusButtonS, '选择跳过一次');
      ensure(list.skipStages.length === 1 && list.skipStages[0].stageId === stage.stageId &&
        list.skipStages[0].count === 1, '跳过次数不为一次');
      const next = new Set(modals(scene));
      this.tap(scene, list._skipButton, '打开 Match Live 跳过确认');
      const confirm = await this.freshPopup(scene, next, p => p._buttons.children.length === 2 &&
        imageIs(p._buttons.children[1], /skip_start_button\.png(?:$|[?#])/), '跳过确认');
      ensure(scene._isPlayingFes === false && list.skipStages.length === 1 && list.skipStages[0].count === 1,
        'Fes 状态或跳过次数已变化');
      const button = confirm._buttons.children[1];
      this.safe(scene, button);
      this.beginAttempt('fes', row, { stageId: stage.stageId, count: 1 });
      const previous = new Set(modals(scene));
      this.tap(scene, button, '确认跳过 Match Live 一次');
      const result = await this.freshPopup(scene, previous, p => p._buttons.children.length === 1,
        'Match Live 跳过结果');
      await this.closeResult(scene, result);
      await this.settle();
      ensure(list.skipStages.length === 0, '未核验到跳过计数清空');
      const remaining = scene._ticketRecuperator.count + scene._ticketRecuperator.exceed;
      ensure(remaining === tickets - 1, '参加券数量变化不符，请手动核对');
      this.tap(scene, list._buttons.children[0], '关闭关卡列表');
      await this.wait(() => !visible(list, scene), '关闭关卡列表');
    }
    async basicFes(top, row) {
      this.safe(top);
      const areaList = unique(walk(top).filter(n => Array.isArray(n._areas) && n._areas.length), '基础区域列表');
      const area = areaList._areas[0];
      ensure(area.isOpened === true && area.difficulty === 'normal', '首个基础区域未开放，已停止');
      const select = await this.go(`/matchLiveStageSelect/${area.id}`, s => s._stageList && s._area,
        '打开首个基础区域');
      this.safe(select);
      ensure(String(select._area.id) === String(area.id) && Array.isArray(select._stageList._listStages),
        '区域或关卡列表结构不符');
      const first = select._stageList._listStages[0];
      ensure(first && first.id != null, '基础关卡不存在');
      const ready = await this.go(`/matchLiveReady/${first.id}`, s => s._params?.stage && s._objs?.nextButton,
        '打开首个基础关卡');
      this.safe(ready);
      ensure(String(ready._params.stage.id) === String(first.id) && ready._params.stage.isOpened !== false &&
        ready._params.area.difficulty === 'normal' && ready._isPlayingFes === false && ready._userJointFesDeck,
        '基础关卡未开放、缺少队伍或已有进行中的 Fes');
      ensure(ready._consumedFesTicket === 1 && ready._ticketRecuperator.count >= 1 &&
        ready._objs['notice/consumeMultipleTicketsButton']?.isOn === false, '参加券消耗不为一张');
      const start = ready._objs.nextButton;
      ensure(imageIs(start, /fes_match_start_button\.png(?:$|[?#])/), '不是 Match Live 开始按钮');
      this.safe(ready, start);
      this.beginAttempt('fes', row, { mode: 'basicBattle', stageId: String(first.id), count: 1 });
      this.tap(ready, start, '开始一次基础 Match Live（参加券一张）');
      const live = await this.wait(() => {
        const s = this.scene();
        return s !== ready && s._player && typeof s._goToJointFesTop === 'function' && s;
      }, '加载 Match Live 演出', 120000);
      const skip = await this.wait(() => {
        const b = live._player?._uiLayer?._header?._objs?.['btn/jointSkipButton'];
        return this.scene() === live && live._player.interactiveChildren !== false &&
          b?.interactive === true && visible(b, live) && b;
      }, '等待演出可跳过', 120000);
      this.tap(live, skip, '跳过本场演出并查看真实比赛结果');
      const exit = await this.wait(() => {
        ensure(this.scene() === live, '比赛场景意外变化，请手动核对');
        if (live._player.interactiveChildren === false || modals(live).length) return false;
        return walk(live._player._resultLayer).find(b => b.interactive === true && visible(b, live) &&
          ownImageIs(b, /(?:^|\/)joint_fes_area_select_button\.png(?:$|[?#])/));
      }, '等待比赛结算', 120000);
      this.tap(live, exit, '返回 Match Live 区域列表');
      await this.wait(() => this.scene() !== live && this.scene()._ticketRecuperator, '返回区域列表');
      await this.settle();
    }
    async connectHome() {
      const lobbyClicked = new WeakSet();
      const readyBy = this.now() + 90000;
      while (!walk(this.scene()).some(n => typeof n._goToMission === 'function' && typeof n._goToNextPage === 'function')) {
        ensure(this.now() < readyBy, '未进入主页，请先完成当前页面操作后重试');
        await this.lobbyStep(lobbyClicked);
        await this.env.sleep(180);
      }
      const home = this.scene();
      const menu = unique(walk(home).filter(n => typeof n._goToMission === 'function' &&
        typeof n._goToNextPage === 'function'), '主页导航');
      this.safe(home, menu);
      this.navigate = menu._goToNextPage.bind(menu);
      return menu;
    }
    async arrangeEventProduce() {
      const menu = await this.connectHome();
      const homeData = menu._myPage;
      ensure(homeData?.autoProduce && !homeData.produceIdol &&
        !homeData.produce && !homeData.userProduce &&
        !homeData.autoProduce.isAutoProducePlaying && !homeData.autoProduce.userAutoProduce &&
        !homeData.autoProduce.isTutorialInProgress,
      '已有培育、待结算的 Auto 排程或教学，请先在游戏中处理');
      const mission = await this.missionPage();
      const raw = mission._missionGroup.event;
      ensure(Array.isArray(raw), '未读到活动任务列表');
      const now = this.now();
      const pending = raw.filter(row => row?.status === 'progress' &&
        row.mission?.transitionDestination === 'produce' && typeof row.mission.title === 'string' &&
        Number.isFinite(row.gameEvent?.openAt) && Number.isFinite(row.gameEvent?.closeAt) &&
        row.gameEvent.openAt * 1000 <= now && row.gameEvent.closeAt * 1000 > now &&
        Number.isSafeInteger(row.progressMax) && Number.isSafeInteger(row.progress) &&
        row.progress >= 0 && row.progressMax > row.progress);
      ensure(pending.length, '当前没有可安排的未完成活动培育任务');
      const ready = await this.go('/produceReady', s => s._params?.autoProduce &&
        typeof s._showAutoPlaySchedule === 'function', '打开培育准备');
      this.safe(ready);
      ensure(ready._store?.isOpenedAutoProduce && ready._params.autoProduce.isTutorialPlayed &&
        !ready._params.isAutoProduce, '请先解锁游戏的 Auto 培育并完成教学');
      ready._showAutoPlaySchedule();
      const { scene, store, layer } = await this.wait(() => {
        const scene = this.scene();
        if (scene === ready || scene.interactiveChildren === false) return false;
        const store = scene._store;
        const holder = walk(scene).find(node => node._store === store &&
          node._deckEditLayer?._scheduleSettingLayer && visible(node._deckEditLayer._scheduleLayer, scene));
        return holder && { scene, store, layer: holder._deckEditLayer };
      }, '打开 Auto 培育排程');
      await this.settle();
      this.safe(scene, layer._scheduleLayer);
      ensure(!store.isTutorial && Array.isArray(store.decks) && Array.isArray(store.userProduceAreas) &&
        Array.isArray(store.schedules) && store.schedules.length > 0 &&
        typeof store.isScheduleAlreadySetUp === 'function' &&
        typeof store.isValidScheduleIdols === 'function' && typeof store.isValidScheduleKnowHowBooks === 'function' &&
        Number.isSafeInteger(store.scheduleTimesLimit) && store.scheduleTimesLimit > 0 &&
        Number.isSafeInteger(store.totalTimesLimit) && store.totalTimesLimit > 0 &&
        typeof layer.updateScheduleContents === 'function' &&
        store.schedules.every(slot => typeof slot.copy === 'function' && typeof slot.restore === 'function'),
      'Auto 培育排程结构已变化');
      ensure(!store.loop && store.schedules.every(slot => slot.isNotSet && !slot.selectedProduceId && slot.times === 0),
        '当前已有排程草稿，请先处理后再按活动安排');
      const plan = planEventProduce(pending, store, this.now());
      for (const message of plan.skipped) this.log(`待手动处理：${message}`);
      ensure(plan.slots.length, '没有可填入的 Auto 排程，请查看上方任务说明');
      const originals = store.schedules.map(slot => slot.copy());
      try {
        plan.slots.forEach(({ candidate, count }, index) => {
          const slot = store.schedules[index];
          slot.restore(candidate.draft);
          slot.times = count;
          slot.selectedGrowthPolicy = candidate.policy;
          ensure(store.isScheduleAlreadySetUp(slot), '游戏判定编队或知识书无效');
        });
        layer.updateScheduleContents();
      } catch (error) {
        store.schedules.forEach((slot, index) => slot.restore(originals[index]));
        layer.updateScheduleContents();
        throw error;
      }
      const policyNames = { vocal: 'Vo', dance: 'Da', visual: 'Vi' };
      plan.slots.forEach(({ candidate, count, goals }, index) => {
        const { roster, scenario, policy } = candidate;
        this.log(`排程 ${index + 1} · ${scenario.name} · ${roster.name || '培育偶像'}（编队 ${roster.deck.deckNumber ?? roster.index + 1}） · ${policyNames[policy]} × ${count} → ${[...goals].join('；')}`);
      });
      this.log(`已填好 ${store.totalTimes} 次 Auto 培育，需 ${store.totalConsumeStamina} 体力。核对后在游戏内开始`);
    }
    async run() {
      await this.connectHome();
      let scene = await this.missionPage();
      this.log('已读取每日列表：' + dailyRows(scene).map(x => `${x.mission.title} ${x.progress}/${x.progressMax}`).join('；'));
      this.attachJournal(dailyRows(scene));
      // Run each resource-consuming task at most once. Read server-backed mission
      // data again after each result, never infer success from an emitted click.
      for (let round = 0; round < 12; round++) {
        if (await this.claim(scene)) {
          scene = await this.missionPage();
          continue;
        }
        const rows = dailyRows(scene);
        this.env.rows(rows.map(x => ({ title: x.mission.title, status: x.status,
          progress: x.progress, max: x.progressMax })));
        if (rows.every(x => x.status === 'received')) {
          this.journal.complete = true; this.save();
          this.log('已核验：每日任务全部达成，奖励全部领取');
          return { complete: true, rows: rows.length };
        }
        const pending = rows.filter(x => x.status === 'progress' && taskKind(x));
        const row = ['fes', 'money', 'training'].map(kind => pending.find(x => taskKind(x) === kind)).find(Boolean);
        ensure(row, '仍有未完成任务，但不是已适配的每日任务；请在任务页手动处理');
        ensure(Number.isFinite(row.progress) && Number.isFinite(row.progressMax) && row.progressMax - row.progress === 1,
          '任务需要多次操作，超出每日一次的使用上限');
        const kind = taskKind(row);
        ensure(!this.journal.attempts[kind], `${kind} 已提交过；本次读取仍未达成，请手动核对后再使用`);
        await this[kind](row);
        scene = await this.missionPage();
        this.verifyAttempt(kind, dailyRows(scene), taskKey(row));
      }
      throw new Error('任务流程超过预期轮数，已停止');
    }
  }

  function boot(win, host, getEngine) {
      let runner;
      const shadow = host.attachShadow({ mode: 'closed' });
      shadow.innerHTML = `<style>
        *{box-sizing:border-box}details{width:320px;background:#f7fafc;color:#24333f;border:1px solid #b9c9d5;
        border-radius:10px;box-shadow:0 3px 18px #0003;font:13px/1.6 system-ui,sans-serif}summary{padding:9px 12px;cursor:pointer;
        font-weight:650}section{padding:0 12px 12px}p{margin:5px 0 9px}button{font:inherit;padding:5px 10px;border:1px solid #adbeca;
        border-radius:6px;background:white;color:#24333f;cursor:pointer}button:disabled{opacity:.5;cursor:default}
        button.start{background:#35647d;color:white}input{width:72px;padding:3px;border:1px solid #adbeca;border-radius:4px}
        pre{white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.6 system-ui;max-height:200px;overflow:auto;
        background:#eaf0f4;padding:6px;border-radius:5px}output{display:block;margin:7px 0;font-weight:600}
        .row{display:flex;gap:6px;margin-top:8px}small{color:#536976}label{display:block;margin:6px 0}
      </style><details><summary>每日任务助手</summary><section>
        <p>登录奖励与公告自动处理；进入主页后可开始每日任务。每项最多一次：Match Live、马尼购物、青铜券训练，随后领取每日奖励。</p>
        <label><input id="autoLobby" type="checkbox" checked style="width:auto"> 自动确认登录奖励、跳过登录与更新演出、关闭公告</label>
        <label>马尼支出上限 <input id="cap" type="number" min="1" max="1000" step="1" value="1000"></label>
        <small>需要参加券、已编成的 Match Live 队伍、未满级支援偶像及青铜券。已有三星关卡时优先跳过。</small>
        <div class="row"><button id="start" class="start">开始每日任务</button><button id="stop" disabled>停止</button>
        <button id="report">导出日志</button></div>
        <div class="row"><button id="eventProduce">按活动安排 Auto 培育</button></div>
        <output id="status">等待手动开始</output><pre id="log">安装后请刷新一次游戏。</pre>
        <button id="connect">重新连接游戏</button> <small>v${VERSION}</small>
      </section></details>`;
      const $ = id => shadow.getElementById(id);
      const logs = [];
      let reportRows = [];
      const log = message => {
        logs.push(`${new Date().toLocaleTimeString('zh-CN', { hour12: false })} ${message}`);
        $('log').textContent = logs.slice(-45).join('\n');
        $('log').scrollTop = $('log').scrollHeight;
        $('status').textContent = message;
      };
      const connect = () => Boolean(getEngine()?.sceneManager?.currentScene);
      $('connect').addEventListener('click', () => log(connect() ?
        '已连接游戏引擎，可以开始每日任务' : '尚未连接游戏引擎；请等待游戏加载后重试，或刷新游戏'));
      const env = {
        engine: () => { const engine = getEngine(); ensure(engine?.sceneManager?.currentScene, '未连接游戏引擎，请点击重新连接游戏；仍失败则刷新游戏并检查网页运行环境'); return engine; },
        hidden: () => win.document.hidden,
        sleep: ms => new Promise(resolve => win.setTimeout(resolve, ms)),
        load: () => { const raw = win.localStorage.getItem(STORAGE); return raw ? JSON.parse(raw) : null; },
        save: value => win.localStorage.setItem(STORAGE, JSON.stringify(value)),
        rows: rows => { reportRows = rows; }, log
      };
      try { $('autoLobby').checked = win.localStorage.getItem('sc.daily.v1.autoLobby') !== 'off'; } catch (_) { /* no preference */ }
      $('autoLobby').addEventListener('change', () => {
        win.localStorage.setItem('sc.daily.v1.autoLobby', $('autoLobby').checked ? 'on' : 'off');
      });
      let lobbyBusy = false, lobbyActions = 0;
      const lobbyClicked = new WeakSet();
      win.setInterval(async () => {
        if (runner || lobbyBusy || !$('autoLobby').checked || win.document.hidden || !connect()) return;
        if (!win.navigator.locks?.request) return;
        lobbyBusy = true;
        try {
          await win.navigator.locks.request('sc.daily.v1.run', { ifAvailable: true }, async lock => {
            if (!lock || runner) return;
            const helper = new Runner(env);
            if (await helper.lobbyStep(lobbyClicked)) {
              lobbyActions++;
              ensure(lobbyActions <= 60, '登录流程操作次数异常，自动处理已停止');
            }
          });
        } catch (error) { $('autoLobby').checked = false; log(`登录自动处理停止：${error.message}`); }
        finally { lobbyBusy = false; }
      }, 750);
      const runFromPanel = async eventProduce => {
        if (runner) return;
        logs.length = 0; reportRows = [];
        const options = { moneyLimit: Number($('cap').value) };
        try {
          ensure(eventProduce || (Number.isSafeInteger(options.moneyLimit) && options.moneyLimit >= 1 && options.moneyLimit <= 1000),
            '马尼上限必须为 1–1000 的整数');
          env.engine();
          ensure(win.navigator.locks?.request, '浏览器不支持跨标签页互斥，请升级浏览器');
          runner = new Runner(env, options);
          $('start').disabled = true; $('eventProduce').disabled = true;
          $('cap').disabled = true; $('stop').disabled = false;
          log(eventProduce ? '读取当前活动培育任务' : '开始；按 Esc 可停止');
          await win.navigator.locks.request('sc.daily.v1.run', { ifAvailable: true }, async lock => {
            ensure(lock, '另一个标签页正在运行任务助手，请先停止那个页面');
            if (eventProduce) await runner.arrangeEventProduce();
            else await runner.run();
          });
        } catch (error) { log(error.message || '运行异常，已停止'); }
        finally {
          runner = null;
          $('start').disabled = false; $('eventProduce').disabled = false;
          $('cap').disabled = false; $('stop').disabled = true;
        }
      };
      $('start').addEventListener('click', () => runFromPanel(false));
      $('eventProduce').addEventListener('click', () => runFromPanel(true));
      const stop = () => {
        $('autoLobby').checked = false;
        win.localStorage.setItem('sc.daily.v1.autoLobby', 'off');
        if (runner) runner.stop();
        log('已停止每日任务和登录自动处理');
      };
      $('stop').addEventListener('click', stop);
      win.document.addEventListener('keydown', event => { if (event.key === 'Escape' && runner) stop(); }, true);
      win.document.addEventListener('visibilitychange', () => { if (win.document.hidden && runner) runner.stop(); });
      $('report').addEventListener('click', () => {
        const blob = new win.Blob([JSON.stringify({ version: VERSION, gameDay: gameDay(),
          missionCompletionVerified: reportRows.length > 0 && reportRows.every(row => row.status === 'received'),
          missions: reportRows, log: logs }, null, 2)], { type: 'application/json' });
        const url = win.URL.createObjectURL(blob), a = win.document.createElement('a');
        a.href = url; a.download = `ShinyColors-daily-${gameDay()}.json`; a.click();
        win.setTimeout(() => win.URL.revokeObjectURL(url), 1000);
      });
  }
  return { VERSION, Runner, gameDay, walk, under, visible, modals, textureNames,
    imageIs, ownImageIs, dailyRows, taskKey, taskKind, chooseMoney, chooseBronze, boot };
})();
