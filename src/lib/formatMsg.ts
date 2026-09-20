/** Replaces {key} placeholders in a template string with values from vars. */
export function formatMsg(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
}
