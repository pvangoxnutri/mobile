import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import type { AppTheme } from '@/constants/themes';

// ──────────────────────────────────────────────────────────────────────────
// GLUNO — the renderer for Gluno's answers.
//
// A travel expert answers with structure: a short lead, then a numbered plan,
// then a caveat. Rendering that as one flat paragraph makes it unreadable on a
// phone, and rendering the raw source makes it look broken ("**Day 2**" is not
// something a person should ever see).
//
// So this is a deliberately SMALL Markdown subset — headings, bullets,
// numbered lists, bold/italic, inline and fenced code — chosen to match what a
// chat answer actually uses. Not a Markdown library: links, tables, images and
// nested lists are intentionally absent, and anything unrecognised falls
// through as plain text rather than failing.
//
// Two rules it must never break:
//   • no syntax reaches the screen — every marker is consumed or left as
//     literal text, never rendered as decoration
//   • no input can crash the chat — every parser here is linear and total
// ──────────────────────────────────────────────────────────────────────────

type Segment = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; segments: Segment[] }
  | { type: 'paragraph'; segments: Segment[] }
  | { type: 'bullet'; segments: Segment[] }
  | { type: 'numbered'; marker: string; segments: Segment[] }
  | { type: 'code'; text: string };

// Bold before italic, so "**x**" is never read as an italic "*" wrapping "*x*".
// Every alternative is non-greedy and anchored on a closing marker, so an
// unmatched "*" simply doesn't match and stays literal.
const INLINE_PATTERN = /(\*\*|__)(.+?)\1|`([^`]+)`|(\*|_)(?!\s)(.+?)\4/;

function parseInline(input: string): Segment[] {
  const segments: Segment[] = [];
  let rest = input;

  // Bounded: every iteration consumes at least one character of `rest`.
  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest);
    if (!match) {
      segments.push({ text: rest });
      break;
    }

    if (match.index > 0) segments.push({ text: rest.slice(0, match.index) });

    if (match[2] !== undefined) segments.push({ text: match[2], bold: true });
    else if (match[3] !== undefined) segments.push({ text: match[3], code: true });
    else if (match[5] !== undefined) segments.push({ text: match[5], italic: true });

    rest = rest.slice(match.index + match[0].length);
  }

  return segments.filter((segment) => segment.text.length > 0);
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s{0,3}[-*•]\s+(.*)$/;
const NUMBERED = /^\s{0,3}(\d{1,2})[.)]\s+(.*)$/;
const FENCE = /^\s*```/;

export function parseGlunoMarkup(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = input.replace(/\r\n/g, '\n').split('\n');

  // Consecutive plain lines belong to one paragraph — a hard wrap in the
  // model's output is not a new paragraph, and treating it as one produces a
  // ragged wall of one-line blocks.
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ type: 'paragraph', segments: parseInline(paragraph.join(' ').trim()) });
    paragraph = [];
  };

  let fenced: string[] | null = null;

  for (const line of lines) {
    if (FENCE.test(line)) {
      if (fenced === null) {
        flushParagraph();
        fenced = [];
      } else {
        blocks.push({ type: 'code', text: fenced.join('\n') });
        fenced = null;
      }
      continue;
    }

    if (fenced !== null) {
      fenced.push(line);
      continue;
    }

    if (line.trim().length === 0) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3;
      blocks.push({ type: 'heading', level, segments: parseInline(heading[2].trim()) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
      flushParagraph();
      blocks.push({ type: 'bullet', segments: parseInline(bullet[1].trim()) });
      continue;
    }

    const numbered = NUMBERED.exec(line);
    if (numbered) {
      flushParagraph();
      blocks.push({ type: 'numbered', marker: `${numbered[1]}.`, segments: parseInline(numbered[2].trim()) });
      continue;
    }

    // A stray blockquote marker is content, not structure — strip the marker
    // rather than showing it.
    paragraph.push(line.replace(/^\s{0,3}>\s?/, ''));
  }

  // An unterminated fence still has to render; dropping it would silently lose
  // the end of an answer.
  if (fenced !== null && fenced.length > 0) blocks.push({ type: 'code', text: fenced.join('\n') });
  flushParagraph();

  return blocks;
}

function renderSegments(segments: Segment[], styles: ReturnType<typeof createStyles>) {
  return segments.map((segment, index) => (
    <Text
      key={index}
      style={[
        segment.bold && styles.bold,
        segment.italic && styles.italic,
        segment.code && styles.inlineCode,
      ]}>
      {segment.text}
    </Text>
  ));
}

export default function GlunoRichText({ text }: { text: string }) {
  const styles = useThemedStyles(createStyles);
  const blocks = useMemo(() => parseGlunoMarkup(text), [text]);

  if (blocks.length === 0) return null;

  return (
    <View style={styles.container}>
      {blocks.map((block, index) => {
        const spacing = index === 0 ? styles.firstBlock : styles.block;

        switch (block.type) {
          case 'heading':
            return (
              <Text
                key={index}
                style={[
                  spacing,
                  styles.heading,
                  block.level === 1 && styles.heading1,
                  block.level === 3 && styles.heading3,
                ]}>
                {renderSegments(block.segments, styles)}
              </Text>
            );

          case 'bullet':
          case 'numbered':
            return (
              <View key={index} style={[spacing, styles.listRow]}>
                <Text style={[styles.body, styles.listMarker]}>
                  {block.type === 'bullet' ? '•' : block.marker}
                </Text>
                <Text style={[styles.body, styles.listBody]}>
                  {renderSegments(block.segments, styles)}
                </Text>
              </View>
            );

          case 'code':
            return (
              <View key={index} style={[spacing, styles.codeBlock]}>
                <Text style={styles.codeText}>{block.text}</Text>
              </View>
            );

          default:
            return (
              <Text key={index} style={[spacing, styles.body]}>
                {renderSegments(block.segments, styles)}
              </Text>
            );
        }
      })}
    </View>
  );
}

const createStyles = (theme: AppTheme) => StyleSheet.create({
  container: {
    width: '100%',
  },
  firstBlock: {
    marginTop: 0,
  },
  block: {
    marginTop: 10,
  },
  body: {
    fontSize: 15,
    // Generous for a chat: these answers are read, not skimmed.
    lineHeight: 22,
    color: theme.colors.textPrimary,
  },
  bold: {
    fontWeight: '800',
  },
  italic: {
    fontStyle: 'italic',
  },
  heading: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    color: theme.colors.textPrimary,
  },
  heading1: {
    fontSize: 17,
    lineHeight: 23,
  },
  heading3: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listMarker: {
    // Fixed width so wrapped list text lines up under itself rather than under
    // the marker.
    minWidth: 18,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  listBody: {
    flex: 1,
  },
  inlineCode: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  codeBlock: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: theme.colors.bgLight,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.textSecondary,
  },
});
