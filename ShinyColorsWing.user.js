// ==UserScript==
// @name         ShinyColors WING TE 助手
// @namespace    local.sc.wing
// @version      0.6.8
// @description  中日文 WING 单轮助手：自动结算、拒绝记者、试镜前学习技能，主属性课程有加成时优先课程；剧情跳过后的转场会等待而不是停止；半决赛与决赛开打前先学技能、直接从客户端入口进入本战，再按本战策略选卡选目标，AUTO 只跑演出与判定条；攻击主动技只学倍率最高的4个；旧脚本留下的未核验记录会在周次未推进时自动清除。
// @match        https://shinycolors.enza.fun/*
// @run-at       document-start
// @grant        none
// @inject-into  page
// @sandbox      raw
// @noframes
// ==/UserScript==
(function (factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else if (typeof window !== 'undefined' && window.top === window.self) api.boot(window);
})(function () {
  'use strict';
  const ACTION_GAP = 400; // pause after every input so the client can settle
const VERSION = '0.6.8', KEY = 'sc.wing.v2.journal';
  const ATTR = Object.freeze({ vo: 'vocal', da: 'dance', vi: 'visual' });
  const PLACE = Object.freeze({ lesson_vo: '1', lesson_da: '2', lesson_vi: '3', work_talk: '5', work_radio: '4' });
  const ACTION_LABEL = Object.freeze({ lesson_vo: 'Vo课程', lesson_da: 'Da课程', lesson_vi: 'Vi课程', work_talk: 'Talk', work_radio: '广播' });
  function ensure(ok, message) { if (!ok) throw new Error(message); }
  function integer(n, lo, hi, label) { ensure(Number.isSafeInteger(n) && n >= lo && n <= hi, `${label}数据无效`); return n; }
  function walk(root) {
    const out = [], seen = new Set(), stack = root ? [root] : [];
    while (stack.length) {
      const n = stack.pop(); if (!n || seen.has(n) || n._destroyed) continue;
      ensure(seen.size < 30000, '场景节点过多，停止'); seen.add(n); out.push(n);
      if (Array.isArray(n.children)) stack.push(...n.children.slice().reverse());
    } return out;
  }
  function under(n, root) { const seen = new Set(); for (; n && !seen.has(n); n = n.parent) { if (n === root) return true; seen.add(n); } return false; }
  function visible(n, root) {
    if (!n || !under(n, root)) return false;
    for (; n; n = n.parent) {
      if (n._destroyed || n.visible === false || n.renderable === false || n.alpha === 0 || (n.scale && (n.scale.x <= 0 || n.scale.y <= 0))) return false;
      if (n === root) return true;
    } return false;
  }
  function one(items, label) { ensure(items.length === 1, `${label}不唯一（${items.length}），停止`); return items[0]; }
  // Known client-side transition surfaces. Story skips and week ends fade the front
  // layer out through a white overlay while the next request is in flight; that state
  // is expected and must be waited out, not reported as an unknown page.
  function transitionState(root) {
    if (!root) return false;
    if (root.interactiveChildren === false || root._isUpdating === true) return true;
    if (visible(root._loadingLayer, root)) return true;
    try { if (typeof root._isTransitionPlaying === 'function' && root._isTransitionPlaying()) return true; } catch (_) { /* keep the other markers */ }
    const layer = root._transitionLayer;
    if (layer && Array.isArray(layer.children) && layer.children.some(n => visible(n, root))) return true;
    const main = root._mainLayer;
    return !!(main && main._blocker && visible(main._blocker, root));
  }
  function sceneHint(root) {
    try {
      const keys = Object.keys(root || {}).filter(k => /^_(mainLayer|topLayer|actionLayer|frontLayer|transitionLayer|loadingLayer|store|params|isWing|advPlayer|event|scenarioPlayer|mainController|blocker|isUpdating|produceSceneName|auditionSceneName)$/.test(k));
      const kids = (Array.isArray(root?.children) ? root.children : []).filter(n => visible(n, root)).slice(0, 8).map(n => n.name || '(未命名)');
      return `键[${keys.join(',')}] 子层[${kids.join(',')}]`;
    } catch (_) { return '界面信息不可读'; }
  }
  function modals(root) { return walk(root).filter(n => n._overlay && n._base && n._buttons && visible(n, root)); }
  function hasListener(n, event) { return typeof n?.listeners === 'function' && n.listeners(event).length > 0; }
  function textures(n) { return walk(n).flatMap(x => [...(x.texture?.textureCacheIds || []), x.texture?.baseTexture?.imageUrl || '']).filter(x => typeof x === 'string'); }
  function snapshot(store, attr) {
    ensure(store?.produceType === 'wing' && ATTR[attr], '仅适配 WING，不会操作其他培育模式');
    const p = store.userProduceIdol, u = store.userProduce, t = store.produceTrendCombination;
    ensure(p && u && u.id != null && t, '未读到完整培育状态');
    const ranks = [t.first, t.second, t.third];
    ensure(new Set(ranks).size === 3 && Object.values(ATTR).every(a => ranks.includes(a)), '流行数据结构变化');
    const w = { runId: String(u.id), week: integer(u.week, 0, 40, '总周次'),
      season: integer(store.seasonNum, 1, 5, '季度'), left: integer(store.remainSeasonWeek, 1, 8, '剩余周数'),
      fans: integer(p.fan, 0, 100000000, '实际粉丝'), sp: integer(p.skillPoint, 0, 10000, 'SP'),
      main: integer(p[ATTR[attr]], 0, 5000, '主属性'), mental: integer(p.mental, 0, 5000, 'Mental'),
      capped: cappedAttributes(p), energy: integer(p.stamina, 0, 1000, '体力'), trendRank: ranks.indexOf(ATTR[attr]) + 1,
      trendFirst: ranks[0], concert: store.isConcertWeek === true, weekType: store.weekType,
      // WING's 心情 (tension) runs 1..5 and feeds both the appeal strength and how
      // quickly the 思い出 gauge builds, so the runner keeps it in the snapshot.
      tension: Number.isFinite(Number(p.tensionLevel)) ? Number(p.tensionLevel) : null,
      produceState: Number.isFinite(store.produceState) ? store.produceState : null };
    return w;
  }
  function decide(w, late = 3) {
    // Both the semi-final and the final are played by battle(): AUTO runs the
    // performance while the runner picks the card and the target of every turn.
    if (w.concert) return w.weekType === 'final' ? 'final_battle' : 'semi_battle';
    if (w.season === 1) return 'work_talk';
    // Season 2 wants 10000 fans. The audition is only the fallback: when the talk
    // preview still adds enough fans, spend the week on talk (attributes + no audition).
    // work() reads place.fan and switches to the audition when talk cannot cover it.
    if (w.season === 2) return 'work_talk';
    if (w.season === 3 && w.fans < 100000) {
      const first = w.fans < 50000, needed = first ? 2 : 1;
      ensure(w.left >= needed, 'S3剩余周数不足以完成四万加五万路线');
      // The 40k step still needs rank 1. The 50k step may also run on rank 2 in
      // the last two weeks: fans are below 100k and there is no time left to wait.
      const rank2Late = !first && w.trendRank === 2 && w.left <= 2;
      if ((w.trendRank === 1 && (first || w.left <= late)) || rank2Late) return first ? 'audition_40000' : 'audition_50000';
      ensure(w.left > needed, 'S3未等到主属性流1或后2周流2，已无等待余量，请接管');
    }
    if (w.season === 4 && w.fans < 500000) {
      ensure(w.fans >= 100000, 'S4不足十万粉丝，偏离路线');
      const needed = Math.ceil((500000 - w.fans) / 100000);
      ensure(w.left >= needed, 'S4剩余周数不足以达到五十万粉丝');
      // Season 4 takes the 100k audition whenever the main attribute is rank 1 or 2;
      // the last weeks still take it regardless (deadline).
      if (w.trendRank <= 2 || w.left <= needed) return 'audition_100000';
    }
    ensure(w.season <= 4, '未知季度，请接管');
    // Radio is never scheduled: it only trades fans for mental, and the run needs
    // fans on every remaining week. Lessons are the only place mental grows, and
    // they follow the season bar in lessonWanted().
    return 'work_talk';
  }
  function lessonPreview(place) {
    ensure(place && Array.isArray(place.supportIdols), '课程支援预览不可用');
    const supportCount = place.supportIdols.length;
    const excellentCount = place.supportIdols.filter(s => s?.canPartnerLesson === true).length;
    const upgrades = [];
    if (excellentCount) upgrades.push('Excellent');
    if (place.includesBonusLevel === true) upgrades.push('设施升级');
    if (place.isPromised === true) upgrades.push('约定');
    if (place.helperStaff) upgrades.push('助手支援');
    return { supportCount, excellentCount, upgrades,
      includesBonusLevel: place.includesBonusLevel === true, isPromised: place.isPromised === true,
      hasHelper: !!place.helperStaff, qualifies: supportCount >= 2 || upgrades.length > 0 };
  }
  // A lesson costs a week of fans, so the bar depends on the season: season 1 and 2 only
  // spend the week when more than three support idols line up, season 3 uses the usual
  // preview rule, and season 4 uses the same rule but only while the main attribute is
  // the third trend - a ranked 1/2 main attribute auditions instead.
  function lessonWanted(preview, season, trendRank) {
    if (season === 4) return Number(trendRank) === 3 && preview.qualifies;
    if (season === 3) return preview.qualifies;
    if (season === 1 || season === 2) return preview.supportCount > 3;
    return false;
  }
  // A talk week is worth more than an audition week when its previewed fan gain still
  // clears the season 2 requirement; anything unknown falls back to the audition.
  function talkCoversFan(expectedFan, fans, target = 10000) {
    const gain = Number(expectedFan), have = Number(fans);
    return Number.isFinite(gain) && Number.isFinite(have) && have + gain >= target;
  }
  function preferLesson(action, attr, place, season = 3, trendRank = null) {
    ensure(ATTR[attr], '主属性无效');
    if (action !== 'work_talk') return action;
    return lessonWanted(lessonPreview(place), season, trendRank) ? `lesson_${attr}` : action;
  }
  const PARAMS=['vocal','dance','visual','mental'];
  function cappedAttributes(p) {
    return PARAMS.filter(a=>Number.isFinite(p?.[a]) && Number.isFinite(p?.['limit'+a[0].toUpperCase()+a.slice(1)]) && p['limit'+a[0].toUpperCase()+a.slice(1)]>0 && p[a]>=p['limit'+a[0].toUpperCase()+a.slice(1)]);
  }
  function skillTiming(w,action) {
    if(w.sp<=0)return null;
    if(action.startsWith('audition_') || action==='semi_battle' || action==='final_battle')return 'audition';
    return w.capped?.length ? 'cap' : null;
  }
  const ATTR_NAME_RX={vocal:/Vocal|ボーカル|Vo(?:[^a-z]|$)/i,dance:/Dance|ダンス|Da(?:[^a-z]|$)/i,visual:/Visual|ビジュアル|Vi(?:[^a-z]|$)/i,mental:/Mental|メンタル|Me(?:[^a-z]|$)/i};
  function skillAttribute(name) { return PARAMS.find(a=>ATTR_NAME_RX[a].test(String(name||'')))||null; }
  function skillPercent(name) { const m=/(\d+)\s*[%％]/.exec(String(name||'')); return m?Number(m[1]):0; }
  // "Visual130%UP" style passives lift that attribute's appeal; limit nodes are a
  // different category, so excluding 上限 by name keeps them apart.
  function boostPanelUseful(panel) {
    const n=String(panel?.skill?.name||'');
    return panel?.skillCategory==='passive' && /(?:UP|アップ)/i.test(n) && !/上限/.test(n) && !!skillAttribute(n);
  }
  // A limit node only pays off once the attribute is close to its cap; below that the
  // attribute still has room to grow and a boost is the better purchase.
  function nearCapAttributes(p,ratio=0.9) {
    return PARAMS.filter(a=>{
      const cap=Number(p?.['limit'+a[0].toUpperCase()+a.slice(1)]),value=Number(p?.[a]);
      return Number.isFinite(value) && Number.isFinite(cap) && cap>0 && value>=cap*ratio;
    });
  }
  // "Visual3.5倍Appeal" style actives carry their damage multiplier in the name.
  function appealMultiplier(name) {
    const m=/(\d+(?:\.\d+)?)\s*倍/.exec(String(name||''));
    return m?Number(m[1]):0;
  }
  // Active skills occupy a fixed set of slots, so every further attack replaces a
  // learned one. Only the four strongest attack panels of the board are worth buying:
  // anything weaker would evict a better skill that is already equipped.
  function bestAttackPanels(board,limit=4) {
    const panels=walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel);
    // Already learned attacks stay in the ranking so the keep set does not shrink and
    // pull a weaker attack in later; add() simply skips the owned ones.
    const treeOf=skillTreeOf(board),pTree=produceTreeOf(board);
    return panels.filter(p=>p.skillCategory==='active'&&!p.isDeleted&&!supportAttackBanned(p,treeOf,pTree))
      .map(p=>({p,mult:appealMultiplier(p.skill?.name),cost:Number(p.skillPoint)||0,step:Number(p.step)||99}))
      // Skill names often carry no "倍" text (for example ビジュアルアピールIV), so a
      // higher SP price and an earlier grid step stand in for "stronger".
      .sort((a,b)=>b.mult-a.mult||b.cost-a.cost||a.step-b.step)
      .slice(0,limit).map(x=>x.p);
  }
  // The skill board is a grid of (sequence, step): a panel becomes learnable only after
  // the panels directly left and up-left of it are learned. The client marks that state
  // as isArrival/isLocked and does not expose a prerequisite list, so the runner derives
  // the missing links from the coordinates and buys them before the target panel.
  // One board carries several trees (one id prefix each, e.g. 2040200090...), so the
  // neighbours only count inside the same tree - ids end with the 2-digit sequence and
  // 2-digit step.
  function skillTreeKey(panel) { return String(panel?.id||'').slice(0,-4); }
  // The client groups panels by character: board._skillPanelsLayer._allSkillPanels is
  // keyed by characterId and then by (sequence << 8) + step. Read that map when it is
  // there so two trees that happen to share id prefixes stay apart; otherwise fall back
  // to the id prefix.
  function skillTreeOf(board) {
    const found=new Map(),layer=board&&board._skillPanelsLayer,all=layer&&layer._allSkillPanels;
    if(all&&typeof all==='object') {
      for(const [charId,group] of Object.entries(all)) {
        for(const view of Object.values(group||{})) {
          const panel=view&&(view.normalSkillPanel||view.awakeSkillPanel);
          if(panel&&panel.id)found.set(String(panel.id),String(charId));
        }
      }
    }
    return panel=>found.get(String(panel?.id||''))||skillTreeKey(panel);
  }
  // The skill board is grouped per character card: index 0 is the produce idol (P card),
  // the rest are support cards. Support panels are learned first, so the produce idol
  // keeps its slots free for the skills that actually grow.
  // Support cards sometimes offer a 2.5倍 attack. It is never worth a slot: the produce
  // card has stronger options, and learning it would also evict a better equipped skill.
  function supportAttackBanned(panel, treeOf, produceTree) {
    if(!panel || panel.skillCategory!=='active')return false;
    if(!produceTree || !treeOf || treeOf(panel)===produceTree)return false;
    const text=`${panel.skill?.name||''} ${panel.skill?.comment||''}`;
    return Math.abs(appealMultiplier(text)-2.5)<0.01;
  }
  function produceTreeOf(board) {
    const idol=board&&board._produceIdol;
    const own=idol&&idol.characterId;
    if(own!==undefined&&own!==null)return String(own);
    const all=board&&board._skillPanelsLayer&&board._skillPanelsLayer._allSkillPanels;
    const keys=all&&typeof all==='object'?Object.keys(all):[];
    return keys.length?String(keys[0]):null;
  }
  function skillPrerequisitePanels(panel,panels,treeOf) {
    const tree=treeOf||skillTreeKey;
    const s=Number(panel?.sequence),k=Number(panel?.step),own=tree(panel);
    if(!own||!Number.isFinite(s)||!Number.isFinite(k)||k<=1)return [];
    return panels.filter(p=>{
      const ps=Number(p?.sequence),pk=Number(p?.step);
      return tree(p)===own && Number.isFinite(ps) && Number.isFinite(pk) && pk===k-1 && (ps===s||ps===s-1);
    });
  }
  // Buying order for one board visit, planned from the live board every time: attack
  // skills first (strongest 倍 first), then the attribute boosts of the wanted
  // attributes, then the limit nodes of attributes close to their cap, then the
  // remaining route limits. A high-value panel that is still gated pulls in its own
  // unfilled prerequisites, so the visit learns the chain instead of giving up.
  function skillPurchaseQueue(board,plan,options) {
    const capOnly=!!(options&&options.capOnly),wantedAttrs=(options&&options.wantedAttrs)||[];
    const planMatched=(options&&options.planMatched!==undefined)?!!options.planMatched:!!plan;
    const panels=walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel);
    const byId=new Map(panels.map(p=>[String(p.id),p]));
    const treeOf=skillTreeOf(board);
    const reachable=p=>!p.isAcquired&&!p.isDeleted&&!p.isAwakeSkill&&p.isArrival===true&&p.isLocked===false;
    const stepOf=p=>({panelId:String(p.id),skillId:String(p.skill?.id),cost:p.skillPoint});
    const idol=board._produceIdol||{};
    const near=nearCapAttributes(idol),full=cappedAttributes(idol);
    const planSteps=planMatched?prioritizeSkillSteps(plan.steps).slice():[];
    const planRank=new Map(planSteps.map((s,i)=>[String(s.panelId),i]));
    const stepFor=p=>{
      const listed=planSteps.find(s=>String(s.panelId)===String(p.id));
      return listed?{...listed}:stepOf(p);
    };
    const attrOf=p=>skillAttribute(p.skill?.name);
    const pTree=produceTreeOf(board);
    const isSupport=p=>!!pTree && treeOf(p)!==pTree;
    // Attack slots are limited, so only the strongest four actives may be bought.
    const keepAttacks=new Set(bestAttackPanels(board).map(p=>String(p.id)));
    const banned=new Set(panels.filter(p=>supportAttackBanned(p,treeOf,pTree)).map(p=>String(p.id)));
    const notes=[];
    const attacks=[],boosts=[],cappedBoosts=[],urgent=[],spare=[],others=[],seen=new Set();
    const add=p=>{
      const key=String(p.id);
      if(p.isAcquired||p.isDeleted||p.isAwakeSkill)return;
      if(seen.has(key))return;
      seen.add(key);
      const rank=planRank.has(key)?planRank.get(key):999;
      const item={...stepFor(p),_rank:rank,_attr:attrOf(p),_percent:skillPercent(p.skill?.name),_mult:appealMultiplier(p.skill?.name),_support:isSupport(p)};
      if(p.skillCategory==='active') { if(!capOnly && keepAttacks.has(key))attacks.push(item); }
      else if(p.skillCategory==='limit_break') (near.includes(attrOf(p))?urgent:spare).push(item);
      else if(!capOnly&&boostPanelUseful(p)&&wantedAttrs.includes(attrOf(p))) {
        // Past its cap an attribute cannot grow, so its boost only pays off after the
        // limit node is bought; such boosts queue behind the limit nodes.
        (full.includes(attrOf(p))?cappedBoosts:boosts).push(item);
      } else if(!capOnly) others.push(item);
    };
    // Everything the board already allows and that the current run wants. A high value
    // panel that is still locked is queued too: emit() then buys its prerequisites, which
    // is how a strong attack deep in the tree becomes learnable in the same visit.
    for(const p of panels) {
      const isAttack=p.skillCategory==='active'&&keepAttacks.has(String(p.id));
      const isNear=p.skillCategory==='limit_break'&&near.includes(attrOf(p));
      const isBoost=!capOnly&&boostPanelUseful(p)&&wantedAttrs.includes(attrOf(p));
      if(!reachable(p)&&!isAttack&&!isNear&&!isBoost)continue;
      if(p.skillCategory==='active'||isNear||isBoost)add(p);
    }
    // And the stored route, which may list a panel that still needs prerequisites.
    if(planMatched)for(const s of planSteps) {
      const p=byId.get(String(s.panelId));
      if(p)add(p);
    }
    const rankOf=s=>s._rank;
    // Support-card skills come before the produce card's own copies of the same kind;
    // inside each group attacks run strongest 倍 first and boosts run strongest % first.
    const supportFirst=(a,b)=>(a._support===b._support?0:(a._support?-1:1));
    attacks.sort((a,b)=>supportFirst(a,b)||b._mult-a._mult||rankOf(a)-rankOf(b)||a.cost-b.cost);
    const boostOrder=(a,b)=>supportFirst(a,b)||b._percent-a._percent
      ||wantedAttrs.indexOf(a._attr)-wantedAttrs.indexOf(b._attr)||rankOf(a)-rankOf(b)||a.cost-b.cost;
    boosts.sort(boostOrder);cappedBoosts.sort(boostOrder);
    const byCost=(a,b)=>rankOf(a)-rankOf(b)||a.cost-b.cost;
    const ordered=[...attacks,...boosts,...urgent.sort(byCost),...cappedBoosts,...spare.sort(byCost),...others.sort(byCost)];
    const stepForPanel=p=>ordered.find(s=>String(s.panelId)===String(p.id))||stepOf(p);
    const out=[],emitted=new Set();
    const emit=(step,depth)=>{
      const key=String(step.panelId);
      if(emitted.has(key))return;
      emitted.add(key);
      const panel=byId.get(key);
      if(panel&&depth<8&&!reachable(panel)) {
        for(const pre of skillPrerequisitePanels(panel,panels,treeOf)) {
          if(pre.isAcquired||pre.isDeleted||pre.isAwakeSkill)continue;
          if(banned.has(String(pre.id))){notes.push(`绕过支援卡2.5倍前置：${pre.skill?.name||pre.id}`);continue;}
          if(pre.skillCategory==='active' && (capOnly || !keepAttacks.has(String(pre.id))))continue;
          emit(stepForPanel(pre),depth+1);
        }
      }
      out.push(step.replaceSkillId?{panelId:step.panelId,skillId:step.skillId,cost:step.cost,replaceSkillId:step.replaceSkillId}
        :{panelId:step.panelId,skillId:step.skillId,cost:step.cost});
    };
    for(const step of ordered)emit(step,0);
    // Notes travel with the queue so skills() can log the bypass once per visit.
    out.notes=notes;
    return out;
  }
  // A board-derived attack has no replaceSkillId stored, so drop the weakest equipped
  // attack (lowest 倍 multiplier) to make room for it.
  function chooseReplaceTarget(board,skillId) {
    const actives=(board._produceIdol?.activeSkills||[]).filter(a=>!a.isDeleted&&String(a.id)!==String(skillId));
    ensure(actives.length,'没有可替换的主动技能');
    return actives.slice().sort((a,b)=>appealMultiplier(a.name)-appealMultiplier(b.name))[0];
  }
  function capPanelUseful(panel,capped) {
    return panel.skillCategory==='limit_break' && capped.some(a=>ATTR_NAME_RX[a].test(panel.skill?.name||''));
  }
  function reporterChoice(items) {
    const text=n=>walk(n).map(x=>typeof x.text==='string'?x.text:'').join(' ').normalize('NFKC');
    const decline=items.filter(n=>/(?:断る|断わる|お断り|拒[绝絕]|[谢謝][绝絕]|不接受|不接[受採采]|辞退)/.test(text(n)));
    if(decline.length)return one(decline,'记者拒绝选项');
    const rethink=items.filter(n=>/(?:考え直す|重新考[虑慮]|再考[虑慮])/.test(text(n)));
    return one(rethink,'记者拒绝或返回选项');
  }
  function riskOf(place) { return integer(place?.troubleRate, 0, 100, '所选工作事故率'); }
  function chooseAudition(auditions, gain) {
    ensure(Array.isArray(auditions), '试镜列表结构变化');
    const usable = auditions.filter(x => x.fan === gain && x.isSelectable === true);
    ensure(usable.length > 0, `${gain}粉丝可参加试镜`);
    // The week can list more than one audition with the same fan gain (for example a
    // normal and a special 5万 one). Always take the first entry in schedule order.
    return usable[0];
  }
  // A dialogue answer can raise 思い出 (memoryPoint/memoryLevel) or 心情 (tension/
  // tensionLevel) besides plain stats. Scoring only the main attribute left the mood
  // at rock bottom and pushed the 思い出 appeal several turns away, so the hints for
  // those two goals are weighed first while the mood is low.
  const ANSWER_WEIGHTS = { memoryPoint: 8, memoryLevel: 8, tension: 8, tensionLevel: 8, mental: 3, fan: 1, skillPoint: 1 };
  const ANSWER_SHORT = { memoryPoint: '思い出', memoryLevel: '思い出Lv', tension: '心情', tensionLevel: '心情Lv',
    mental: 'Me', fan: '粉丝', skillPoint: 'SP', vocal: 'Vo', dance: 'Da', visual: 'Vi' };
  function answerParams(event, id) {
    const list = event?.produceEventParams;
    if (!Array.isArray(list)) return null;
    return list.find(p => String(p.selectNum) === String(id)) || null;
  }
  function answerScore(params, attr, mood = null) {
    if (!params) return null;
    // 心情 peaks at 5; above 4 the tension part is already full and only wastes points.
    const needMood = !(Number.isFinite(mood) && mood >= 4);
    let score = 0;
    for (const k of Object.keys(ANSWER_WEIGHTS)) {
      const v = Number(params[k]);
      if (!Number.isFinite(v) || v === 0) continue;
      if (v <= 0) continue;
      const moodKey = k === 'tension' || k === 'tensionLevel';
      score += v * (moodKey && !needMood ? 1 : ANSWER_WEIGHTS[k]);
    }
    const main = Number(params[ATTR[attr]]);
    if (Number.isFinite(main) && main !== 0) { if (main > 0) score += main * 2; }
    for (const a of PARAMS) {
      if (a === ATTR[attr]) continue;
      const v = Number(params[a]);
      if (!Number.isFinite(v) || v === 0) continue;
      if (v > 0) score += v * 0.5;
    }
    return score;
  }
  function describeAnswer(params) {
    if (!params) return '';
    const bits = [];
    for (const k of Object.keys(ANSWER_SHORT)) {
      const v = Number(params[k]);
      if (Number.isFinite(v) && v > 0) bits.push(`${ANSWER_SHORT[k]}+${v}`);
    }
    return bits.join('／');
  }
  function chooseAnswer(event, attr, labels, mood = null) {
    const answers = event?.answers;
    ensure(Array.isArray(answers) && answers.length, '选项数据不可用');
    const candidates = answers.filter(a => labels.includes(String(a.id)));
    if (event.eventCategory?.selectRequestParamKey === 'isAccept') {
      ensure(candidates.some(a => String(a.id) === 'agree'), '约定选项结构变化');
      return one(candidates.filter(a => String(a.id) !== 'agree'), '拒绝约定选项').id;
    }
    const perfect = candidates.filter(a => a.result === 'perfect');
    if (perfect.length) return one(perfect, 'Perfect选项').id;
    const scored = candidates.map(a => ({ a, score: answerScore(answerParams(event, a.id), attr, mood) }));
    ensure(scored.every(x => x.score !== null), '未读到记事本的属性提示或Perfect结果，停止而不猜选项');
    const best = Math.max(...scored.map(x => x.score));
    ensure(best > 0, '没有心情或属性收益选项，请手动选择');
    return scored.find(x => x.score === best).a.id;
  }
  function isMemo(item) {
    const name = String(typeof item?.getName === 'function' ? item.getName() : item?.produceItem?.name || '').normalize('NFKC').replace(/[\s　]/g, '');
    return /^(秘密のメモ帳|秘密的(记事本|記事本|笔记本|筆記本|备忘录|備忘錄)|秘密(记事本|記事本|笔记本|筆記本|备忘录|備忘錄))$/.test(name);
  }
  function chooseMemo(items, area) {
    ensure(Array.isArray(items), '未读取到持有道具');
    return one(items.filter(x => isMemo(x) && Number.isSafeInteger(x.num) && x.num > 0 && x.isOpen === true &&
      typeof x.getEffectTypes === 'function' && x.getEffectTypes().includes('navigation') &&
      typeof x.checkAreaRestriction === 'function' && !x.checkAreaRestriction(area)), '可用秘密记事本');
  }
  // Cooperate with another document-start script's ezg accessor (e.g. daily helper).
  function captureEngine(win, receive) {
    const d = Object.getOwnPropertyDescriptor(win, 'ezg');
    const accept = x => { if (x?.sceneManager && x?.game) receive(x); };
    accept(win.ezg);
    if (d && !d.configurable) return false;
    let value = d && 'value' in d ? d.value : undefined;
    Object.defineProperty(win, 'ezg', { configurable: true, enumerable: d?.enumerable ?? true,
      get() { return d?.get ? d.get.call(win) : value; },
      set(next) { if (d?.set) d.set.call(win, next); else value = next; accept(next); } });
    return true;
  }
  function interactionEvent(button) {
    // BaseScene's visual tap effect also receives scene taps, before dialogue callbacks.
    const position=typeof button.getGlobalPosition==='function'?button.getGlobalPosition():{x:0,y:0};
    ensure(Number.isFinite(position.x)&&Number.isFinite(position.y),'点击坐标数据无效');
    const point=(x,y)=>({x,y,clone(){return point(this.x,this.y);}});
    const global=point(position.x,position.y);
    return {target:button,currentTarget:button,type:'tap',stopped:false,
      stopPropagation(){this.stopped=true;},data:{global,
        getLocalPosition(display){ensure(typeof display.toLocal==='function','局部坐标转换不可用');return display.toLocal(global);}}};
  }
  class Runner {
    constructor(env, options = {}) {
      this.env = env; this.options = { attr: 'vi', maxWeeks: 1, ...options };
      ensure(ATTR[this.options.attr], '主属性无效'); integer(this.options.maxWeeks, 1, 34, '本次周数');
      this.stopped = false; this.stopReason = ''; this.started = Date.now(); this.lastProgress = Date.now();
      this.bindings = new WeakMap(); this.did = new WeakSet(); this.skillSeen = new Set(); this.journal = null; this.pendingPopup = null;
      this.latest = null; this.lastWeek = null; this.startWeek = null; this.actions = 0;
      this.paused = false; this.pausedAt = 0; this.pauseReason = '';
      this.auditionWaitStarted = null; this.auditionLogged = 0;
      this.storyOwner = null; this.storyActedAt = 0; this.storyWatch = new WeakMap();
      this.transitionStarted = null; this.transitionLogged = 0; this.transitionRetries = 0;
    }
    check() {
      ensure(!this.stopped, `已停止（${this.stopReason || '未记录原因'}）；已发出的操作仍可能完成`);
      // A hidden tab (audition videos and full-screen performances hide it for a
      // moment) must not end the run: hold every input until the page is back.
      if (this.env.hidden() && !this.paused) this.pause('页面隐藏');
      ensure(!this.paused, '已暂停（页面隐藏）；切回游戏页后会自动继续');
      ensure(Date.now() - this.started < 60 * 60000, '达到一小时上限'); ensure(this.actions < 600, '操作数超限');
    }
    pause(reason) { if (this.stopped) return; if (!this.paused) { this.paused = true; this.pausedAt = Date.now(); } this.pauseReason = reason || this.pauseReason || '页面隐藏'; }
    resume() {
      if (!this.paused) return;
      const held = Math.round((Date.now() - this.pausedAt) / 1000);
      this.paused = false; this.pausedAt = 0; this.lastProgress = Date.now();
      this.log(`页面已恢复：继续（暂停 ${held} 秒）`);
    }
    // The reason is kept so a diagnostic states who stopped the run (button, Esc,
    // hidden tab, or the week-count guard) instead of one generic line.
    stop(reason) { this.stopped = true; this.stopReason = reason || this.stopReason || '手动'; }
    scene() { this.check(); const s = this.env.engine().sceneManager.currentScene; ensure(s, '游戏场景未就绪'); return s; }
    log(s) { this.env.log(s); }
    progress(s) { this.lastProgress = Date.now(); this.transitionStarted = null; this.transitionRetries = 0; this.auditionWaitStarted = null; if (s) this.log(s); }
    safe(root, target) {
      this.check(); ensure(this.scene() === root && visible(target, root), '目标已离开当前场景');
      for (let n = target; n; n = n.parent) { ensure(n.interactiveChildren !== false, '界面正在转场'); if (n === root) break; }
      const pop = modals(root).at(-1); ensure(!pop || under(target, pop), '有未处理弹窗，请接管');
      ensure(!walk(root).some(n => n._tutorialLayer && visible(n._tutorialLayer, root)), '请先完成教学');
    }
    inputTarget(root, button, label, event = 'tap') {
      this.safe(root, button);
      // The top-page Produce/Rest controls delegate taps from their named child.
      if (button.interactive !== true && hasListener(button, event)) {
        button = one((button.children || []).filter(n => n.name === 'btn' && visible(n, root) && n.interactive === true && hasListener(n, event)), `${label}内部按钮`);
      }
      this.safe(root, button);
      ensure(button.interactive === true && hasListener(button, event), `${label}按钮未就绪`);
      return button;
    }
    tap(root, button, label, event = 'tap') {
      button = this.inputTarget(root, button, label, event);
      this.log(label); this.actions++; button.emit(event, interactionEvent(button)); this.lastActAt = Date.now(); this.progress();
    }
    call(root, owner, method, args, label) {
      this.safe(root, owner); ensure(typeof owner[method] === 'function', `${label}接口已变化`);
      this.log(label); this.actions++; owner[method](...args); this.lastActAt = Date.now(); this.progress();
    }
    // WING reacts to taps with short animations; firing the next input immediately
    // makes the client drop or misroute it. Keep at least 400 ms between inputs.
    async pace() {
      const gap = ACTION_GAP - (Date.now() - (this.lastActAt || 0));
      if (gap > 0) await this.env.sleep(gap);
      this.check();
    }
    async wait(predicate, label, timeout = 20000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { this.check(); const result = predicate(); if (result) return result; await this.env.sleep(100); }
      throw new Error(`${label}超时；不会重复提交`);
    }
    attach(w) {
      if (!this.journal) {
        const old = this.env.load();
        this.journal = old?.runId === w.runId ? old : { version: VERSION, runId: w.runId, pending: null, verified: [] };
        // Journals written by older versions may lack fields the current code appends to.
        this.journal.verified ??= [];
        this.startWeek ??= w.week;
      }
      ensure(this.journal.runId === w.runId, '培育轮次变化，禁止自动开始另一轮');
      const p = this.journal.pending;
      if (p) {
        ensure(w.week >= p.week, '周次回退');
        if (w.week > p.week) {
          ensure(w.fans >= p.fans, '粉丝数减少，状态异常');
          this.journal.verified.push({ ...p, after: w }); this.journal.pending = null; this.env.save(this.journal);
          this.progress(`核验完成：周次 ${p.week}→${w.week}，粉丝 ${p.fans}→${w.fans}，SP ${p.sp}→${w.sp}`);
        } else if (w.produceState === 200) {
          // Same week and the client is still at MORNING: the committed tap never
          // resolved into an action, so the week was not consumed. Older journals
          // (written before produceState was captured) land here too; anything that
          // did act already shows AFTER_ACTION/END_OF_WEEK or a new week instead.
          this.journal.pending = null; this.env.save(this.journal);
          this.progress(`上次提交未生效（第${w.week}周仍在早晨），已清除待核验记录并继续`);
        } else throw new Error('本周已有提交记录但尚未核验推进；请核对游戏，避免重复消耗一周');
      }
      this.latest = w;
      if (this.lastWeek !== w.week) { this.lastWeek = w.week; this.progress(`S${w.season} 剩${w.left}周｜粉丝${w.fans}｜SP${w.sp}｜Me${w.mental}｜${this.options.attr.toUpperCase()}流${w.trendRank}`); }
      ensure(this.options.untilEnd===true || w.week - this.startWeek < this.options.maxWeeks, '本次设定周数已完成，已停止');
    }
    commit(w, action) {
      this.autoLogged=false;
      ensure(!this.journal.pending, '本周已有待核验操作');
      this.journal.pending = { week: w.week, fans: w.fans, sp: w.sp, action, state: w, time: Date.now() };
      this.activeCommitAction = action;
      this.env.save(this.journal); // Persist before any week-consuming click.
      this.committedAt = Date.now(); this.enteredAt = 0; this.entryRetries = 0;
    }
    // The client keeps one mainController per scenario and only shows/hides its
    // skip / skip-to-select / speed nodes for each segment. Blocking a node forever
    // silently ignored the next skippable segment, so a button becomes available
    // again as soon as the game hides or disables it.
    storyButton(root, button, label) {
      if (!button) return false;
      if (this.did.has(button)) {
        if (!visible(button, root) || button.interactive !== true) this.did.delete(button);
        return false;
      }
      if (!visible(button, root) || button.interactive !== true || !hasListener(button, 'tap')) return false;
      this.tap(root, button, label); this.did.add(button); this.storyActedAt = Date.now(); return true;
    }
    noteStory(owner) { this.storyOwner = owner; }
    // The track index advances once per dialogue line, so an unchanged index over
    // two seconds means the segment is stuck even though every tap succeeded.
    storyKey(adv) {
      const tm = adv?._trackManager;
      return tm && Number.isFinite(tm._current) ? String(tm._current) : null;
    }
    stalled(adv, now = Date.now()) {
      const key = this.storyKey(adv);
      if (key === null) return false;
      const previous = this.storyWatch.get(adv);
      if (!previous || previous.key !== key) { this.storyWatch.set(adv, { key, at: now }); return false; }
      return now - previous.at >= 2000;
    }
    fastOn(adv) {
      const c = adv && adv.mainController;
      return !!c && String(c.speedMode) === 'fast4' && c._speedButtonMap?.fast4?.isOn === true;
    }
    // The 4x control is a toggle button: the button's own "tap" handler flips isOn
    // before the AdvPlayer handler reads it, so two taps restore the previous state
    // and one tap on a lit button turns 4x OFF. Force the mode instead of counting
    // taps, otherwise "re-enable 4x" quietly ends up back at normal speed.
    ensureFast4(root, adv, label = '重新开启四倍速') {
      const c = adv && adv.mainController, fast = c && c._speedButtonMap && c._speedButtonMap.fast4;
      if (!c || !fast || !visible(fast, root) || fast.interactive !== true || !hasListener(fast, 'tap')) return false;
      if (this.fastOn(adv)) return true;
      const was = String(c.speedMode || 'normal');
      if (typeof c._controlSpeedButton === 'function') {
        if (typeof fast.resetOn === 'function') fast.resetOn(true);
        else { try { fast.isOn = true; } catch (_) { return false; } }
        this.call(root, c, '_controlSpeedButton', [fast, 'fast4'], `${label}（${was}→fast4）`);
      } else if (typeof c.init === 'function') {
        this.call(root, c, 'init', ['fast4'], `${label}（${was}→fast4）`);
      } else return false;
      this.did.add(fast); this.storyActedAt = Date.now(); this.storyWatch.delete(adv);
      return this.fastOn(adv);
    }
    async nudgeStory(root, adv, now = Date.now()) {
      if (!visible(adv.scenarioPlayer, root) || visible(adv.selectList, root)) return false;
      if (!this.stalled(adv, now)) return false;
      const c = adv.mainController, fast = c && c._speedButtonMap && c._speedButtonMap.fast4;
      if (fast && visible(fast, root) && fast.interactive === true && hasListener(fast, 'tap')) {
        if (!this.fastOn(adv)) {
          this.log('界面2秒未变化：四倍速未生效，重新开启');
          return this.ensureFast4(root, adv, '重新开启四倍速');
        }
      }
      if (hasListener(adv._interactionLayer, 'tap') && adv._interactionLayer.interactive === true) {
        this.log('界面2秒未变化：推进剧情对话');
        this.tap(root, adv._interactionLayer, '推进剧情对话'); this.storyActedAt = Date.now(); this.storyWatch.delete(adv);
        return true;
      }
      return false;
    }
    async story(root) {
      const players = walk(root).filter(n => n._event && n._advPlayer && visible(n._advPlayer, root)).reverse();
      for (const owner of players) {
        const adv = owner._advPlayer, list = adv.selectList;
        if (list && visible(list, root) && list._active !== false && Array.isArray(list.items) && list.items.some(n => visible(n, root))) {
          const items = list.items.filter(n => visible(n, root));
          if (items.some(n => this.did.has(n))) { this.noteStory(owner); return true; }
          const mood = Number(root._store?.userProduceIdol?.tensionLevel);
          const id = chooseAnswer(owner._event, this.options.attr, items.map(x => String(x.nextLabel)),
            Number.isFinite(mood) ? mood : null);
          const item = one(items.filter(x => String(x.nextLabel) === String(id)), '剧情选项');
          const answer = answerParams(owner._event, id);
          this.tap(root, item, owner._event.eventCategory?.selectRequestParamKey === 'isAccept' ? '拒绝约定，保持既定路线'
            : `选项 ${id}${answer ? `（${describeAnswer(answer)}）` : '（记事本无提示）'}`);
          items.forEach(n => this.did.add(n)); this.noteStory(owner); this.storyActedAt = Date.now(); return true;
        }
      }
      // Overlay result players are added after the base player, so dispatch the last
      // one first; a finished base player must not mask an active overlay player.
      const advs = walk(root).filter(n => n.mainController && n.scenarioPlayer && visible(n, root)).reverse();
      for (const adv of advs) {
        const c = adv.mainController;
        if (this.storyButton(root, c._skipToSelectTrackButton, '跳到剧情选项')) { this.noteStory(adv); return true; }
        if (this.storyButton(root, c._skipButton, '跳过已读剧情')) { this.noteStory(adv); return true; }
        const fast = c._speedButtonMap?.fast4;
        if (fast && !this.fastOn(adv)) this.did.delete(fast);
        if (fast && visible(fast, root) && fast.interactive === true && !this.fastOn(adv)) {
          if (this.ensureFast4(root, adv, '启用4倍速')) { this.noteStory(adv); return true; }
        }
        if (fast && (!visible(fast, root) || fast.interactive !== true) && this.did.has(fast)) this.did.delete(fast);
        const owner = players.find(x => x._advPlayer === adv);
        // Promise events intentionally ignore the saved speed setting. Advance only
        // the game's own scenario surface; never select the first answer blindly.
        if (owner?._event?.eventCategory?.ignoreSpeedSetting && !visible(adv.selectList, root) &&
            hasListener(adv._interactionLayer, 'tap') && adv._interactionLayer.interactive === true) {
          if (Date.now() - this.storyActedAt > 500) {
            this.tap(root, adv._interactionLayer, '推进对话'); this.noteStory(adv); this.storyActedAt = Date.now();
          } else this.noteStory(adv);
          await this.nudgeStory(root, adv);
          return true;
        }
        this.noteStory(adv);
        // A skipped or finished scenario can leave its player on screen while the
        // client waits for one ordinary dialogue tap; also re-assert 4x when the
        // segment stopped moving (morning / promise events reset it in the client).
        if (visible(adv.scenarioPlayer, root) && !visible(adv.selectList, root)) await this.nudgeStory(root, adv);
        return true;
      }
      return false;
    }
    tapBinding(root,button,label,repeat=false) {
      if(!button || !visible(button,root) || button.interactive!==true || !hasListener(button,'tap'))return false;
      for(let n=button;n;n=n.parent){if(n.interactiveChildren===false)return false;if(n===root)break;}
      const bindings=button.listeners('tap'),old=this.bindings.get(button);
      if(old && old.length===bindings.length && old.every((f,i)=>f===bindings[i]) && (!repeat || Date.now()-(this.lastResultTap||0)<600))return false;
      if(repeat)this.lastResultTap=Date.now();
      this.tap(root,button,label);this.bindings.set(button,bindings);return true;
    }
    async settlement(root) {
      const result=walk(root).find(n=>n._isWing===true && n._params && n._staff && n._btnNext && n._btnOk && visible(n,root));
      if(!result)return false;
      for(const [b,label] of [[result._btnSkip,'跳过季度结算计数'],[result._btnOk,'确认季度／周结算'],[result._btnNext,'继续季度结算']])if(this.tapBinding(root,b,label))return true;
      // Staff comments use the result surface's own tap callback to advance.
      this.tapBinding(root,result,'推进结算评语',true);
      return true;
    }
    async reporter(root) {
      const owner=walk(root).find(n=>n._reporterAppearance && n._answersLayer && n._producerCommentUI && typeof n._rejectInterview==='function' && visible(n,root));
      if(!owner)return false;
      const list=walk(owner._answersLayer).find(n=>Array.isArray(n._answerItems)&&n._answerItems.length&&visible(n,root));
      if(list){
        const item=reporterChoice(list._answerItems);
        this.tapBinding(root,item,'拒绝记者采访（已确认拒绝选项）');
      }else if(!this.tapBinding(root,owner,'推进记者对话'))this.tapBinding(root,owner._tapLayer,'跳过记者出场演出');
      return true;
    }
    async actionLayer(root, main, label='打开日程') {
      let layer = main._actionLayer;
      if (!visible(layer,root)) {
        this.tap(root,main._topLayer?._produceButton,label);
        layer = await this.wait(() => visible(main._actionLayer,root) && main._actionLayer.interactiveChildren !== false && main._actionLayer,label);
      }
      layer = main._actionLayer;
      if (typeof layer?.waitForInitialTaskFinish === 'function') { await layer.waitForInitialTaskFinish(); this.check(); }
      ensure(layer && visible(layer,root),'日程界面未就绪');
      return layer;
    }
    async lessonChoice(root, main, store, w, action) {
      if (action !== 'work_talk') return action;
      if (w.season > 4) { this.log(`S${w.season} 不安排课程，保持 Talk`); return action; }
      if (w.season < 1) { this.log(`S${w.season} 不安排课程，保持 Talk`); return action; }
      if (w.season === 4 && Number(w.trendRank) !== 3) {
        this.log(`S4 主属性流${w.trendRank}，不上课程（流 1／流 2 直接试镜）`);
        return action;
      }
      const layer = await this.actionLayer(root,main,'打开日程检查主属性课程');
      const lessonAction = `lesson_${this.options.attr}`, placeId = PLACE[lessonAction];
      ensure(Array.isArray(store.places), '课程列表未就绪');
      const place = one(store.places.filter(p=>String(p.producePlaceCategoryId)===placeId),'主属性课程');
      if (String(layer._selectedPlaceCategory)!==placeId) {
        this.call(root,layer,'selectPlace',[placeId],`预览${ACTION_LABEL[lessonAction]}`);
        await this.wait(()=>String(layer._selectedPlaceCategory)===placeId,'主属性课程预览');
      }
      const current = snapshot(store,this.options.attr);
      ensure(current.week===w.week && current.sp===w.sp,'课程预览期间状态变化');
      let preview;
      try { preview = lessonPreview(place); }
      catch (error) { this.log(`课程预览不可用，保持 Talk：${error.message}`); return action; }
      const boosts = preview.upgrades.join('／') || '无强化';
      const wanted = lessonWanted(preview, w.season, w.trendRank);
      const bar = w.season === 1 || w.season === 2 ? '支援>3'
        : w.season === 4 ? '支援≥2 或任强化，且主属性为流3' : '支援≥2 或有强化';
      this.log(`主属性课程：支援${preview.supportCount}名｜Excellent ${preview.excellentCount}｜${boosts} → ${wanted?'优先课程':'保持 Talk'}（S${w.season} 门槛：${bar}）`);
      return wanted ? lessonAction : action;
    }
    async talkFanPreview(root, main, store, action = 'work_talk') {
      const layer = await this.actionLayer(root, main, '打开日程查看Talk预计粉丝');
      const placeId = PLACE[action];
      ensure(Array.isArray(store.places), '工作列表未就绪');
      const place = one(store.places.filter(p => String(p.producePlaceCategoryId) === placeId), '目标工作');
      if (String(layer._selectedPlaceCategory) !== placeId) {
        this.call(root, layer, 'selectPlace', [placeId], '预览Talk');
        await this.wait(() => String(layer._selectedPlaceCategory) === placeId, 'Talk 预览');
      }
      // The client shows the expected fan gain of the selected place at produceTop.
      return { fan: Number(place.fan), growth: place.growthPoint || {} };
    }
    // Season 2 only: the last week asks whether talk alone still reaches 10000 fans.
    async s2LastWeekPlan(root, main, store, w) {
      const talk = await this.talkFanPreview(root, main, store, 'work_talk');
      const need = 10000 - w.fans;
      if (!talkCoversFan(talk.fan, w.fans)) {
        this.log(`S2 最后一周：Talk 预计粉丝 +${Number.isFinite(talk.fan) ? talk.fan : '未知'}，补不齐 ${need}，改打 1 万粉丝试镜`);
        return 'audition';
      }
      this.log(`S2 最后一周：Talk 预计粉丝 +${talk.fan}，可补足 ${need}，本周保持 Talk`);
      return 'talk';
    }
    async work(root, main, store, w, action) {
      const layer = await this.actionLayer(root,main,'打开日程');
      const placeId = PLACE[action];
      ensure(Array.isArray(store.places), '工作列表未就绪');
      const place = one(store.places.filter(p=>String(p.producePlaceCategoryId)===placeId),'目标工作');
      if (String(layer._selectedPlaceCategory)!==placeId) {
        this.call(root,layer,'selectPlace',[placeId],`选择${ACTION_LABEL[action] || action}`);
        await this.wait(()=>String(layer._selectedPlaceCategory)===placeId,'工作预览');
      }
      const current = snapshot(store,this.options.attr);
      ensure(current.week===w.week && current.sp===w.sp,'选择工作期间状态变化');
      if (action.startsWith('lesson_')) {
        const preview = lessonPreview(place);
        ensure(lessonWanted(preview, current.season, current.trendRank),'课程强化条件变化，停止而不提交');
        this.log(`课程条件复核：支援${preview.supportCount}名｜${preview.upgrades.join('／') || '无强化'}`);
      }
      const rate=riskOf(layer.selectedAction); ensure(String(layer.selectedAction?.producePlaceCategoryId)===placeId,'预览与目标工作不一致');
      this.log(`所选工作事故率 ${rate}%`);
      if (rate>10) {
        this.call(root,main,'_showTop',[],'事故率超过10%，返回休息');
        await this.wait(()=>visible(main._topLayer?._restButton,root),'休息按钮');
        this.inputTarget(root,main._topLayer._restButton,'休息');
        this.commit(w,'rest'); this.pendingPopup={kind:'rest',root};
        this.tap(root,main._topLayer._restButton,'休息');
      } else {
        ensure(riskOf(layer.selectedAction)===rate,'提交前事故率变化');
        this.inputTarget(root,layer._decisionButton,'提交');this.commit(w,action);
        this.tap(root,layer._decisionButton,'提交本周工作');
      }
      this.activeCommitWeek=w.week;
      await this.env.sleep(350);
    }
    async audition(root,main,store,w,gain) {
      const usable=(store.produceAuditions||[]).filter(a=>a.fan===gain && a.isSelectable===true);
      const target=chooseAudition(store.produceAuditions,gain);
      if(usable.length>1)this.log(`试镜候选：${gain}粉丝共${usable.length}项，按日程顺序参加第1项`);
      if (!visible(main._actionLayer,root)) {
        this.tap(root,main._topLayer._produceButton,'打开试镜日程');
        await this.wait(()=>visible(main._actionLayer,root)&&main._actionLayer.interactiveChildren!==false,'试镜菜单');
      }
      const layer=main._actionLayer;
      this.call(root,layer,'selectAudition',[],'切换试镜列表');
      await this.wait(()=>layer._auditionCarousel || layer._actionSelect?.actionType===4,'试镜列表');
      await this.selectAuditionTarget(root,layer,target);
      ensure(target.isSelectable===true && target.fan===gain,'试镜条件发生变化');
      this.inputTarget(root,layer._decisionButton,'提交'); this.commit(w,`audition_${gain}`);this.activeCommitWeek=w.week;
      this.tap(root,layer._decisionButton,'参加目标试镜'); await this.env.sleep(350);
    }
    async selectAuditionTarget(root,layer,target) {
      // New WING UI nests module 30772 under actionSelect; the wrapper has no scrollToIndex.
      const select=layer._actionSelect;
      if(select?.actionType===4 && visible(select,root) && select._actionListCarousel) {
        const carousel=select._actionListCarousel;
        ensure(Array.isArray(select._auditions)&&Array.isArray(select._auditionContents),'试镜轮播结构变化');
        const index=select._auditions.findIndex(a=>String(a.id)===String(target.id));
        ensure(index>=0 && String(select._auditionContents[index]?.id)===String(target.id),'试镜内容与目标ID不符');
        this.call(root,carousel,'scrollToIndex',[index],`选择${target.fan}粉丝试镜`);
        await this.wait(()=>!carousel._tween && String(carousel.currentContent?.id)===String(target.id),'试镜轮播稳定');
      } else {
        const carousel=layer._auditionCarousel;
        ensure(carousel && visible(carousel,root),'未适配的试镜选择界面');
        const index=layer._store.produceAuditions.findIndex(a=>String(a.id)===String(target.id));
        ensure(index>=0,'目标试镜不存在');
        this.call(root,layer,'selectAuditionWithIndex',[index],`选择${target.fan}粉丝试镜`);
      }
      await this.wait(()=>layer.selectedActionType===4 && String(layer._selectedPlaceCategory)===String(target.id),'目标试镜');
    }
    async popup(root) {
      const pops=modals(root),p=pops.at(-1); if(!p) {this.pendingPopup=null;return false;}
      // The client's API error dialog carries お問い合わせID / エラーコード. It is not a
      // decision we can answer: stop and keep the id instead of tapping through it.
      const text=walk(p).map(n=>typeof n.text==='string'?n.text:'').filter(Boolean).join(' ');
      if(/エラーコード|お問い合わせID|错误代码|问题ID|問題ID/.test(text)){
        const id=(/お問い合わせID[:：]\s*(\S+)/.exec(text)||/问题ID[:：]\s*(\S+)/.exec(text)||[])[1]||'未知';
        throw new Error(`游戏报错弹窗（ID ${id}）：${text.replace(/\s+/g,' ').slice(0,80)}；已停止，请不要重复提交`);
      }
      ensure(this.pendingPopup?.root===root,'遇到未适配弹窗，停止');
      const buttons=walk(p._buttons).filter(b=>b.interactive===true && hasListener(b,'tap'));
      const yes=buttons.filter(b=>textures(b).some(t=>/(submit|ok|yes|decision|decide)_button/.test(t)));
      // The concert confirm dialog draws its ok button with a texture that is not
      // always readable here; it is also always the last button in the row, so fall
      // back to that instead of stopping on a dialog the run itself opened.
      const last=this.pendingPopup.kind==='WING参赛'?buttons[buttons.length-1]:null;
      const b=yes.length===1?yes[0]:(last||one(yes,`${this.pendingPopup.kind}确认按钮`));
      await this.pace();this.tap(root,b,`确认${this.pendingPopup.kind}`);this.pendingPopup=null;return true;
    }
    // AUTO still runs the performance and resolves the appeal meter, but the card and
    // the target of every turn come from planBattleTurn, so a finishing blow can be
    // kept for the trend-first judge and for the main attribute judge.
    installBattlePolicy(b) {
      const mainAttr=ATTR[this.options.attr];
      if(b.__wingTePolicy===mainAttr)return false;
      const previous=b.__wingTePolicy?b.__wingTePrevious:{card:b._getSkillCardForLiveAuto,judge:b._getJudgeForLiveAuto};
      b.__wingTePolicy=mainAttr;b.__wingTePrevious=previous;
      const fallbackCard=()=>{
        const hand=b._skillCardHand,list=hand&&Array.isArray(hand.currentActiveSkills)?hand.currentActiveSkills:[];
        for(const e of list){const c=hand.getSkillCard(e.skillId,e.idolId);if(c&&c.disabled!==true)return c;}
        return b.selectedCard||null;
      };
      let planned=null;
      b._getSkillCardForLiveAuto=()=>{
        try {
          planned=planBattleTurn(b,mainAttr);
          const j=planned.judge, turn=(Number(b._concertService?.turn)||0)+1;
          this.log(`本战第${turn}回合：${planned.reason}｜目标${j.attribute}流${judgeOrder(j)} 余${Math.round(j.hp)}｜预计${Math.round(planned.damage)}`);
          return planned.card;
        } catch(err) {
          planned=null;
          // The last judge dying is the normal end of a concert, not a policy failure.
          if(!/没有可攻击审阅员/.test(err.message))this.log(`本战策略回退：${err.message}`);
          const card=typeof previous.card==='function'?previous.card.call(b):null;
          return card||fallbackCard();
        }
      };
      b._getJudgeForLiveAuto=()=>{
        try { if(planned)return planned.judge; } catch(_) { /* fall back below */ }
        if(typeof previous.judge==='function')return previous.judge.call(b);
        return battleJudges(b).sort((x,y)=>judgeOrder(x)-judgeOrder(y))[0]||null;
      };
      const judges=battleJudges(b);
      const trend=judges.filter(j=>judgeOrder(j)===1)[0]||null;
      const main=judges.filter(j=>j.attribute===mainAttr)[0]||null;
      this.log(`本战策略：主攻流1（${trend?trend.attribute:'暂无'}），兼顾主属性（${main?main.attribute:'暂无'}）${trend&&main&&trend===main?'；两者为同一审阅员，最后一击只能收一次':''}`);
      return true;
    }
    // The skill board is loaded additively and hides the produce page while it is
    // open, so the concert entry must wait for the page to come back and must call
    // the produce page's own entry (the top layer only owns the button that opens
    // the confirm dialog).
    async enterConcert(root,main,w) {
      const label='进入WING本战';
      // Only a concert week has a live to enter. Calling the entry on a work week
      // makes the client ask the server for a concert that does not exist, which is
      // what produced the 9000 error dialog.
      ensure(!w || w.concert===true, '本周不是周赛周，不能进入本战');
      await this.wait(()=>this.currentScene()===root && !!main && visible(main,root) && main.interactiveChildren!==false,'培育主页恢复',8000);
      if(typeof main._onGoToConcert==='function'){this.call(root,main,'_onGoToConcert',[],label);this.enteredAt=Date.now();return true;}
      if(typeof main._goToConcert==='function'){this.call(root,main,'_goToConcert',[],label);this.enteredAt=Date.now();return true;}
      const top=main._topLayer;
      this.tap(root,ensure(top&&top._produceButton,'未找到参赛入口（顶栏与培育按钮）；已停止，请导出诊断'),label);
      this.enteredAt=Date.now();
      return true;
    }
    async liveSpeed(root,b) {
      const sc=b._speedChanger,button=b._speedButton;
      const speed=Number(sc&&sc.speed);
      if(!Number.isFinite(speed)||speed>=3)return false;
      if(!visible(button,root)||button.interactive!==true)return false;
      this.tap(root,button,`本战演出加速：${speed}→${speed+1}`);
      return true;
    }
    async battle(root) {
      const b=walk(root).find(n=>n._concertService && n._judgeList && n._skillCardHand && visible(n,root));
      if(!b)return false;
      ensure(this.latest,'必须先从培育主页连接，不能从未知试镜中途盲跑');
      const svc=b._concertService;
      if(typeof svc.checkFinishResult==='function') {
        let result=null;try{result=svc.checkFinishResult();}catch(_){result=null;}
        if(result&&result.finished)return false;
      }
      this.installBattlePolicy(b);
      await this.liveSpeed(root,b);
      const autoExists=svc.existsLiveAutoFunction===true,autoReady=svc.isLiveAutoUnlocked===true;
      if(!this.autoLogged){this.autoLogged=true;this.log(`本战AUTO：${autoExists?autoReady?'已解锁':'未解锁':'本战不支持AUTO'}`);}
      if(b._autoButton.isOn!==true) {
        // The policy needs the client's own timing-gauge solver; a manual gauge waits
        // for a real touchstart, so a locked AUTO can only be handed back to the player.
        ensure(autoExists,'本战不支持AUTO：判定条只能手点，已停下等你手动打完本战');
        ensure(autoReady,'本战AUTO尚未解锁：判定条只能手点，已停下等你手动打完本战（技能与SP已在战前处理好）');
        // The toggle flips itself on tap, so only the fallback path presets isOn.
        if(visible(b._autoButton,root)&&b._autoButton.interactive===true) {
          this.tap(root,b._autoButton,'开启AUTO并由助手选卡选目标');
        } else {
          if(typeof b._autoButton.resetOn==='function')b._autoButton.resetOn(true);
          b._autoOnStart=false;
          this.call(root,b,'_enableAutoPlay',[true],'开启AUTO并由助手选卡选目标');
        }
      }
      this.progress(); return true;
    }
    async confirmSkill(root, board, label) {
      const pop = await this.wait(() => modals(root).find(n => under(n,board._dialogLayer)),label);
      const yes = await this.wait(() => {
        const buttons=walk(pop._buttons).filter(b => visible(b,root) && b.interactive===true && hasListener(b,'tap') && textures(b).some(t=>/(submit|ok|yes|decision|decide)_button/.test(t)));
        if(!buttons.length)return null;
        const target=one(buttons,label);
        for(let n=target;n;n=n.parent){if(n.interactiveChildren===false)return null;if(n===root)break;}
        return target;
      },label+'可点击');
      this.tap(root,yes,label);
    }
    async concertResult(root) {
      const result=walk(root).find(n=>n._params?.concertData && n._judgeSpeech && n._okButton && typeof n._doNotContinue==='function');
      if(!result)return false;
      if(this.tapBinding(root,result._okButton,'确认试镜结果（不使用续关道具）'))return true;
      this.tapBinding(root,result,'推进试镜结果评语');return true;
    }
    async skills(root) {
      const board=walk(root).find(n=>n._skillPanelsLayer && n._produceIdol && typeof n._onSelectIdolSkillPanel==='function');
      if(!board)return false;
      let plan=this.options.skillPlan;
      // Starting on the board (or resuming after a restart) leaves no main-page
      // snapshot, so only the conservative cap purchase can run unattended.
      const capOnly=this.skillMode==='cap' || (!this.skillMode && !this.latest);
      ensure(!board._isViewOnly && !board._isTutorialPlaying,'技能页只读或正在教学');
      await this.wait(()=>board.interactiveChildren!==false && !board._switching,'技能页准备');
      // Every produce run can offer a different board, so the priority is re-judged from
      // the live board on each visit. A route from the same run only contributes its
      // replacement hints; a route from an earlier run is not reused at all - the run
      // would otherwise keep buying last run's weakest leftovers.
      const runKey=this.latest?String(this.latest.runId):'';
      const newRun=this.skillRunKey!==runKey;
      if(newRun){this.skillRunKey=runKey;this.skillOrderLogged=false;}
      const sameRun=!!(plan && this.latest && String(plan.runId)===runKey);
      const hinted=!!(plan && sameRun && planMatchesBoard(plan,board))?plan:null;
      if(plan && !hinted && sameRun) {
        this.log('存储路线与当前技能页不符，本次按技能页重新判定学习优先级');
        plan=null;
      } else if(plan && !hinted) {
        this.log(`本次培育重新判定技能学习优先级（${plan.runId}→${runKey||'未连接主页'}，不沿用上一轮路线顺序）`);
        plan=null;
      } else if(!plan) {
        this.log('未配置技能路线：本次按技能页判定技能学习优先级');
      }
      const planMatched=!!hinted;
      const mainAttr=ATTR[this.options.attr];
      const wantedAttrs=[mainAttr,this.latest?this.latest.trendFirst:null].filter((a,i,x)=>a&&x.indexOf(a)===i);
      const attempted=new Set();
      let deferred=false,bought=0,unreachable=0;
      const panelOf=id=>walk(board._skillPanelsLayer).filter(n=>String(n.normalSkillPanel?.id)===String(id)).map(n=>n.normalSkillPanel)[0];
      // Purchase order follows the run: attack skills first, then the attribute boosts,
      // and the limit nodes last - and only for attributes close to their cap. Buying
      // the route verbatim left boosts that were missing from the stored route (for
      // example Visual130%UP) unlearned, and a gated high-value panel now pulls in the
      // prerequisites that still block it.
      const buildQueue=()=>skillPurchaseQueue(board,planMatched?plan:null,{capOnly,wantedAttrs,planMatched});
      this.skillNotes=this.skillNotes||new Set();
      const noteOnce=msg=>{if(this.skillNotes.has(msg))return;this.skillNotes.add(msg);this.log(msg);};
      if(!capOnly) {
        const treeOf=skillTreeOf(board),pTree=produceTreeOf(board);
        const banned=walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel)
          .filter(p=>!p.isAcquired&&supportAttackBanned(p,treeOf,pTree)).map(p=>p.skill?.name||p.id);
        if(banned.length)noteOnce(`支援卡的2.5倍攻击技能不学：${banned.join('、')}`);
      }
      if(!capOnly && (newRun||!this.skillOrderLogged)) {
        this.skillOrderLogged=true;
        const head=buildQueue().slice(0,8).map(s=>panelOf(s.panelId)?.skill?.name||s.panelId);
        if(head.length)this.log(`本轮技能学习顺序：第${this.latest?this.latest.week:0}周｜${head.join(' → ')}`);
      }
      if(!capOnly) {
        // Say which attacks are deliberately left alone; a stored route may list them,
        // but buying a weaker attack would replace a stronger one already equipped.
        const keep=new Set(bestAttackPanels(board).map(p=>String(p.id)));
        const skipped=walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel)
          .filter(p=>p.skillCategory==='active'&&!p.isDeleted&&!p.isAcquired&&!keep.has(String(p.id))).map(p=>p.skill?.name).filter(Boolean);
        if(skipped.length)this.log(`攻击技能只学倍率最高的4个，不学：${skipped.join('、')}`);
      }
      for(;;) {
        const queue=buildQueue();
        for(const note of queue.notes||[])noteOnce(note);
        const pending=queue.filter(s=>!attempted.has(String(s.panelId)));
        if(!pending.length)break;
        const sp=board._produceIdol.skillPoint;
        // The queue is in priority order, so the head is the skill worth buying next. If
        // that one is not affordable, buying a cheaper lower priority node instead would
        // spend SP on something the plan ranked behind it - so stop shopping entirely.
        const head=pending[0];
        if(!Number.isFinite(sp)||sp<head.cost) {
          deferred=true;
          this.log(`SP不足，本轮停止购买：${panelOf(head.panelId)?.skill?.name||head.panelId}（需${head.cost}，现有${sp}）`);
          break;
        }
        const step=head;
        attempted.add(String(step.panelId));
        const node=one(walk(board._skillPanelsLayer).filter(n=>String(n.normalSkillPanel?.id)===step.panelId),'技能节点');
        const panel=node.normalSkillPanel;
        ensure(String(panel.skill?.id)===step.skillId,'技能身份变化');
        ensure(!panel.isDeleted && !panel.isAwakeSkill,'路线包含已删除或觉醒技能');
        if(panel.isAcquired)continue;
        ensure(panel.skillPoint===step.cost,'技能SP消耗与路线不符');
        if(panel.isArrival!==true || panel.isLocked!==false) {
          unreachable++;
          this.log(`前置未满足，暂缓：${panel.skill.name}`);
          continue;
        }
        const before=integer(board._produceIdol.skillPoint,0,10000,'技能页SP');
        ensure(['active','passive','limit_break'].includes(panel.skillCategory),'未适配的技能类型');
        let old;
        if(panel.skillCategory==='active') {
          old=step.replaceSkillId
            ?one(board._produceIdol.activeSkills.filter(a=>!a.isDeleted && String(a.id)===String(step.replaceSkillId)),'指定替换技能')
            :chooseReplaceTarget(board,step.skillId);
          ensure(String(old.id)!==String(step.skillId),'不能替换为相同技能');
        }
        await this.pace();this.tap(root,node,`查看技能：${panel.skill.name}`);
        const detail=await this.wait(()=>!board._switching && board._skillPanelDetail?._normalSkill?._skillPanel===panel && board._skillPanelDetail._normalSkill,'技能详情');
        await this.pace();this.tap(root,detail._acquireButton,`学习技能（${step.cost}SP）`);
        await this.confirmSkill(root,board,'确认技能学习');
        if(old) {
          const list=await this.wait(()=>walk(board._dialogLayer).find(n=>n.name==='deleteSkillList'&&visible(n,root)),'替换技能列表');
          const active=board._produceIdol.activeSkills.filter(a=>!a.isDeleted);
          ensure(list.children.length===active.length,'替换列表数量变化');
          const row=list.children[active.indexOf(old)];
          ensure(walk(row).some(n=>n.name==='name'&&n.text===old.name),'替换项与指定技能不一致');
          const button=one(walk(row).filter(n=>n.name==='selectButton'&&n.interactive===true),'替换技能按钮');
          await this.pace();this.tap(root,button,`替换旧技能：${old.name}`);
          await this.confirmSkill(root,board,'确认指定技能替换');
        }
        await this.wait(()=>node.normalSkillPanel?.isAcquired===true && board.interactiveChildren!==false,'技能学习结果');
        ensure(board._produceIdol.skillPoint===before-step.cost,'技能学习后的SP变化不符');
        if(old)ensure(board._produceIdol.activeSkills.some(a=>!a.isDeleted&&String(a.id)===step.skillId),'新主动技能未装备');
        this.progress(`技能已核验：${panel.skill.name}，SP ${before}→${board._produceIdol.skillPoint}`);
        bought++;
      }
      // Planning happens from the live board, so a panel the client still marks as
      // gated is only a skip with a log - never a reason to stop the run.
      if(!bought&&!deferred&&unreachable)this.log(`技能页仍有${unreachable}项前置未满足，本次跳过`);
      if(!bought&&!deferred&&!unreachable)this.log('技能页没有可学习的节点，返回培育页');
      if(this.latest)this.skillSeen.add(`${this.latest.runId}:${this.latest.week}`);
      const back=one(walk(board._uiPartsLayer).filter(n=>n.name==='backButton'&&visible(n,root)),'技能页返回按钮');
      await this.pace();this.tap(root,back,'完成技能检查，返回培育');
      await this.wait(()=>!under(board,this.env.engine().sceneManager.currentScene),'离开技能页');
      return true;
    }
    async prepareMemo() {
      const root=this.scene();
      const deck=one(walk(root).filter(n=>n._itemPreparation && Array.isArray(n._selectedItems) && typeof n._onSelectProduceItem==='function'),'道具选择界面');
      this.safe(root,deck._itemPreparation);
      const store=deck._store;
      ensure(String(store.selectedProduceId)==='1','仅在WING准备页装备记事本');
      ensure(store.currentStaminaTimes===1,'请将体力倍率设为1倍后再选道具');
      const memo=chooseMemo(store.userProduceItems,store.selectedProduceId);
      ensure(deck._selectedItems.every(isMemo),'已有其他道具，停止以免更改你的选择');
      if(!deck._selectedItems.some(isMemo))this.call(root,deck,'_onSelectProduceItem',[memo],'选择秘密记事本');
      ensure(deck._selectedItems.length===1 && isMemo(deck._selectedItems[0]),'记事本选择未生效');
      this.log('已装备1本秘密记事本；请在游戏内确认开始。本助手不会自动再开下一轮。');
    }
    phase(kind, owner, timeout) {
      if (this.phaseOwner !== owner || this.phaseKind !== kind) {
        this.phaseOwner = owner; this.phaseKind = kind; this.phaseStarted = Date.now();
      }
      ensure(Date.now() - this.phaseStarted < timeout, `${kind}等待超时，请导出诊断`);
    }
    async run() {
      this.log('开始单轮流程；Esc停止。刷新后需手动继续。');
      const initial=this.scene();
      if(initial._store?.produceType==='wing'){try{this.latest=snapshot(initial._store,this.options.attr);}catch(_){/* Settlement can hold an incomplete/stale week store. Connect after it closes. */}}
      if(!this.latest){const pending=this.env.load()?.pending;if(pending?.state&&pending.action?.startsWith('audition_')){this.latest=pending.state;this.startWeek=pending.state.week;}}
      while(true) {
        let root=null;
        try {
        if(this.paused) {
          if(Date.now()-this.pausedAt>600000) this.stop('暂停超过十分钟');
          await this.env.sleep(400); continue;
        }
        root=this.scene();
        await this.pace();
        if(this.ending(root)){ await this.finishProduce(root); return; }
        if(await this.settlement(root)){this.phase('季度结算',root,180000);await this.env.sleep(160);continue;}
        if(await this.reporter(root)){this.phase('记者事件',root,180000);await this.env.sleep(160);continue;}
        if(await this.story(root)){this.phase('剧情',this.storyOwner||root,180000);await this.env.sleep(80);continue;}
        if(await this.concertResult(root)){this.phase('试镜结算',root,180000);await this.env.sleep(160);continue;}
        if(await this.battle(root)){this.phase('试镜',root,240000);await this.env.sleep(150);continue;}
        this.phaseKind = null;
        if(await this.skills(root))continue;
        if(modals(root).length){await this.popup(root);await this.env.sleep(200);continue;}
        const main=root._mainLayer,store=root._store;
        const ready=store?.produceType==='wing' && main && (visible(main._actionLayer,root) || visible(main._topLayer?._produceButton,root));
        if(ready && main.interactiveChildren!==false && root.interactiveChildren!==false && (!main._blocker || !visible(main._blocker,root))) {
          const w=snapshot(store,this.options.attr);
          if(this.journal?.pending && this.activeCommitWeek===w.week){
            const committed=this.activeCommitAction||this.journal?.pending?.action||'';
            const battleWeek=committed==='semi_battle'||committed==='final_battle';
            const inBattle=!!walk(root).find(n=>n._concertService);
            const since=Date.now()-(this.enteredAt||this.committedAt||Date.now());
            // The live loads as its own scene. If it never shows up the entry call did
            // not take, so retry it instead of idling until the timeout. Work weeks have
            // no live at all: they just need time for the client to advance.
            if(battleWeek && !inBattle && since>6000 && (this.entryRetries||0)<3){
              this.entryRetries=(this.entryRetries||0)+1;
              this.log(`本战演出尚未出现，重试进入（第${this.entryRetries}次）`);
              await this.enterConcert(root,main,w);this.lastProgress=Date.now();continue;
            }
            if(battleWeek) ensure(!(!inBattle && since>40000),'进入本战后40秒仍未出现演出场景；已停止，请导出诊断');
            else ensure(since<90000,'提交后90秒仍未推进到下一周；已停止，请导出诊断');
            await this.env.sleep(120);continue;
          }
          this.attach(w);let action=decide(w);this.log(`决策：${action}`);
          const skillKey=`${w.runId}:${w.week}`;
          if(this.options.skillsAcknowledged===true) { this.skillSeen.add(skillKey); this.options.skillsAcknowledged=false; }
          const skillMode=skillTiming(w,action);
          if(skillMode && !this.skillSeen.has(skillKey)) {
            this.skillMode=skillMode;
            const battle=action==='semi_battle'||action==='final_battle';
            try {
              this.call(root,main,'showSkillBoard',[],battle?'准决赛/决赛前先学技能（攻击→增益→上限）':skillMode==='audition'?'试镜前先学技能（攻击→增益→上限）':'属性触顶，仅检查可用上限节点');
            } catch(e) {
              // A concert week may not expose the skill board; never block the battle on it.
              if(!battle)throw e;
              this.log(`本战前无法打开技能页：${e.message}；直接进入本战`);
              this.skillSeen.add(skillKey);
            }
            await this.env.sleep(200);continue;
          }
          let s2LastWeek=false;
          if(action==='work_talk' && w.season===2 && w.left===1 && w.fans<10000) {
            // Talk only replaces the audition when its own preview closes the fan gap,
            // and a lesson must not take that week either - lessons give no fans.
            if(await this.s2LastWeekPlan(root,main,store,w)==='audition') {
              await this.audition(root,main,store,w,10000);
              continue;
            }
            s2LastWeek=true;
          }
          if(action==='work_talk' && !s2LastWeek) {
            const preferred=await this.lessonChoice(root,main,store,w,action);
            if(preferred!==action) { this.log(`课程优先：${ACTION_LABEL[action]}→${ACTION_LABEL[preferred]}`); action=preferred; }
          }
          if(PLACE[action])await this.work(root,main,store,w,action);
          else if(action.startsWith('audition_'))await this.audition(root,main,store,w,Number(action.slice(9)));
          else if(action==='semi_battle' || action==='final_battle') {
            this.latest=w;this.pendingPopup={kind:'WING参赛',root};
            this.commit(w,action);this.activeCommitWeek=w.week;
            // The top layer's produce button only opens a "start the live?" dialog and
            // hides itself behind it; the client's submit then just disables the top
            // layer and calls the produce page's own _onGoToConcert. Call that entry
            // directly, after waiting out the skill board, and keep the dialog away.
            await this.enterConcert(root,main,w);
          }
        } else if (this.transition(root)) {
          // Story skips and week ends fade the front layer out; keep waiting while the
          // client is actually transitioning instead of declaring an unknown page.
          this.transitionStarted ??= Date.now();
          const waited = Date.now() - this.transitionStarted;
          ensure(waited < 180000, '转场超过三分钟仍未结束，已停止；请导出诊断');
          if (waited > 10000 && Date.now() - this.transitionLogged > 10000) {
            this.transitionLogged = Date.now();
            this.log(`等待转场完成（已等待 ${Math.round(waited / 1000)} 秒）`);
            this.lastProgress = Date.now();
          }
          await this.env.sleep(150);
        } else if(this.auditionScene(root)) {
          // An audition performance runs without input for up to a couple of minutes;
          // wait it out instead of calling the screen unknown after 45 seconds.
          this.auditionWaitStarted ??= Date.now();
          const waited = Date.now() - this.auditionWaitStarted;
          ensure(waited < 240000, '试镜演出超过四分钟仍未结束，已停止；请导出诊断');
          if (waited > 10000 && Date.now() - this.auditionLogged > 10000) {
            this.auditionLogged = Date.now();
            this.log(`等待试镜演出结束（已等待 ${Math.round(waited / 1000)} 秒）`);
            this.lastProgress = Date.now();
          }
          await this.env.sleep(200);
        } else {
          ensure(Date.now()-this.lastProgress<45000,`当前剧情、结果页或转场尚未适配，已停止；请导出诊断（${sceneHint(root)}）`);
          await this.env.sleep(120);
        }
        }catch(e){
          const current=this.currentScene();
          if(e.message==='目标已离开当前场景'){
            if(current!==root){this.log('场景已切换，重新读取当前界面');continue;}
            // The target can vanish under the tap without a scene change (a dialog or
            // loading layer replaces the node). Once this week is committed the pending
            // record blocks a second action, so waiting is harmless.
            if(this.journal?.pending && this.activeCommitWeek===this.latest?.week){this.log('界面已切换，等待本战场景');await this.env.sleep(200);continue;}
          }
          // A tap issued exactly while the client fades between layers is harmless to
          // retry; the old behaviour aborted a whole run on that transient state.
          if(/已暂停（页面隐藏）/.test(e.message)){ await this.env.sleep(400); continue; }
          if(e.message==='界面正在转场' || e.message==='游戏场景未就绪'){
            this.transitionRetries++;
            ensure(this.transitionRetries<160, `${e.message}；等待超过上限，已停止；请导出诊断`);
            if(this.transitionRetries===1)this.log(`${e.message}，等待后重试`);
            await this.env.sleep(300);continue;
          }
          throw e;
        }
      }
    }
    currentScene() { try { return this.env.engine().sceneManager.currentScene || null; } catch (_) { return null; } }
    transition(root) { try { return transitionState(root); } catch (_) { return false; } }
    // The audition performance is its own scene (source/readable/app.js:160651 sets
    // _auditionId); it plays itself out and then hands over to the result page.
    auditionScene(root) { try { return !!(root && (root._auditionId || (root._mvLayer && root._appealPhaseLayer))); } catch (_) { return false; } }
    // The ending scene owns _endingLayer (source/readable/41602.js:3017) and finishes by
    // loading the home scene, i.e. the produce run is over and must not be re-entered.
    ending(root) { try { return !!(root && root._endingLayer && visible(root._endingLayer, root)); } catch (_) { return false; } }
    async finishProduce(root) {
      const idol = root && root._params && root._params.produceIdol;
      const fans = Number(idol && (idol.fan ?? idol.fans));
      const bits = [];
      if (this.latest) bits.push(`第 ${this.latest.week} 周`, `${this.latest.fans} 粉丝`);
      else if (Number.isFinite(fans)) bits.push(`${fans} 粉丝`);
      const text = `培育完成：本轮 WING 已结束${bits.length ? `（${bits.join('｜')}）` : ''}`;
      this.log(`${text}；已停止，不会自动开始下一轮。`);
      this.stop('培育完成');
      if (typeof this.env.done === 'function') this.env.done(text);
    }
  }
  // Explicit prerequisites from this owned deck's recorded skill route. Keep
  // high multiplier appeals ahead of unrelated passives/limits, including saved old routes.
  const BLADE_ROUTES=[
    ['10401000700101'],
    ['20402000900101','20402000900202','20402000900303','20402000900404'],
    ['20401600700101','20401600700202','20401600700303','20401600700404']
  ];
  function prioritizeSkillSteps(steps) {
    const byId=new Map(steps.map(s=>[s.panelId,s])),ordered=[],seen=new Set();
    for(const route of BLADE_ROUTES) {
      if(!byId.has(route.at(-1)))continue;
      // A partial/custom plan must supply every prerequisite; otherwise preserve it.
      if(!route.every(id=>byId.has(id)))continue;
      for(const id of route){if(!seen.has(id)){seen.add(id);ordered.push(byId.get(id));}}
    }
    return [...ordered,...steps.filter(s=>!seen.has(s.panelId))];
  }
  // A long-lived deck keeps its panel/skill identities across runs, so the stored
  // plan can be rebound only when the live board proves every step still exists.
  function planMatchesBoard(plan,board) {
    if(!plan || !Array.isArray(plan.steps) || !plan.steps.length || !board)return false;
    const panels=walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel);
    return plan.steps.every(s=>panels.some(p=>String(p.id)===String(s.panelId) && String(p.skill?.id)===String(s.skillId)));
  }
  // Without a stored route, buy only the limit-break nodes that actually lift a
  // capped attribute; cheapest first so several caps can be cleared in one visit.
  function capSteps(board) {
    const capped=cappedAttributes(board?._produceIdol);
    return walk(board?._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>n.normalSkillPanel)
      .filter(p=>!p.isAcquired && !p.isDeleted && !p.isAwakeSkill && p.isArrival===true && p.isLocked===false && capPanelUseful(p,capped))
      .map(p=>({panelId:String(p.id),skillId:String(p.skill?.id),cost:p.skillPoint}))
      .sort((a,b)=>a.cost-b.cost);
  }
  // --- WING 本战 -------------------------------------------------------------
  // The concert UI keeps one display node per judge (hp/attribute/trendOrder getters)
  // and the server precomputes every active skill's damage per judge id, so the hand
  // and the remaining interest can both be re-read on every turn.
  function judgeAlive(j) {
    try { return !!j && j._destroyed !== true && typeof j.hp === 'number' && Number.isFinite(j.hp) && j.hp > 0; } catch (_) { return false; }
  }
  function judgeOrder(j) { const n = Number(j && j.trendOrder); return Number.isFinite(n) ? n : 99; }
  function battleJudges(live) {
    const list = live && live._judgeList;
    ensure(list && Array.isArray(list.judges), '判定条结构变化（judges）；已停止，请导出诊断');
    return list.judges.filter(judgeAlive);
  }
  function battleCards(live) {
    const svc = live && live._concertService, hand = live && live._skillCardHand;
    ensure(svc && hand && Array.isArray(hand.currentActiveSkills), '技能卡结构变化（currentActiveSkills）；已停止，请导出诊断');
    const out = [];
    for (const entry of hand.currentActiveSkills) {
      if (!entry || entry.skillId == null || entry.idolId == null) continue;
      const card = typeof hand.getSkillCard === 'function' ? hand.getSkillCard(entry.skillId, entry.idolId) : null;
      if (!card) continue;
      const skill = typeof svc.findActiveSkill === 'function' ? svc.findActiveSkill(entry.skillId, entry.idolId, false) : null;
      const list = skill && Array.isArray(skill.premeasuredDamages) ? skill.premeasuredDamages : [];
      const damages = new Map();
      for (const d of list) { const v = Number(d && d.damage); if (Number.isFinite(v) && v > 0) damages.set(String(d.targetJudgeId), v); }
      if (damages.size) out.push({ card, skill, damages, enabled: card.disabled !== true });
    }
    return out;
  }
  // One (card, target) pair per turn. A blow that would empty a judge comes first:
  // the trend-first judge is the standing target and the run's main attribute judge is
  // the second goal, so both last hits can be collected in the same concert. When no
  // judge can be finished, damage goes to the trend-first judge as usual.
  function planBattleTurn(live, mainAttr) {
    const alive = battleJudges(live);
    ensure(alive.length, '判定条已没有可攻击审阅员');
    const trendFirst = alive.filter(j => judgeOrder(j) === 1)[0] || null;
    const mainJudge = mainAttr ? alive.filter(j => j.attribute === mainAttr)[0] || null : null;
    const cards = battleCards(live).filter(c => c.enabled);
    ensure(cards.length, '没有可用伤害技能卡；已停止，请导出诊断');
    const pairs = [];
    for (const c of cards) for (const [id, damage] of c.damages) {
      const judge = alive.find(j => String(j.id) === id);
      if (judge) pairs.push({ card: c.card, judge, damage });
    }
    ensure(pairs.length, '技能卡无法命中存活审阅员；已停止，请导出诊断');
    // The cheapest finishing card keeps the other judges available for later last hits.
    const cheapest = xs => xs.slice().sort((a, b) => a.damage - b.damage)[0];
    const finishes = pairs.filter(p => p.damage >= p.judge.hp);
    if (finishes.length) {
      const trendFinish = finishes.filter(p => judgeOrder(p.judge) === 1);
      if (trendFinish.length) return { ...cheapest(trendFinish), reason: '流行1最后一击' };
      const mainFinish = mainJudge ? finishes.filter(p => String(p.judge.id) === String(mainJudge.id)) : [];
      if (mainFinish.length) return { ...cheapest(mainFinish), reason: '主属性最后一击' };
      return { ...cheapest(finishes), reason: '其他审阅员最后一击' };
    }
    const base = trendFirst || mainJudge || alive.slice().sort((a, b) => judgeOrder(a) - judgeOrder(b))[0];
    const onBase = pairs.filter(p => String(p.judge.id) === String(base.id)).sort((a, b) => b.damage - a.damage);
    const best = onBase[0] || pairs.slice().sort((a, b) => b.damage - a.damage)[0];
    return { ...best, reason: `${judgeOrder(base) === 1 ? '流行1' : '主属性'}审阅员` };
  }
  function parseSkillPlan(text) {
    if(!text.trim())return null;
    const p=JSON.parse(text);ensure(p&&typeof p.runId==='string'&&Array.isArray(p.steps)&&p.steps.length>0&&p.steps.length<=40,'技能路线格式无效');
    const ids=new Set();for(const x of p.steps){ensure(typeof x.panelId==='string'&&typeof x.skillId==='string'&&!ids.has(x.panelId),'技能路线ID重复或无效');ids.add(x.panelId);integer(x.cost,1,500,'技能消耗');ensure(x.replaceSkillId===undefined||typeof x.replaceSkillId==='string','替换技能ID无效');}return p;
  }
  function skillReport(root) {
    const board=walk(root).find(n=>n._skillPanelsLayer&&n._produceIdol);
    if(!board)return null;
    const skill=a=>({id:a.id,name:a.name,comment:a.comment,isDeleted:a.isDeleted});
    return {sp:board._produceIdol.skillPoint,activeSkills:board._produceIdol.activeSkills?.map(skill),panels:walk(board._skillPanelsLayer).filter(n=>n.normalSkillPanel).map(n=>{const p=n.normalSkillPanel;return {id:p.id,skillPoint:p.skillPoint,sequence:p.sequence,step:p.step,isAcquired:p.isAcquired,isArrival:p.isArrival,isLocked:p.isLocked,isDeleted:p.isDeleted,isAwakeSkill:p.isAwakeSkill,skillCategory:p.skillCategory,skill:skill(p.skill)};})};
  }
  function diagnostics(engine) {
    const root=engine?.sceneManager?.currentScene;if(!root)return {connected:false};
    const nodes=walk(root);let state=null;try{state=snapshot(root._store,'vi');}catch(_){}
    return {version:VERSION,connected:true,state,skills:skillReport(root),sceneKeys:Object.keys(root).filter(k=>!/(token|session|password)/i.test(k)),
      nodes:nodes.filter(n=>visible(n,root)).slice(0,1200).map(n=>({name:n.name||'',keys:Object.keys(n).filter(k=>/^_(store|mainLayer|topLayer|actionLayer|advPlayer|event|.*Button|.*Layer)$/.test(k)),
        interactive:n.interactive===true,events:typeof n.eventNames==='function'?n.eventNames().map(String):[],
        textures:[...(n.texture?.textureCacheIds||[])].filter(x=>typeof x==='string').map(x=>x.split('?')[0])})),
      // Explicit allowlist: no cookies, credentials, request headers or entire stores.
      summary:{rootChildren:root.children?.length,produceType:root._store?.produceType,produceState:root._store?.produceState,
        mainKeys:root._mainLayer?Object.keys(root._mainLayer):[],places:root._store?.places?.map(p=>{let lesson=null;try{lesson=lessonPreview(p);}catch(_){}return {id:p.producePlaceCategoryId,actionType:p.actionType,troubleRate:p.troubleRate,lesson};}),
        auditions:root._store?.produceAuditions?.map(a=>({id:a.id,fan:a.fan,isSelectable:a.isSelectable}))}};
  }
  const runtimeByWindow = new WeakMap();
  function recoverEngine(win) {
    if (win.ezg?.sceneManager && win.ezg?.game) return win.ezg;
    // Public client module 77528 retains the engine after clearing window.ezg.
    // Obtain only that known export; never replace module factories or make requests.
    if (win.ezg !== null) return null;
    let runtime = runtimeByWindow.get(win);
    if (!runtime) {
      const chunks = win.tpwetogxwo9mtg;
      if (!Array.isArray(chunks) || chunks.push === Array.prototype.push) return null;
      chunks.push([['sc_wing_engine_connection_v2'], {}, require => {
        if (typeof require === 'function' && require.m) runtime = require;
      }]);
      if (!runtime) return null;
      runtimeByWindow.set(win, runtime);
    }
    const factory = runtime.m[77528];
    if (typeof factory !== 'function' ||
        !/window\.ezg\s*;\s*window\.ezg\s*=\s*null/.test(Function.prototype.toString.call(factory))) return null;
    const engine = runtime(77528);
    return engine?.sceneManager && engine?.game ? engine : null;
  }
  function boot(win) {
    if(win.location.hostname!=='shinycolors.enza.fun')return;
    let engine,runner;captureEngine(win,e=>{engine=e;});const logs=[];
    function mount(){
      if(!win.document.body)return win.setTimeout(mount,50);
      if(win.document.getElementById('sc-wing-helper'))return;
      const host=win.document.createElement('div');host.id='sc-wing-helper';host.style.cssText='position:fixed;left:8px;top:8px;z-index:2147483646';
      const shadow=host.attachShadow({mode:'open'});
      shadow.innerHTML=`<style>*{box-sizing:border-box}details{width:325px;background:#f6f8fa;color:#253444;border:1px solid #abbcc9;border-radius:9px;font:13px/1.5 system-ui;box-shadow:0 3px 14px #0003}summary{padding:9px;cursor:pointer;font-weight:bold}section{padding:0 10px 10px}p{margin:6px 0}button,select,input{font:inherit;margin:3px;padding:5px;border:1px solid #b2bdc8;border-radius:4px;background:white;color:#253444}button{cursor:pointer}button:disabled{opacity:.5}pre{white-space:pre-wrap;max-height:180px;overflow:auto;background:#e8eef3;padding:7px;font-size:11px}output{display:block;color:#28546c}small{display:block;color:#647486}</style>
      <details><summary>WING TE 助手 ${VERSION}</summary><section><p>兼容中文／日文。只操作当前一轮，不自动重开。</p>
      <label>主属性<select id="attr"><option value="vi">Vi</option><option value="vo">Vo</option><option value="da">Da</option></select></label>
      <label>本次最多<input id="weeks" type="number" min="1" max="34" value="1" style="width:52px">周</label>
      <label><input id="untilEnd" type="checkbox">运行至本轮TE培育结束（半决赛/决赛自动打完）</label><label><input id="skills" type="checkbox">本次已检查技能（继续时生效）</label>
      <div><button id="read">读取状态</button><button id="start">开始／继续</button><button id="stop">停止</button></div>
      <details style="width:auto;box-shadow:none"><summary>本轮技能路线</summary><textarea id="skillplan" rows="5" style="width:100%" placeholder="填入本轮技能路线 JSON；空白时保留手动检查"></textarea></details><div><button id="memo">准备页选记事本</button><button id="export">导出诊断</button></div>
      <small>勾选运行至结束可取消周数限制；半决赛与决赛开打前会先打开技能页学习，再按本战策略打完；进入本战每次点击后停 0.4 秒再操作；剧情层 2 秒没前进时直接把四倍速模式设为开启（四倍速是开关按钮，连点两次会回到原状态）。旧脚本留下的未核验记录，若该周仍停在早晨会自动清除，不再拦启动。试镜列表有多个同粉丝档时只参加日程里的第一个。技能：每次培育、每次进入技能页都按当前技能页重新判定学习优先级（上一轮的路线只提供替换目标，不再决定顺序）；同一类里支援卡节点优先于P卡节点，攻击主动技按倍率从高到低（只学倍率最高的4个，避免挤掉已学的强攻击；支援卡的2.5倍攻击一律不学，若它挡在路径上当跳板则改走另一条前置），随后增益UP按倍率从高到低，最后上限UP（接近上限90%才学）；锁定中的高倍率攻击／增益会连同前置一起排进本次学习，攻击仍排在增益之前；SP不足时（队列最前面那个买不起）本轮直接停止购买，不买更低优先级的节点。第四季度只要主属性在前二流行就安排十万试镜。不再安排广播节目；课程门槛按季度：S1／S2 选Talk时只有该课程支援超过3名才改上主属性课程，S3 支援≥2名或出现Excellent／设施升级／约定／助手支援即上课程，S4 用同样门槛但只限主属性流行位为第三时上课（流1／流2 去试镜）。对话选项按记事本提示打分：心情未满时优先思い出与心情，其次主属性；S2 最后一周先看日程里 Talk 的预计粉丝：够 1 万就 Talk，不够才打 1 万粉丝试镜（该周不上课程）。跑到培育结束（Ending）时面板会亮起绿色「培育完成」提示、标题闪烁并自动停止，不会重开下一轮。切到别的标签页只会暂停，切回游戏自动继续。记者采访自动拒绝。半决赛与决赛：优先给流1收最后一击，其次给主属性审阅员，收不掉时主攻流1最强卡；开AUTO让客户端跑演出与判定条，演出速度提到3倍。未知界面暂停，不乱点确认。</small>
      <div id="done" style="display:none;margin:6px 0;padding:8px;border-radius:6px;background:#0b7a3b;color:#fff;font-weight:bold"></div>
      <output id="state">等待游戏引擎。首次安装后请刷新。</output><pre id="log"></pre></section></details>`;
      win.document.body.appendChild(host);const $=id=>shadow.getElementById(id);
      $('skillplan').value=win.localStorage.getItem('sc.wing.v2.skillPlan')||'';
      const log=message=>{logs.push(`${new Date().toLocaleTimeString()} ${message}`);$('log').textContent=logs.slice(-60).join('\n');$('state').textContent=message;};
      const env={engine:()=>{if(!engine?.sceneManager?.currentScene)engine=recoverEngine(win)||engine;ensure(engine?.sceneManager?.currentScene,'未连接游戏引擎：请等待加载后再试；仍失败请导出诊断');return engine;},hidden:()=>win.document.hidden,sleep:ms=>new Promise(r=>win.setTimeout(r,ms)),
        // A finished produce run must be obvious even if the panel is collapsed.
        done:text=>{
          $('done').textContent=`✅ ${text}`;$('done').style.display='block';$('state').textContent=text;
          $('start').disabled=false;$('memo').disabled=false;
          const base=win.document.title||'WING';let on=false;
          const timer=win.setInterval(()=>{win.document.title=(on?'✅ 培育完成 · ':'')+base;on=!on;},700);
          const clear=()=>{win.clearInterval(timer);win.document.title=base;win.removeEventListener('focus',clear);};
          win.setTimeout(clear,60000);win.addEventListener('focus',clear);
        },
        log,
        saveSkillPlan:plan=>{const text=JSON.stringify(plan,null,2);$('skillplan').value=text;win.localStorage.setItem('sc.wing.v2.skillPlan',text);},
        load:()=>JSON.parse(win.localStorage.getItem(KEY)||'null'),save:j=>win.localStorage.setItem(KEY,JSON.stringify(j))};
      $('read').onclick=()=>{try{const w=snapshot(env.engine().sceneManager.currentScene._store,$('attr').value);log(`S${w.season} 剩${w.left}周｜粉丝${w.fans}｜SP${w.sp}｜Me${w.mental}｜流${w.trendRank}`);}catch(e){log(e.message);}};
      async function start(memo){
        if(runner)return;try{
          ensure(win.navigator.locks?.request,'浏览器缺少跨标签页互斥支持');env.engine();
          const skillPlan=parseSkillPlan($('skillplan').value);win.localStorage.setItem('sc.wing.v2.skillPlan',$('skillplan').value);
          runner=new Runner(env,{skillPlan,attr:$('attr').value,maxWeeks:Number($('weeks').value),untilEnd:$('untilEnd').checked,skillsAcknowledged:$('skills').checked});
          $('start').disabled=true;$('memo').disabled=true;$('skills').checked=false;
          await win.navigator.locks.request('sc.daily.v1.run',{ifAvailable:true},async daily=>{ensure(daily,'每日任务助手正在操作，请先停止');
            await win.navigator.locks.request('sc.wing.v2.run',{ifAvailable:true},async lock=>{ensure(lock,'另一标签页正在培育');if(memo)await runner.prepareMemo();else await runner.run();});});
        }catch(e){log(e.message||String(e));}finally{runner=null;$('start').disabled=false;$('memo').disabled=false;}
      }
      $('untilEnd').onchange=()=>{$('weeks').disabled=$('untilEnd').checked;};
      $('start').onclick=()=>start(false);$('memo').onclick=()=>start(true);
      const stop=why=>{if(runner)runner.stop(why);log(`已请求停止（${why}）；已提交的工作可能仍在完成。`);};
      $('stop').onclick=()=>stop('停止按钮');
      win.document.addEventListener('keydown',e=>{if(e.key==='Escape')stop('Esc');},true);
      // A hidden tab keeps the game running but freezes rendering, so the runner
      // stops by design. Record it so the next diagnostic shows why.
      win.document.addEventListener('visibilitychange',()=>{
        if(!runner)return;
        if(win.document.hidden){ runner.pause('页面隐藏'); log('页面已隐藏：暂停操作，切回游戏后自动继续。'); }
        else runner.resume();
      });
      $('export').onclick=()=>{try{const report={...diagnostics(env.engine()),journal:env.load(),log:logs};const url=win.URL.createObjectURL(new win.Blob([JSON.stringify(report,null,2)],{type:'application/json'}));const a=win.document.createElement('a');a.href=url;a.download='ShinyColors-WING-diagnostic.json';a.click();win.setTimeout(()=>win.URL.revokeObjectURL(url),1000);}catch(e){log(e.message);}};
    }mount();
  }
  return {VERSION,ATTR,PLACE,ACTION_LABEL,Runner,walk,under,visible,transitionState,snapshot,decide,lessonPreview,preferLesson,talkCoversFan,riskOf,chooseAudition,chooseAnswer,isMemo,chooseMemo,cappedAttributes,skillTiming,capPanelUseful,reporterChoice,captureEngine,recoverEngine,interactionEvent,parseSkillPlan,prioritizeSkillSteps,planMatchesBoard,capSteps,skillAttribute,skillPercent,boostPanelUseful,nearCapAttributes,appealMultiplier,bestAttackPanels,skillTreeOf,produceTreeOf,skillPrerequisitePanels,chooseReplaceTarget,skillPurchaseQueue,battleJudges,battleCards,planBattleTurn,answerParams,answerScore,describeAnswer,skillReport,diagnostics,boot};
});
