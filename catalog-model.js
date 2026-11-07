'use strict';

const catalog = require('./settings-catalog.json');
const entries = [];
function walk(nodes) {
  for (const node of Object.values(nodes)) {
    entries.push(...node.settings);
    walk(node.children);
  }
}
walk(catalog.categories);
const identity = item => JSON.stringify([item.settings_name, item.settings_path || []]);
const byId = new Map(entries.map(item => [identity(item), item]));
const options = {
  'workbench.sideBar.location': ['left', 'right'],
  'workbench.colorTheme': [],
  'workbench.iconTheme': [],
  'chat.editor.wordWrap': ['on', 'off'],
  'git.autofetch': [false, true, 'all'],
  'terminal.integrated.cursorStyle': ['block', 'line', 'underline'],
  'editor.wordWrap': ['off', 'on', 'wordWrapColumn', 'bounded'],
  'editor.fontLigatures': [false, true],
  'extensions.autoUpdate': ['on', 'off'],
  'files.autoSave': ['off', 'afterDelay', 'onFocusChange', 'onWindowChange'],
  'js/ts.updateImportsOnFileMove.enabled': ['prompt', 'always', 'never'],
  'debug.openDebug': ['neverOpen', 'openOnSessionStart', 'openOnFirstSessionStart', 'openOnDebugBreak'],
  'debug.toolBarLocation': ['floating', 'docked', 'commandCenter', 'hidden'],
  'debug.inlineValues': ['on', 'off', 'auto'],
  'task.autoDetect': ['on', 'off'],
  'task.saveBeforeRun': ['always', 'never', 'prompt'],
  'window.confirmBeforeClose': ['always', 'keyboardOnly', 'never'],
  'editor.accessibilitySupport': ['auto', 'on', 'off'],
  'workbench.reduceMotion': ['auto', 'on', 'off'],
  'workbench.reduceTransparency': ['auto', 'on', 'off']
};
const ranges = {
  'editor.fontSize': [6, 100],
  'accessibility.signalOptions.volume': [0, 100],
  'remote.SSH.connectTimeout': [1, null],
  'platformio-ide.reopenSerialMonitorDelay': [0, null]
};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function readPath(value, path) {
  for (const key of path) {
    if (typeof value === 'string' && key === 'foreground') return value;
    if (!isObject(value) || !Object.hasOwn(value, key)) return undefined;
    value = value[key];
  }
  return value;
}

function validateEdit(edit) {
  if (!isObject(edit) || !byId.has(edit.id)) throw new Error('Unknown catalog setting.');
  const item = byId.get(edit.id);
  if (edit.mode === 'inherit') {
    if (edit.value !== null) throw new Error('Inherited values must be null.');
    return item;
  }
  if (edit.mode !== 'value') throw new Error('Invalid value mode.');
  const value = edit.value;
  if (item.settings_control === 'color') {
    if (typeof value !== 'string' || !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) {
      throw new Error('Enter a hexadecimal color such as #336699 or #33669980.');
    }
  } else if ((item.settings_path || []).at(-1) === 'fontStyle') {
    if (typeof value !== 'string' || !/^(?:(?:italic|bold|underline|strikethrough)(?: (?:italic|bold|underline|strikethrough))*)?$/.test(value)) {
      throw new Error('Use italic, bold, underline, or strikethrough, separated by spaces.');
    }
  } else if (item.settings_control === 'font' || item.settings_control === 'text') {
    if (typeof value !== 'string') throw new Error('A text value is required.');
    if (item.settings_control === 'font' && !value.trim()) throw new Error('Enter a font family or use inheritance.');
    if (item.settings_name.endsWith('fontWeight') && (!/^(default|normal|bold|[1-9][0-9]{0,2}|1000)$/.test(value) ||
      (value === 'default' && item.settings_name !== 'chat.editor.fontWeight'))) {
      throw new Error('Use normal, bold, or a weight from 1 to 1000 (default is also supported for chat).');
    }
  } else if (item.settings_name === 'editor.fontLigatures' && typeof value === 'string') {
    // VS Code also accepts advanced font-feature expressions.
  } else {
    const choices = item.settings_options || options[item.settings_name];
    if (choices?.length && !choices.includes(value)) throw new Error('Select a supported value.');
    const type = item.settings_path?.at(-1) === 'enabled' ? 'boolean' : typeof item.settings_value;
    if (!choices?.length && typeof value !== type) throw new Error(`Expected a ${type} value.`);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
      const range = ranges[item.settings_name];
      if (range && (value < range[0] || (range[1] !== null && value > range[1]))) throw new Error('Value is outside the supported range.');
      if (['platformio-ide.reopenSerialMonitorDelay'].includes(item.settings_name) && !Number.isInteger(value)) throw new Error('Enter a whole number.');
    }
  }
  return item;
}

function mergeEdit(current, item, edit) {
  const path = item.settings_path || [];
  if (!path.length) return edit.mode === 'inherit' ? undefined : structuredClone(edit.value);
  if (current !== undefined && !isObject(current)) throw new Error('The containing setting is not an object.');
  const result = structuredClone(current || {});
  function update(node, index) {
    const key = path[index];
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe property path.');
    if (index === path.length - 1) {
      if (edit.mode === 'inherit') delete node[key];
      else node[key] = structuredClone(edit.value);
      return;
    }
    if (!Object.hasOwn(node, key)) {
      if (edit.mode === 'inherit') return;
      node[key] = {};
    }
    if (typeof node[key] === 'string' && (
      (item.settings_name === 'editor.tokenColorCustomizations' && index === 0) ||
      (item.settings_name === 'editor.semanticTokenColorCustomizations' && index === 1)
    )) node[key] = { foreground: node[key] };
    if (!isObject(node[key])) throw new Error('An existing nested value is incompatible with this edit.');
    update(node[key], index + 1);
    if (!Object.keys(node[key]).length) delete node[key];
  }
  update(result, 0);
  return Object.keys(result).length ? result : undefined;
}

module.exports = { catalog, entries, identity, byId, options, ranges, readPath, validateEdit, mergeEdit };
