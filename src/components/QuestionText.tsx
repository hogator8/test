import type { ReactNode } from "react";

// Kanji run immediately followed by a (fullwidth or halfwidth) parenthesized
// reading, e.g. "学校(がっこう)" or "学校（がっこう）". Only converted to
// <ruby> when the bracket content is pure hiragana - "Test(1)" or a
// katakana/romaji gloss is left as plain text.
const FURIGANA_RE = /([一-鿿]+)[(（]([぀-ゟ]+)[)）]/g;

// Three or more consecutive underscores mark a fill-in-the-blank.
const BLANK_RE = /_{3,}/g;

type Segment = { type: "text"; value: string } | { type: "ruby"; kanji: string; kana: string };

function splitFurigana(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  const re = new RegExp(FURIGANA_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "ruby", kanji: match[1], kana: match[2] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

function renderTextWithBlanks(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let blankIdx = 0;
  const re = new RegExp(BLANK_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <span
        key={`${keyPrefix}-blank-${blankIdx++}`}
        className="mx-1 inline-block min-w-[3rem] border-b-4 border-orange-500 align-baseline"
      >
        &nbsp;
      </span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

/** Furigana conversion first, then fill-in-blank conversion, as specified. */
export function renderQuestionText(text: string): ReactNode[] {
  const segments = splitFurigana(text);
  const nodes: ReactNode[] = [];
  segments.forEach((seg, i) => {
    if (seg.type === "ruby") {
      nodes.push(
        <ruby key={`ruby-${i}`}>
          {seg.kanji}
          <rt style={{ fontSize: "60%" }}>{seg.kana}</rt>
        </ruby>
      );
    } else {
      nodes.push(...renderTextWithBlanks(seg.value, `seg-${i}`));
    }
  });
  return nodes;
}

export function QuestionText({ text, className }: { text: string; className?: string }) {
  return <span className={`font-kaisei notranslate ${className ?? ""}`}>{renderQuestionText(text)}</span>;
}
