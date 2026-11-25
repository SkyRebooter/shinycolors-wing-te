function startSuite(win, wing, daily) {
  if (win.location.hostname !== 'shinycolors.enza.fun' || win.top !== win.self) return;
  let engine;
  wing.captureEngine(win, value => { engine = value; });
  const getEngine = () => {
    if (!engine?.sceneManager?.currentScene) {
      try { engine = wing.recoverEngine(win) || engine; }
      catch (_) { /* Wait for an understood client runtime. */ }
    }
    return engine;
  };

  function mount() {
    if (!win.document.body) {
      win.setTimeout(mount, 50);
      return;
    }
    if (win.document.getElementById('sc-suite-helper')) return;
    const host = win.document.createElement('aside');
    host.id = 'sc-suite-helper';
    host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      details{background:#f6f8fa;color:#253444;border:1px solid #abbcc9;border-radius:10px;
      width:min(350px,calc(100vw - 16px));font:13px/1.5 system-ui;box-shadow:0 3px 14px #0003}
      summary{cursor:pointer;font-weight:700;padding:9px 12px}
      section{display:grid;gap:6px;padding:0 6px 6px;max-height:calc(100dvh - 65px);overflow:auto}
      p{margin:4px 6px}
    </style><details><summary>ShinyColors 助手 v${wing.VERSION}</summary><section>
      <p id="notice" hidden>检测到旧版独立脚本。停用旧版后刷新游戏，即可使用合并面板。</p>
      <slot name="daily"></slot><slot name="wing"></slot>
    </section></details>`;
    const panels = [
      ['daily', 'sc-daily-helper', daily],
      ['wing', 'sc-wing-helper', wing]
    ];
    for (const [slotName, id, feature] of panels) {
      if (win.document.getElementById(id)) {
        shadow.getElementById('notice').hidden = false;
        continue;
      }
      const panel = win.document.createElement('div');
      panel.id = id;
      panel.slot = slotName;
      host.appendChild(panel);
      try { feature.boot(win, panel, getEngine); }
      catch (error) {
        const notice = shadow.getElementById('notice');
        notice.hidden = false;
        notice.textContent = `面板加载失败：${error.message}`;
      }
    }
    win.document.body.appendChild(host);
  }
  mount();
}
