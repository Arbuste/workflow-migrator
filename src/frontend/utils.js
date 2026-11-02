// UI Kit does not expose the browser URL to the application, so nested admin
// pages are identified from the entry point supplied in the Forge context.
export function getPageFromContext(context) {
  const extension = context?.extension || {};
  const entryPoint = `${extension.entryPoint || ''} ${extension.route || ''}`.toLowerCase();

  // Check the specific nested route before "workflow": the application key
  // itself contains that word on every page.
  if (entryPoint.includes('field')) return 'fields';
  if (entryPoint.includes('list-workflows') || entryPoint.includes('/workflows')) return 'workflows';
  return 'configuration';
}

export function getProjectKey(project = {}) {
  return project.key || project.projectKey || project.projectId || project.id || '';
}

export function getProjectName(project = {}) {
  return project.name || project.projectName || getProjectKey(project);
}

function escapeCsvCell(value) {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Keeping CSV generation independent from the renderer makes the output easy
// to verify and preserves the exact field data returned by the resolver.
export function buildFieldsCsv(fields = []) {
  const header = ['Nom du champ', 'Type du champ', 'ID Source', 'ID Target'];
  const lines = fields.map((field) => [
    field.name,
    field.type,
    field.idSource,
    field.idTarget,
  ].map(escapeCsvCell).join(','));

  return [header.join(','), ...lines].join('\n');
}
