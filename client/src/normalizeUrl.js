/** Lets people type "example.com" instead of "https://example.com". */
export function normalizeUrl(input) {
  const value = input.trim();
  if (!value || /^[a-z][a-z\d+.-]*:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}
