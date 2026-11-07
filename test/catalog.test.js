'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const model = require('../catalog-model');
const item = (name, propertyPath = []) => model.byId.get(JSON.stringify([name, propertyPath]));
const edit = (entry, value, mode = 'value') => ({ id: model.identity(entry), value, mode });

test('catalog has unique compound identities and Markdown matches its hierarchy', () => {
  assert.equal(model.byId.size, model.entries.length);
  const headings = [], bullets = [];
  function walk(nodes, depth) {
    for (const [name, node] of Object.entries(nodes)) {
      headings.push(`${'#'.repeat(depth)} ${name}`);
      for (const entry of node.settings) {
        for (const key of ['settings_name', 'settings_human_read', 'settings_description']) assert.equal(typeof entry[key], 'string');
        assert.ok(Object.hasOwn(entry, 'settings_value'));
        if (entry.settings_value_mode === 'inherit') assert.equal(entry.settings_value, null);
        bullets.push(`- **${entry.settings_human_read}:** ${entry.settings_description}`);
      }
      walk(node.children, depth + 1);
    }
  }
  walk(model.catalog.categories, 3);
  const markdown = fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8');
  const chapter = markdown.split('## 8. Hierarchical JSON structure\n')[1].split('\n## 9.')[0];
  assert.deepEqual(chapter.split('\n').filter(line => /^#{3,} /.test(line)), headings);
  assert.deepEqual(chapter.split('\n').filter(line => line.startsWith('- **')), bullets);
  for (const entry of model.entries) assert.ok(!markdown.includes(entry.settings_name), entry.settings_name);
});

test('nested color edits preserve siblings, theme overrides, and their input object', () => {
  const entry = item('workbench.colorCustomizations', ['editor.background']);
  const original = { 'editor.foreground': '#ffffff', '[My theme]': { 'editor.background': '#112233' } };
  const result = model.mergeEdit(original, entry, edit(entry, '#44556680'));
  assert.deepEqual(result, { ...original, 'editor.background': '#44556680' });
  assert.ok(!Object.hasOwn(original, 'editor.background'));
  assert.deepEqual(model.mergeEdit(result, entry, edit(entry, null, 'inherit')), original);
});

test('nested styles preserve shorthand colors and can clear styles explicitly', () => {
  const entry = item('editor.tokenColorCustomizations', ['comments', 'fontStyle']);
  const original = { comments: '#abc123', strings: { foreground: '#123456' } };
  const result = model.mergeEdit(original, entry, edit(entry, 'italic bold'));
  assert.deepEqual(result.comments, { foreground: '#abc123', fontStyle: 'italic bold' });
  assert.deepEqual(model.mergeEdit(result, entry, edit(entry, '', 'value')).comments, { foreground: '#abc123', fontStyle: '' });
  assert.deepEqual(model.mergeEdit(result, entry, edit(entry, null, 'inherit')).comments, { foreground: '#abc123' });
});

test('semantic colors preserve other rules and promote shorthand safely', () => {
  const entry = item('editor.semanticTokenColorCustomizations', ['rules', 'variable', 'foreground']);
  const original = { enabled: true, rules: { variable: '#123456', function: { bold: true } } };
  assert.equal(model.readPath(original, entry.settings_path), '#123456');
  const result = model.mergeEdit(original, entry, edit(entry, '#abcdef'));
  assert.deepEqual(result, { enabled: true, rules: { variable: { foreground: '#abcdef' }, function: { bold: true } } });
});

test('inheritance removes empty overrides and rejects incompatible nested shapes', () => {
  const entry = item('workbench.colorCustomizations', ['editor.background']);
  assert.equal(model.mergeEdit({ 'editor.background': '#ffffff' }, entry, edit(entry, null, 'inherit')), undefined);
  const style = item('editor.tokenColorCustomizations', ['comments', 'fontStyle']);
  assert.throws(() => model.mergeEdit({ comments: 42 }, style, edit(style, 'bold')), /incompatible/);
  assert.throws(() => model.mergeEdit([], entry, edit(entry, '#ffffff')), /not an object/);
});

test('validate colors, alpha, inheritance, booleans, enums, numeric bounds, styles, and fonts', () => {
  const color = item('workbench.colorCustomizations', ['editor.background']);
  model.validateEdit(edit(color, '#abcdef80'));
  model.validateEdit(edit(color, null, 'inherit'));
  assert.throws(() => model.validateEdit(edit(color, 'red')), /hexadecimal/);
  assert.throws(() => model.validateEdit(edit(color, '#fff')), /hexadecimal/);
  assert.throws(() => model.validateEdit(edit(color, '#ffffff', 'inherit')), /null/);
  assert.throws(() => model.validateEdit(edit(item('editor.fontSize'), 101)), /range/);
  assert.throws(() => model.validateEdit(edit(item('editor.fontSize'), NaN)), /finite/);
  assert.throws(() => model.validateEdit(edit(item('git.enabled'), 'true')), /boolean/);
  model.validateEdit(edit(item('git.autofetch'), 'all'));
  assert.throws(() => model.validateEdit(edit(item('editor.wordWrap'), 'invalid')), /supported/);
  assert.throws(() => model.validateEdit(edit(item('editor.fontFamily'), '')), /font/);
  assert.throws(() => model.validateEdit(edit(item('editor.fontWeight'), 'default')), /weight/);
  assert.throws(() => model.validateEdit(edit(item('editor.tokenColorCustomizations', ['comments', 'fontStyle']), 'oblique')), /styles|italic/);
  assert.throws(() => model.validateEdit({ id: 'unknown', mode: 'value', value: true }), /Unknown/);
});
