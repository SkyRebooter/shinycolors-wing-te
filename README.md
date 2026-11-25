# ShinyColors 助手

用于《偶像大师 闪耀色彩》网页版的单一 Tampermonkey 脚本。v0.7.0 将每日任务、活动 Auto 培育排程与 WING TE 合并到同一个面板。本版按预发布提供，尚无合并版游戏实测。

## 安装

- [直接安装 userscript](https://raw.githubusercontent.com/SkyRebooter/shinycolors-wing-te/v0.7.0/ShinyColorsWing.user.js)
- [篡改猴导入包](https://github.com/SkyRebooter/shinycolors-wing-te/releases/download/v0.7.0/ShinyColors_Tampermonkey_v0.7.0.zip)
- [完整发布包](https://github.com/SkyRebooter/shinycolors-wing-te/releases/download/v0.7.0/ShinyColors_full_v0.7.0.zip)

Tampermonkey 可以打开直接安装链接，也可以在「实用工具 → 从文件导入」选择 ZIP。新版沿用旧 WING TE 脚本的名称和命名空间。更新后停用独立的「ShinyColors 每日任务助手」，刷新游戏，打开右上角「ShinyColors 助手 v0.7.0」。

## 使用

- **每日任务** 从游戏主页点击「开始每日任务」。助手执行尚未达成的 Fes、马尼购物和青铜券训练，并领取每日奖励。单次上限为一张 Fes 参加券、一件预算内马尼商品和一张青铜券。登录奖励提示与公告有独立的自动处理开关。
- **活动 Auto 培育** 从游戏主页点击「按活动安排 Auto 培育」。助手根据当前未完成活动任务选择剧本、已有编队的偶像、Vo／Da／Vi 培育方针和次数，并填写游戏原生排程。在游戏内确认开始。无法识别的任务条件、缺少匹配编队和超出活动截止时间的次数会记入日志。需要先解锁 Auto 培育并完成教学，已安排的排程需先处理。
- **WING TE** 在游戏中选好培育偶像与队伍，进入 WING 后展开 WING TE 区域，选择主属性与周数，再点击「开始／继续」。勾选运行至结束可继续到本轮结束。游戏自带的演出 AUTO 是半决赛和决赛策略的依赖项。

三个入口共用引擎连接和跨标签页互斥。每日任务及活动排程在标签页隐藏时停止，WING TE 会暂停并在回到页面时继续。Esc 可停止当前运行。

## WING TE 功能

- 工作、课程、试镜、季度结算与剧情推进；中文／日文界面适配。
- 工作事故率大于 10% 时休息。课程根据支援、强化与流行判定是否替代 Talk；当前策略不主动安排广播。
- S2 末周检查 Talk 预计粉丝是否足够晋级；S3 四万／五万、S4 十万粉丝路线。
- 技能优先攻击主动 → 增益 → 上限，展开必要前置并只规划倍率最高的四个攻击；支援卡 2.5 倍攻击排除。
- 半决赛／决赛通过客户端 AUTO 执行，装载流行1与收尾选择策略，并启用3倍速。AUTO 必须已解锁，最后一击不能保证。
- 记者采访自动拒绝，约定拒绝；对话选项侧重心情与思い出。
- 到达 Ending 结束时显示“培育完成”，停止当前运行，绝不自动重开下一轮。

## 保护与限制

WING TE 只操作 WING，不购买道具或付费续关。提交前记录 pending，核验周推进；未知页面或错误弹窗停止。操作间隔至少400ms；标签页隐藏时暂停，超过10分钟停止。单次运行限1小时、600次操作。

技能和 UI 适配依赖客户端内部界面结构，客户端更新可能使脚本失效。倍率缺少“倍”字样时只能按其他字段排序；技能前置由网格推断；奖励、胜负和最后一击由游戏服务器裁定。

## 构建与历史验证

无 npm 第三方依赖。需要 Node.js 22+ 和 Python 3.9+。修改 `src/` 后运行构建，生成可安装的 `ShinyColorsWing.user.js` 和发布附件。

```sh
npm run build
npm run check
npm test
```

现有离线测试覆盖 WING TE 逻辑。v0.6.8 的实测范围与历史测试另见验证记录。活动 Auto 排程的文本覆盖和结算结果仍需在游戏中核对。

## 开发文档

- [开发交接](docs/HANDOFF.md)
- [客户端适配依据](docs/SOURCE_ADAPTERS.md)
- [验证记录](validation.json)

仓库仅发布助手源码及经过整理的文档，不包含游戏客户端 bundle、个人卡库、账号运行日志或历史诊断。游戏及角色素材权利归原权利人；本仓库不附带这些素材。
