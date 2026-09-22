export function fillTemplate(template: string, vars: { code: string; instruction: string }): string {
  let result = template;
  // Replace {{code}} safely escaped for JSON if inside string
  const escapedCode = JSON.stringify(vars.code).slice(1, -1);
  const escapedInstruction = JSON.stringify(vars.instruction).slice(1, -1);

  result = result.replace(/\{\{code\}\}/g, escapedCode);
  result = result.replace(/\{\{instruction\}\}/g, escapedInstruction);
  return result;
}

export function getByPath(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const normalized = path.replace(/\[(\w+)\]/g, '.$1');
  const parts = normalized.split('.');
  let curr = obj;
  for (const part of parts) {
    if (curr === undefined || curr === null) return undefined;
    curr = curr[part];
  }
  return curr;
}
