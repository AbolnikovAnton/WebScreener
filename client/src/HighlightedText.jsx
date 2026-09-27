import { Fragment } from "react";

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wraps every case-insensitive occurrence of `query` in <mark>, keeping the
 * original spelling from the page ("React", "REACT"…).
 */
export function HighlightedText({ text, query }) {
  if (!query) {
    return text;
  }

  // With a capturing group, split() keeps the matches at odd indexes.
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, "gi"));

  return parts.map((part, index) =>
    index % 2 === 1 ? <mark key={index}>{part}</mark> : <Fragment key={index}>{part}</Fragment>,
  );
}
