# WING TE 助手开发交接（v0.6.8）

目标：完成当前 WING 单轮工作、课程、试镜、本战与结算，在 Ending 给出完成提示并停止；不自动开下一轮。

源码为单文件 ShinyColorsWing.user.js，测试为 wing.test.cjs。112 项离线测试通过；v0.6.8 未做完整实机点验。

## 行为边界

只操作 produceType=wing；不自动购买、付费续关；未知界面或错误弹窗停止。操作至少间隔400ms。隐藏暂停最多10分钟；运行最多1小时、600次操作。提交前写 journal pending，核验周推进后确认成功。

## 主要入口

- decide / preferLesson / s2LastWeekPlan：周决策、课程与S2预计粉丝。
- skillPurchaseQueue / bestAttackPanels / skillPrerequisitePanels / skills：四个最高倍率主动、必要前置、增益及上限。
- story / chooseAnswer / nudgeStory：剧情、选项、四倍速。
- settlement / reporter / concertResult：结算、记者拒绝与试镜结果对话。
- enterConcert / battle / installBattlePolicy：本战入口、AUTO及策略。
- ending / finishProduce / boot：结束提示、面板与运行状态。

## 客户端依据

请阅读 SOURCE_ADAPTERS.md。公开客户端 bundle 不随仓库分发，开发者需从当前游戏网页自行核对；历史文件行号会随客户端变化。不要把接口名当作稳定公共API。

## 回归与发布

先复现并增加失败测试，再修改行为；运行 npm run check、npm test。修改版本号时同时检查 metadata @version、VERSION、package.json、validation.json、README链接及构建产物。运行 npm run build 校验导入包和完整包。保留测试与实机验证的区别，不宣称离线测试等于通关。

## 尚未验证

当前版本整轮通关、服务器最后一击结果、不同卡组下技能路径与胜率。需要有人看守的真实账号逐步验证；排障时只收集必要诊断，发布前清除个人信息。
