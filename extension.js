'use strict';

const vscode = require('vscode');
const { randomBytes } = require('node:crypto');
const model = require('./catalog-model');

function activate(context) {
  context.globalState.setKeysForSync(['presets']);
  context.subscriptions.push(vscode.commands.registerCommand('humanSettings.open', () => {
    const panel = vscode.window.createWebviewPanel('humanSettings', 'Human Settings', vscode.ViewColumn.One, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
    });
    const nonce = randomBytes(24).toString('hex');
    const resource = name => panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', name));
    panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <link rel="stylesheet" href="${resource('gui.css')}"><title>Human Settings</title></head>
      <body><main id="app"></main><script nonce="${nonce}" src="${resource('gui.js')}"></script></body></html>`;
    let busy = false;
    const configuration = () => vscode.workspace.getConfiguration();
    const isAvailable = item => configuration().inspect(item.settings_name) !== undefined;
    function snapshot() {
      const config = configuration();
      const values = {};
      for (const item of model.entries) {
        const inspected = config.inspect(item.settings_name);
        const effective = model.readPath(config.get(item.settings_name), item.settings_path || []);
        const own = model.readPath(inspected?.globalValue, item.settings_path || []);
        values[model.identity(item)] = {
          mode: own === undefined ? 'inherit' : 'value',
          value: own !== undefined ? own : effective === undefined ? item.settings_value : effective,
          available: inspected !== undefined,
          overridden: inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined
        };
      }
      const choices = { ...model.options };
      for (const [key, contribution, field] of [
        ['workbench.colorTheme', 'themes', 'label'],
        ['workbench.iconTheme', 'iconThemes', 'id']
      ]) {
        choices[key] = [...new Set(vscode.extensions.all.flatMap(extension =>
          (extension.packageJSON.contributes?.[contribution] || []).map(theme => theme[field] || theme.id)
        ))];
      }
      return { type: 'init', catalog: model.catalog, values, options: choices, ranges: model.ranges,
        presets: Object.keys(context.globalState.get('presets', {})), browserDemo: false };
    }
    async function apply(edits) {
      if (!Array.isArray(edits) || edits.length > model.entries.length) throw new Error('Invalid edit batch.');
      const config = configuration();
      const updates = new Map();
      const originals = new Map();
      const themeConflicts = new Set();
      for (const edit of edits) {
        const item = model.validateEdit(edit);
        if (!isAvailable(item)) throw new Error(`${item.settings_human_read} requires an unavailable setting or extension.`);
        const key = item.settings_name;
        if (item.settings_path?.length && ['workbench.colorCustomizations', 'editor.tokenColorCustomizations', 'editor.semanticTokenColorCustomizations'].includes(key)) {
          const effective = config.get(key);
          if (effective && typeof effective === 'object' && Object.keys(effective).some(property => property.startsWith('['))) {
            themeConflicts.add(item.settings_human_read);
          }
        }
        if (!originals.has(key)) originals.set(key, config.inspect(key)?.globalValue);
        const previous = updates.has(key) ? updates.get(key) : originals.get(key);
        updates.set(key, model.mergeEdit(previous, item, edit));
      }
      if (themeConflicts.size && await vscode.window.showWarningMessage(
        'Theme-specific overrides exist and may take precedence over these global customization edits. They will be preserved. Apply global edits anyway?',
        { modal: true }, 'Apply global edits'
      ) !== 'Apply global edits') return false;
      const written = [];
      try {
        for (const [key, value] of updates) {
          await config.update(key, value, vscode.ConfigurationTarget.Global);
          written.push(key);
        }
      } catch (error) {
        const rollbackErrors = [];
        for (const key of written.reverse()) {
          try { await config.update(key, originals.get(key), vscode.ConfigurationTarget.Global); }
          catch (rollbackError) { rollbackErrors.push(`${key}: ${rollbackError.message}`); }
        }
        throw new Error(`${error.message}${rollbackErrors.length ? ` Rollback failures: ${rollbackErrors.join('; ')}` : ' Previous writes were rolled back.'}`);
      }
      return true;
    }
    panel.webview.onDidReceiveMessage(async message => {
      if (busy) {
        await panel.webview.postMessage({ type: 'error', message: 'Another operation is still running.' });
        return;
      }
      busy = true;
      try {
        if (message.type === 'ready') await panel.webview.postMessage(snapshot());
        else if (message.type === 'apply') {
          if (await apply(message.edits)) {
            await panel.webview.postMessage({ type: 'applied', snapshot: snapshot() });
            vscode.window.showInformationMessage('Settings applied to the active user profile. Workspace overrides may still take precedence.');
          } else {
            await panel.webview.postMessage({ type: 'notice', message: 'Application cancelled. Your draft has been preserved.' });
          }
        } else if (message.type === 'savePreset') {
          if (!Array.isArray(message.edits)) throw new Error('Invalid preset.');
          for (const edit of message.edits) model.validateEdit(edit);
          const name = await vscode.window.showInputBox({ prompt: 'Name this preset', validateInput: value =>
            !value.trim() || ['__proto__', 'constructor', 'prototype'].includes(value.trim()) ? 'Enter a valid preset name.' : undefined });
          if (name) {
            const presets = context.globalState.get('presets', {});
            if (Object.hasOwn(presets, name.trim()) && await vscode.window.showWarningMessage('Replace this preset?', { modal: true }, 'Replace') !== 'Replace') return;
            presets[name.trim()] = message.edits;
            await context.globalState.update('presets', presets);
            await panel.webview.postMessage({ type: 'presets', names: Object.keys(presets) });
            vscode.window.showInformationMessage('Preset saved. Enable Settings Sync and extension synchronization to sync it between installations.');
          }
        } else if (message.type === 'loadPreset') {
          const presets = context.globalState.get('presets', {});
          if (!Object.hasOwn(presets, message.name)) throw new Error('Preset not found.');
          for (const edit of presets[message.name]) model.validateEdit(edit);
          await panel.webview.postMessage({ type: 'preset', edits: presets[message.name] });
        } else throw new Error('Unknown GUI request.');
      } catch (error) {
        vscode.window.showErrorMessage(`Human Settings: ${error.message}`);
        await panel.webview.postMessage({ type: 'error', message: error.message });
      } finally {
        busy = false;
        await panel.webview.postMessage({ type: 'idle' });
      }
    }, undefined, context.subscriptions);
  }));
}

module.exports = { activate };
