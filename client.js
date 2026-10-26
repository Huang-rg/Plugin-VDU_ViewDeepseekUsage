/**
 * DeepSeek 用量 · 全局浏览器面板（客户端半）
 *
 * 按钮在**窗口左上角的标题栏那一行**：`应用`、`编辑` 的右边（平级）。
 * 那一行是外壳的窗户铬（Chromium 画的标题栏 + 侧边栏收起按钮），没有插槽可注册，
 * 所以按钮就渲染在 `shell.overlay`（root 作用域、覆盖整帧的浮层）里，用绝对定位
 * 摆到菜单项后面：`top` 按 `--dsh-windows-titlebar-height` 垂直居中，`left` 落在
 * `编辑` 右边缘之后（`--dub-caption-left`，默认 152px）。它不是会话里的控件，
 * 所以切会话、开新会话都不会消失。
 * 非 Windows 标题栏环境（纯 Web / macOS）没有这一行可放，按钮改落到
 * `conversation.header.leading`（会话标题之前的全局导航位，root 作用域，常驻）。
 *
 * 面板同样在 `shell.overlay` 里：模态遮罩 + 居中 16:9 窗口（每次打开都回到 1200×675，
 * 不继承上次拉过的尺寸），拖标题栏移动、八向拖拽拉伸、最大化 / 还原，
 * 点遮罩、点窗口外任意处、按 Esc 都关闭，Ctrl+R 刷新页面。
 * 它是 root 作用域的，所以切换会话不会卸载它（只是模态期间点不到侧边栏，要先关掉）。
 *
 * 页面怎么装进来：`https://platform.deepseek.com/usage` 带
 * `content-security-policy: frame-ancestors 'none'`，iframe 一定会被浏览器拒绝，
 * 所以桌面端走宿主自己的浏览器通道 —— `globalThis.dshDesktop.browser`
 * （protocolVersion 1）拿到一次性 guest lease，自己建 `<webview>`，
 * 和右侧栏「浏览器」用的是同一套主进程审批与隔离策略。
 * 存储分区键沿用右侧栏浏览器的算法（`cwd:<工作区路径>`，没有工作区就 `session:<id>`），
 * 于是这里和右侧栏浏览器共用同一份登录态——不用再登一次。
 * 非桌面环境（纯 Web）没有 <webview> 可建，面板给出说明和「在系统浏览器中打开」。
 *
 * React 由浏览器模块表提供，除 `react` 之外不 require 任何包；不读别的插件的 DOM。
 */

window.__ModuleLoader__.load({
  id: 'dsh-usage-browser',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** 本插件的 locale 命名空间。 */
    const NS = 'usage-browser';
    /** CSS 标签标识，避免重复注入。 */
    const CSS_TAG_ID = 'dsh-usage-browser/panel.css';
    /** 唯一要访问的地址。 */
    const USAGE_URL = 'https://platform.deepseek.com/usage';
    /** 拿不到会话工作区时的存储分区键（同一进程内仍然稳定）。 */
    const FALLBACK_WORKSPACE = 'usage-browser:global';
    /** 面板最小尺寸（再小就看不清页面了）。 */
    const MIN_WIDTH = 480;
    const MIN_HEIGHT = 270;
    /** 与窗口边缘的最小留白。 */
    const EDGE_GAP = 8;

    const zh = {
      'button.label': '用量',
      'button.title': 'DeepSeek 用量（点击打开全局面板）',
      'panel.label': 'DeepSeek 用量',
      'panel.title': 'DeepSeek 用量',
      'panel.loading': '正在打开用量页面…',
      'panel.failed': '页面加载失败，可以刷新重试，或改在系统浏览器中打开。',
      'panel.failedDetail': '加载失败：{detail}',
      'tool.reload': '刷新（Ctrl+R）',
      'tool.external': '在系统浏览器中打开',
      'tool.expand': '最大化',
      'tool.restore': '还原大小',
      'tool.close': '关闭面板',
      'drag.title': '拖动标题栏移动窗口',
      'resize.n': '调整高度（上边）',
      'resize.s': '调整高度（下边）',
      'resize.e': '调整宽度（右边）',
      'resize.w': '调整宽度（左边）',
      'foot.url': 'platform.deepseek.com/usage',
      'foot.hint': '拖标题栏移动 · 拖边缘拉伸 · 点空白处关闭',
      'fallback.title': '这个页面不能嵌在应用里打开',
      'fallback.note': '站点声明了 frame-ancestors: none，任何嵌入窗口都会被拒绝。桌面端会用原生页面打开同一地址；当前环境请改用系统浏览器。',
      'fallback.open': '在系统浏览器中打开',
      'shortcut.label': '用户自创 · 用量面板',
    };

    const en = {
      'button.label': 'Usage',
      'button.title': 'DeepSeek usage (opens a global panel)',
      'panel.label': 'DeepSeek usage',
      'panel.title': 'DeepSeek usage',
      'panel.loading': 'Opening the usage page…',
      'panel.failed': 'The page failed to load. Reload it, or open it in your system browser.',
      'panel.failedDetail': 'Load failed: {detail}',
      'tool.reload': 'Reload (Ctrl+R)',
      'tool.external': 'Open in system browser',
      'tool.expand': 'Maximize',
      'tool.restore': 'Restore size',
      'tool.close': 'Close panel',
      'drag.title': 'Drag the title bar to move the window',
      'resize.n': 'Resize height (top)',
      'resize.s': 'Resize height (bottom)',
      'resize.e': 'Resize width (right)',
      'resize.w': 'Resize width (left)',
      'foot.url': 'platform.deepseek.com/usage',
      'foot.hint': 'Drag the title bar to move · drag an edge to resize · click outside to close',
      'fallback.title': 'This page cannot open inside the app',
      'fallback.note': 'The site declares frame-ancestors: none, so every embedded frame is refused. Desktop opens the same address natively; here, use your system browser.',
      'fallback.open': 'Open in system browser',
      'shortcut.label': 'Custom · Usage panel',
    };

    /* ==================================================================== */
    /* 样式                                                                  */
    /* ==================================================================== */

    /**
     * 纪律沿用第一版：
     * 1. 面与文字只用主题 token（`cordis_inspect_query` Theme 列出的那批），token 带字面兜底。
     * 2. 浮层根节点自己关掉命中测试 —— `shell.overlay` 给每个直接子元素加了
     *    `pointer-events: auto`，不关就等于铺一块隐形玻璃挡住整个应用；
     *    用 `.dub-layer.dub-layer` 提高特异性，不跟宿主规则比文档顺序。
     * 3. 标题栏那颗按钮用 `-webkit-app-region: no-drag`，否则点下去只是拖窗口。
     * 4. 遮罩用固定的黑色薄纱：深浅两套主题下都是"压暗"，比混 label-primary 稳。
     */
    const CSS = [
      '.dub-layer.dub-layer{position:absolute;inset:0;pointer-events:none;box-sizing:border-box}',
      '.dub-backdrop{position:absolute;inset:0;z-index:0;pointer-events:auto;background:rgba(8,9,12,.34)}',
      '.dub-panel{position:absolute;z-index:1;pointer-events:auto;box-sizing:border-box;display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden;background-color:var(--dsw-alias-bg-layer-1,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:12px;box-shadow:0 2px 10px rgba(0,0,0,.12),0 28px 72px rgba(0,0,0,.28);-webkit-app-region:no-drag}',
      /* 八向拖拽把手：四边 + 四角，几何由脚本按当前面板矩形算，这里只管光标与层级。 */
      '.dub-resize{position:absolute;z-index:2;touch-action:none;pointer-events:auto}',
      '.dub-resize[data-edge="n"],.dub-resize[data-edge="s"]{cursor:ns-resize}',
      '.dub-resize[data-edge="e"],.dub-resize[data-edge="w"]{cursor:ew-resize}',
      '.dub-resize[data-edge="ne"],.dub-resize[data-edge="sw"]{cursor:nesw-resize}',
      '.dub-resize[data-edge="nw"],.dub-resize[data-edge="se"]{cursor:nwse-resize}',
      '.dub-head{flex:none;display:flex;align-items:center;gap:8px;padding:6px 8px 6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none}',
      '.dub-head:active{cursor:grabbing}',
      '.dub-mark{flex:none;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;background-color:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}',
      '.dub-title{flex:1 1 auto;min-width:0;font-size:12.5px;font-weight:600;line-height:18px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dub-tools{flex:none;display:inline-flex;align-items:center;gap:2px}',
      '.dub-tool{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;border:0;border-radius:6px;background-color:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}',
      '.dub-tool:hover{color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05))}',
      '.dub-tool:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}',
      '.dub-body{position:relative;flex:1 1 auto;min-height:0;display:flex;flex-direction:column;background-color:var(--dsw-alias-bg-base,#fff)}',
      '.dub-viewport{position:relative;flex:1 1 auto;min-width:0;min-height:0;display:flex}',
      '.dub-webview{flex:1 1 auto;width:100%;height:100%;min-width:0;min-height:0;border:0;display:flex;-webkit-app-region:no-drag}',
      '.dub-loading{flex:none;padding:5px 10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dub-status{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:24px;text-align:center;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);background-color:var(--dsw-alias-bg-base,#fff)}',
      '.dub-status-text{max-width:420px}',
      '.dub-error{color:var(--dsw-alias-state-error-primary)}',
      '.dub-primary{font:inherit;font-size:12px;font-weight:600;line-height:18px;padding:6px 12px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:8px;background-color:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary);cursor:pointer}',
      '.dub-primary:hover{background-color:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05))}',
      '.dub-primary:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}',
      '.dub-fallback{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px;text-align:center}',
      '.dub-fallback-title{margin:0;font-size:13px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary)}',
      '.dub-fallback-note{margin:0;max-width:420px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-secondary)}',
      '.dub-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:4px 10px;border-top:1px solid var(--dsw-alias-border-l1,rgba(0,0,0,.08));font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dub-foot-url{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dub-foot-hint{flex:none;white-space:nowrap}',
      /* 标题栏那颗按钮：和「应用/编辑」同一行、在它们右边，垂直居中于标题栏高度。 */
      '.dub-launch{flex:none;display:inline-flex;align-items:center;gap:4px;align-self:center;height:24px;padding:0 7px;border:.5px solid var(--dsw-alias-border-l2,rgba(0,0,0,.14));border-radius:var(--dsw-radius-sm,6px);background-color:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer;-webkit-app-region:no-drag}',
      '.dub-launch:hover{background-color:var(--dsw-alias-bg-layer-2,rgba(0,0,0,.05))}',
      '.dub-launch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4d6bfe);outline-offset:1px}',
      '.dub-launch[data-active="true"]{border-color:var(--dsw-alias-brand-primary,#4d6bfe);color:var(--dsw-alias-brand-primary,#4d6bfe);background-color:transparent}',
      '.dub-launch[data-dock="caption"]{position:absolute;z-index:3;pointer-events:auto;margin:0;top:calc((var(--dsh-windows-titlebar-height,40px) - 24px) / 2);left:var(--dub-caption-left,152px)}',
      /* 左侧栏收起时，标题栏那一行会多出「打开侧边栏 + 新建会话」两个图标按钮，
         菜单整体右移 36px（实测：应用 48→84、编辑 98→134）。跟着挪同样的距离，
         两种状态下都留 6px 间隙，不会压到「编辑」。 */
      '[data-sidebar-collapsed] .dub-launch[data-dock="caption"]{left:var(--dub-caption-left-collapsed,188px)}',
      '.dub-launch-mark{display:inline-flex;align-items:center;justify-content:center;flex:none}',
      '@media (forced-colors:active){.dub-panel,.dub-launch,.dub-primary{border-color:CanvasText}.dub-mark,.dub-webview{forced-color-adjust:none}}',
    ].join('');

    /* ==================================================================== */
    /* 图标（自绘，跟随 currentColor）                                        */
    /* ==================================================================== */

    /** 三根柱子：用量 / 账户数据。 */
    function chartIcon(size) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M3.5 12.5V8.5M8 12.5V4M12.5 12.5V6.5', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' }),
        h('path', { d: 'M2.5 14h11', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round', opacity: 0.55 }),
      );
    }

    function reloadIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M13.2 2.6v3.1H10', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      );
    }

    function externalIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M9.5 3h3.5v3.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
        h('path', { d: 'M13 3 7.8 8.2', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
        h('path', { d: 'M12 9.6V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V5.5A1.5 1.5 0 0 1 4 4h2.4', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      );
    }

    function expandIcon(expanded) {
      const d = expanded
        ? 'M6 10 3 13M3 10v3h3M10 6l3-3M13 6V3h-3'
        : 'M6.5 3v3.5H3M9.5 13v-3.5H13M13 9.5 9.5 13M3 6.5 6.5 3';
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d, stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      );
    }

    function closeIcon() {
      return h(
        'svg',
        { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': true },
        h('path', { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
      );
    }

    /* ==================================================================== */
    /* 面板开关与尺寸（模块级小 store，按钮与浮窗共用）                        */
    /* ==================================================================== */

    /**
     * `useSyncExternalStore` 按引用比较：每次变化换一个新对象，没变化时永远同一个引用。
     * `rect` 在第一次打开时按 16:9 居中算出来，之后记住用户拉过的尺寸。
     */
    let snapshot = { open: false, workspace: FALLBACK_WORKSPACE, revision: 0, rect: null, savedRect: null, maximized: false };
    const listeners = new Set();

    function publish(next) {
      snapshot = next;
      for (const listener of [...listeners]) {
        try {
          listener();
        } catch (error) {
          console.error('usage-browser: listener failed', error);
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }

    function getSnapshot() {
      return snapshot;
    }

    /* ---------- 尺寸计算 ---------- */

    function viewport() {
      return {
        width: typeof window === 'undefined' ? 1280 : window.innerWidth,
        height: typeof window === 'undefined' ? 800 : window.innerHeight,
      };
    }

    /**
     * 窗口自绘标题栏的高度（Windows）。最大化面板要避开它：
     * 那一行右上角是系统的「最小化 / 还原 / 关闭」，面板自己的工具栏正好落在同一个位置，
     * 压上去以后点「最大化/还原」会点到系统按钮，把整个窗口还原掉。
     */
    function captionHeight() {
      if (typeof document === 'undefined') return 0;
      const raw = getComputedStyle(document.documentElement).getPropertyValue('--dsh-windows-titlebar-height');
      const value = Number.parseFloat(raw);
      return Number.isFinite(value) && value > 0 ? value : 0;
    }

    /** 16:9、约 1200×675、居中；窗口放不下就按高度反推宽度。 */
    function defaultRect() {
      const view = viewport();
      const maxWidth = Math.max(MIN_WIDTH, view.width - EDGE_GAP * 2);
      const maxHeight = Math.max(MIN_HEIGHT, view.height - EDGE_GAP * 2);
      let width = Math.min(1200, maxWidth);
      let height = Math.round((width * 9) / 16);
      if (height > maxHeight) {
        height = maxHeight;
        width = Math.round((height * 16) / 9);
      }
      width = Math.max(MIN_WIDTH, Math.min(width, maxWidth));
      height = Math.max(MIN_HEIGHT, Math.min(height, maxHeight));
      return {
        x: Math.round((view.width - width) / 2),
        y: Math.round((view.height - height) / 2),
        width,
        height,
      };
    }

    /** 任何尺寸都要留在窗口里，且不小于最小尺寸。 */
    function clampRect(rect) {
      const view = viewport();
      const maxWidth = Math.max(MIN_WIDTH, view.width - EDGE_GAP * 2);
      const maxHeight = Math.max(MIN_HEIGHT, view.height - EDGE_GAP * 2);
      const width = Math.max(MIN_WIDTH, Math.min(rect.width, maxWidth));
      const height = Math.max(MIN_HEIGHT, Math.min(rect.height, maxHeight));
      const x = Math.max(EDGE_GAP, Math.min(rect.x, view.width - width - EDGE_GAP));
      const y = Math.max(EDGE_GAP, Math.min(rect.y, view.height - height - EDGE_GAP));
      return { x, y, width, height };
    }

    /** 每次打开都从 16:9 的原始比例开始，不继承上一次拉过的尺寸。 */
    function openPanel(workspace) {
      publish({
        ...snapshot,
        open: true,
        workspace: workspace || snapshot.workspace,
        rect: defaultRect(),
        savedRect: null,
        maximized: false,
      });
    }

    function closePanel() {
      if (snapshot.open !== true) return;
      publish({ ...snapshot, open: false });
    }

    function setRect(rect) {
      publish({ ...snapshot, rect: clampRect(rect), maximized: false });
    }

    /** 换一个 revision 让 guest 重建；cookie 在分区里，登录态不会丢。 */
    function reloadPanel() {
      if (snapshot.open !== true) return;
      publish({ ...snapshot, revision: snapshot.revision + 1 });
    }

    function toggleMaximize() {
      if (snapshot.open !== true) return;
      if (snapshot.maximized === true) {
        publish({ ...snapshot, maximized: false, rect: clampRect(snapshot.savedRect === null ? defaultRect() : snapshot.savedRect), savedRect: null });
        return;
      }
      const view = viewport();
      const top = captionHeight() + EDGE_GAP;
      publish({
        ...snapshot,
        maximized: true,
        savedRect: snapshot.rect,
        rect: {
          x: EDGE_GAP,
          y: top,
          width: Math.max(MIN_WIDTH, view.width - EDGE_GAP * 2),
          height: Math.max(MIN_HEIGHT, view.height - top - EDGE_GAP),
        },
      });
    }

    /* ==================================================================== */
    /* 平台判定                                                              */
    /* ==================================================================== */

    /**
     * Windows 桌面端：窗口有一条自绘标题栏（`data-windows-titlebar`），
     * 「应用」「编辑」两个菜单就在这一行 —— 按钮可以摆到它们右边。
     * 其它环境没有这一行，按钮落到会话标题前的全局导航位。
     */
    let captionModeCache;
    function captionMode() {
      if (captionModeCache === undefined) {
        captionModeCache = typeof document !== 'undefined' && document.documentElement.hasAttribute('data-windows-titlebar');
      }
      return captionModeCache;
    }

    /* ==================================================================== */
    /* 桌面浏览器通道                                                        */
    /* ==================================================================== */

    /** preload 暴露的产品接口；纯 Web 里不存在。 */
    function desktopBridge() {
      const carrier = globalThis.dshDesktop;
      if (carrier === undefined || carrier === null || carrier.protocolVersion !== 1) return undefined;
      const browser = carrier.browser;
      if (browser === undefined || browser === null || typeof browser.acquire !== 'function' || typeof browser.release !== 'function') return undefined;
      return browser;
    }

    /**
     * 存储分区键：和右侧栏「浏览器」用同一套算法（`cwd:<workdir>`，否则 `session:<id>`），
     * 这样先在这边登录过，再去右侧栏浏览器打开同一个站点时不用再登一次，反之亦然。
     */
    function workspaceKeyOf(sessionId, workspaces) {
      if (typeof sessionId !== 'string' || sessionId === '') return undefined;
      const items = workspaces !== undefined && workspaces !== null && Array.isArray(workspaces.items) ? workspaces.items : [];
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue;
        if (!Array.isArray(item.sessionIds) || !item.sessionIds.includes(sessionId)) continue;
        if (typeof item.path === 'string' && item.path !== '') return 'cwd:' + item.path;
      }
      return 'session:' + sessionId;
    }

    /**
     * 桌面端的键盘桥。**有些**构建里 Ctrl+R 会在主进程的 `before-input-event` 就被拦下
     * （对已绑定的按键 `preventDefault`），页面和 guest 都收不到 keydown；这时只能从
     * 这条桥拿：preload 把键事件转成 `{ kind: 'keyboard' | 'webview', frameName, code,
     * control, … }`。主框架里的按键是 `keyboard`，guest 里的是 `webview`（要求元素带
     * `data-sidebar-browser-frame` 且 `name` 与事件里的 frameName 一致）。
     *
     * 当前这个 profile 实测**没有**在主进程拦截（按键照常到页面），所以主路径是
     * 面板上的 DOM `keydown` 抓取 + guest 里注入的 `location.reload()`；这里作为
     * 换构建时的兜底，三条路互不冲突（主进程真拦了的话，DOM 那条自然收不到）。
     */
    function desktopKeyboard() {
      const carrier = globalThis.dshDesktop;
      if (carrier === undefined || carrier === null || carrier.protocolVersion !== 1) return undefined;
      const keyboard = carrier.keyboard;
      if (keyboard === undefined || keyboard === null || typeof keyboard.subscribe !== 'function') return undefined;
      return keyboard;
    }

    /** Ctrl+R（macOS 上是 Cmd+R），不带 Alt/Shift。 */
    function isReloadGesture(input) {
      if (input === null || typeof input !== 'object') return false;
      if (input.code !== 'KeyR' || input.alt === true || input.shift === true) return false;
      if (input.control !== true && input.meta !== true) return false;
      return input.repeat !== true;
    }

    /* ==================================================================== */
    /* 翻译                                                                  */
    /* ==================================================================== */

    /** 注册用的翻译函数兜底：props.t 拿不到时用 apply 里 bind 出来的那个。 */
    let boundTranslate = null;

    function translateOf(props) {
      if (props !== undefined && props !== null && typeof props.t === 'function') return props.t;
      if (typeof boundTranslate === 'function') return boundTranslate;
      return (key) => key;
    }

    /* ==================================================================== */
    /* 面板内的 guest                                                        */
    /* ==================================================================== */

    /**
     * 建一个只属于本面板的 `<webview>`。
     *
     * 主进程在 `will-attach-webview` 上只认三件事：lease 属于本窗口、`src` 是
     * `about:blank#<lease>`、`partition` 与 lease 里记的一致；三者对上才放行，
     * 之后由主进程把 nodeIntegration / sandbox / 权限策略全部改写成固定值。
     * 所以这里的建法必须和右侧栏浏览器一字不差。
     * 尺寸由 CSS 跟随容器，拉伸面板不会重建 guest。
     */
    function GuestView(props) {
      const viewportRef = React.useRef(null);
      const [status, setStatus] = React.useState('loading');
      const [detail, setDetail] = React.useState('');
      const report = React.useCallback((next, reason) => {
        setStatus(next);
        if (typeof reason === 'string' && reason !== '') setDetail(reason);
      }, []);
      const t = props.t;

      React.useEffect(() => {
        const host = viewportRef.current;
        const bridge = desktopBridge();
        if (host === null || bridge === undefined) {
          report('failed', '');
          return undefined;
        }
        let cancelled = false;
        let requested = false;
        let element = null;
        let lease = null;
        report('loading', '');

        // Ctrl+R：guest 有焦点时按键被主进程截走，只能从键盘桥拿回来。
        const keyboard = desktopKeyboard();
        const stopKeyboard = keyboard === undefined ? undefined : keyboard.subscribe((input) => {
          if (cancelled || lease === null) return;
          if (input === null || typeof input !== 'object' || input.kind !== 'webview' || input.frameName !== lease) return;
          if (!isReloadGesture(input)) return;
          reloadPanel();
        });

        const create = async () => {
          try {
            const reservation = await bridge.acquire(props.workspace);
            if (cancelled) {
              try {
                await bridge.release(reservation.lease);
              } catch (error) {
                console.error('usage-browser: lease release failed', error);
              }
              return;
            }
            lease = reservation.lease;
            const node = document.createElement('webview');
            node.className = 'dub-webview';
            node.setAttribute('name', reservation.lease);
            node.setAttribute('partition', reservation.partition);
            node.setAttribute('allowpopups', '');
            // 键盘桥只认带这个标记的 webview（和右侧栏浏览器同一个约定）。
            node.setAttribute('data-sidebar-browser-frame', 'webview');
            node.setAttribute('src', 'about:blank#' + reservation.lease);
            node.setAttribute('aria-label', USAGE_URL);
            node.addEventListener('dom-ready', () => {
              if (cancelled || requested) return;
              requested = true;
              Promise.resolve(node.loadURL(USAGE_URL)).catch((error) => {
                if (!cancelled) report('failed', String(error));
              });
            });
            node.addEventListener('did-finish-load', () => {
              if (cancelled) return;
              // about:blank#<lease> 也会触发一次 did-finish-load；只认真正的页面。
              let current = '';
              try {
                current = typeof node.getURL === 'function' ? node.getURL() : '';
              } catch (error) {
                current = '';
              }
              if (current === '' || current.startsWith('about:blank')) return;
              // 焦点落进页面以后，按键归 guest，外面的监听收不到；给页面自己装一个
              // 最小的 Ctrl+R → location.reload()。只这一个键，不碰页面其它行为。
              if (typeof node.executeJavaScript === 'function') {
                Promise.resolve(
                  node.executeJavaScript(
                    '(function(){if(window.__dshUsageReloadKey)return;window.__dshUsageReloadKey=true;' +
                      'window.addEventListener("keydown",function(event){' +
                      'var key=typeof event.key==="string"?event.key.toLowerCase():"";' +
                      'if(key!=="r"||event.altKey||event.shiftKey||!(event.ctrlKey||event.metaKey)||event.repeat)return;' +
                      'event.preventDefault();event.stopPropagation();location.reload();},true);})();',
                  ),
                ).catch((error) => {
                  console.error('usage-browser: reload shortcut injection failed', error);
                });
              }
              report('ready', '');
            });
            node.addEventListener('did-fail-load', (event) => {
              if (cancelled || event.isMainFrame !== true || event.errorCode === -3) return;
              report('failed', typeof event.errorDescription === 'string' ? event.errorDescription : '');
            });
            element = node;
            host.appendChild(node);
          } catch (error) {
            if (!cancelled) report('failed', String(error));
          }
        };

        create();

        return () => {
          cancelled = true;
          if (typeof stopKeyboard === 'function') stopKeyboard();
          if (element !== null) {
            element.remove();
            element = null;
          }
          if (lease !== null) {
            const releasing = lease;
            lease = null;
            Promise.resolve(bridge.release(releasing)).catch((error) => {
              console.error('usage-browser: lease release failed', error);
            });
          }
        };
      }, [props.workspace, props.revision, report]);

      return h(
        'div',
        { className: 'dub-body' },
        h('div', { className: 'dub-viewport', ref: viewportRef }),
        status === 'loading' ? h('div', { className: 'dub-loading' }, t('panel.loading')) : null,
        status === 'failed'
          ? h(
              'div',
              { className: 'dub-status' },
              h('span', { className: 'dub-status-text dub-error' }, t('panel.failed')),
              detail === '' ? null : h('span', { className: 'dub-status-text' }, t('panel.failedDetail', { detail })),
              h('button', { type: 'button', className: 'dub-primary', onClick: props.onRetry }, t('tool.reload')),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dub-primary',
                  onClick: () => {
                    window.open(USAGE_URL, '_blank', 'noopener,noreferrer');
                  },
                },
                t('tool.external'),
              ),
            )
          : null,
      );
    }

    /* ==================================================================== */
    /* 浮层里的面板                                                          */
    /* ==================================================================== */

    function toolButton(label, onClick, icon) {
      return h('button', { type: 'button', className: 'dub-tool', title: label, 'aria-label': label, onClick }, icon);
    }

    function WebFallback(props) {
      const t = props.t;
      return h(
        'div',
        { className: 'dub-fallback' },
        h('p', { className: 'dub-fallback-title' }, t('fallback.title')),
        h('p', { className: 'dub-fallback-note' }, t('fallback.note')),
        h(
          'button',
          {
            type: 'button',
            className: 'dub-primary',
            onClick: () => {
              window.open(USAGE_URL, '_blank', 'noopener,noreferrer');
            },
          },
          t('fallback.open'),
        ),
      );
    }

    /** 八向把手：`mode` 里的 n/s/e/w 决定哪条边跟手走。 */
    const RESIZE_MODES = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    /** 把手厚度 / 角落边长：跨在面板边线上，一半在里一半在外。 */
    const GRIP = 10;
    const CORNER = 16;

    function handleBox(mode, rect) {
      const half = GRIP / 2;
      const corner = CORNER / 2;
      const left = rect.x;
      const top = rect.y;
      const right = rect.x + rect.width;
      const bottom = rect.y + rect.height;
      if (mode === 'n') return { left: left + 12, top: top - half, width: Math.max(24, rect.width - 24), height: GRIP };
      if (mode === 's') return { left: left + 12, top: bottom - half, width: Math.max(24, rect.width - 24), height: GRIP };
      if (mode === 'w') return { left: left - half, top: top + 12, width: GRIP, height: Math.max(24, rect.height - 24) };
      if (mode === 'e') return { left: right - half, top: top + 12, width: GRIP, height: Math.max(24, rect.height - 24) };
      if (mode === 'nw') return { left: left - corner, top: top - corner, width: CORNER, height: CORNER };
      if (mode === 'ne') return { left: right - corner, top: top - corner, width: CORNER, height: CORNER };
      if (mode === 'sw') return { left: left - corner, top: bottom - corner, width: CORNER, height: CORNER };
      return { left: right - corner, top: bottom - corner, width: CORNER, height: CORNER };
    }

    /**
     * 把手放在**面板外面**（浮层里、遮罩之上）：面板自己的 `overflow:hidden` 会裁掉
     * 溢出的把手，而且面板正文是 `<webview>` guest，压在边线上的把手收不到指针事件。
     * 搁在边上就不一样了：命中区域跨在边线上，外面那一半落在遮罩上，里面那一半
     * 落在面板边框上，都是普通 DOM，指针稳稳到手。
     */
    function ResizeHandles(props) {
      const drag = React.useRef(null);
      const t = props.t;
      const onDown = (mode) => (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        drag.current = { mode, x0: event.clientX, y0: event.clientY, rect: props.rect };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          /* 指针捕获失败也能用（事件仍会冒泡到元素上） */
        }
      };
      const onMove = (event) => {
        const current = drag.current;
        if (current === null) return;
        const dx = event.clientX - current.x0;
        const dy = event.clientY - current.y0;
        const base = current.rect;
        const view = viewport();
        const maxWidth = Math.max(MIN_WIDTH, view.width - EDGE_GAP * 2);
        const maxHeight = Math.max(MIN_HEIGHT, view.height - EDGE_GAP * 2);
        let { x, y, width, height } = base;
        if (current.mode.includes('e')) width = Math.min(Math.max(base.width + dx, MIN_WIDTH), maxWidth);
        if (current.mode.includes('s')) height = Math.min(Math.max(base.height + dy, MIN_HEIGHT), maxHeight);
        if (current.mode.includes('w')) {
          const next = Math.min(Math.max(base.width - dx, MIN_WIDTH), maxWidth);
          x = base.x + (base.width - next);
          width = next;
        }
        if (current.mode.includes('n')) {
          const next = Math.min(Math.max(base.height - dy, MIN_HEIGHT), maxHeight);
          y = base.y + (base.height - next);
          height = next;
        }
        setRect({ x, y, width, height });
      };
      const onUp = (event) => {
        drag.current = null;
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* 已经释放 */
        }
      };
      return h(
        React.Fragment,
        null,
        RESIZE_MODES.map((mode) => {
          const box = handleBox(mode, props.rect);
          return h('div', {
            key: mode,
            className: 'dub-resize',
            'data-edge': mode,
            'aria-hidden': 'true',
            title: mode === 'n' || mode === 's' ? t('resize.n') : mode === 'e' || mode === 'w' ? t('resize.e') : undefined,
            style: { left: box.left + 'px', top: box.top + 'px', width: box.width + 'px', height: box.height + 'px' },
            onPointerDown: onDown(mode),
            onPointerMove: onMove,
            onPointerUp: onUp,
            onPointerCancel: onUp,
          });
        }),
      );
    }

    function UsagePanel(props) {
      const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      const t = translateOf(props);
      const bridge = desktopBridge();
      const rect = state.rect === null ? defaultRect() : state.rect;
      const headDrag = React.useRef(null);

      // Esc 关闭 + Ctrl+R 刷新（DOM 路径：主进程没截走这个键时，按键会正常到页面）。
      React.useEffect(() => {
        if (state.open !== true) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') {
            closePanel();
            return;
          }
          const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
          if (key !== 'r' || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey) || event.repeat) return;
          event.preventDefault();
          event.stopPropagation();
          reloadPanel();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, [state.open]);

      // Ctrl+R 刷新：焦点在本窗口的普通 DOM 上时，主进程把键转成 `kind: 'keyboard'`。
      React.useEffect(() => {
        if (state.open !== true) return undefined;
        const keyboard = desktopKeyboard();
        if (keyboard === undefined) return undefined;
        return keyboard.subscribe((input) => {
          if (input === null || typeof input !== 'object' || input.kind !== 'keyboard') return;
          if (!isReloadGesture(input)) return;
          reloadPanel();
        });
      }, [state.open]);

      // 窗口尺寸变化时把面板拉回可视区。
      React.useEffect(() => {
        if (state.open !== true) return undefined;
        const onResize = () => {
          if (snapshot.rect !== null) setRect(snapshot.rect);
        };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, [state.open]);

      /* ---------- 拖动标题栏移动整个窗口 ---------- */

      const onHeadDown = (event) => {
        if (event.button !== 0) return;
        const target = event.target;
        if (target !== null && typeof target.closest === 'function' && target.closest('button') !== null) return;
        const current = getSnapshot();
        if (current.rect === null || current.maximized === true) return;
        event.preventDefault();
        headDrag.current = { x0: event.clientX, y0: event.clientY, rect: current.rect };
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch (error) {
          /* 指针捕获失败也能用 */
        }
      };
      const onHeadMove = (event) => {
        const dragState = headDrag.current;
        if (dragState === null) return;
        const view = viewport();
        const width = Math.min(dragState.rect.width, view.width - EDGE_GAP * 2);
        const height = Math.min(dragState.rect.height, view.height - EDGE_GAP * 2);
        const x = Math.min(Math.max(dragState.rect.x + event.clientX - dragState.x0, EDGE_GAP), view.width - width - EDGE_GAP);
        const y = Math.min(Math.max(dragState.rect.y + event.clientY - dragState.y0, EDGE_GAP), view.height - height - EDGE_GAP);
        if (snapshot.rect === null) return;
        publish({ ...snapshot, rect: { ...snapshot.rect, x, y }, maximized: false, savedRect: null });
      };
      const onHeadUp = (event) => {
        headDrag.current = null;
        try {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        } catch (error) {
          /* 已经释放 */
        }
      };

      return h(
        'section',
        {
          className: 'dub-panel',
          style: { left: rect.x + 'px', top: rect.y + 'px', width: rect.width + 'px', height: rect.height + 'px' },
          role: 'dialog',
          'aria-modal': 'true',
          'aria-label': t('panel.label'),
        },
        h(
          'header',
          {
            className: 'dub-head',
            title: t('drag.title'),
            onPointerDown: onHeadDown,
            onPointerMove: onHeadMove,
            onPointerUp: onHeadUp,
            onPointerCancel: onHeadUp,
          },
          h('span', { className: 'dub-mark', 'aria-hidden': 'true' }, chartIcon(14)),
          h('span', { className: 'dub-title' }, t('panel.title')),
          h(
            'div',
            { className: 'dub-tools' },
            toolButton(t('tool.reload'), reloadPanel, reloadIcon()),
            toolButton(
              t('tool.external'),
              () => {
                window.open(USAGE_URL, '_blank', 'noopener,noreferrer');
              },
              externalIcon(),
            ),
            toolButton(state.maximized ? t('tool.restore') : t('tool.expand'), toggleMaximize, expandIcon(state.maximized)),
            toolButton(t('tool.close'), closePanel, closeIcon()),
          ),
        ),
        bridge === undefined
          ? h(WebFallback, { t })
          : h(GuestView, {
              workspace: state.workspace,
              revision: state.revision,
              t,
              onRetry: reloadPanel,
            }),
        h(
          'footer',
          { className: 'dub-foot' },
          h('span', { className: 'dub-foot-url' }, t('foot.url')),
          h('span', { className: 'dub-foot-hint' }, t('foot.hint')),
        ),
      );
    }

    /* ==================================================================== */
    /* 按钮                                                                  */
    /* ==================================================================== */

    function LaunchButton(props) {
      const t = props.t;
      const open = props.open;
      return h(
        'button',
        {
          type: 'button',
          className: 'dub-launch',
          'data-active': open ? 'true' : 'false',
          'data-dock': props.dock,
          'aria-pressed': open,
          title: t('button.title'),
          'aria-label': t('button.title'),
          onClick: props.onClick,
        },
        h('span', { className: 'dub-launch-mark', 'aria-hidden': 'true' }, chartIcon(13)),
        h('span', { className: 'dub-launch-label' }, t('button.label')),
      );
    }

    /** 浮层入口：标题栏那颗按钮 + （打开时的）遮罩与面板。 */
    function UsageDock(props) {
      const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      const t = translateOf(props);
      const open = state.open === true;
      const launcher = captionMode()
        ? h(LaunchButton, {
            t,
            dock: 'caption',
            open,
            onClick: () => {
              if (open) closePanel();
              else openPanel(undefined);
            },
          })
        : null;
      return h(
        'div',
        { className: 'dub-layer' },
        open ? h('div', { className: 'dub-backdrop', 'aria-hidden': 'true', onClick: closePanel }) : null,
        open ? h(UsagePanel, { t }) : null,
        open && state.rect !== null ? h(ResizeHandles, { rect: state.rect, t }) : null,
        launcher,
      );
    }

    /** 没有标题栏的环境：落到会话标题之前的全局导航位（blank / 无会话时也在）。 */
    function LeadingLauncher(props) {
      const state = React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
      const t = translateOf(props);
      if (captionMode()) return null;
      const sessionId = props.sessionId;
      const workspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces((value) => value) : undefined;
      return h(LaunchButton, {
        t,
        open: state.open === true,
        onClick: () => {
          if (state.open === true) {
            closePanel();
            return;
          }
          openPanel(workspaceKeyOf(sessionId, workspaces));
        },
      });
    }

    /**
     * 什么都不画，只做一件事：把「当前会话属于哪个工作区」记进 store。
     *
     * 标题栏那颗按钮在 root 作用域的浮层里，拿不到当前会话，也就无从计算存储分区键；
     * 不记的话每次都会用兜底分区键，等于要把平台账号再登一遍、还跟右侧栏浏览器对不上。
     * 工具位是唯一同时拿得到 `sessionId` 与 `useWorkspaces` 的地方，所以在这里挂一个
     * 零宽度的「探针」，键变了就同步过去（只写一次，不触发循环）。
     */
    function SessionProbe(props) {
      const sessionId = props.sessionId;
      const workspaces = typeof props.useWorkspaces === 'function' ? props.useWorkspaces((value) => value) : undefined;
      const key = workspaceKeyOf(sessionId, workspaces);
      React.useEffect(() => {
        if (typeof key !== 'string' || key === snapshot.workspace) return;
        publish({ ...snapshot, workspace: key });
      }, [key]);
      return null;
    }

    /* ==================================================================== */
    /* 注册                                                                  */
    /* ==================================================================== */

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        boundTranslate = ctx.locale.bind(NS);

        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {};
          if (document.querySelector('style[data-plugin-css="' + CSS_TAG_ID + '"]') !== null) return () => {};
          const tag = document.createElement('style');
          tag.dataset.plugin = 'dsh-usage-browser';
          tag.dataset.pluginCss = CSS_TAG_ID;
          tag.textContent = CSS;
          document.head.appendChild(tag);
          return () => tag.remove();
        }, 'usage-browser: styles');

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'usage-browser: dictionaries');

        // 浮层：root 作用域，整帧都在，所以按钮和面板都不属于任何会话。
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            {
              name: 'shell.overlay',
              id: 'usage-browser',
              order: 500,
              locale: NS,
            },
            UsageDock,
          ),
        );

        // 没有窗口标题栏时（纯 Web / macOS）的落点：会话标题之前的全局导航位。
        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register(
            {
              name: 'conversation.header.leading',
              id: 'usage-browser',
              order: 0,
              locale: NS,
            },
            LeadingLauncher,
          ),
        );

        // 零宽度的会话探针：只把当前工作区的存储分区键同步进 store，不画任何东西。
        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'usage-browser-context',
              order: -20,
              locale: NS,
            },
            SessionProbe,
          ),
        );

        // 可自定义的快捷键。走应用自带的快捷键服务：它会出现在「快捷键」面板里、
        // 可以在那儿录制/改键/清除，并且用同一套 describeBinding 做冲突检测
        // （与已有绑定或固定动作撞车时该行会被标成冲突、保存被拒）。
        // id 用 `custom.` 前缀，将来自己再加功能时沿用同一个前缀，列表里就会连成一片。
        ctx.inject(['shortcuts'], (scope) => {
          scope.effect(
            () =>
              scope.shortcuts.register({
                id: 'custom.usage',
                label: () => boundTranslate('shortcut.label'),
                aliases: ['用量', '用量面板', 'usage', 'usage panel', '用户自创'],
                defaults: {
                  'desktop:macos': { code: 'KeyU', modifiers: ['primary', 'shift'] },
                  'desktop:windows': { code: 'KeyU', modifiers: ['primary', 'shift'] },
                  'desktop:linux': { code: 'KeyU', modifiers: ['primary', 'shift'] },
                  'web:macos': { code: 'KeyU', modifiers: ['primary', 'shift'] },
                  'web:windows': { code: 'KeyU', modifiers: ['primary', 'shift'] },
                },
                regions: ['page', 'editable', 'terminal'],
                modals: ['settings', 'shortcuts', 'other'],
                resolve: () => ({
                  status: 'handled',
                  run: () => {
                    if (snapshot.open === true) closePanel();
                    else openPanel(undefined);
                  },
                }),
              }),
            'usage-browser: shortcut',
          );
        });
      },
    };
  },
});
