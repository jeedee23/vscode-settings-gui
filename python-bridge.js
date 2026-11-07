'use strict';

const fs = require('node:fs');
const model = require('./catalog-model');

try {
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (request.action === 'metadata') {
    process.stdout.write(JSON.stringify({
      catalog: model.catalog, options: model.options, ranges: model.ranges
    }));
  } else if (request.action === 'validate' || request.action === 'export') {
    if (!Array.isArray(request.edits)) throw new Error('Edits must be an array.');
    const ids = new Set();
    const settings = {};
    const removals = [];
    for (const edit of request.edits) {
      const item = model.validateEdit(edit);
      if (ids.has(edit.id)) throw new Error('Duplicate setting identity.');
      ids.add(edit.id);
      if (edit.mode === 'inherit') {
        removals.push({ settings_name: item.settings_name, settings_path: item.settings_path || [] });
      }
      const value = model.mergeEdit(settings[item.settings_name], item, edit);
      if (value === undefined) delete settings[item.settings_name];
      else settings[item.settings_name] = value;
    }
    process.stdout.write(JSON.stringify({ settings, removals }));
  } else {
    throw new Error('Unknown bridge action.');
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
