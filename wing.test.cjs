const test=require('node:test'),assert=require('node:assert/strict');
const W=require('./ShinyColorsWing.user.js');
const state=()=>({produceType:'wing',seasonNum:1,remainSeasonWeek:7,isConcertWeek:false,weekType:'produce',userProduce:{id:'run1',week:2},userProduceIdol:{fan:159,skillPoint:30,stamina:91,visual:70,vocal:72,dance:75,mental:67},produceTrendCombination:{first:'vocal',second:'dance',third:'visual'}});
test('Numeric state ignores language and reads actual fans',()=>{for(const label of ['粉丝数 还差841','ファン人数 あと841']){const s=state();s.label=label;assert.equal(W.snapshot(s,'vi').fans,159);assert.equal(W.snapshot(s,'vi').trendRank,3);}});
test('Reject other produce types, absent ranks, nonfinite values',()=>{let s=state();s.produceType='6th_produce_area';assert.throws(()=>W.snapshot(s,'vi'));s=state();s.produceTrendCombination.third='dance';assert.throws(()=>W.snapshot(s,'vi'));s=state();s.userProduceIdol.fan=NaN;assert.throws(()=>W.snapshot(s,'vi'));});
test('S1 S2 Talk; S2 last week decides through the talk preview',()=>{
 let w=W.snapshot(state(),'vi');
 assert.equal(W.decide(w),'work_talk');
 assert.equal(W.decide({...w,season:2,left:2}),'work_talk');
 // work() reads the previewed fan gain and only falls back to the 10000 audition when
 // talk cannot close the gap, so decide() itself always routes to the work path.
 assert.equal(W.decide({...w,season:2,left:1}),'work_talk');
});
test('Main lesson overrides Talk when it has two supports or an enhancement hint',()=>{
 const plain={supportIdols:[{}],includesBonusLevel:false,isPromised:false};
 assert.deepEqual(W.lessonPreview(plain),{supportCount:1,excellentCount:0,upgrades:[],includesBonusLevel:false,isPromised:false,hasHelper:false,qualifies:false});
 assert.equal(W.preferLesson('work_talk','vi',plain),'work_talk');
 assert.equal(W.preferLesson('work_talk','vi',{supportIdols:[{},{}]}),'lesson_vi');
 assert.equal(W.preferLesson('work_talk','vo',{supportIdols:[{canPartnerLesson:true}]}),'lesson_vo');
 assert.equal(W.preferLesson('work_talk','da',{supportIdols:[{}],includesBonusLevel:true}),'lesson_da');
 assert.equal(W.preferLesson('work_talk','vi',{supportIdols:[{}],isPromised:true}),'lesson_vi');
 assert.equal(W.preferLesson('work_talk','vi',{supportIdols:[{}],helperStaff:{}}),'lesson_vi');
 assert.deepEqual(W.lessonPreview({supportIdols:[{canPartnerLesson:true},{}],includesBonusLevel:true,isPromised:true,helperStaff:{}}).upgrades,['Excellent','设施升级','约定','助手支援']);
});
test('Lesson override never replaces Radio or an audition',()=>{
 const boosted={supportIdols:[{},{}]};
 assert.equal(W.preferLesson('work_radio','vi',boosted),'work_radio');
 assert.equal(W.preferLesson('audition_40000','vi',boosted),'audition_40000');
 assert.throws(()=>W.preferLesson('work_talk','vi',{}),/课程支援预览不可用/);
});
test('Runner previews and selects the main lesson only after Talk is chosen',async()=>{
 const {root,r}=sceneFixture();r.env.sleep=async()=>{};
 const place={producePlaceCategoryId:'3',supportIdols:[{canPartnerLesson:true}],includesBonusLevel:false,isPromised:false,troubleRate:5};
 const store={...state(),seasonNum:3,places:[place]},w=W.snapshot(store,'vi');
 const layer={_selectedPlaceCategory:'5',interactiveChildren:true};let selected;
 r.actionLayer=async()=>layer;r.call=(_root,_owner,method,args)=>{assert.equal(method,'selectPlace');selected=args[0];layer._selectedPlaceCategory=selected;};
 assert.equal(await r.lessonChoice(root,{},store,w,'work_talk'),'lesson_vi');assert.equal(selected,'3');
 selected=null;assert.equal(await r.lessonChoice(root,{},store,w,'work_radio'),'work_radio');assert.equal(selected,null);
 assert.equal(await r.lessonChoice(root,{},store,{...w,season:2},'work_talk'),'work_talk');assert.equal(selected,null);
 assert.equal(await r.lessonChoice(root,{},store,{...w,season:4},'work_talk'),'lesson_vi');
 assert.equal(await r.lessonChoice(root,{},store,{...w,season:4,trendRank:2},'work_talk'),'work_talk');
});
test('S3 40k first, late 50k, then Talk instead of radio',()=>{let w={...W.snapshot(state(),'vi'),season:3,fans:10000,trendRank:1};assert.equal(W.decide(w),'audition_40000');assert.equal(W.decide({...w,fans:50000,left:5}),'work_talk');assert.equal(W.decide({...w,fans:50000,left:3}),'audition_50000');assert.equal(W.decide({...w,fans:100000,mental:300}),'work_talk');assert.throws(()=>W.decide({...w,trendRank:3,left:2}));});
test('Radio is never scheduled; lessons use a per-season bar',()=>{
 const base={...W.snapshot(state(),'vi'),fans:600000,left:2,trendRank:3};
 for(const season of [3,4]) assert.equal(W.decide({...base,season,mental:1}),'work_talk');
 const two={supportIdols:[{},{}]}, three={supportIdols:[{},{},{}]}, four={supportIdols:[{},{},{},{}]};
 // season 1 and 2 spend a week on a lesson only when more than three support idols line up
 assert.equal(W.preferLesson('work_talk','vi',three,1),'work_talk');
 assert.equal(W.preferLesson('work_talk','vi',four,1),'lesson_vi');
 assert.equal(W.preferLesson('work_talk','vi',three,2),'work_talk');
 assert.equal(W.preferLesson('work_talk','vi',four,2),'lesson_vi');
 // season 3 keeps the preview bar (2 supporters, or any upgrade)
 assert.equal(W.preferLesson('work_talk','vi',two,3),'lesson_vi');
 assert.equal(W.preferLesson('work_talk','vi',{supportIdols:[]},3),'work_talk');
 // season 4 uses the season 3 bar, but only while the main attribute is trend 3
 assert.equal(W.preferLesson('work_talk','vi',two,4,3),'lesson_vi');
 assert.equal(W.preferLesson('work_talk','vi',two,4,2),'work_talk');
 assert.equal(W.preferLesson('work_talk','vi',two,4,1),'work_talk');
 assert.equal(W.preferLesson('work_talk','vi',{supportIdols:[]},4,3),'work_talk');
 assert.equal(W.preferLesson('audition_40000','vi',four,3),'audition_40000');
});
test('S4 four 100k and both concert weeks join the battle policy',()=>{let w={...W.snapshot(state(),'vi'),season:4,left:4,fans:100000};for(let i=0;i<4;i++)assert.equal(W.decide({...w,left:4-i,fans:100000+i*100000}),'audition_100000');assert.throws(()=>W.decide({...w,fans:90000}));assert.equal(W.decide({...w,concert:true,weekType:'final'}),'final_battle');assert.equal(W.decide({...w,concert:true,weekType:'semi'}),'semi_battle');});
test('Risk boundary accepts 10 and rejects unknown',()=>{assert.equal(W.riskOf({troubleRate:10}),10);assert.equal(W.riskOf({troubleRate:11}),11);assert.throws(()=>W.riskOf({troubleRate:'0'}));assert.throws(()=>W.riskOf({troubleRate:NaN}));});
test('Select exact audition reward, first of several, reject locked',()=>{const a={id:'a',fan:40000,isSelectable:true};assert.equal(W.chooseAudition([a,{fan:50000,isSelectable:true}],40000),a);assert.equal(W.chooseAudition([a,{...a,id:'b'}],40000).id,'a');assert.throws(()=>W.chooseAudition([{...a,isSelectable:false}],40000));assert.throws(()=>W.chooseAudition([],40000));});
test('Several 50000 fan auditions: the first schedule entry is taken',()=>{const list=[{id:'5',fan:3000,isSelectable:true},{id:'10',fan:50000,isSelectable:true},{id:'11',fan:50000,isSelectable:true},{id:'12',fan:100000,isSelectable:false}];assert.equal(W.chooseAudition(list,50000).id,'10');list[1].isSelectable=false;assert.equal(W.chooseAudition(list,50000).id,'11');assert.throws(()=>W.chooseAudition(list,100000));});
test('Perfect selected by stable id, shuffled or translated text irrelevant',()=>{for(const text of ['いい笑顔','笑容不错'])assert.equal(W.chooseAnswer({answers:[{id:'3',text,result:'normal'},{id:'1',text,result:'perfect'}]},'vi',['1','3']),'1');});
test('Attribute choice uses actual result fields, never ordinal',()=>{const e={answers:[{id:'2'},{id:'3'},{id:'1'}],produceEventParams:[{selectNum:1,visual:20},{selectNum:2,visual:0},{selectNum:3,visual:10}]};assert.equal(W.chooseAnswer(e,'vi',['3','1','2']),'1');assert.throws(()=>W.chooseAnswer({answers:[{id:1}]},'vi',['1']));});
test('Declines promise independent of words',()=>assert.equal(W.chooseAnswer({eventCategory:{selectRequestParamKey:'isAccept'},answers:[{id:'agree'},{id:'disagree'}]},'vi',['agree','disagree']),'disagree'));
test('Memo Japanese, simplified, traditional; no substitution',()=>{for(const n of ['秘密のメモ帳','秘密的记事本','秘密的筆記本','秘密记事本'])assert.equal(W.isMemo({getName:()=>n}),true);assert.equal(W.isMemo({getName:()=> '高級秘密のメモ帳'}),false);const m={getName:()=> '秘密のメモ帳',num:3,isOpen:true,getEffectTypes:()=>['navigation'],checkAreaRestriction:()=>false};assert.equal(W.chooseMemo([m],'1'),m);assert.throws(()=>W.chooseMemo([{...m,num:0}],'1'));assert.throws(()=>W.chooseMemo([{...m,getEffectTypes:()=>['stamina']}],'1'));});
test('Engine hook chains existing translation/daily accessor',()=>{let original;const win={};Object.defineProperty(win,'ezg',{configurable:true,get:()=>original,set:x=>{original=x;}});let captured;W.captureEngine(win,x=>captured=x);const engine={sceneManager:{},game:{}};win.ezg=engine;assert.equal(win.ezg,engine);assert.equal(original,engine);assert.equal(captured,engine);});
test('Journal blocks repeat week, verifies real advancement, prevents second run',()=>{let saved;const env={hidden:()=>false,load:()=>saved,save:j=>saved=structuredClone(j),log:()=>{}};const r=new W.Runner(env,{maxWeeks:3}),w=W.snapshot(state(),'vi');r.attach(w);r.commit(w,'work_talk');const next=new W.Runner(env,{maxWeeks:3});assert.throws(()=>next.attach(w),/已有提交/);next.attach({...w,week:3,fans:317,sp:48});assert.equal(saved.pending,null);assert.equal(saved.verified.length,1);assert.throws(()=>next.attach({...w,runId:'run2'}),/轮次变化/);});
test('A pending record is cleared when the week never left the morning',()=>{
 let saved;const env={hidden:()=>false,load:()=>saved,save:j=>saved=structuredClone(j),log:()=>{}};
 const w=W.snapshot(state(),'vi');
 const r=new W.Runner(env,{maxWeeks:3});r.attach(w);r.commit(w,'semi_battle');
 assert.notEqual(saved.pending,null);
 const next=new W.Runner(env,{maxWeeks:3});
 next.attach({...w,produceState:200});
 assert.equal(saved.pending,null);
 assert.equal(saved.verified.length,0);
 assert.equal(next.latest.week,w.week);
});
test('A pending record still blocks once the week has been acted on',()=>{
 let saved;const env={hidden:()=>false,load:()=>saved,save:j=>saved=structuredClone(j),log:()=>{}};
 const w=W.snapshot(state(),'vi');
 const r=new W.Runner(env,{maxWeeks:3});r.attach(w);r.commit(w,'semi_battle');
 for(const produceState of [300,400,900,1000]) assert.throws(()=>new W.Runner(env,{maxWeeks:3}).attach({...w,produceState}),/已有提交/);
});
test('A concert week opens the skill board before the battle without demanding a route',async()=>{
 const {root,add,r}=sceneFixture();
 const store={...state(),isConcertWeek:true,weekType:'semi'};
 store.userProduce={id:'run1',week:33};
 const main=add(root,{interactiveChildren:true});root._mainLayer=main;root._store=store;
 main._actionLayer=add(main,{interactive:true,visible:true});
 let opened=0;main.showSkillBoard=()=>{opened++;r.stop();};
 r.env.sleep=async()=>{};r.options.untilEnd=true;
 await assert.rejects(r.run(),/已停止/);
 assert.equal(opened,1);
});
test('Hidden page prevents input',()=>{const r=new W.Runner({hidden:()=>true});assert.throws(()=>r.check(),/隐藏/);});
test('Detached target not visible even if visible flag true',()=>assert.equal(W.visible({visible:true},{children:[]}),false));
function sceneFixture(){
 const root={children:[]},engine={sceneManager:{currentScene:root}};
 const add=(parent,props={})=>{const n={children:[],parent,...props};parent.children.push(n);return n;};
 const r=new W.Runner({engine:()=>engine,hidden:()=>false,log:()=>{},load:()=>null,save:()=>{},sleep:async()=>{}});
 return {root,add,r};
}
test('Delegated top button taps exactly one named interactive child',()=>{
 const {root,add,r}=sceneFixture();let count=0;
 const b=add(root,{interactive:false,listeners:()=>[()=>{}]});
 add(b,{name:'btn',interactive:true,listeners:()=>[()=>{}],emit:(e,data)=>{count++;assert.equal(data.target.name,'btn');}});
 r.tap(root,b,'打开日程');assert.equal(count,1);
 add(b,{name:'btn',interactive:true,listeners:()=>[()=>{}]});
 assert.throws(()=>r.tap(root,b,'打开日程'),/不唯一/);assert.equal(count,1);
});
test('Reused select list accepts new items but never repeats pending selection',async()=>{
 const {root,add,r}=sceneFixture();let count=0;
 const owner=add(root,{_event:{answers:[{id:'1',result:'perfect'}]}});
 const adv=add(owner);owner._advPlayer=adv;adv.selectList=add(adv,{items:[]});
 function newItem(){const item=add(adv.selectList,{nextLabel:'1',interactive:true,listeners:()=>[()=>{}],emit:()=>count++});adv.selectList.items=[item];}
 newItem();await r.story(root);await r.story(root);assert.equal(count,1);
 adv.selectList.children=[];newItem();await r.story(root);assert.equal(count,2);
});
test('Long recognized scenes cannot bypass bounded phase timeout',()=>{
 const {root,r}=sceneFixture();r.phase('剧情',root,180000);r.phaseStarted-=180001;
 assert.throws(()=>r.phase('剧情',root,180000),/等待超时/);
 r.phase('试镜',root,240000);
});
test('Late injection recovers only the known public cached engine export',()=>{
 const engine={sceneManager:{},game:{}},win={ezg:null,tpwetogxwo9mtg:[]};
 const runtime=id=>{assert.equal(id,77528);return engine;};
 runtime.m={77528:function(){const t=window.ezg;window.ezg=null;return t;}};
 win.tpwetogxwo9mtg.push=function(chunk){chunk[2](runtime);};
 assert.equal(W.recoverEngine(win),engine);
 runtime.m[77528]=function(){return 'unexpected';};assert.equal(W.recoverEngine(win),null);
 assert.equal(W.recoverEngine({ezg:null,tpwetogxwo9mtg:[]}),null);
});
test('Skill plans reject duplicate IDs, free/deletion operations, and malformed replacement',()=>{
 const p={runId:'r',steps:[{panelId:'p',skillId:'s',cost:20}]};
 assert.equal(W.parseSkillPlan(JSON.stringify(p)).steps[0].cost,20);
 assert.throws(()=>W.parseSkillPlan(JSON.stringify({...p,steps:[...p.steps,...p.steps]})));
 assert.throws(()=>W.parseSkillPlan(JSON.stringify({...p,steps:[{...p.steps[0],cost:0}]})));
 assert.throws(()=>W.parseSkillPlan(JSON.stringify({...p,steps:[{...p.steps[0],replaceSkillId:2}]})));
});
test('Skill purchase verifies acquisition and exact SP decrease, then returns',async()=>{
 const {root,add,r}=sceneFixture();const p={id:'p',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'passive',skill:{id:'s',name:'Vi 30%UP'}};
 const board=add(root,{_produceIdol:{skillPoint:65},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const btn=(parent,props,act)=>add(parent,{interactive:true,listeners:()=>[()=>{}],emit:act,...props});
 const acquire=btn(board,{},()=>{});
 btn(board._skillPanelsLayer,{normalSkillPanel:p},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:p,_acquireButton:acquire}};});
 btn(board._uiPartsLayer,{name:'backButton'},()=>{board.parent=null;});
 r.confirmSkill=async()=>{p.isAcquired=true;board._produceIdol.skillPoint=45;};
 r.latest={runId:'r',week:3};r.options.skillPlan={runId:'r',steps:[{panelId:'p',skillId:'s',cost:20}]};
 assert.equal(await r.skills(root),true);assert.equal(board._produceIdol.skillPoint,45);assert.equal(r.skillSeen.has('r:3'),true);
});
test('A plan from another run re-plans from the live board instead of stopping',async()=>{
 const {root,add,r}=sceneFixture();
 const boost=skillPanel('boost','passive','Visual130%UP',30);
 skillBoard(root,add,{sp:40,stats:{visual:200,limitVisual:900},panels:[boost],r});
 const logs=[];r.log=m=>logs.push(m);
 r.latest={runId:'run2',week:3};r.skillMode='audition';
 let saved=null;r.env.saveSkillPlan=plan=>{saved=plan;};
 r.options.skillPlan={runId:'run1',steps:[{panelId:'gone',skillId:'sg',cost:20}]};
 assert.equal(await r.skills(root),true);
 assert.equal(boost.isAcquired,true);assert.equal(saved,null);
 assert.ok(logs.some(m=>/重新判定技能学习优先级/.test(m)));
});
test('A plan is matched to the live board by every panel and skill identity',()=>{
 const board={_skillPanelsLayer:{children:[{normalSkillPanel:{id:'p1',skill:{id:'s1'}}},{normalSkillPanel:{id:'p2',skill:{id:'s2'}}}]}};
 const plan={runId:'old',steps:[{panelId:'p1',skillId:'s1',cost:20},{panelId:'p2',skillId:'s2',cost:30}]};
 assert.equal(W.planMatchesBoard(plan,board),true);
 assert.equal(W.planMatchesBoard({...plan,steps:[{panelId:'p1',skillId:'sX',cost:20}]},board),false);
 assert.equal(W.planMatchesBoard({...plan,steps:[{panelId:'p9',skillId:'s1',cost:20}]},board),false);
 assert.equal(W.planMatchesBoard(null,board),false);
 assert.equal(W.planMatchesBoard({runId:'old',steps:[]},board),false);
});
test('Cap-only fallback lists unlocked limit breaks for capped attributes, cheapest first',()=>{
 const panels=[
  {id:'visual',skillPoint:40,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'sv',name:'Visual上限UP'}},
  {id:'both',skillPoint:20,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'sb',name:'Visual＆Mental上限UP'}},
  {id:'vocal',skillPoint:10,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'so',name:'Vocal上限UP'}},
  {id:'active',skillPoint:5,isArrival:true,isLocked:false,skillCategory:'active',skill:{id:'sa',name:'Visual5倍'}},
  {id:'locked',skillPoint:5,isArrival:true,isLocked:true,skillCategory:'limit_break',skill:{id:'sl',name:'Visual上限UP'}},
  {id:'notyet',skillPoint:5,isArrival:false,isLocked:false,skillCategory:'limit_break',skill:{id:'sn',name:'Visual上限UP'}}];
 const board={_produceIdol:{visual:100,limitVisual:100,mental:50,limitMental:50},_skillPanelsLayer:{children:panels.map(p=>({normalSkillPanel:p}))}};
 assert.deepEqual(W.capSteps(board).map(s=>s.panelId),['both','visual']);
});
test('Every new produce run re-judges the order instead of reusing the stored route',async()=>{
 const {root,add,r}=sceneFixture();const p={id:'p',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'passive',skill:{id:'s',name:'Vi 30%UP'}};
 const board=add(root,{_produceIdol:{skillPoint:65},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const btn=(parent,props,act)=>add(parent,{interactive:true,listeners:()=>[()=>{}],emit:act,...props});
 const acquire=btn(board,{},()=>{});
 btn(board._skillPanelsLayer,{normalSkillPanel:p},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:p,_acquireButton:acquire}};});
 btn(board._uiPartsLayer,{name:'backButton'},()=>{board.parent=null;});
 r.confirmSkill=async()=>{p.isAcquired=true;board._produceIdol.skillPoint=45;};
 const logs=[];r.log=m=>logs.push(m);
 r.latest={runId:'run2',week:3};r.skillMode='audition';let saved=null;r.env.saveSkillPlan=plan=>{saved=plan;};
 r.options.skillPlan={runId:'run1',steps:[{panelId:'p',skillId:'s',cost:20,replaceSkillId:'x'}]};
 assert.equal(await r.skills(root),true);
 assert.equal(board._produceIdol.skillPoint,45);
 // the stored route belongs to run1: it is not reused, not rewritten, and not saved
 assert.equal(saved,null);assert.equal(r.options.skillPlan.runId,'run1');
 assert.ok(logs.some(m=>/重新判定技能学习优先级/.test(m)));
 assert.ok(logs.some(m=>/本轮技能学习顺序/.test(m)));
});
test('A route from the same run still supplies replacement targets',()=>{
 const {root,add}=sceneFixture();
 const panel={id:'p9',skillPoint:30,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'active',skill:{id:'s9',name:'Visual3倍Appeal'}};
 const layer=add(root,{});
 add(layer,{normalSkillPanel:panel});
 const board={_skillPanelsLayer:layer,_produceIdol:{skillPoint:40,visual:10,limitVisual:900,activeSkills:[{id:'a1',name:'Visual1倍'}]}};
 const plan={runId:'r',steps:[{panelId:'p9',skillId:'s9',cost:30,replaceSkillId:'a1'}]};
 const q=W.skillPurchaseQueue(board,plan,{capOnly:false,wantedAttrs:['visual'],planMatched:true});
 assert.equal(q[0].panelId,'p9');assert.equal(q[0].replaceSkillId,'a1');
});
test('A stale skill plan no longer stops the run and the board node is still re-planned',async()=>{
 const {root,add,r}=sceneFixture();
 const boost=skillPanel('p','passive','Visual130%UP',20);
 skillBoard(root,add,{sp:65,stats:{visual:200,limitVisual:900},panels:[boost],r});
 r.latest={runId:'run2',week:3};r.skillMode='audition';
 r.options.skillPlan={runId:'run1',steps:[{panelId:'p',skillId:'other',cost:20}]};
 assert.equal(await r.skills(root),true);
 assert.equal(boost.isAcquired,true);
});
test('Starting on the board without a main-page snapshot buys only capped limit breaks',async()=>{
 const {root,add,r}=sceneFixture();const p={id:'limit',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'s',name:'Visual上限UP'}};
 const board=add(root,{_produceIdol:{skillPoint:80,visual:500,limitVisual:500},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const btn=(parent,props,act)=>add(parent,{interactive:true,listeners:()=>[()=>{}],emit:act,...props});
 const acquire=btn(board,{},()=>{});
 btn(board._skillPanelsLayer,{normalSkillPanel:p},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:p,_acquireButton:acquire}};});
 btn(board._uiPartsLayer,{name:'backButton'},()=>{board.parent=null;});
 r.confirmSkill=async()=>{p.isAcquired=true;board._produceIdol.skillPoint=60;};
 r.latest=null;r.skillMode=undefined;let saved=null;r.env.saveSkillPlan=plan=>{saved=plan;};
 r.options.skillPlan={runId:'old',steps:[{panelId:'limit',skillId:'s',cost:20}]};
 assert.equal(await r.skills(root),true);
 assert.equal(board._produceIdol.skillPoint,60);assert.equal(saved,null);assert.equal(r.skillSeen.size,0);
});
test('Starting on the board with no plan and no caps returns without buying',async()=>{
 const {root,add,r}=sceneFixture();let back=0;
 const board=add(root,{_produceIdol:{skillPoint:80},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 add(board._uiPartsLayer,{name:'backButton',interactive:true,listeners:()=>[()=>{}],emit:()=>{back++;board.parent=null;}});
 r.latest=null;r.options.skillPlan=null;
 assert.equal(await r.skills(root),true);assert.equal(back,1);
});
test('Skill confirmation waits for its button to become visible',async()=>{
 const {root,add,r}=sceneFixture();const board=add(root);board._dialogLayer=add(board);
 const pop=add(board._dialogLayer,{_overlay:{},_base:{}});pop._buttons=add(pop);
 let taps=0,sleeps=0;const b=add(pop._buttons,{visible:false,interactive:true,texture:{textureCacheIds:['submit_button.png']},listeners:()=>[()=>{}],emit:()=>taps++});
 r.env.sleep=async()=>{sleeps++;b.visible=true;};
 await r.confirmSkill(root,board,'确认');assert.equal(taps,1);assert.equal(sleeps,1);
});
test('SP alone never opens skills; auditions and real caps do',()=>{
 const w={sp:999,capped:[]};assert.equal(W.skillTiming(w,'work_talk'),null);assert.equal(W.skillTiming(w,'work_radio'),null);
 assert.equal(W.skillTiming({...w,sp:20},'audition_40000'),'audition');assert.equal(W.skillTiming(w,'final_battle'),'audition');
 assert.equal(W.skillTiming({...w,capped:['visual']},'work_talk'),'cap');assert.equal(W.skillTiming({...w,sp:0},'audition_10000'),null);
 assert.deepEqual(W.cappedAttributes({visual:500,limitVisual:500,vocal:499,limitVocal:500}),['visual']);
 assert.equal(W.capPanelUseful({skillCategory:'active',skill:{name:'Visual5倍'}},['visual']),false);
 assert.equal(W.capPanelUseful({skillCategory:'limit_break',skill:{name:'Visual＆Mental上限UP'}},['visual']),true);
 assert.equal(W.capPanelUseful({skillCategory:'limit_break',skill:{name:'Vocal上限UP'}},['visual']),false);
});
test('Reporter decline is independent of answer order and Chinese/Japanese',()=>{
 const item=text=>({text,children:[]});for(const t of ['取材を断る','拒绝采访','拒絕採訪']){const a=item(t);assert.equal(W.reporterChoice([item('接受采访'),a]),a);assert.equal(W.reporterChoice([a,item('接受采访')]),a);}
 assert.throws(()=>W.reporterChoice([item('接受采访'),item('第一种采访')]));
});
test('Settlement handles the typed rank result and reused buttons once per binding',async()=>{
 const {root,add,r}=sceneFixture();let taps=0;let cb=()=>{};
 const owner=add(root,{_isWing:true,_params:{},_staff:{}});
 owner._btnNext=add(owner,{visible:false});owner._btnOk=add(owner,{interactive:true,listeners:()=>[cb],emit:()=>taps++});
 await r.settlement(root);await r.settlement(root);assert.equal(taps,1);
 cb=()=>{};await r.settlement(root);assert.equal(taps,2);
 const generic=sceneFixture();add(generic.root,{name:'btnOk',interactive:true,listeners:()=>[cb],emit:()=>taps++});assert.equal(await generic.r.settlement(generic.root),false);
});
test('Starting on a settlement with an incomplete store does not fail before skip',async()=>{
 const {root,r}=sceneFixture();root._store={produceType:'wing'};let reached=false;
 r.settlement=async()=>{reached=true;r.stop();return true;};r.env.sleep=async()=>{};
 await assert.rejects(r.run(),/已停止/);assert.equal(reached,true);
});
test('Reporter handler clicks only decline and never unrelated choices',async()=>{
 const {root,add,r}=sceneFixture();let accept=0,decline=0;
 const owner=add(root,{_reporterAppearance:{},_producerCommentUI:{},_rejectInterview(){}});owner._answersLayer=add(owner);
 const list=add(owner._answersLayer,{_answerItems:[]});
 const make=(text,emit)=>add(list,{text,interactive:true,listeners:()=>[emit],emit});
 list._answerItems=[make('取材を受ける',()=>accept++),make('取材を断る',()=>decline++)];
 await r.reporter(root);assert.equal(accept,0);assert.equal(decline,1);
});
test('Cap-only visit skips planned active/passive purchases and buys only the capped limit',async()=>{
 const {root,add,r}=sceneFixture();let activeTaps=0;
 const board=add(root,{_produceIdol:{skillPoint:100,visual:500,limitVisual:500},_onSelectIdolSkillPanel(){}});board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const panel={id:'limit',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'s',name:'Visual上限UP'}};
 const active={...panel,id:'active',skillCategory:'active',skill:{id:'a',name:'Visual5倍'}};
 const button=(parent,props,emit)=>add(parent,{interactive:true,listeners:()=>[emit],emit,...props});
 const acquire=button(board,{},()=>{});
 button(board._skillPanelsLayer,{normalSkillPanel:active},()=>activeTaps++);
 button(board._skillPanelsLayer,{normalSkillPanel:panel},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:panel,_acquireButton:acquire}};});
 button(board._uiPartsLayer,{name:'backButton'},()=>board.parent=null);
 r.confirmSkill=async()=>{panel.isAcquired=true;board._produceIdol.skillPoint=80;board._produceIdol.limitVisual=550;};
 r.latest={runId:'r',week:3};r.skillMode='cap';r.options.skillPlan={runId:'r',steps:[{panelId:'active',skillId:'a',cost:20},{panelId:'limit',skillId:'s',cost:20}]};
 await r.skills(root);assert.equal(activeTaps,0);assert.equal(board._produceIdol.skillPoint,80);
});
test('New audition wrapper selects its nested carousel without calling nonexistent wrapper method',async()=>{
 const {root,add,r}=sceneFixture();const target={id:'7',fan:10000,isSelectable:true};
 const layer=add(root,{selectedActionType:4});const carousel=add(layer,{currentContent:{id:'5'},scrollToIndex(i){assert.equal(i,2);this.currentContent={id:'7'};layer._selectedPlaceCategory='7';}});
 layer._actionSelect=add(layer,{actionType:4,_actionListCarousel:carousel,_auditions:[{id:'5'},{id:'6'},target],_auditionContents:[{id:'5'},{id:'6'},{id:'7'}]});
 await r.selectAuditionTarget(root,layer,target);assert.equal(layer._selectedPlaceCategory,'7');
 layer._actionSelect._auditionContents[2].id='8';await assert.rejects(r.selectAuditionTarget(root,layer,target),/目标ID不符/);
});
test('Continuous mode ignores week-count cutoff while preserving same-run guard',()=>{
 const r=new W.Runner({hidden:()=>false,load:()=>null,save:()=>{},log:()=>{}},{untilEnd:true,maxWeeks:1});const w=W.snapshot(state(),'vi');r.attach(w);r.attach({...w,week:w.week+2});assert.throws(()=>r.attach({...w,runId:'other'}),/轮次变化/);
});
test('Blade route prioritization moves necessary high-multiplier chains before optional filler',()=>{
 const ids=['filler','20401600700404','20402000900404','10401000700101','20402000900101','20402000900202','20402000900303','20401600700101','20401600700202','20401600700303'];
 const steps=ids.map(panelId=>({panelId}));const out=W.prioritizeSkillSteps(steps).map(s=>s.panelId);
 assert.equal(out[0],'10401000700101');assert.equal(out.at(-1),'filler');assert.ok(out.indexOf('20402000900303')<out.indexOf('20402000900404'));assert.equal(out.length,new Set(out).size);
});
test('Concert result advances OK and never chooses paid continue',async()=>{
 const {root,add,r}=sceneFixture();let ok=0,paid=0;
 const result=add(root,{_params:{concertData:{}},_judgeSpeech:{},_doNotContinue(){}});
 result._okButton=add(result,{interactive:true,listeners:()=>[()=>{}],emit:()=>ok++});
 result._continueButton=add(result,{interactive:true,listeners:()=>[()=>{}],emit:()=>paid++});
 await r.concertResult(root);assert.equal(ok,1);assert.equal(paid,0);
});
test('Scene dialogue taps include global coordinates for BaseScene tap effect, then advance speech',async()=>{
 const {root,add,r}=sceneFixture();const {EventEmitter}=require('node:events');const events=new EventEmitter();let effects=0,skipped=0,advanced=0;
 root._params={concertData:{}};root._judgeSpeech={};root._okButton=add(root,{visible:false});root._doNotContinue=()=>{};root.interactive=true;
 root.getGlobalPosition=()=>({x:568,y:320});root.listeners=e=>events.listeners(e);root.emit=(e,data)=>events.emit(e,data);
 events.on('tap',e=>{assert.equal(e.data.global.x,568);assert.equal(e.data.global.y,320);assert.equal(e.data.global.clone().x,568);effects++;});
 events.once('tap',()=>{skipped++;Promise.resolve().then(()=>events.once('tap',()=>advanced++));});
 await r.concertResult(root);await Promise.resolve();await r.concertResult(root);await r.concertResult(root);
 assert.equal(skipped,1);assert.equal(advanced,1);assert.equal(effects,3); // last base-only binding is harmless and runs once
});
test('Invalid scene tap coordinates stop before dispatch',()=>{
 const {root,r}=sceneFixture();let dispatched=0;root.interactive=true;root.listeners=()=>[()=>{}];root.getGlobalPosition=()=>({x:NaN,y:0});root.emit=()=>dispatched++;
 assert.throws(()=>r.tap(root,root,'推进结果'),/坐标/);assert.equal(dispatched,0);
});
test('Resumed pending audition counts its finished week toward the one-week limit',()=>{
 const w=W.snapshot(state(),'vi');const saved={runId:w.runId,pending:{week:w.week,fans:w.fans,sp:w.sp,state:w},verified:[]};
 const r=new W.Runner({hidden:()=>false,load:()=>saved,save:()=>{},log:()=>{}});r.startWeek=w.week;
 assert.throws(()=>r.attach({...w,week:w.week+1,fans:w.fans+10000}),/设定周数已完成/);assert.equal(saved.pending,null);
});
test('Post-audition ADV takes precedence over the still-present concert result scene',async()=>{
 const {root,r}=sceneFixture();r.env.load=()=>null;r.env.sleep=async()=>{};let story=0,result=0;
 r.settlement=async()=>false;r.reporter=async()=>false;
 r.story=async()=>{story++;r.stop();return true;};r.concertResult=async()=>{result++;return true;};
 await assert.rejects(r.run(),/已停止/);assert.equal(story,1);assert.equal(result,0);
});
function storyFixture(){
 const {root,add,r}=sceneFixture();
 const owner=add(root,{_event:{answers:[]}});
 const adv=add(owner,{});owner._advPlayer=adv;
 adv.scenarioPlayer=add(adv,{});
 adv.mainController=add(adv,{});
 adv._interactionLayer=add(adv,{interactive:true,listeners:()=>[()=>{}]});
 r.env.sleep=async()=>{};
 return {root,add,r,owner,adv};
}
test('Known client transition surfaces wait instead of looking like unknown pages',()=>{
 const root={children:[],interactiveChildren:true};
 const loading={children:[],visible:true,parent:root},blocker={children:[],visible:true,parent:root};
 assert.equal(W.transitionState(root),false);
 assert.equal(W.transitionState({children:[],interactiveChildren:false}),true);
 assert.equal(W.transitionState({children:[],_isUpdating:true}),true);
 root._loadingLayer=loading;assert.equal(W.transitionState(root),true);
 const white={children:[],visible:true,alpha:1,parent:root};loading.visible=false;root._transitionLayer={children:[white]};
 assert.equal(W.transitionState(root),true);
 white.alpha=0;assert.equal(W.transitionState(root),false);
 root._mainLayer={_blocker:blocker};assert.equal(W.transitionState(root),true);
 blocker.visible=false;assert.equal(W.transitionState(root),false);
 const playing={children:[],_isTransitionPlaying:()=>true};assert.equal(W.transitionState(playing),true);
});
test('A long known transition is waited out, while an unknown page still stops with a hint',async()=>{
 const {root,r}=sceneFixture();root._store={produceType:'wing'};root._isUpdating=true;r.lastProgress=Date.now()-60000;
 let ticks=0;r.env.sleep=async()=>{if(++ticks===4){root._isUpdating=false;r.stop();}};
 await assert.rejects(r.run(),/已停止/);assert.equal(ticks,4);
 const second=sceneFixture();second.root._store={produceType:'wing'};second.r.lastProgress=Date.now()-46000;
 await assert.rejects(second.r.run(),/尚未适配.*键\[/);
});
test('A tap rejected by a transition is retried instead of ending the run',async()=>{
 const {root,r}=sceneFixture();r.env.sleep=async()=>{};let calls=0;
 r.story=async()=>{if(++calls===1)throw new Error('界面正在转场');r.stop();return true;};
 await assert.rejects(r.run(),/已停止/);assert.equal(calls,2);
});
test('Skip button is re-armed when the client hides it for the next story segment',async()=>{
 const {root,add,r,adv}=storyFixture();let taps=0;
 const skip=add(adv.mainController,{visible:true,interactive:true,listeners:()=>[()=>{}],emit:()=>taps++});
 adv.mainController._skipButton=skip;
 await r.story(root);await r.story(root);assert.equal(taps,1);
 skip.visible=false;await r.story(root);assert.equal(taps,1);
 skip.visible=true;await r.story(root);assert.equal(taps,2);
});
test('Active overlay story player is handled before a finished base player',async()=>{
 const {root,add,r}=sceneFixture();let taps=0;
 const stale=add(root,{mainController:{},scenarioPlayer:{}});
 const active=add(root,{});active.scenarioPlayer={};active.mainController=add(active,{});
 active.mainController._skipButton=add(active.mainController,{visible:true,interactive:true,listeners:()=>[()=>{}],emit:()=>taps++});
 assert.equal(await r.story(root),true);assert.equal(taps,1);
 assert.equal(await r.story(root),true);assert.equal(taps,1);
 assert.equal(W.walk(root).includes(stale),true);
});
test('A visible but idle story surface advances through the game dialogue layer',async()=>{
 const {root,add,r,adv}=storyFixture();let taps=0;
 adv._interactionLayer.listeners=()=>[()=>{}];adv._interactionLayer.emit=()=>taps++;
 adv._trackManager={_current:0};r.storyWatch.set(adv,{key:'0',at:Date.now()-4000});
 await r.story(root);assert.equal(taps,1);
 await r.story(root);assert.equal(taps,1);
 adv._interactionLayer.interactive=false;r.storyWatch.set(adv,{key:'0',at:Date.now()-4000});
 await r.story(root);assert.equal(taps,1);
});
test('A stalled story segment forces 4x back on instead of toggling twice',async()=>{
 const {root,add,r,adv}=storyFixture();
 const ctl=adv.mainController,logs=[];r.log=m=>logs.push(m);
 let taps=0,forces=0;
 const fast=add(ctl,{visible:true,interactive:true,isOn:false,listeners:()=>[()=>{}],emit:()=>taps++});
 ctl._speedButtonMap={fast4:fast};ctl.speedMode='normal';
 ctl._controlSpeedButton=(btn,mode)=>{forces++;ctl.speedMode=btn.isOn?mode:'normal';};
 adv._trackManager={_current:2};r.storyWatch.set(adv,{key:'2',at:Date.now()-4000});
 assert.equal(await r.story(root),true);
 assert.equal(taps,0);assert.equal(forces,1);assert.equal(fast.isOn,true);assert.equal(ctl.speedMode,'fast4');
 assert.ok(logs.some(m=>/启用4倍速（normal→fast4）/.test(m)));
});
test('A desynced 4x control is forced to 4x instead of being toggled off',async()=>{
 const {root,add,r,adv}=storyFixture();
 const ctl=adv.mainController;let taps=0,forces=0;
 // The client can keep the button lit while its speed mode fell back to normal.
 const fast=add(ctl,{visible:true,interactive:true,isOn:true,listeners:()=>[()=>{}],emit:()=>{taps++;fast.isOn=!fast.isOn;ctl.speedMode=fast.isOn?'fast4':'normal';}});
 ctl._speedButtonMap={fast4:fast};ctl.speedMode='normal';
 ctl._controlSpeedButton=(btn,mode)=>{forces++;ctl.speedMode=btn.isOn?mode:'normal';};
 adv._trackManager={_current:0};r.storyWatch.set(adv,{key:'0',at:Date.now()-4000});
 await r.nudgeStory(root,adv);
 assert.equal(taps,0);assert.equal(forces,1);assert.equal(ctl.speedMode,'fast4');
});
test('A stalled promise dialogue re-asserts 4x while its tap keeps advancing',async()=>{
 const {root,add,r,owner,adv}=storyFixture();
 owner._event={answers:[],eventCategory:{ignoreSpeedSetting:true}};
 let advTaps=0;adv._interactionLayer.listeners=()=>[()=>{}];adv._interactionLayer.emit=()=>advTaps++;
 const ctl=adv.mainController;let taps=0,forces=0;
 const fast=add(ctl,{visible:true,interactive:true,isOn:false,listeners:()=>[()=>{}],emit:()=>taps++});
 ctl._speedButtonMap={fast4:fast};ctl.speedMode='normal';
 ctl._controlSpeedButton=(btn,mode)=>{forces++;ctl.speedMode=btn.isOn?mode:'normal';};
 adv._trackManager={_current:0};r.storyWatch.set(adv,{key:'0',at:Date.now()-4000});
 await r.story(root);
 assert.equal(forces,1);assert.equal(taps,0);assert.equal(ctl.speedMode,'fast4');
 // 4x is forced first; the next stalled call is free to advance the dialogue.
 r.storyWatch.set(adv,{key:'0',at:Date.now()-4000});
 await r.story(root);
 assert.equal(advTaps,1);
});
test('Every input is followed by a 400 ms pause before the next one',async()=>{
 const {root,add,r}=sceneFixture();const slept=[];r.env.sleep=async ms=>slept.push(ms);
 const b=add(root,{interactive:true,listeners:()=>[()=>{}],emit:()=>{}});
 r.tap(root,b,'按钮');assert.ok(Date.now()-r.lastActAt<50,'tap records the action time');
 await r.pace();assert.equal(slept.length,1);assert.ok(slept[0]>=300&&slept[0]<=400,`waited ${slept[0]}`);
 r.lastActAt=Date.now()-1000;await r.pace();assert.equal(slept.length,1,'no wait when the gap already passed');
});
test('A slow client is not tapped again while the pace window is open',async()=>{
 const {root,add,r}=sceneFixture();let slept=0;r.env.sleep=async()=>{slept++;};
 const b=add(root,{interactive:true,listeners:()=>[()=>{}],emit:()=>{}});
 r.tap(root,b,'按钮');await r.pace();await r.pace();
 assert.ok(slept>=1);
});
test('A moved story line restarts the two second stall window instead of nudging',async()=>{
 const {root,add,r,adv}=storyFixture();
 const ctl=adv.mainController;let taps=0;
 const fast=add(ctl,{visible:true,interactive:true,isOn:true,listeners:()=>[()=>{}],emit:()=>{taps++;}});
 ctl._speedButtonMap={fast4:fast};ctl.speedMode='fast4';
 adv._trackManager={_current:5};r.storyWatch.set(adv,{key:'4',at:Date.now()-9000});
 await r.story(root);
 assert.equal(taps,0);
 assert.equal(r.storyWatch.get(adv).key,'5');
});

test('Skipping a read story survives the white transition and reaches the next settlement',async()=>{
 const {root,add,r}=sceneFixture();root._store={produceType:'wing'};
 const white={children:[],visible:true,alpha:1,parent:root};
 let skipTaps=0,loops=0;
 const owner=add(root,{_event:{answers:[]}});
 const adv=add(owner,{});owner._advPlayer=adv;
 const sp=add(adv,{});adv.scenarioPlayer=sp;
 adv._interactionLayer=add(adv,{interactive:true,listeners:()=>[()=>{}]});
 const ctl=add(adv,{});adv.mainController=ctl;
 const skip=add(ctl,{visible:true,interactive:true,listeners:()=>[()=>{}],emit:()=>{
  skipTaps++;skip.visible=false;sp.visible=false;adv.visible=false;root._transitionLayer={children:[white]};
 }});
 ctl._skipButton=skip;
 r.env.sleep=async()=>{
  loops++;
  // The client's white transition left no story and no main layer for longer than
  // the old 45 s unknown-page window; only a recognized transition may wait it out.
  if(loops===2)r.lastProgress=Date.now()-60000;
  if(loops===6){white.alpha=0;root._settlement=true;}
 };
 r.settlement=async root=>{if(!root._settlement)return false;r.stop();return true;};
 r.reporter=async()=>false;
 await assert.rejects(r.run(),/已停止/);
 assert.equal(skipTaps,1);assert.ok(loops>=6);
});
test('S3 last two weeks also take the 50k audition on the second trend',()=>{
 const w={...W.snapshot(state(),'vi'),season:3,fans:50000,mental:100,trendRank:2};
 assert.equal(W.decide({...w,left:2}),'audition_50000');
 assert.equal(W.decide({...w,left:1}),'audition_50000');
 assert.equal(W.decide({...w,left:3}),'work_talk');
 assert.equal(W.decide({...w,left:2,fans:99999}),'audition_50000');
 assert.equal(W.decide({...w,left:2,trendRank:1}),'audition_50000');
 assert.equal(W.decide({...w,left:3,trendRank:1}),'audition_50000');
 assert.equal(W.decide({...w,left:2,trendRank:3}),'work_talk');
 assert.throws(()=>W.decide({...w,left:2,fans:10000,trendRank:2}),/等待余量/);
});
test('An unaffordable top priority skill stops the visit without buying a cheaper node',async()=>{
 const {root,add,r}=sceneFixture();
 const attack={id:'atk',skillPoint:50,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'active',skill:{id:'sa',name:'てやんでぇ＋'}};
 const passive={id:'pas',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'passive',skill:{id:'sp',name:'Visual60%UP'}};
 const board=add(root,{_produceIdol:{skillPoint:30,activeSkills:[{id:'old',name:'旧技能'}]},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const button=(parent,props,emit)=>add(parent,{interactive:true,listeners:()=>[emit],emit,...props});
 const acquire=button(board,{},()=>{});
 button(board._skillPanelsLayer,{normalSkillPanel:attack},()=>{throw new Error('不应点击负担不起的主动技能');});
 button(board._skillPanelsLayer,{normalSkillPanel:passive},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:passive,_acquireButton:acquire}};});
 button(board._uiPartsLayer,{name:'backButton'},()=>board.parent=null);
 r.confirmSkill=async()=>{passive.isAcquired=true;board._produceIdol.skillPoint=10;};
 r.latest={runId:'r',week:3};r.skillMode='audition';
 r.options.skillPlan={runId:'r',steps:[{panelId:'atk',skillId:'sa',cost:50,replaceSkillId:'old'},{panelId:'pas',skillId:'sp',cost:20}]};
 const logs=[];r.log=m=>logs.push(m);
 assert.equal(await r.skills(root),true);
 // The head of the queue costs 50 and only 30 SP is left: nothing is bought at all.
 assert.equal(passive.isAcquired,false);assert.equal(attack.isAcquired,false);assert.equal(board._produceIdol.skillPoint,30);
 assert.ok(logs.some(m=>/SP不足，本轮停止购买：てやんでぇ＋（需50，现有30）/.test(m)));
});
test('A gated route step on a fresh board is skipped with a log instead of stopping',async()=>{
 const {root,add,r}=sceneFixture();
 const locked={id:'lock',skillPoint:20,isAcquired:false,isArrival:false,isLocked:false,skillCategory:'passive',skill:{id:'sl',name:'Visual65%UP'}};
 const board=skillBoard(root,add,{sp:99,stats:{visual:300,limitVisual:900},panels:[locked],r});
 const logs=[];r.log=m=>logs.push(m);
 r.latest={runId:'r',week:3};r.skillMode='audition';
 r.options.skillPlan={runId:'r',steps:[{panelId:'lock',skillId:'sl',cost:20}]};
 assert.equal(await r.skills(root),true);
 assert.equal(locked.isAcquired,false);assert.equal(board._produceIdol.skillPoint,99);
 assert.ok(logs.some(m=>/前置未满足/.test(m)));
});
test('A cap visit buys limit nodes for capped attributes the route does not list',async()=>{
 const {root,add,r}=sceneFixture();
 const active={id:'atk',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'active',skill:{id:'sa',name:'Visual5倍'}};
 const limit={id:'lim',skillPoint:20,isAcquired:false,isArrival:true,isLocked:false,skillCategory:'limit_break',skill:{id:'sl',name:'Mental上限UP'}};
 const board=add(root,{_produceIdol:{skillPoint:60,mental:300,limitMental:300},_onSelectIdolSkillPanel(){}});
 board._skillPanelsLayer=add(board);board._uiPartsLayer=add(board);
 const button=(parent,props,emit)=>add(parent,{interactive:true,listeners:()=>[emit],emit,...props});
 const acquire=button(board,{},()=>{});
 button(board._skillPanelsLayer,{normalSkillPanel:active},()=>{throw new Error('上限检查时不应购买主动技能');});
 button(board._skillPanelsLayer,{normalSkillPanel:limit},()=>{board._skillPanelDetail={_normalSkill:{_skillPanel:limit,_acquireButton:acquire}};});
 button(board._uiPartsLayer,{name:'backButton'},()=>board.parent=null);
 r.confirmSkill=async()=>{limit.isAcquired=true;board._produceIdol.skillPoint=40;board._produceIdol.limitMental=400;};
 r.latest={runId:'r',week:3};r.skillMode='cap';
 r.options.skillPlan={runId:'r',steps:[{panelId:'atk',skillId:'sa',cost:20}]};
 assert.equal(await r.skills(root),true);
 assert.equal(limit.isAcquired,true);assert.equal(active.isAcquired,false);assert.equal(board._produceIdol.skillPoint,40);
});

// --- v0.5.10 skill order: attacks, boosts, limit nodes near the cap -------------
function skillBoard(root, add, opts) {
  const board = add(root, { _produceIdol: { skillPoint: opts.sp, ...(opts.stats || {}) }, _onSelectIdolSkillPanel() {} });
  board._skillPanelsLayer = add(board); board._uiPartsLayer = add(board);
  const btn = (parent, props, act) => add(parent, { interactive: true, listeners: () => [() => {}], emit: act, ...props });
  const acquire = btn(board, {}, () => {});
  let pending = null;
  for (const panel of opts.panels) {
    btn(board._skillPanelsLayer, { normalSkillPanel: panel }, () => {
      pending = panel;
      board._skillPanelDetail = { _normalSkill: { _skillPanel: panel, _acquireButton: acquire } };
    });
  }
  btn(board._uiPartsLayer, { name: 'backButton' }, () => { board.parent = null; });
  opts.r.confirmSkill = async () => { const panel = pending; panel.isAcquired = true; board._produceIdol.skillPoint -= panel.skillPoint; };
  return board;
}
function skillPanel(id, category, name, cost) {
  return { id, skillCategory: category, skillPoint: cost, isAcquired: false, isArrival: true, isLocked: false, skill: { id: 's' + id, name } };
}
test('Boost detection covers Visual130%UP but not limit nodes or attack skills', () => {
  assert.equal(W.boostPanelUseful({ skillCategory: 'passive', skill: { name: 'Visual130%UP' } }), true);
  assert.equal(W.boostPanelUseful({ skillCategory: 'passive', skill: { name: 'Vo50%アップ' } }), true);
  assert.equal(W.boostPanelUseful({ skillCategory: 'limit_break', skill: { name: 'Visual上限UP' } }), false);
  assert.equal(W.boostPanelUseful({ skillCategory: 'active', skill: { name: 'Visual5倍' } }), false);
  assert.equal(W.boostPanelUseful({ skillCategory: 'passive', skill: { name: 'メンタル回復' } }), false);
  assert.equal(W.skillAttribute('Visual130%UP'), 'visual');
  assert.equal(W.skillPercent('Visual130%UP'), 130);
  assert.deepEqual(W.nearCapAttributes({ visual: 480, limitVisual: 500, dance: 100, limitDance: 500 }), ['visual']);
  assert.deepEqual(W.nearCapAttributes({ visual: 450, limitVisual: 500 }), ['visual']); // 90% counts as near
  assert.deepEqual(W.nearCapAttributes({ visual: 440, limitVisual: 500 }), []);
});
test('Purchase queue runs attacks, boosts, near-cap limits, then spare limits', () => {
  const panels = [
    skillPanel('atk', 'active', 'Visual5倍', 20),
    skillPanel('near', 'limit_break', 'Visual上限UP', 20),
    skillPanel('boost', 'passive', 'Visual130%UP', 30),
    skillPanel('spare', 'limit_break', 'Dance上限UP', 40)];
  const board = { _skillPanelsLayer: { children: panels.map(p => ({ normalSkillPanel: p })) }, _produceIdol: { visual: 480, limitVisual: 500, dance: 100, limitDance: 500 } };
  const plan = { runId: 'r', steps: [
    { panelId: 'spare', skillId: 'sspare', cost: 40, replaceSkillId: undefined },
    { panelId: 'atk', skillId: 'satk', cost: 20 },
    { panelId: 'near', skillId: 'snear', cost: 20 }] };
  const queue = W.skillPurchaseQueue(board, plan, { capOnly: false, wantedAttrs: ['visual'] });
  assert.deepEqual(queue.map(s => s.panelId), ['atk', 'boost', 'near', 'spare']);
});
test('A boost the stored route never listed is still learned before a spare limit node', async () => {
  const { root, add, r } = sceneFixture();
  const boost = skillPanel('boost', 'passive', 'Visual130%UP', 30);
  const spare = skillPanel('spare', 'limit_break', 'Dance上限UP', 20);
  const board = skillBoard(root, add, { sp: 35, stats: { visual: 300, limitVisual: 900, dance: 100, limitDance: 900 }, panels: [boost, spare], r });
  const logs = []; r.log = m => logs.push(m);
  r.latest = { runId: 'r', week: 3 };
  r.options.skillPlan = { runId: 'r', steps: [{ panelId: 'spare', skillId: 'sspare', cost: 20 }] };
  assert.equal(await r.skills(root), true);
  assert.equal(boost.isAcquired, true);
  assert.equal(spare.isAcquired, false);
  assert.equal(board._produceIdol.skillPoint, 5);
  assert.ok(logs.some(m => /SP不足，本轮停止购买：Dance上限UP/.test(m)));
});
test('An attribute close to its cap buys the boost, then defers the limit node on SP', async () => {
  const { root, add, r } = sceneFixture();
  const limit = skillPanel('limit', 'limit_break', 'Visual上限UP', 20);
  const boost = skillPanel('boost', 'passive', 'Visual130%UP', 30);
  const board = skillBoard(root, add, { sp: 45, stats: { visual: 480, limitVisual: 500 }, panels: [limit, boost], r });
  const logs = []; r.log = m => logs.push(m);
  r.latest = { runId: 'r', week: 3 };
  r.options.skillPlan = { runId: 'r', steps: [{ panelId: 'boost', skillId: 'sboost', cost: 30 }, { panelId: 'limit', skillId: 'slimit', cost: 20 }] };
  assert.equal(await r.skills(root), true);
  assert.equal(boost.isAcquired, true);
  assert.equal(limit.isAcquired, false);
  assert.equal(board._produceIdol.skillPoint, 15);
  assert.ok(logs.some(m => /SP不足，本轮停止购买：Visual上限UP/.test(m)));
});

// --- v0.5.11 skill path planning: board grid, prerequisites, per-run planning ----
test('Skill prerequisites come from the tree grid of sequence and step', () => {
  const panels = [
    { id: '20402000900101', sequence: 1, step: 1 }, { id: '20402000900202', sequence: 2, step: 2 },
    { id: '20402000900302', sequence: 3, step: 2 }, { id: '20402000900303', sequence: 3, step: 3 },
    { id: '20401600700202', sequence: 2, step: 2 }];
  assert.deepEqual(W.skillPrerequisitePanels(panels[3], panels).map(p => p.id), ['20402000900202', '20402000900302']);
  assert.deepEqual(W.skillPrerequisitePanels(panels[0], panels), []);
  assert.deepEqual(W.skillPrerequisitePanels({ id: 'x' }, panels), []);
});
test('Panel trees follow the client characterId map when the board exposes it', () => {
  const a1 = { id: 'aaa00101', sequence: 1, step: 1 }, a2 = { id: 'aaa00202', sequence: 2, step: 2 };
  const b1 = { id: 'bbb00101', sequence: 1, step: 1 }, b2 = { id: 'bbb00202', sequence: 2, step: 2 };
  const view = p => ({ normalSkillPanel: p });
  const board = { _skillPanelsLayer: { _allSkillPanels: { 11: { 257: view(a1), 514: view(a2) }, 22: { 257: view(b1), 514: view(b2) } } } };
  const treeOf = W.skillTreeOf(board);
  assert.equal(treeOf(a1), '11');
  assert.equal(treeOf(b2), '22');
  assert.deepEqual(W.skillPrerequisitePanels(a2, [a1, a2, b1, b2], treeOf).map(p => p.id), ['aaa00101']);
  assert.deepEqual(W.skillPrerequisitePanels(a1, [a1, a2, b1, b2], treeOf), []);
});
test('The queue plans attacks before boosts even without a stored route', () => {
  const atk = skillPanel('atk', 'active', 'Visual5倍', 20);
  const boost = skillPanel('boost', 'passive', 'Visual130%UP', 20);
  const weak = skillPanel('weak', 'active', 'Dance2倍', 20);
  const board = { _skillPanelsLayer: { children: [boost, atk, weak].map(p => ({ normalSkillPanel: p })) }, _produceIdol: { visual: 200, limitVisual: 900 } };
  const queue = W.skillPurchaseQueue(board, null, { capOnly: false, wantedAttrs: ['visual'] });
  assert.deepEqual(queue.map(s => s.panelId), ['atk', 'weak', 'boost']);
});
test('A gated high-value boost pulls in its unfilled prerequisite first', () => {
  const pre = { id: '20402000900202', sequence: 2, step: 2, skillCategory: 'passive', skillPoint: 10, isArrival: true, isLocked: false, skill: { id: 'sp', name: 'メンタル回復' } };
  const tgt = { id: '20402000900303', sequence: 3, step: 3, skillCategory: 'passive', skillPoint: 30, isArrival: false, isLocked: false, skill: { id: 'st', name: 'Visual130%UP' } };
  const board = { _skillPanelsLayer: { children: [pre, tgt].map(p => ({ normalSkillPanel: p })) }, _produceIdol: { visual: 200, limitVisual: 900 } };
  const queue = W.skillPurchaseQueue(board, { runId: 'r', steps: [{ panelId: '20402000900303', skillId: 'st', cost: 30 }] }, { capOnly: false, wantedAttrs: ['visual'], planMatched: true });
  assert.deepEqual(queue.map(s => s.panelId), ['20402000900202', '20402000900303']);
});
test('A skill visit learns the missing prerequisite before the gated target', async () => {
  const { root, add, r } = sceneFixture();
  const pre = { id: '20402000900202', sequence: 2, step: 2, skillCategory: 'passive', skillPoint: 10, isAcquired: false, isArrival: true, isLocked: false, skill: { id: 'sp', name: 'メンタル回復' } };
  const tgt = { id: '20402000900303', sequence: 3, step: 3, skillCategory: 'passive', skillPoint: 30, isAcquired: false, isArrival: false, isLocked: false, skill: { id: 'st', name: 'Visual130%UP' } };
  const board = skillBoard(root, add, { sp: 45, stats: { visual: 200, limitVisual: 900 }, panels: [pre, tgt], r });
  const order = [];
  r.confirmSkill = async () => {
    const panel = board._skillPanelDetail._normalSkill._skillPanel;
    order.push(panel.id); panel.isAcquired = true; board._produceIdol.skillPoint -= panel.skillPoint;
    if (panel.id === '20402000900202') tgt.isArrival = true; // the client unlocks the next grid cell
  };
  r.latest = { runId: 'r', week: 3 }; r.skillMode = 'audition';
  r.options.skillPlan = { runId: 'r', steps: [{ panelId: '20402000900303', skillId: 'st', cost: 30 }] };
  assert.equal(await r.skills(root), true);
  assert.deepEqual(order, ['20402000900202', '20402000900303']);
  assert.equal(board._produceIdol.skillPoint, 5);
});
test('Without a stored plan the visit plans the board and says so', async () => {
  const { root, add, r } = sceneFixture();
  const boost = skillPanel('boost', 'passive', 'Visual130%UP', 20);
  const limit = skillPanel('near', 'limit_break', 'Visual上限UP', 20);
  const board = skillBoard(root, add, { sp: 50, stats: { visual: 480, limitVisual: 500 }, panels: [limit, boost], r });
  const order = [];
  r.confirmSkill = async () => { const p = board._skillPanelDetail._normalSkill._skillPanel; order.push(p.id); p.isAcquired = true; board._produceIdol.skillPoint -= p.skillPoint; };
  const logs = []; r.log = m => logs.push(m);
  r.latest = { runId: 'r', week: 3 }; r.skillMode = 'audition'; r.options.skillPlan = null;
  assert.equal(await r.skills(root), true);
  assert.deepEqual(order, ['boost', 'near']);
  assert.ok(logs.some(m => /未配置技能路线/.test(m)));
});
test('Only the four strongest attack skills are planned even when the route lists more', () => {
  const names = ['Visual2倍', 'Visual5倍', 'Dance3.5倍', 'Visual3倍', 'Visual4.5倍', 'Mental1.5倍'];
  const panels = names.map((n, i) => skillPanel('a' + (i + 1), 'active', n, 20));
  const board = { _skillPanelsLayer: { children: panels.map(p => ({ normalSkillPanel: p })) }, _produceIdol: {} };
  const plan = { runId: 'r', steps: panels.map(p => ({ panelId: p.id, skillId: p.skill.id, cost: p.skillPoint })) };
  const queue = W.skillPurchaseQueue(board, plan, { capOnly: false, wantedAttrs: ['visual'] });
  assert.deepEqual(queue.map(s => s.panelId), ['a2', 'a5', 'a3', 'a4']);
  assert.equal(W.bestAttackPanels(board).length, 4);
});
test('A skill visit learns only the strongest four attacks and names the ones it skips', async () => {
  const { root, add, r } = sceneFixture();
  const names = ['Visual2倍', 'Visual5倍', 'Dance3.5倍', 'Visual3倍', 'Visual4.5倍', 'Mental1.5倍'];
  const panels = names.map((n, i) => skillPanel('a' + (i + 1), 'active', n, 20));
  const board = skillBoard(root, add, { sp: 200, stats: { visual: 300, limitVisual: 900 }, panels, r });
  const equipped = [{ id: 'old', name: 'Visual1倍Appeal', isDeleted: false }];
  board._produceIdol.activeSkills = equipped;
  board._dialogLayer = add(board);
  const list = add(board._dialogLayer, { name: 'deleteSkillList' });
  const order = [];
  let pendingSkill = null;
  const rows = () => {
    list.children.length = 0;
    for (const a of board._produceIdol.activeSkills.filter(x => !x.isDeleted)) {
      const row = add(list, { skill: a });
      add(row, { name: 'name', text: a.name });
      add(row, { name: 'selectButton', interactive: true, listeners: () => [() => {}], emit: () => {
        const i = board._produceIdol.activeSkills.indexOf(row.skill);
        if (i >= 0) board._produceIdol.activeSkills.splice(i, 1);
        board._produceIdol.activeSkills.push({ id: pendingSkill.id, name: pendingSkill.name, isDeleted: false });
        list.children.length = 0;
      } });
    }
  };
  r.confirmSkill = async () => {
    const p = board._skillPanelDetail._normalSkill._skillPanel;
    if (p.isAcquired) return;
    order.push(p.id); p.isAcquired = true; board._produceIdol.skillPoint -= p.skillPoint;
    if (p.skillCategory === 'active') { pendingSkill = p.skill; rows(); }
  };
  const logs = []; r.log = m => logs.push(m);
  r.latest = { runId: 'r', week: 3 }; r.skillMode = 'audition'; r.options.skillPlan = null;
  assert.equal(await r.skills(root), true);
  assert.deepEqual(order, ['a2', 'a5', 'a3', 'a4']);
  assert.equal(board._produceIdol.skillPoint, 120);
  assert.ok(logs.some(m => /攻击技能只学倍率最高的4个，不学：Visual2倍、Mental1.5倍/.test(m)));
});
test('A locked strong attack pulls its own prerequisites before any boost', async () => {
  const { root, add, r } = sceneFixture();
  const mk = (id, seq, step, category, name, cost, extra) => ({ ...skillPanel(id, category, name, cost), sequence: seq, step, ...extra });
  const pre1 = mk('aaa00101', 1, 1, 'passive', 'Visual30％UP', 20);
  const pre2 = mk('aaa00202', 2, 2, 'passive', 'Visual30％UP', 20, { isArrival: false });
  const target = mk('aaa00303', 3, 3, 'active', 'Visual5倍', 30, { isArrival: false });
  // A cheaper, reachable, stronger boost would win a plain boost-first order.
  const jump = mk('bbb00101', 1, 1, 'passive', 'Visual99％UP', 20);
  const board = skillBoard(root, add, { sp: 200, stats: { visual: 300, limitVisual: 900 }, panels: [pre1, pre2, target, jump], r });
  board._produceIdol.activeSkills = [{ id: 'old', name: 'Visual1倍Appeal', isDeleted: false }];
  board._dialogLayer = add(board);
  const list = add(board._dialogLayer, { name: 'deleteSkillList' });
  let pendingSkill = null;
  const rows = () => {
    list.children.length = 0;
    for (const a of board._produceIdol.activeSkills.filter(x => !x.isDeleted)) {
      const row = add(list, { skill: a });
      add(row, { name: 'name', text: a.name });
      add(row, { name: 'selectButton', interactive: true, listeners: () => [() => {}], emit: () => {
        const i = board._produceIdol.activeSkills.indexOf(row.skill);
        if (i >= 0) board._produceIdol.activeSkills.splice(i, 1);
        board._produceIdol.activeSkills.push({ id: pendingSkill.id, name: pendingSkill.name, isDeleted: false });
        list.children.length = 0;
      } });
    }
  };
  const order = [];
  const unlock = p => {
    for (const q of board._skillPanelsLayer.children.map(c => c.normalSkillPanel)) {
      if (q.isAcquired) continue;
      if (Number(q.step) === Number(p.step) + 1 && (Number(q.sequence) === Number(p.sequence) || Number(q.sequence) === Number(p.sequence) + 1)) {
        q.isArrival = true; q.isLocked = false;
      }
    }
  };
  r.confirmSkill = async () => {
    const p = board._skillPanelDetail._normalSkill._skillPanel;
    if (p.isAcquired) return;
    order.push(p.id); p.isAcquired = true; board._produceIdol.skillPoint -= p.skillPoint;
    if (p.skillCategory === 'active') { pendingSkill = p.skill; rows(); }
    unlock(p);
  };
  r.latest = { runId: 'r', week: 5 }; r.skillMode = 'audition'; r.options.skillPlan = null;
  assert.equal(await r.skills(root), true);
  assert.deepEqual(order, ['aaa00101', 'aaa00202', 'aaa00303', 'bbb00101']);
  assert.equal(board._produceIdol.skillPoint, 110);
});
test('Support card 2.5倍 attacks are left out of the plan entirely', () => {
  const mk = (id, seq, step, category, name, comment, cost) => ({ ...skillPanel(id, category, name, cost), sequence: seq, step, skill: { id: 's' + id, name, comment } });
  const own = mk('P00000101', 1, 1, 'active', 'ビジュアルアピールIV', 'Visual3倍Appeal', 30);
  const weak = mk('S00000101', 1, 1, 'active', '水色感情', 'Visual2.5倍Appeal', 30);
  const board = { _skillPanelsLayer: { children: [own, weak].map(p => ({ normalSkillPanel: p })) }, _produceIdol: { characterId: 'P000' } };
  const q = W.skillPurchaseQueue(board, null, { capOnly: false, wantedAttrs: ['visual'] });
  assert.deepEqual(q.map(x => x.panelId), ['P00000101']);
  assert.equal(W.bestAttackPanels(board).length, 1);
});
test('A 2.5倍 support attack is bypassed when a target needs a prerequisite', () => {
  const mk = (id, seq, step, category, name, comment, cost, arrival) => ({ ...skillPanel(id, category, name, cost), sequence: seq, step, isArrival: arrival, skill: { id: 's' + id, name, comment } });
  const banned = mk('S00000101', 1, 1, 'active', '水色感情', 'Visual2.5倍Appeal', 30, true);
  const allowed = mk('S00000201', 2, 1, 'passive', 'Visual30％UP', '', 20, true);
  const target = mk('S00000202', 2, 2, 'passive', 'Visual130％UP', '', 40, false);
  const board = { _skillPanelsLayer: { children: [banned, allowed, target].map(p => ({ normalSkillPanel: p })) }, _produceIdol: { characterId: 'P000' } };
  const q = W.skillPurchaseQueue(board, null, { capOnly: false, wantedAttrs: ['visual'] });
  assert.deepEqual(q.map(x => x.panelId), ['S00000201', 'S00000202']);
  assert.ok((q.notes || []).some(n => /绕过支援卡2.5倍前置/.test(n)));
});
test('Attack ranking falls back to SP price when the name carries no 倍', () => {
  const mk = (id, name, cost) => ({ ...skillPanel(id, 'active', name, cost), sequence: 1, step: Number(id.slice(-1)) });
  const panels = [mk('c00101', 'ビジュアルアピールIV', 20), mk('c00202', 'ビジュアルアピールIV＋', 40), mk('c00303', '間違いそうだ', 30)];
  const board = { _skillPanelsLayer: { children: panels.map(p => ({ normalSkillPanel: p })) }, _produceIdol: {} };
  assert.deepEqual(W.bestAttackPanels(board).map(p => p.skillPoint), [40, 30, 20]);
});
test('A concert week starts the live directly instead of leaving the confirm dialog open', async () => {
  const { root, add, r } = sceneFixture();
  const store = { ...state(), isConcertWeek: true, weekType: 'semi' };
  store.userProduce = { id: 'run1', week: 33 };
  const main = add(root, { interactiveChildren: true });
  root._mainLayer = main; root._store = store;
  main._actionLayer = add(main, { interactive: true });
  let entered = 0, gate = 0;
  main._onGoToConcert = () => { entered++; r.stop(); };
  main._topLayer = add(main, {});
  main._topLayer._produceButton = add(main._topLayer, { interactive: true, listeners: () => [() => {}], emit: () => { gate++; } });
  r.options.untilEnd = true; r.skillSeen.add('run1:33');
  await assert.rejects(r.run(), /已停止/);
  assert.equal(entered, 1);
  assert.equal(gate, 0);
});
test('A concert confirm dialog is accepted through its last button when the texture is unknown', async () => {
  const { root, add, r } = sceneFixture();
  const dialog = add(root, {});
  dialog._overlay = add(dialog, {});
  dialog._base = add(dialog, {});
  const buttons = dialog._buttons = add(dialog, {});
  let cancel = 0, ok = 0;
  add(buttons, { interactive: true, listeners: () => [() => {}], texture: { textureCacheIds: ['cancel_button.png'] }, emit: () => { cancel++; } });
  add(buttons, { interactive: true, listeners: () => [() => {}], texture: { textureCacheIds: [] }, emit: () => { ok++; } });
  r.pendingPopup = { kind: 'WING参赛', root };
  assert.equal(await r.popup(root), true);
  assert.equal(ok, 1); assert.equal(cancel, 0);
  assert.equal(r.pendingPopup, null);
});
test('Snapshot carries the 心情 level so dialogue choices can read it', () => {
  const s = state(); s.userProduceIdol.tensionLevel = 4;
  assert.equal(W.snapshot(s, 'vi').tension, 4);
});
test('Dialogue choice prefers 思い出 and 心情 hints while the mood is low', () => {
  const e = { answers: [{ id: '1' }, { id: '2' }], produceEventParams: [{ selectNum: 1, visual: 8 }, { selectNum: 2, tension: 2, memoryPoint: 5 }] };
  assert.equal(W.chooseAnswer(e, 'vi', ['1', '2'], 2), '2');
  const full = { answers: [{ id: '1' }, { id: '2' }], produceEventParams: [{ selectNum: 1, visual: 10 }, { selectNum: 2, tension: 5 }] };
  assert.equal(W.chooseAnswer(full, 'vi', ['1', '2'], 5), '1');
  const mem = { answers: [{ id: '1' }, { id: '2' }], produceEventParams: [{ selectNum: 1, visual: 30 }, { selectNum: 2, memoryPoint: 10 }] };
  assert.equal(W.chooseAnswer(mem, 'vi', ['1', '2'], 5), '2');
});
test('Answer hints describe what the runner is buying', () => {
  assert.equal(W.answerScore({ memoryPoint: 10 }, 'vi', 1), 80);
  assert.equal(W.answerScore({ tension: 2 }, 'vi', 5), 2);
  assert.equal(W.answerScore(null, 'vi', 1), null);
  assert.equal(W.describeAnswer({ memoryPoint: 5, tension: 1, visual: 3 }), '思い出+5／心情+1／Vi+3');
});
test('A missing live scene retries the concert entry instead of idling', async () => {
  const { root, add, r } = sceneFixture();
  const logs = []; r.env.log = s => logs.push(s);
  const store = { ...state(), isConcertWeek: true, weekType: 'semi' };
  store.userProduce = { id: 'run1', week: 33 };
  const main = add(root, { interactiveChildren: true });
  root._mainLayer = main; root._store = store;
  main._actionLayer = add(main, { interactive: true });
  main._topLayer = add(main, {});
  let entered = 0;
  main._onGoToConcert = () => { entered++; if (entered >= 2) r.stop(); };
  r.options.untilEnd = true; r.skillSeen.add('run1:33');
  r.journal = { pending: { week: 33, action: 'semi_battle' }, verified: [] };
  r.activeCommitWeek = 33; r.latest = W.snapshot(store, 'vi');
  r.committedAt = Date.now() - 10000; r.enteredAt = Date.now() - 10000; r.entryRetries = 0;
  await assert.rejects(r.run(), /已停止/);
  assert.equal(entered, 2);
  assert.ok(logs.some(x => /重试进入/.test(x)));
});
test('A live scene that never appears stops with a diagnostic instead of waiting', async () => {
  const { root, add, r } = sceneFixture();
  const store = { ...state(), isConcertWeek: true, weekType: 'final' };
  store.userProduce = { id: 'run1', week: 33 };
  const main = add(root, { interactiveChildren: true });
  root._mainLayer = main; root._store = store;
  main._actionLayer = add(main, { interactive: true });
  main._onGoToConcert = () => {};
  r.options.untilEnd = true; r.skillSeen.add('run1:33');
  r.journal = { pending: { week: 33, action: 'final_battle' }, verified: [] };
  r.activeCommitWeek = 33; r.latest = W.snapshot(store, 'vi');
  r.committedAt = Date.now() - 50000; r.enteredAt = 0; r.entryRetries = 3;
  await assert.rejects(r.run(), /演出场景/);
});
test('A stop records who asked for it', async () => {
  const { r } = sceneFixture();
  r.stop('页面隐藏');
  assert.throws(() => r.check(), /已停止（页面隐藏）/);
  const { r: r2 } = sceneFixture();
  r2.stop();
  assert.throws(() => r2.check(), /已停止（手动）/);
});
test('Talk replaces the S2 audition only when its previewed fans close the gap', () => {
  assert.equal(W.talkCoversFan(800, 9500), true);
  assert.equal(W.talkCoversFan(400, 9500), false);
  assert.equal(W.talkCoversFan(undefined, 9500), false);
  assert.equal(W.talkCoversFan(0, 10000), true);
});
test('The S2 last week keeps Talk when the preview closes the fan gap', async () => {
  const { root, r } = sceneFixture();
  const places = [{ producePlaceCategoryId: '5', fan: 800 }];
  const layer = { _selectedPlaceCategory: '5', interactiveChildren: true };
  r.actionLayer = async () => layer;
  const logs = []; r.log = m => logs.push(m);
  const plan = await r.s2LastWeekPlan(root, {}, { places }, { fans: 9500, week: 16, season: 2, left: 1 });
  assert.equal(plan, 'talk');
  assert.ok(logs.some(m => /可补足 500，本周保持 Talk/.test(m)));
});
test('The S2 last week falls back to the audition when Talk cannot reach 10000', async () => {
  const { root, r } = sceneFixture();
  const places = [{ producePlaceCategoryId: '5', fan: 300 }];
  const layer = { _selectedPlaceCategory: '5', interactiveChildren: true };
  r.actionLayer = async () => layer;
  const logs = []; r.log = m => logs.push(m);
  const plan = await r.s2LastWeekPlan(root, {}, { places }, { fans: 9500, week: 16, season: 2, left: 1 });
  assert.equal(plan, 'audition');
  assert.ok(logs.some(m => /改打 1 万粉丝试镜/.test(m)));
});
test('The talk preview reads the expected fan gain of the selected place', async () => {
  const { root, r } = sceneFixture();
  const places = [{ producePlaceCategoryId: '5', fan: 640, growthPoint: { visualGrowthPoint: 30 } }];
  const layer = { _selectedPlaceCategory: '9', interactiveChildren: true };
  r.actionLayer = async () => layer;
  let selected = null;
  r.call = (_root, _owner, method, args) => { assert.equal(method, 'selectPlace'); selected = args[0]; layer._selectedPlaceCategory = selected; };
  const talk = await r.talkFanPreview(root, {}, { places }, 'work_talk');
  assert.equal(selected, W.PLACE.work_talk);
  assert.equal(talk.fan, 640);
  assert.equal(talk.growth.visualGrowthPoint, 30);
});
test('S4 auditions while the main attribute is in the trend top two',()=>{
 const w={...W.snapshot(state(),'vi'),season:4,left:4,fans:100000};
 assert.equal(W.decide({...w,trendRank:1}),'audition_100000');
 assert.equal(W.decide({...w,trendRank:2}),'audition_100000');
 assert.equal(W.decide({...w,fans:400000,trendRank:3,left:3}),'work_talk');
 assert.equal(W.decide({...w,fans:400000,trendRank:3,left:1}),'audition_100000');
});
test('Support card skills are learned before the produce card ones',()=>{
 const { root, add } = sceneFixture();
 const mk=(id,name,category='active',cost=20)=>({id,skillCategory:category,skillPoint:cost,isAcquired:false,isArrival:true,isLocked:false,skill:{id:'s'+id,name}});
 const pAtk=mk('p1','Visual5倍Appeal'), sAtk=mk('s1','Visual3倍Appeal');
 const pBoost=mk('p2','Visual130％UP','passive'), sBoost=mk('s2','Visual60％UP','passive');
 const layer=add(root,{});
 for(const panel of [pAtk,sAtk,pBoost,sBoost]) add(layer,{normalSkillPanel:panel});
 layer._allSkillPanels={'11':{257:{normalSkillPanel:pAtk},513:{normalSkillPanel:pBoost}},
                        '22':{257:{normalSkillPanel:sAtk},513:{normalSkillPanel:sBoost}}};
 const board={_skillPanelsLayer:layer,_produceIdol:{characterId:'11',visual:10,limitVisual:1000,activeSkills:[]}};
 assert.equal(W.produceTreeOf(board),'11');
 const q=W.skillPurchaseQueue(board,null,{capOnly:false,wantedAttrs:['visual']});
 assert.deepEqual(q.map(x=>x.panelId),['s1','p1','s2','p2']);
 const flip={...board,_produceIdol:{...board._produceIdol,characterId:'22'}};
 const q2=W.skillPurchaseQueue(flip,null,{capOnly:false,wantedAttrs:['visual']});
 assert.deepEqual(q2.map(x=>x.panelId),['p1','s1','p2','s2']);
});
test('A work week never tries to enter the concert while it advances', async () => {
  const { root, add, r } = sceneFixture();
  const logs = []; r.log = s => logs.push(s);
  const store = { ...state(), isConcertWeek: false, weekType: 'produce' };
  store.userProduce = { id: 'run1', week: 10 };
  const main = add(root, { interactiveChildren: true });
  root._mainLayer = main; root._store = store;
  main._actionLayer = add(main, { interactive: true });
  main._topLayer = add(main, {});
  let entered = 0, ticks = 0;
  main._onGoToConcert = () => { entered++; };
  r.env.sleep = async () => { if (++ticks > 4) r.stop(); };
  r.journal = { pending: { week: 10, action: 'lesson_vi' }, verified: [] };
  r.activeCommitWeek = 10; r.latest = W.snapshot(store, 'vi');
  r.committedAt = Date.now() - 10000;
  await assert.rejects(r.run(), /已停止/);
  assert.equal(entered, 0);
  assert.ok(!logs.some(x => /重试进入/.test(x)));
});
test('A hidden page pauses input instead of ending the run', () => {
  const { r } = sceneFixture();
  r.env.hidden = () => true;
  assert.throws(() => r.check(), /已暂停（页面隐藏）/);
  assert.equal(r.paused, true);
  r.env.hidden = () => false;
  r.resume();
  assert.equal(r.paused, false);
  r.check();
});
test('The ending scene reports a finished produce and stops without re-entering', async () => {
  const { root, add, r } = sceneFixture();
  const logs = []; r.log = m => logs.push(m);
  let done = '';
  r.env.done = text => { done = text; };
  const endingLayer = add(root, {});
  root._endingLayer = endingLayer;
  r.latest = { week: 34, fans: 526853 };
  assert.equal(r.ending(root), true);
  assert.equal(r.ending({}), false);
  await r.run();
  assert.equal(r.stopped, true);
  assert.equal(r.stopReason, '培育完成');
  assert.ok(logs.some(m => /培育完成：本轮 WING 已结束（第 34 周｜526853 粉丝）；已停止/.test(m)));
  assert.equal(done, '培育完成：本轮 WING 已结束（第 34 周｜526853 粉丝）');
});
test('The audition performance is waited out instead of being called unknown', async () => {
  const { root, r } = sceneFixture();
  const logs = []; r.log = m => logs.push(m);
  root._auditionId = 1234;
  let ticks = 0;
  r.env.sleep = async () => { if (++ticks > 12) r.stop(); };
  await assert.rejects(r.run(), /已停止/);
  assert.ok(!logs.some(m => /尚未适配/.test(m)));
  assert.equal(r.auditionScene({ _auditionId: 1 }), true);
  assert.equal(r.auditionScene({ _mvLayer: {}, _appealPhaseLayer: {} }), true);
  assert.equal(r.auditionScene({}), false);
});
test('The client error dialog stops the run and keeps the inquiry id', async () => {
  const { root, add, r } = sceneFixture();
  root._store = { produceType: 'wing' };
  const dialog = add(root, {});
  dialog._overlay = add(dialog, { visible: true });
  const base = add(dialog, { visible: true }); dialog._base = base;
  dialog._buttons = add(dialog, {});
  add(base, { text: 'エラーが発生しました。お問い合わせID: dbnv4v9osamc71192ic0 エラーコード: 9000' });
  add(dialog._buttons, { interactive: true, listeners: () => [() => {}] });
  r.pendingPopup = { kind: 'WING参赛', root };
  await assert.rejects(r.popup(root), /游戏报错弹窗（ID dbnv4v9osamc71192ic0）/);
});
test('A concert entry is refused on a work week', async () => {
  const { root, add, r } = sceneFixture();
  const main = add(root, { interactiveChildren: true });
  let entered = 0; main._onGoToConcert = () => { entered++; };
  await assert.rejects(r.enterConcert(root, main, { concert: false }), /不能进入本战/);
  assert.equal(entered, 0);
});
test('A board attack replaces the weakest equipped attack', () => {
  const board = { _produceIdol: { activeSkills: [{ id: 'a', name: 'Visual5倍Appeal' }, { id: 'b', name: 'Dance2.5倍Appeal' }] } };
  assert.equal(W.chooseReplaceTarget(board, 'new').id, 'b');
  assert.throws(() => W.chooseReplaceTarget({ _produceIdol: { activeSkills: [] } }, 'new'), /没有可替换的主动技能/);
});

// --- v0.5.9 semi-final / final battle policy -------------------------------
function judgeNode(id, attribute, trendOrder, hp) { return { id, attribute, trendOrder, hp }; }
function cardNode(id, hits) { return { id, disabled: false, hits: hits.map(([judgeId, damage]) => ({ targetJudgeId: judgeId, damage })) }; }
function liveFixture(judges, cards) {
  const skills = new Map(cards.map(c => [c.id, { card: c, skill: { premeasuredDamages: c.hits } }]));
  return {
    _judgeList: { judges },
    _concertService: { turn: 0, findActiveSkill: id => (skills.get(id) || {}).skill || null, existsLiveAutoFunction: true, isLiveAutoUnlocked: true, checkFinishResult: () => ({ finished: false }) },
    _skillCardHand: { currentActiveSkills: cards.map(c => ({ skillId: c.id, idolId: 'i' })), getSkillCard: id => (skills.get(id) || {}).card || null },
    _autoButton: { isOn: false, interactive: true, resetOn(on) { this.isOn = !!on; } },
    _speedChanger: { speed: 3 },
    _getSkillCardForLiveAuto() { return cards[0]; },
    _getJudgeForLiveAuto() { return judges[0]; },
  };
}
test('Battle plan spends a finishing blow on the trend-first judge before anything else', () => {
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 100), judgeNode('j2', 'visual', 2, 9000)],
    [cardNode('a', [['j1', 120]]), cardNode('b', [['j2', 5000]])]);
  const plan = W.planBattleTurn(live, 'visual');
  assert.equal(plan.judge.id, 'j1'); assert.equal(plan.reason, '流行1最后一击'); assert.equal(plan.card.id, 'a');
});
test('Battle plan keeps a finish for the main attribute judge when trend 1 cannot be finished', () => {
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 5000), judgeNode('j2', 'visual', 2, 400)],
    [cardNode('a', [['j1', 200]]), cardNode('b', [['j2', 500]])]);
  const plan = W.planBattleTurn(live, 'visual');
  assert.equal(plan.judge.id, 'j2'); assert.equal(plan.reason, '主属性最后一击'); assert.equal(plan.card.id, 'b');
});
test('Battle plan without a finish hits trend 1 with the strongest card and ignores dead judges', () => {
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 5000), judgeNode('j2', 'visual', 2, 0), judgeNode('j3', 'dance', 3, 5000)],
    [cardNode('a', [['j1', 200], ['j3', 999]]), cardNode('b', [['j1', 900], ['j2', 999]])]);
  let plan = W.planBattleTurn(live, 'visual');
  assert.equal(plan.judge.id, 'j1'); assert.equal(plan.card.id, 'b'); assert.equal(plan.reason, '流行1审阅员');
  const deadOnly = liveFixture([judgeNode('j1', 'vocal', 1, 0), judgeNode('j3', 'dance', 3, 60)],
    [cardNode('a', [['j3', 999]]), cardNode('b', [['j3', 40]])]);
  plan = W.planBattleTurn(deadOnly, 'visual');
  assert.equal(plan.judge.id, 'j3'); assert.equal(plan.reason, '其他审阅员最后一击'); assert.equal(plan.card.id, 'a');
});
test('Battle plan stops with a diagnostic instead of blind tapping when the UI shape changed', () => {
  assert.throws(() => W.planBattleTurn({ _judgeList: {} }, 'visual'), /判定条结构变化/);
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 100)], [cardNode('a', [['j1', 50]])]);
  live._skillCardHand.currentActiveSkills = undefined;
  assert.throws(() => W.planBattleTurn(live, 'visual'), /技能卡结构变化/);
});
test('Injected policy answers the client with the planned card and target, and logs the reason', () => {
  const logs = [];
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 100), judgeNode('j2', 'visual', 2, 9000)],
    [cardNode('a', [['j1', 120]]), cardNode('b', [['j2', 5000]])]);
  const r = new W.Runner({ hidden: () => false, log: line => logs.push(line), load: () => null, save: () => {} }, { attr: 'vi' });
  assert.equal(r.installBattlePolicy(live), true);
  assert.equal(live._getSkillCardForLiveAuto().id, 'a');
  assert.equal(live._getJudgeForLiveAuto().id, 'j1');
  assert.equal(r.installBattlePolicy(live), false);
  assert.ok(logs.some(l => l.includes('本战策略：主攻流1')), logs.join('\n'));
  assert.ok(logs.some(l => l.includes('本战第1回合：流行1最后一击')), logs.join('\n'));
});
test('Battle turns AUTO on, speeds the show up, and never demands a manual final', async () => {
  const { root, add, r } = sceneFixture();
  let taps = 0;
  const cards = [cardNode('a', [['j1', 120]])];
  const live = liveFixture([judgeNode('j1', 'vocal', 1, 100)], cards);
  Object.assign(live, { _speedButton: null });
  const node = add(root, live);
  node._autoButton = add(node, { isOn: false, interactive: true, listeners: () => [() => {}], emit: () => { taps++; node._autoButton.isOn = true; } });
  r.latest = { runId: 'r', week: 5, weekType: 'final', trendFirst: 'vocal' };
  assert.equal(await r.battle(root), true);
  assert.equal(taps, 1); assert.equal(node._autoButton.isOn, true);
  node._autoButton.isOn = false;
  node._concertService.isLiveAutoUnlocked = false;
  await assert.rejects(r.battle(root), /AUTO尚未解锁/);
  node._concertService.existsLiveAutoFunction = false;
  await assert.rejects(r.battle(root), /不支持AUTO/);
});
