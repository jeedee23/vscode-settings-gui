'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../catalog-model');

function host() {
  let command, receive, input = 'My preset', failKey, confirmation = 'Replace';
  const userValues = new Map();
  const outgoing = [], notices = [], writes = [];
  const defaults = new Map();
  for (const item of model.entries) {
    if (!item.settings_path?.length) defaults.set(item.settings_name, item.settings_value);
    else defaults.set(item.settings_name, {});
  }
  const presets = {};
  const config = {
    get: key => userValues.has(key) ? userValues.get(key) : defaults.get(key),
    inspect: key => defaults.has(key) ? { defaultValue: defaults.get(key), globalValue: userValues.get(key) } : undefined,
    update: async (key, value, target) => {
      assert.equal(target, 'global');
      if (key === failKey) { failKey = undefined; throw new Error('Simulated write failure'); }
      writes.push([key, value]);
      if (value === undefined) userValues.delete(key);
      else userValues.set(key, value);
    }
  };
  const panel = {
    webview: {
      cspSource: 'vscode-resource:',
      asWebviewUri: value => value,
      postMessage: async message => outgoing.push(message),
      onDidReceiveMessage: handler => { receive = handler; }
    }
  };
  const vscode = {
    ViewColumn: { One: 1 }, ConfigurationTarget: { Global: 'global' },
    Uri: { joinPath: (...segments) => segments.join('/') },
    workspace: { getConfiguration: () => config },
    extensions: { all: [] },
    commands: { registerCommand: (name, callback) => { assert.equal(name, 'humanSettings.open'); command = callback; return {}; } },
    window: {
      createWebviewPanel: () => panel,
      showInformationMessage: message => notices.push(message),
      showErrorMessage: message => notices.push(message),
      showInputBox: async () => input,
      showWarningMessage: async () => confirmation
    }
  };
  const context = {
    extensionUri: '/extension',
    subscriptions: [],
    globalState: {
      setKeysForSync: keys => assert.deepEqual(Array.from(keys), ['presets']),
      get: (key, fallback) => Object.hasOwn(presets, key) ? presets[key] : fallback,
      update: async (key, value) => { presets[key] = value; }
    }
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extension.js'), 'utf8'), {
    module, require: id => id === 'vscode' ? vscode : id === './catalog-model' ? model : require(id)
  });
  module.exports.activate(context);
  command();
  return { receive: message => receive(message), outgoing, notices, userValues, writes, presets,
    fail: key => { failKey = key; }, setName: name => { input = name; },
    confirm: value => { confirmation = value; }, panel };
}
const edit = (name, propertyPath, value, mode = 'value') => ({
  id: JSON.stringify([name, propertyPath]), mode, value
});

test('host creates a CSP-protected webview and sends real configuration snapshot', async () => {
  const h = host();
  await h.receive({ type: 'ready' });
  assert.match(h.panel.webview.html, /Content-Security-Policy/);
  const initial = h.outgoing.find(message => message.type === 'init');
  assert.equal(Object.keys(initial.values).length, model.entries.length);
  assert.equal(initial.values[JSON.stringify(['editor.fontSize', []])].value, 14);
});

test('host groups nested changes and writes once per compound setting', async () => {
  const h = host();
  h.userValues.set('workbench.colorCustomizations', { 'sideBar.foreground': '#abcdef' });
  await h.receive({ type: 'apply', edits: [
    edit('workbench.colorCustomizations', ['editor.background'], '#123456'),
    edit('workbench.colorCustomizations', ['editor.foreground'], '#ffffff')
  ] });
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.userValues.get('workbench.colorCustomizations'), {
    'sideBar.foreground': '#abcdef', 'editor.background': '#123456', 'editor.foreground': '#ffffff'
  });
  assert.ok(h.outgoing.some(message => message.type === 'applied'));
});

test('invalid batch causes no writes and write failure rolls back earlier changes', async () => {
  const h = host();
  await h.receive({ type: 'apply', edits: [
    edit('editor.fontSize', [], 18), edit('git.enabled', [], 'wrong')
  ] });
  assert.equal(h.writes.length, 0);
  assert.ok(h.outgoing.some(message => message.type === 'error'));
  h.userValues.set('editor.fontSize', 16);
  h.fail('git.enabled');
  await h.receive({ type: 'apply', edits: [
    edit('editor.fontSize', [], 18), edit('git.enabled', [], false)
  ] });
  assert.equal(h.userValues.get('editor.fontSize'), 16);
  assert.ok(h.notices.some(message => message.includes('rolled back')));
});

test('preset save and load use synced storage and do not apply settings', async () => {
  const h = host();
  const edits = [edit('editor.fontSize', [], 20)];
  await h.receive({ type: 'savePreset', edits });
  assert.deepEqual(h.presets.presets['My preset'], edits);
  await h.receive({ type: 'loadPreset', name: 'My preset' });
  assert.deepEqual(h.outgoing.find(message => message.type === 'preset').edits, edits);
  assert.equal(h.writes.length, 0);
});

test('theme-specific overrides require confirmation and cancellation preserves draft', async () => {
  const h = host();
  h.userValues.set('workbench.colorCustomizations', { '[My theme]': { 'editor.background': '#112233' } });
  const edits = [edit('workbench.colorCustomizations', ['editor.background'], '#abcdef')];
  h.confirm(undefined);
  await h.receive({ type: 'apply', edits });
  assert.equal(h.writes.length, 0);
  assert.ok(h.outgoing.some(message => message.type === 'notice'));
  assert.ok(!h.outgoing.some(message => message.type === 'applied'));
  h.confirm('Apply global edits');
  await h.receive({ type: 'apply', edits });
  assert.deepEqual(h.userValues.get('workbench.colorCustomizations'), {
    '[My theme]': { 'editor.background': '#112233' }, 'editor.background': '#abcdef'
  });
});
