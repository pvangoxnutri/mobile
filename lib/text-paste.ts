// Apple Notes copies checklists to the clipboard as markdown-ish task lines
// ("- [ ] Buy sunscreen" / "- [x] Book hotel"). Pasted into the app that
// reads as raw markup, so free-text inputs normalize the markers instead:
// at line starts they become clean bullets/checks, and markers that ended up
// mid-line (single-line inputs flatten pasted newlines to spaces) become
// separators. Typing plain text is untouched — the fast path bails unless a
// checklist marker is actually present.
export function stripNotesChecklistMarkers(text: string): string {
  if (!text.includes('- [') && !text.includes('-[')) return text;
  return (
    text
      .replace(/\r\n?/g, '\n')
      .replace(/(^|\n)\s*-\s*\[[xX]\]\s*/g, '$1✓ ')
      .replace(/(^|\n)\s*-\s*\[\s?\]\s*/g, '$1• ')
      // Mid-line markers → item separator (flattened multi-line paste).
      // No required whitespace before the dash: single-line inputs can
      // concatenate pasted lines with nothing in between ("Test 1- [ ] ...").
      .replace(/\s*-\s*\[[xX]\]\s*/g, ' · ✓ ')
      .replace(/\s*-\s*\[\s?\]\s*/g, ' · ')
  );
}

// For list-shaped inputs (one entity per row, like packing-list items): break
// a paste into its individual entries — one per line or per checklist marker,
// with the bullet/check prefixes removed since the row brings its own
// checkbox. A single-entry result means "not a list paste": callers should
// treat the text as ordinary typing.
export function splitPastedChecklistItems(text: string): string[] {
  return stripNotesChecklistMarkers(text)
    .split(/\n|\s·\s/)
    .map((part) => part.replace(/^\s*[•✓]\s*/, '').trim())
    .filter(Boolean);
}
