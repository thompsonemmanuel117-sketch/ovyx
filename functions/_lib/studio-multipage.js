export function example(value) {
  return String(value || '').replace(/^\/+/, '').replace(/\\/g, '/');
}
