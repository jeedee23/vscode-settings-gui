'use strict';

(() => {
  const host = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  const app = document.getElementById('app');
  let data, entries = [], selected, locked = false;
  const drafts = new Map();
  const rows = new Map();
  const identity = item => JSON.stringify([item.settings_name, item.settings_path || []]);
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const send = message => {
    if (!host) { status('Browser preview only: applying settings and syncing presets require the VS Code extension.'); return; }
    locked = true;
    updateButtons();
    host.postMessage(message);
  };
  function status(message, error = false) {
    const target = document.getElementById('status');
    target.textContent = message;
    target.classList.toggle('error', error);
  }
  function updateButtons() {
    const invalid = [...rows.values()].some(row => row.querySelector('.error')?.textContent);
    document.getElementById('apply').disabled = locked || !drafts.size || invalid;
    document.getElementById('save').disabled = locked || invalid;
    document.getElementById('load').disabled = locked;
    document.getElementById('discard').disabled = locked;
    document.getElementById('search').disabled = locked;
    document.getElementById('presets').disabled = locked;
    document.getElementById('tree').inert = locked;
  }
  function current(item) {
    const id = identity(item);
    return drafts.get(id) || { id, mode: data.values[id]?.mode || 'inherit', value: data.values[id]?.value ?? item.settings_value };
  }
  function change(item, value, mode = 'value') {
    const id = identity(item);
    drafts.set(id, { id, mode, value: mode === 'inherit' ? null : value });
    selected = item;
    for (const [key, row] of rows) row.classList.toggle('selected', key === id);
    const hint = rows.get(id)?.querySelector('.hint');
    if (hint) hint.textContent = `Draft: ${mode === 'inherit' ? 'Inherited' : 'Explicit value'}${data.values[id]?.overridden ? ' · Workspace override may take precedence.' : ''}`;
    status(`${drafts.size} draft change${drafts.size === 1 ? '' : 's'}. Nothing applied yet.`);
    updateButtons();
    preview();
  }
  function renderSetting(item) {
    const id = identity(item), rawValue = current(item).value;
    const value = rawValue === null && !item.settings_path?.length && item.settings_value_mode !== 'inherit'
      ? item.settings_value : rawValue;
    const row = node('section', undefined, 'setting');
    rows.set(id, row);
    const label = node('label', item.settings_human_read);
    const controls = node('div', undefined, 'controls');
    const error = node('div', '', 'error');
    row.append(label, node('div', item.settings_description, 'description'), controls, error);
    row.addEventListener('focusin', () => { selected = item; preview(); });
    const available = data.values[id]?.available !== false;
    const choices = item.settings_options || data.options[item.settings_name];
    const control = item.settings_control;
    let input;
    if (control === 'color') {
      const picker = node('input'); picker.type = 'color';
      picker.value = typeof value === 'string' ? value.slice(0, 7) : '#336699';
      picker.setAttribute('aria-label', `${item.settings_human_read} color picker`);
      input = node('input'); input.type = 'text'; input.placeholder = 'Inherit, or #RRGGBB[AA]';
      input.value = typeof value === 'string' ? value : '';
      picker.addEventListener('input', () => {
        const alpha = /^#[0-9a-f]{8}$/i.test(input.value) ? input.value.slice(7) : '';
        input.value = picker.value + alpha;
        input.dispatchEvent(new Event('input'));
      });
      input.addEventListener('input', () => {
        const valid = /^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(input.value);
        error.textContent = valid ? '' : 'Use #RRGGBB or #RRGGBBAA, or click Inherit.';
        if (valid) { picker.value = input.value.slice(0, 7); change(item, input.value); }
        updateButtons();
      });
      controls.append(picker, input);
      picker.disabled = !available;
    } else if (choices?.length && !(item.settings_name === 'editor.fontLigatures' && typeof value === 'string')) {
      input = node('select');
      if (value === null || value === undefined) {
        const inherited = node('option', 'Inherited'); inherited.value = 'inherit'; inherited.disabled = true; input.append(inherited);
      }
      for (const choice of choices) { const option = node('option', String(choice)); option.value = JSON.stringify(choice); input.append(option); }
      if (!choices.includes(value) && value !== null && value !== undefined) {
        const option = node('option', `${value} (current)`); option.value = JSON.stringify(value); input.append(option);
      }
      input.value = value === null || value === undefined ? 'inherit' : JSON.stringify(value);
      input.addEventListener('change', () => change(item, JSON.parse(input.value)));
      controls.append(input);
    } else if (typeof item.settings_value === 'boolean') {
      input = node('input'); input.type = 'checkbox'; input.checked = Boolean(value);
      input.addEventListener('change', () => change(item, input.checked));
      controls.append(input);
    } else if (typeof item.settings_value === 'number') {
      input = node('input'); input.type = 'number'; input.value = value;
      const range = data.ranges[item.settings_name];
      if (range) { input.min = range[0]; if (range[1] !== null) input.max = range[1]; }
      input.step = item.settings_name === 'platformio-ide.reopenSerialMonitorDelay' ? '1' : 'any';
      let slider;
      if (range && range[1] !== null) {
        slider = node('input'); slider.type = 'range'; slider.min = range[0]; slider.max = range[1]; slider.step = '1'; slider.value = value;
        slider.setAttribute('aria-label', `${item.settings_human_read} slider`);
        slider.addEventListener('input', () => { input.value = slider.value; input.dispatchEvent(new Event('input')); });
        controls.append(slider);
      }
      input.addEventListener('input', () => {
        error.textContent = input.value === '' || !input.checkValidity() ? 'Enter a number within the allowed range.' : '';
        if (!error.textContent) { if (slider) slider.value = input.value; change(item, Number(input.value)); }
        updateButtons();
      });
      controls.append(input);
      if (slider) slider.disabled = !available;
    } else {
      input = node('input'); input.type = 'text'; input.value = value ?? '';
      if (control === 'font') input.setAttribute('list', 'fonts');
      input.addEventListener('input', () => {
        const style = item.settings_path?.at(-1) === 'fontStyle';
        error.textContent = style && !/^(?:(?:italic|bold|underline|strikethrough)(?: (?:italic|bold|underline|strikethrough))*)?$/.test(input.value)
          ? 'Use italic, bold, underline, or strikethrough separated by spaces.' : '';
        if (control === 'font' && !input.value.trim()) error.textContent = 'Enter a font or click Inherit.';
        if (!error.textContent) change(item, input.value);
        updateButtons();
      });
      controls.append(input);
    }
    input.id = `setting-${entries.indexOf(item)}`;
    input.setAttribute('aria-label', item.settings_human_read);
    label.htmlFor = input.id;
    input.disabled = !available;
    const inherit = node('button', 'Inherit');
    inherit.disabled = !available;
    inherit.addEventListener('click', () => { change(item, null, 'inherit'); renderTree(); });
    controls.append(inherit);
    row.append(node('div', !available ? 'Unavailable: install the required extension or use a supported VS Code version.' :
      `${current(item).mode === 'inherit' ? 'Inherited' : 'Explicit value'}${data.values[id]?.overridden ? ' · Workspace override may take precedence.' : ''}`, 'hint'));
    return row;
  }
  function renderTree() {
    const tree = document.getElementById('tree');
    const opened = new Set([...tree.querySelectorAll('details[open]')].map(el => el.dataset.path));
    const first = !tree.childNodes.length;
    rows.clear(); tree.replaceChildren();
    const query = document.getElementById('search').value.toLowerCase();
    function add(nodes, parent, path) {
      for (const [name, category] of Object.entries(nodes)) {
        const details = node('details'); details.dataset.path = JSON.stringify([...path, name]);
        details.open = query ? true : first ? path.length === 0 && name === 'Visual interface' : opened.has(details.dataset.path);
        details.append(node('summary', name), node('div', category.description, 'description'));
        const matchedCategory = [...path, name].join(' ').toLowerCase().includes(query);
        for (const item of category.settings) {
          if (!query || matchedCategory || `${item.settings_human_read} ${item.settings_description}`.toLowerCase().includes(query)) details.append(renderSetting(item));
        }
        add(category.children, details, [...path, name]);
        if (!query || details.querySelector('.setting')) parent.append(details);
      }
    }
    add(data.catalog.categories, tree, []);
    updateButtons();
  }
  function preview() {
    const target = document.getElementById('visual');
    const val = (name, path = []) => {
      const item = entries.find(entry => entry.settings_name === name && JSON.stringify(entry.settings_path || []) === JSON.stringify(path));
      if (!item) return undefined;
      const edit = current(item);
      if (drafts.has(identity(item)) && edit.mode === 'inherit') {
        return !path.length && item.settings_value_mode !== 'inherit' ? item.settings_value : undefined;
      }
      return edit.value;
    };
    const map = {
      'editor.background': 'editor-bg', 'editor.foreground': 'editor-fg', 'editor.selectionBackground': 'selection-bg',
      'editor.lineHighlightBackground': 'line-bg', 'editorCursor.foreground': 'cursor-fg',
      'sideBar.background': 'sidebar-bg', 'sideBar.foreground': 'sidebar-fg',
      'sideBarSectionHeader.background': 'heading-bg', 'sideBarSectionHeader.foreground': 'heading-fg',
      'tab.activeBackground': 'tab-active-bg', 'tab.activeForeground': 'tab-active-fg',
      'tab.inactiveBackground': 'tab-inactive-bg', 'tab.inactiveForeground': 'tab-inactive-fg',
      'statusBar.background': 'status-bg', 'statusBar.foreground': 'status-fg',
      'terminal.background': 'terminal-bg', 'terminal.foreground': 'terminal-fg', 'terminalCursor.foreground': 'terminal-cursor'
    };
    for (const [key, property] of Object.entries(map)) {
      const color = val('workbench.colorCustomizations', [key]);
      target.style.removeProperty(`--${property}`);
      if (typeof color === 'string' && /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color)) target.style.setProperty(`--${property}`, color);
    }
    for (const [prefix, name] of [['editor', 'editor'], ['terminal', 'terminal.integrated'], ['chat', 'chat.editor']]) {
      for (const [suffix, field] of [['font', 'fontFamily'], ['size', 'fontSize'], ['weight', 'fontWeight']]) {
        const value = val(`${name}.${field}`);
        target.style.removeProperty(`--${prefix}-${suffix}`);
        if (value !== undefined && value !== null && value !== '' && value !== 'default') target.style.setProperty(`--${prefix}-${suffix}`, field === 'fontSize' ? `${value}px` : String(value));
      }
    }
    for (const [group, token] of [['comments', 'comment'], ['strings', 'string'], ['keywords', 'keyword'], ['numbers', 'number'], ['types', 'type'], ['functions', 'function'], ['variables', 'variable']]) {
      const color = val('editor.tokenColorCustomizations', [group, 'foreground']);
      const semantic = val('editor.semanticTokenColorCustomizations', ['rules', token, 'foreground']);
      const semanticEnabled = val('editor.semanticTokenColorCustomizations', ['enabled']);
      target.style.removeProperty(`--${token}`);
      const resolved = semanticEnabled !== false && semantic ? semantic : color;
      if (resolved) target.style.setProperty(`--${token}`, resolved);
      const style = val('editor.tokenColorCustomizations', [group, 'fontStyle']) || '';
      for (const element of target.querySelectorAll(`.token-${token}`)) {
        element.style.fontStyle = style.includes('italic') ? 'italic' : '';
        element.style.fontWeight = style.includes('bold') ? 'bold' : '';
        element.style.textDecoration = [style.includes('underline') ? 'underline' : '', style.includes('strikethrough') ? 'line-through' : ''].filter(Boolean).join(' ');
      }
    }
    target.querySelector('.mock-sidebar').style.order = val('workbench.sideBar.location') === 'right' ? '1' : '';
    target.querySelector('.mock-status').hidden = val('workbench.statusBar.visible') === false;
    target.querySelector('.mock-code').style.whiteSpace = val('editor.wordWrap') === 'off' ? 'pre' : 'pre-wrap';
    target.querySelector('.mock-chat pre').style.whiteSpace = val('chat.editor.wordWrap') === 'on' ? 'pre-wrap' : 'pre';
    const cursor = val('terminal.integrated.cursorStyle');
    target.querySelector('.terminal-cursor').textContent = cursor === 'line' ? '|' : cursor === 'underline' ? '_' : '█';
    const info = document.getElementById('selection-info');
    info.replaceChildren(node('strong', selected?.settings_human_read || 'Choose a setting on the left'),
      node('p', selected?.settings_description || 'Expand a category to edit its settings.'));
    if (selected) {
      const edit = current(selected);
      info.append(node('p', `Value: ${edit.mode === 'inherit' ? 'Inherited' : JSON.stringify(edit.value)}`));
      if (!/color|font|wordWrap|sideBar.location|statusBar.visible|cursorStyle/.test(selected.settings_control || selected.settings_name)) {
        info.append(node('p', 'This setting changes behavior rather than appearance. The preview explains it; it does not execute Git, tasks, debugging, or device operations.'));
      }
    }
  }
  function init(payload) {
    data = payload; entries = [];
    function collect(nodes) { for (const category of Object.values(nodes)) { entries.push(...category.settings); collect(category.children); } }
    collect(data.catalog.categories);
    app.innerHTML = `<header class="toolbar"><strong>Human Settings</strong><button id="apply">Apply draft</button><button id="discard">Discard draft</button><button id="save">Save preset</button><select id="presets" aria-label="Saved preset"></select><button id="load">Load preset</button></header>
      <div id="status" role="status" aria-live="polite">Draft mode: settings change only when applied.</div>
      <div class="layout"><section class="settings-pane" aria-label="Settings hierarchy"><input id="search" type="search" aria-label="Search settings" placeholder="Search settings and categories"><div id="tree"></div></section>
      <section class="preview-pane" aria-label="Visual preview"><h2>Live visual preview</h2><p class="preview-note">Illustrative sample, not an exact rendering of your installed theme. Custom colors and supported fonts update here. Inherited colors use sample fallbacks; behavior-only settings are explained below.</p>
      <div id="visual"><div class="mock-window"><div class="mock-title">My workspace</div><div class="mock-body"><aside class="mock-sidebar"><div class="mock-heading">EXPLORER</div><div>src</div><div>  main.ts</div><div>  readme.md</div></aside><div class="mock-main"><div class="mock-tabs"><span class="active">main.ts</span><span>readme.md</span></div><pre class="mock-code"><span class="token-comment">// Your custom colors and fonts</span>
<span class="token-keyword">function</span> <span class="token-function">greet</span>(<span class="token-variable">name</span>: <span class="token-type">string</span>) {
<span class="current-line">  <span class="token-keyword">const</span> count = <span class="token-number">42</span>;</span>
  <span class="token-keyword">return</span> <span class="selection token-string">"Hello"</span> + <span class="token-variable">name</span>;<span class="cursor"> </span>
}</pre></div></div><div class="mock-status">main · TypeScript · Spaces: 4</div></div><div class="mock-terminal">$ npm run build<br>Build completed.<br>$ <span class="terminal-cursor">█</span></div><div class="mock-chat"><strong>Chat code sample</strong><pre>const answer = 42;</pre></div></div>
      <div id="selection-info" class="selection-info"></div></section></div><datalist id="fonts"><option value="monospace"><option value="'Droid Sans Mono', monospace"><option value="'Fira Code', monospace"><option value="'JetBrains Mono', monospace"><option value="'Cascadia Code', monospace"></datalist>`;
    document.getElementById('search').addEventListener('input', renderTree);
    document.getElementById('apply').addEventListener('click', () => send({ type: 'apply', edits: [...drafts.values()] }));
    document.getElementById('discard').addEventListener('click', () => { drafts.clear(); renderTree(); preview(); status('Draft discarded.'); });
    document.getElementById('save').addEventListener('click', () => {
      const edits = entries.filter(item => data.values[identity(item)]?.available !== false).map(item => {
        const edit = current(item); return { ...edit, value: edit.mode === 'inherit' ? null : edit.value };
      });
      send({ type: 'savePreset', edits });
    });
    document.getElementById('load').addEventListener('click', () => send({ type: 'loadPreset', name: document.getElementById('presets').value }));
    setPresets(data.presets); renderTree(); preview();
  }
  function setPresets(names) {
    const select = document.getElementById('presets'); select.replaceChildren();
    for (const name of names) { const option = node('option', name); option.value = name; select.append(option); }
  }
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'init') init(message);
    if (message.type === 'applied') { drafts.clear(); init(message.snapshot); status('Applied to the active user profile.'); }
    if (message.type === 'presets') setPresets(message.names);
    if (message.type === 'preset') {
      drafts.clear();
      for (const edit of message.edits) drafts.set(edit.id, edit);
      renderTree(); preview(); status('Preset loaded into draft. Review it, then Apply.');
    }
    if (message.type === 'error') status(message.message, true);
    if (message.type === 'notice') status(message.message);
    if (message.type === 'idle') { locked = false; updateButtons(); }
  });
  if (host) host.postMessage({ type: 'ready' });
  else fetch('../settings-catalog.json').then(response => {
    if (!response.ok) throw new Error('Could not load the catalog.');
    return response.json();
  }).then(catalog => init({ catalog, values: {}, options: {
    'workbench.sideBar.location': ['left', 'right'], 'editor.wordWrap': ['off', 'on', 'wordWrapColumn', 'bounded'],
    'terminal.integrated.cursorStyle': ['block', 'line', 'underline']
  }, ranges: { 'editor.fontSize': [6, 100], 'accessibility.signalOptions.volume': [0, 100] }, presets: [], browserDemo: true }))
    .catch(error => { app.textContent = `Unable to open GUI: ${error.message}`; });
})();
