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
      .replace(/(^|\n)\s*-\s*\[[xX]\]\s*/g, '$1✓ ')
      .replace(/(^|\n)\s*-\s*\[\s?\]\s*/g, '$1• ')
      // Mid-line markers → item separator (flattened multi-line paste).
      .replace(/\s+-\s*\[[xX]\]\s*/g, ' · ✓ ')
      .replace(/\s+-\s*\[\s?\]\s*/g, ' · ')
  );
}
