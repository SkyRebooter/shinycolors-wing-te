# 客户端适配依据

公开客户端脚本检查存档位于开发目录 `source/`；完整交付包不重新分发游戏客户端代码。

- 39155：WING 结算类 `_isWing/_params/_staff/_btnNext/_btnOk/_btnSkip`；`_showStaff` 的界面 tap 推进，计数 skip 与阶段回调。
- 39155：记者类 `_reporterAppearance/_answersLayer/_producerCommentUI/_rejectInterview`；拒绝路径来自界面选项，日文 answerKey 为 decline。脚本点击显示的拒绝项，不直接调用请求函数。
- 39155：当前能力上限来自 `userProduceIdol.limitVocal/limitDance/limitVisual/limitMental`。
- 12069：技能面板学习、替换、SP 变化和正常返回流程。
- 15729：剧情选项提示与四倍速。

公开主包来源与哈希见 `client-source.json`。客户端变更或字段不完整时应停止并重新导出诊断。

- v0.5.1：39155 模块30772及试镜包装层的 `_actionListCarousel/scrollToIndex/currentContent`；32553 的 `_judgeSpeech/_okButton/_doNotContinue` 普通试镜结果路径。

- v0.5.2：app BaseScene._showTapEffect 读取 e.data.global；32553 的 _handleSpeechSkip 使用场景 once(tap) 跳过及确认评语，需完整点击事件。

- v0.5.3：试镜结果场景在 OK 后仍保留，_startAfterConcert/_playProduceEvent 把 ADV 加入 _frontLayer；必须先分派可见剧情，再处理结果根场景。

- v0.5.4：app 的 PLACE_CATEGORY_TYPES 中 Vo/Da/Vi 课程为 1/2/3；39155 的 place 在 resetPlaceLocalProperty 中写入 supportIdols/isPromised，课程预览的 Excellent 为 supportIdols[].canPartnerLesson，设施升级为 includesBonusLevel，助手为 helperStaff。课程在 actionTable 中以 selectPlace 预览，提交前复核同一 place。

- v0.5.5：剧情跳过按钮在 app.js 135416/135471 只 show/hide 复用，15729 的 `_skipEvent` 在淡出 10 帧后才 emit end；跳过后的转场是 39155 的 `_showTransitionAndDestroyFrontLayer`（`_transitionLayer` 白幕 + 销毁 `_frontLayer`）与 `_endWeek` 请求。转场标记使用 `_isTransitionPlaying`、`_transitionLayer` 可见子节点、`_loadingLayer`、`interactiveChildren === false`、`mainLayer._blocker`。依据见 `verification/source-contract-0.5.5.txt`。

- v0.5.6：技能页 `_skillPanelsLayer` 下每个 `normalSkillPanel` 的 `id`、`skill.id`、`skillPoint`、`isArrival/isLocked/isAcquired/isDeleted/isAwakeSkill` 用于逐项核验路线；`cappedAttributes` 读取 `_produceIdol` 的 `visual/vocal/dance/mental` 与对应 `limit*`。剧情进度指纹来自 app.js 31625 的 `ue`（`_trackManager`）：`_current` 是轨道索引，`forward()` 每次台词前进一；15729 的 `_skipEvent` 与 39155 的剧情推进都走这一索引。依据见 `verification/source-contract-0.5.6.txt`。

- v0.5.7：季度流行顺序来自 39155 周信息里的 `produceTrendCombination`（`first/second/third` 为属性 id，决赛/演唱会用它判定主属性是否流 1）；50000 试镜本身没有流位门槛，只在粉丝数上受限，所以「S3 末 2 周流 2 也打五万」是脚本策略变更而非客户端限制。技能类别由 12069 的 `switch (skillCategory)` 校验（非法值直接抛错），攻击技能是带 `replaceSkillId` 的 active 节点，属性增益 UP 为 `passive`，上限节点为 `limit_break`；SP 不足时暂缓某一步不会影响后续步骤的可达性判断（`isArrival/isLocked`）。依据见 `verification/source-contract-0.5.7.txt`。

- v0.5.8：39155 的 `produceAuditions` 是**有序数组**，同一 `fan` 值可能对应多个 `id`（诊断 6 的 summary.auditions 里 3000/5000/10000/15000/100000 各按周标注 `isSelectable`）。脚本按该数组顺序取第一个可参加条目；轮播选择时用 `select._auditions` 中按 `id` 查到的下标并核对 `_auditionContents[index].id`，所以「第一个」就是玩家看到的日程第一项。依据见 `verification/source-contract-0.5.8.txt`。

- v0.5.9：本战 UI 的选卡/选目标入口是 app.js 的 `_selectSkillCard`（47408）与 `_handleSelectJudge`（47043），AUTO 每回合经 `_autoSelect`（46818）调用可覆盖的 `_getSkillCardForLiveAuto`（47556）和 `_getJudgeForLiveAuto`；脚本注入这两个方法即可逐回合指定卡与目标，而判定条仍由 AUTO 走 `liveAutoAppealMeterCategoryDecisionMethod` 正常结算（非 AUTO 路径在 `_startTimingGauge(t,null)` 等待真实 `touchstart`）。审阅员读取 `_judgeList.judges` 的 `hp/maxHp/attribute/trendOrder`（102760-102900，trendOrder 由 48180-48184 赋值），伤害来自 `findActiveSkill(...).premeasuredDamages`（61665-61667 每次待机刷新）。`JUDGE_FINISH_BONUS`（40156）是客户端唯一的收尾相关标识，最后一击奖励判定在服务端，脚本只按结构与剩余 HP 选目标。依据见 `verification/source-contract-0.5.9.txt`。

- v0.5.10：技能购买顺序改为按类别结构决定，而不是照抄路线。12069 的 `_showConfirmationDialog` 里 `switch (skillCategory)`：`ACTIVE` 走替换对话框，`PASSIVE`/`LIMIT_BREAK`/`QUICK`/`ABILITY` 统一走 `_requestAcquireSkillPanel`，所以属性增益 UP（passive）与上限 UP（limit_break）都能直接学习、无需替换。脚本用节点名里的 `UP`/`アップ` 与「上限」区分增益和上限，用 `_produceIdol` 的当前值与 `limit*` 计算是否接近上限（≥90%），再据此排出「攻击 → 近上限上限 → 增益 → 尚有空间上限」的队列；增益还会扫描整块 `_skillPanelsLayer`，补学路线未列出的、本轮主属性或第一流行属性的被动。依据见 `verification/source-contract-0.5.10.txt`。

- v0.5.10：技能类别经 12069 的 `switch (e.skillCategory)`（4768）分流：`ACTIVE` 走 `_showDeleteSkillSelectDialog` 先选替换，其余（passive/limit_break/quick/ability）走 `_requestAcquireSkillPanel`，因此属性增益 UP 不需要替换行。属性增益与上限节点识别用 `normalSkillPanel` 的 `skill.name`（如 `Visual130%UP`、`Visual上限UP`）与 `skillCategory`；`nearCapAttributes` 用 `_produceIdol` 的 `visual/vocal/dance/mental` 对比 `limit*`（≥90% 视为接近上限）。依据见 `verification/source-contract-0.5.10.txt`。

- v0.5.11：技能盘是每名角色一棵的 (sequence, step) 网格。12069.js:1880 `Me = e => String((e.sequence << 8) + e.step)`，1884 以该键 groupBy，2005 `_allSkillPanels[characterId][Me(t)]`，1930 用 `step-1`/`sequence-1` 定位，说明同一 `(sequence, step)` 在每棵树各有一格、互不为前置。客户端没有前置字段（grep `prevPanel`/`prerequisite` 无结果，`isArrival` 只在 12069 读取、app.js:53969/86933 设置），所以助手按同一棵树内的 `(s, k-1)` 与 `(s-1, k-1)` 推导前置，学习前仍以客户端下发的 `isArrival`/`isLocked` 复核。主动技替换目标缺失时按名称里的「N倍」选倍率最低的已装备主动技，替换仍走客户端的 `deleteSkillList`（12069.js:2606）。依据见 `verification/source-contract-0.5.11.txt`。


- v0.5.12：周内阶段由 `store.produceState`（app.js:10368-10399 的 `PRODUCE_STATES`）表示，MORNING 为 200，AFTER_ACTION 300、END_OF_WEEK 400、CONCERT 900、CONCERT_RESULT 1000 都表示本周已行动；因此「同周 + pending」只有在 `produceState===200` 时才能判定为「提交没有生效、这一周没被消耗」。技能页在主页面由 39155.js:47611 的 `showSkillBoard()` 打开，它没有周类型门槛（只关掉 `interactiveChildren` 并 `loadSceneAsync("skillBoard",{additive:true})`），所以准决赛/决赛周也能先学技能。本战 AUTO 由 `existsLiveAutoFunction`（payload 的 `supportAutoplay`）与 `isLiveAutoUnlocked`（`autoplayEnabled`，来自 `userReleasedAutoProduceAreas`）决定：锁定状态点按钮只会 `resetOn(false)` 并弹解锁条件（46650），`_enableAutoPlay` 也不生效（46836），此时脚本无法代替玩家点判定条。依据见 `verification/source-contract-0.5.12.txt`。

- v0.5.13：周赛周的「是否开始 live」确认框由 39155.js:48059 的 `_showConcertConfirmDialog` 打开（`JI.new({title: produceTop.concertConfirmPop.title, text, type: JI.BUTTON_TYPE.SUBMIT})`，`.addTo(this._layers[POPUP]).once("submit", ()=>{ this._topLayer.disable(); this._onGoToConcert(); })`），弹框会盖住培育按钮；因此点按钮两次必然失败。客户端自己的提交路径只做「禁用顶栏 + `_onGoToConcert`」两件事（48092；非 GRAD 决赛时转 `_goToConcert` → `concertReady()` → `_prepareConcert` → `concertAction.concertStart()` + `loadSceneAsync("produceConcert")`），脚本直接调用 `_onGoToConcert` 即可，不必经过弹框。弹框按钮由 app.js:58380-58560 的对话框类绘制，`BUTTON_TYPE`（58411）里 `SUBMIT` 依次 push `cancel_button.png` 与 `ok_button.png`，确认按钮在行尾。攻击主动技有装备槽位上限，因此只买技能盘上前 4 名（按名称里的「N倍」排序）；`normalSkillPanel.skillCategory==='active'` 即主动技，替换仍走 `deleteSkillList`（12069.js:2606）。依据见 `verification/source-contract-0.5.13.txt`。

- v0.5.14：每周的参赛入口是培育主页（`root._mainLayer`）的方法 `_onGoToConcert`（39155.js:48091-48094，非 GRAD 决赛时 `this._goToConcert(e)`），不在顶栏 `_topLayer` 上；主页只把 `_goToConcert` 作为构造参数持有（46956），`_topLayer` 惰性创建（48136）。`showSkillBoard`（47611-47635）在打开技能页时把主页 `interactiveChildren` 设为 false，关闭后经 `onUpdateSkillParams: _onBackFromSkillBoard` 恢复，所以学完技能立刻点顶栏按钮会因节点不可见失败。对话选项的记事本提示来自 `event.produceEventParams`（15729.js:2198-2215 按 `selectNum` 找对应项并作为 `resultParam` 显示），`_playParamsUp`（15729.js:2351-2420）读取 `vocal/dance/visual/mental/stamina/tension/tensionLevel/memoryPoint/memoryLevel/fan/skillPoint`，即选项除四维外还可能给心情（1~5 级，39155.js:4642-4656 钳制）与思い出（决定回忆炸弹）；当前心情可从 `store.userProduceIdol.tensionLevel` 读取（app.js:19968）。依据见 `verification/source-contract-0.5.14.txt`。

- v0.5.15：`mainController._speedButtonMap.fast4` 是开关按钮（`app.js:134470-134500` 的 `q.A`/`p` 类：构造时 `on("tap", toggle)`，`toggle()=_changeOn(!_isOn)`，`resetOn(e)` 直接设 `_isOn` 并切纹理），点击回调 `app.js:135392-135410` 再执行 `_controlSpeedButton(target, FAST4)`；`_controlSpeedButton`（`app.js:135503-135509`）以 `e.isOn ? t : ge.NORMAL` 设定 `_speedMode`，所以「双击两次」= 开→关，回到原点。幂等开启用 `init(e)`（`app.js:135458-135466`：`resetOn(!0)` + `_controlSpeedButton(map[e], e)` + `_speedMode = e`），或先 `resetOn(true)` 再 `_controlSpeedButton(fast,'fast4')`。速度模式取值见模块 36279（`app.js:67107-67114`）`{NORMAL:"normal",AUTO:"auto",FAST4:"fast4"}`，参数表 `app.js:135373-135392`（fast4: textSpeed 80 / effectSpeed 8 / waitTime 20）。依据见 `verification/source-contract-0.5.15.txt`。

- v0.5.16：客户端 API 错误弹窗文案在 `app.js:145195-145196`（`エラーが発生しました…お問い合わせID: %{requestId}エラーコード: %{errorCode}`，另有 `invalidSession` 145188），截图里的「问题ID／错误代码 9000」即此。参赛入口 `39155.js:48091-48094 _onGoToConcert` → `39155.js:9348 _goToConcert` → `_produceAction.concertReady()` 会向服务端请求演唱会；`39155.js:12862 _onProduce` 只在 `isConcertWeek` 时走该路径，所以非周赛周调用入口就是无效请求（9000）。脚本侧改为用提交动作类型 + `concert` 周型双重校验，并在 `popup()` 里先识别报错文案。依据见 `verification/source-contract-0.5.16.txt`。

- v0.5.17：行动选择不涉及新的客户端字段——广播（`PLACE.work_radio` = 类别 `4`）与课程（类别 `1/2/3`）都是同一套 `producePlaceCategoryId` 预览，`Risk of` 仍读 `troubleRate`。策略层改动：兜底一律 `work_talk`（类别 `5`），课程只在 `season === 3` 时由 `preferLesson(action, attr, place, season)` 覆盖，`lessonChoice()` 在其它季度直接返回 Talk 并记日志。

- v0.5.19：技能页以「角色卡」为单位分组：`12069.js:1917-1960` 用 `[userProduceIdol].concat(userSupportIdols)` 逐个建立 `_allSkillPanels[e.characterId]`，数组第 0 位是 P 卡（培育偶像），其余为支援卡。脚本侧 `produceTreeOf(board)` 读 `board._produceIdol.characterId`（回退 `_allSkillPanels` 的第一个键），据此把支援卡节点排在 P 卡节点之前。S4 试镜只需 `trendRank`（`produceTrendCombination` 的顺序），没有新的客户端字段。

- v0.6.0：技能页没有「上一轮优先」字段，优先级只能每轮从技能页重新推导。脚本用 `12069.js:1917-1960` 的 `_allSkillPanels[characterId]` 分组（第 0 位 P 卡）判断节点属于哪张卡，用面板自身的 `isArrival/isLocked/isAcquired` 与 `_produceIdol` 的当前属性判断可达性与收益；路线只在同一 `runId` 时提供 `replaceSkillId` 提示（替换目标由 `deleteSkillList` 决定，12069.js:2606）。

- v0.6.1：课程门槛只用已有的 `place.supportIdols`（`11590.js` 的 `ProducePlace`：`supportIdols` 为本周登场支援偶像数组），没有新增字段；S1／S2 判据为 `supportIdols.length > 3`，S3 仍为 `length >= 2 || includesBonusLevel || isPromised || helperStaff`。

- v0.6.2：S4 上课条件用 `snapshot()` 已有的 `trendRank`（来自 `produceTrendCombination` 的主属性位次）与课程预览字段组合判断，没有新增客户端字段；`lessonChoice()` 在 S4 且 `trendRank !== 3` 时直接返回 Talk 并记「S4 主属性流N，不上课程」。

- v0.6.3：技术树仍无客户端前置字段，前置由 `(sequence, step)` 网格推断（`skillPrerequisitePanels`：同树 `step-1` 且 `sequence` 相同或减一）；技能名常见无「倍」文本（`ビジュアルアピールIV`），因此 `bestAttackPanels` 的排序键依次为 `appealMultiplier`、`skillPoint`、`step`。

- v0.6.4：购买循环改为只看队首（`pending[0]`）：`sp < head.cost` 时记「SP不足，本轮停止购买」并 break，不再扫描「买得起的第一个」，因此不会再出现「贵的买不起就先买便宜的」。

- v0.6.5：支援卡与 P 卡技能树由 `skillTreeOf()`（`_allSkillPanels` 的 characterId 分组）区分；倍率取自面板 `skill.name` 与 `skill.comment` 两处（支援卡技能的「N倍」常写在 comment 里），因此 `appealMultiplier(name+' '+comment)` 才可靠。

- v0.6.6：日程预览的预计收益在 place 对象上——`39155.js:30997-31005` 的键表 `g_ = {VOCAL:"growthPoint.vocalGrowthPoint", …, FAN:"fan"}`，`31145-31162 switchIncreaseValue()` 取 `e.fan`（无子键）或 `e.growthPoint[a]` 填进参数列表，所以 `place.fan` 就是「预计增加的粉丝数」，不需要读 UI 文本。

- v0.6.7：试镜演出是独立场景——`app.js:160651` 的构造里 `createConcertGame(e, Ti.A.audition, …)` 后写 `n._auditionId = e.produceAudition.id`，所以 `root._auditionId` 可作为「正在演出」的判据；演出期间客户端不接受输入，结束后切到带 `_params.concertData` 的结果页。标签页隐藏由 `document.hidden` 判断，暂停不需要客户端配合。

- v0.6.8：培育结束是独立场景——`41602.js:3017` 的 `_endingLayer = He.new(e._params).addTo(e)` 播完 Ending 后 `_finishCurrentIdolProduce()` 直接 `loadSceneAsync("home")`。所以 `root._endingLayer` 是「本轮结束」的判据，命中后不得再进入下一轮。
