const SNIPPET_RADIUS = 120;

/**
 * Long paragraphs are cut down to the part around the match so the results
 * list stays readable.
 */
export function toSnippet(line, matchIndex, matchLength, radius = SNIPPET_RADIUS) {
  if (line.length <= radius * 2 + matchLength) {
    return line;
  }

  const start = Math.max(0, matchIndex - radius);
  const end = Math.min(line.length, matchIndex + matchLength + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < line.length ? "…" : "";

  return `${prefix}${line.slice(start, end).trim()}${suffix}`;
}

/**
 * Returns the lines that contain `keyword` (case-insensitive) and are not in
 * `seen` yet. Adds them to `seen`. Stops once `seen` reaches `limit`.
 */
export function findNewMatches(lines, keyword, seen, limit = Infinity) {
  const needle = keyword.toLowerCase();
  const fresh = [];

  for (const rawLine of lines) {
    if (seen.size >= limit) {
      break;
    }

    const line = rawLine.replace(/\s+/g, " ").trim();
    const index = line.toLowerCase().indexOf(needle);
    if (index === -1) {
      continue;
    }

    const snippet = toSnippet(line, index, needle.length);
    if (!seen.has(snippet)) {
      seen.add(snippet);
      fresh.push(snippet);
    }
  }

  return fresh;
}
