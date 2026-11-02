import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFieldsCsv, getPageFromContext, getProjectKey, getProjectName } from '../src/frontend/utils.js';

test('maps nested admin entry points to their UI Kit page', () => {
  assert.equal(getPageFromContext({ extension: { entryPoint: 'workflow-migrator-fields' } }), 'fields');
  assert.equal(getPageFromContext({ extension: { entryPoint: 'workflow-migrator-list-workflows' } }), 'workflows');
  assert.equal(getPageFromContext({ extension: { entryPoint: 'workflow-migrator-configuration' } }), 'configuration');
  assert.equal(getPageFromContext(), 'configuration');
});

test('builds valid CSV without changing field values', () => {
  const csv = buildFieldsCsv([{
    name: 'Champ, "important"',
    type: 'array - option',
    idSource: 'customfield_10001',
    idTarget: null,
  }]);

  assert.equal(
    csv,
    'Nom du champ,Type du champ,ID Source,ID Target\n"Champ, ""important""",array - option,customfield_10001,',
  );
});

test('normalizes Jira project shapes', () => {
  assert.equal(getProjectKey({ projectKey: 'DEMO' }), 'DEMO');
  assert.equal(getProjectName({ projectName: 'Démonstration', projectKey: 'DEMO' }), 'Démonstration');
});
