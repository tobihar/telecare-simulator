(function () {
  'use strict';

  // Fensterverwaltung für den Anästhesie-Simulator: Fenster lassen sich über
  // Ziehleisten skalieren und auf einen schmalen Streifen minimieren. Die
  // Anordnung wird pro Browser gespeichert. Skalieren gibt es nur im
  // Desktop-Layout (ab 1201 px), Minimieren überall.

  const STORAGE_KEY = 'galenVentLayout';
  const STACKS = {
    left: ['staff', 'patient', 'inventory'],
    right: ['actions', 'orders'],
    center: ['chat', 'pumps']
  };
  // Fenster, die beim ersten Besuch minimiert sind.
  const DEFAULT_MINIMIZED = new Set(['vitals']);
  const COLLAPSED_WIDTH = 40;
  const MIN_CENTER = 600;
  const MIN_CHAT = 280;
  const MIN_VENT = 360;
  const MIN_STACK_PANEL = 60;
  const KEY_STEP = 16;

  const $ = selector => document.querySelector(selector);
  const layout = $('.main-layout');
  if (!layout) return;
  const columns = { left: $('.left-column'), center: $('.center-column'), right: $('.right-column') };
  const workspace = $('.center-workspace');
  const panels = Object.fromEntries([...document.querySelectorAll('[data-window]')].map(panel => [panel.dataset.window, panel]));
  const desktopQuery = window.matchMedia('(min-width: 1201px)');
  const clamp = (value, min, max) => Math.max(min, Math.min(Math.max(min, max), value));

  const defaultState = () => ({ version: 1, minimized: {}, leftW: null, rightW: null, chatFrac: null, pumpsH: null, vitalsH: null, weights: {} });
  let state = loadState();
  let splitters = [];

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.version === 1) return { ...defaultState(), ...saved, minimized: { ...saved.minimized }, weights: { ...saved.weights } };
    } catch {}
    return defaultState();
  }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }

  const isMinimized = key => key in state.minimized ? Boolean(state.minimized[key]) : DEFAULT_MINIMIZED.has(key);
  const stackCollapsed = name => STACKS[name].every(isMinimized);
  const rect = element => element.getBoundingClientRect();

  function setVar(element, name, value) {
    if (value === null || value === undefined) element.style.removeProperty(name);
    else element.style.setProperty(name, value);
  }

  // Natürliche Höhen der Fenster in den Seitenspalten als Startgewichte messen,
  // damit die Standardansicht wie vorher aussieht. Bis dahin (Klasse
  // stack-weighted fehlt) behalten die Fenster ihre natürliche Höhe.
  function measureStackWeights() {
    if (!desktopQuery.matches) return;
    ['left', 'right'].forEach(name => {
      const column = columns[name];
      const missing = STACKS[name].filter(key => !(state.weights[key] > 0));
      if (missing.length) {
        column.classList.remove('stack-weighted');
        missing.forEach(key => { state.weights[key] = Math.max(1, panels[key]?.offsetHeight || 1); });
      }
      column.classList.add('stack-weighted');
    });
    applyLayout();
  }
  // Erst messen, wenn die Simulation ihre Inhalte (z. B. Personalkarten) gezeichnet hat.
  const measureWhenRendered = () => requestAnimationFrame(() => requestAnimationFrame(measureStackWeights));

  function applyLayout() {
    const desktop = desktopQuery.matches;
    const collapsed = { left: stackCollapsed('left'), right: stackCollapsed('right'), center: stackCollapsed('center') };
    const ventMinimized = isMinimized('ventilator');
    const centerCollapsed = collapsed.center && ventMinimized && isMinimized('vitals');

    Object.entries(panels).forEach(([key, panel]) => {
      const minimized = isMinimized(key);
      const stack = Object.keys(STACKS).find(name => STACKS[name].includes(key));
      panel.classList.toggle('window-minimized', minimized);
      panel.classList.toggle('window-vertical', desktop && minimized && (key === 'ventilator' || Boolean(stack && collapsed[stack])));
      const button = panel.querySelector('.window-toggle');
      if (button) {
        const title = panel.dataset.windowTitle;
        button.textContent = minimized ? '+' : '–';
        button.setAttribute('aria-expanded', String(!minimized));
        button.setAttribute('aria-label', `${title} ${minimized ? 'wiederherstellen' : 'minimieren'}`);
        button.title = minimized ? 'Wiederherstellen' : 'Minimieren';
      }
      if (state.weights[key] > 0) panel.style.setProperty('--w', String(state.weights[key]));
    });
    columns.left?.classList.toggle('stack-collapsed', collapsed.left);
    columns.right?.classList.toggle('stack-collapsed', collapsed.right);

    const sideWidth = (side, stored) => {
      if (collapsed[side]) return `${COLLAPSED_WIDTH}px`;
      if (centerCollapsed) return 'minmax(0, 1fr)';
      return stored ? `${Math.round(stored)}px` : null;
    };
    setVar(layout, '--left-w', sideWidth('left', state.leftW));
    setVar(layout, '--right-w', sideWidth('right', state.rightW));
    setVar(layout, '--center-w', centerCollapsed ? `${COLLAPSED_WIDTH * 2 + 8}px` : null);

    let chatW = null, ventW = null;
    if (collapsed.center) { chatW = `${COLLAPSED_WIDTH}px`; ventW = 'minmax(0, 1fr)'; }
    else if (ventMinimized) { chatW = 'minmax(0, 1fr)'; ventW = `${COLLAPSED_WIDTH}px`; }
    else if (state.chatFrac) { chatW = `minmax(${MIN_CHAT}px, ${state.chatFrac.toFixed(4)}fr)`; ventW = `minmax(${MIN_VENT}px, ${(1 - state.chatFrac).toFixed(4)}fr)`; }
    if (centerCollapsed) { chatW = `${COLLAPSED_WIDTH}px`; ventW = `${COLLAPSED_WIDTH}px`; }
    setVar(columns.center, '--vitals-h', state.vitalsH ? `${Math.round(state.vitalsH)}px` : null);
    setVar(workspace, '--chat-w', chatW);
    setVar(workspace, '--vent-w', ventW);
    setVar(workspace, '--chat-h', isMinimized('chat') ? 'auto' : null);
    setVar(workspace, '--pumps-h', isMinimized('pumps') ? 'auto' : isMinimized('chat') ? 'minmax(0, 1fr)' : state.pumpsH ? `${Math.round(state.pumpsH)}px` : null);

    positionSplitters();
  }

  function toggleWindow(key) {
    state.minimized[key] = !isMinimized(key);
    applyLayout();
    saveState();
  }

  function setupWindowButtons() {
    Object.entries(panels).forEach(([key, panel]) => {
      const titleRow = panel.querySelector(':scope > .panel-title-row');
      if (!titleRow) return;
      panel.dataset.windowTitle = panel.querySelector('h2')?.textContent.trim() || key;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'window-toggle';
      button.addEventListener('click', event => {
        event.stopPropagation();
        toggleWindow(key);
      });
      titleRow.append(button);
      // Ein minimiertes Fenster lässt sich auch per Klick auf den Streifen öffnen.
      panel.addEventListener('click', () => { if (isMinimized(key)) toggleWindow(key); });
    });
  }

  // --- Ziehleisten -------------------------------------------------------------

  function snapshot() {
    const stackHeights = {};
    [...STACKS.left, ...STACKS.right].forEach(key => { stackHeights[key] = rect(panels[key]).height; });
    return {
      leftW: rect(columns.left).width,
      rightW: rect(columns.right).width,
      centerW: rect(columns.center).width,
      chatPx: rect(panels.chat).width,
      ventPx: rect(panels.ventilator).width,
      chatH: rect(panels.chat).height,
      pumpsH: rect(panels.pumps).height,
      vitalsH: panels.vitals ? rect(panels.vitals).height : 0,
      workspaceH: rect(workspace).height,
      stackHeights,
      weights: { ...state.weights }
    };
  }

  function stackPairs(name) {
    const open = STACKS[name].filter(key => !isMinimized(key));
    return open.slice(0, -1).map((key, i) => [key, open[i + 1]]);
  }

  function splitterDefinitions() {
    const box = rect(layout);
    const definitions = [];
    const centerCollapsed = stackCollapsed('center') && isMinimized('ventilator') && isMinimized('vitals');
    const verticalAt = (x, top, height) => ({ orientation: 'vertical', x: x - box.left, y: top - box.top, w: 8, h: height });
    const horizontalAt = (y, left, width) => ({ orientation: 'horizontal', x: left - box.left, y: y - box.top, w: width, h: 8 });

    if (!stackCollapsed('left') && !centerCollapsed) {
      definitions.push({
        id: 'left-column', label: 'Breite der linken Spalte', ...verticalAt(rect(columns.left).right, box.top, box.height),
        drag: (s, dx) => { state.leftW = clamp(s.leftW + dx, 180, s.leftW + s.centerW - MIN_CENTER); }
      });
    }
    if (!stackCollapsed('right') && !centerCollapsed) {
      definitions.push({
        id: 'right-column', label: 'Breite der rechten Spalte', ...verticalAt(rect(columns.center).right, box.top, box.height),
        drag: (s, dx) => { state.rightW = clamp(s.rightW - dx, 200, s.rightW + s.centerW - MIN_CENTER); }
      });
    }
    if (!stackCollapsed('center') && !isMinimized('ventilator')) {
      const ws = rect(workspace);
      definitions.push({
        id: 'chat-vent', label: 'Breite von Chat und Beatmungsgerät', ...verticalAt(rect(panels.ventilator).left - 8, ws.top, ws.height),
        drag: (s, dx) => {
          const total = s.chatPx + s.ventPx;
          state.chatFrac = clamp(s.chatPx + dx, MIN_CHAT, total - MIN_VENT) / total;
        }
      });
    }
    if (panels.vitals && !isMinimized('vitals')) {
      const monitor = rect(panels.vitals);
      definitions.push({
        id: 'vitals-workspace', label: 'Höhe der Vitalkurven', ...horizontalAt(monitor.bottom, monitor.left, monitor.width),
        drag: (s, dx, dy) => { state.vitalsH = clamp(s.vitalsH + dy, 120, s.vitalsH + s.workspaceH - 320); }
      });
    }
    if (!isMinimized('chat') && !isMinimized('pumps')) {
      const chat = rect(panels.chat);
      definitions.push({
        id: 'chat-pumps', label: 'Höhe von Chat und Perfusoren', ...horizontalAt(chat.bottom, chat.left, chat.width),
        drag: (s, dx, dy) => { state.pumpsH = clamp(s.pumpsH - dy, 70, s.pumpsH + s.chatH - 120); }
      });
    }
    ['left', 'right'].forEach(name => {
      if (stackCollapsed(name)) return;
      stackPairs(name).forEach(([a, b]) => {
        const upper = rect(panels[a]);
        definitions.push({
          id: `${a}-${b}`, label: `Höhe von ${panels[a].dataset.windowTitle} und ${panels[b].dataset.windowTitle}`,
          ...horizontalAt(upper.bottom, upper.left, upper.width),
          drag: (s, dx, dy) => {
            const hA = s.stackHeights[a], hB = s.stackHeights[b];
            const wA = s.weights[a] || 1, wB = s.weights[b] || 1;
            const nextA = clamp(hA + dy, MIN_STACK_PANEL, hA + hB - MIN_STACK_PANEL);
            state.weights[a] = (wA + wB) * nextA / (hA + hB);
            state.weights[b] = (wA + wB) - state.weights[a];
          }
        });
      });
    });
    return definitions;
  }

  const splitterLayer = document.createElement('div');
  splitterLayer.className = 'window-splitters';
  layout.append(splitterLayer);

  function positionSplitters() {
    if (!desktopQuery.matches) {
      splitterLayer.replaceChildren();
      splitters = [];
      return;
    }
    const definitions = splitterDefinitions();
    const existing = new Map(splitters.map(item => [item.definition.id, item]));
    splitters = definitions.map(definition => {
      const item = existing.get(definition.id) || createSplitter(definition);
      item.definition = definition;
      const node = item.node;
      node.className = `window-splitter ${definition.orientation}`;
      node.setAttribute('aria-orientation', definition.orientation);
      node.setAttribute('aria-label', definition.label);
      Object.assign(node.style, { left: `${definition.x}px`, top: `${definition.y}px`, width: `${definition.w}px`, height: `${definition.h}px` });
      return item;
    });
    // Nur hinzufügen bzw. entfernen, damit eine gerade gezogene Leiste im DOM bleibt.
    const active = new Set(splitters.map(item => item.node));
    [...splitterLayer.children].forEach(node => { if (!active.has(node)) node.remove(); });
    splitters.forEach(item => { if (item.node.parentNode !== splitterLayer) splitterLayer.append(item.node); });
  }

  function createSplitter() {
    const node = document.createElement('div');
    node.setAttribute('role', 'separator');
    node.tabIndex = 0;
    const item = { node, definition: null };
    let start = null, startX = 0, startY = 0;

    node.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      start = snapshot();
      startX = event.clientX;
      startY = event.clientY;
      node.setPointerCapture(event.pointerId);
      node.classList.add('dragging');
      document.body.classList.add('window-resizing', `window-resizing-${item.definition.orientation}`);
    });
    node.addEventListener('pointermove', event => {
      if (!start) return;
      item.definition.drag(start, event.clientX - startX, event.clientY - startY);
      applyLayout();
    });
    const finish = () => {
      if (!start) return;
      start = null;
      node.classList.remove('dragging');
      document.body.classList.remove('window-resizing', 'window-resizing-vertical', 'window-resizing-horizontal');
      saveState();
    };
    node.addEventListener('pointerup', finish);
    node.addEventListener('pointercancel', finish);
    node.addEventListener('keydown', event => {
      const vertical = item.definition.orientation === 'vertical';
      const delta = { ArrowLeft: vertical ? -KEY_STEP : 0, ArrowRight: vertical ? KEY_STEP : 0, ArrowUp: vertical ? 0 : -KEY_STEP, ArrowDown: vertical ? 0 : KEY_STEP }[event.key];
      if (!delta) return;
      event.preventDefault();
      item.definition.drag(snapshot(), vertical ? delta : 0, vertical ? 0 : delta);
      applyLayout();
      saveState();
    });
    return item;
  }

  function resetLayout() {
    state = defaultState();
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    Object.values(panels).forEach(panel => panel.style.removeProperty('--w'));
    applyLayout();
    measureStackWeights();
  }

  setupWindowButtons();
  applyLayout();
  if (document.readyState === 'complete') measureWhenRendered();
  else window.addEventListener('load', measureWhenRendered, { once: true });
  document.getElementById('resetLayoutBtn')?.addEventListener('click', () => {
    resetLayout();
    document.querySelector('.game-menu')?.removeAttribute('open');
  });
  desktopQuery.addEventListener('change', () => { applyLayout(); measureStackWeights(); });
  window.addEventListener('resize', positionSplitters);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(() => positionSplitters());
    observer.observe(layout);
    Object.values(panels).forEach(panel => observer.observe(panel));
  }
})();
