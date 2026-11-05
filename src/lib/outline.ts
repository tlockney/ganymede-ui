/**
 * The notebook's outline (#212): the headings of its Markdown cells, in
 * order, each with the index of the cell it is in. The web sidebar and
 * the Mac app's Outline tab show it; picking one scrolls to its cell.
 */

/** One heading: its level (1–6), its text and its cell's index. */
export type OutlineItem = { level: number; text: string; cell: number };

/** What `outlineOf` reads from each cell. */
export type OutlineCell = { type: string; source: string };

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const ATX = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const SETEXT = /^ {0,3}(=+|-+)[ \t]*$/;
const HTML_HEADING = /^\s*<h([1-6])\b[^>]*>(.*?)<\/h\1>/i;

/**
 * Heading text without Markdown: links and images keep their text,
 * emphasis and code marks go, HTML tags go, entities for `&`, `<`, `>`
 * and quotes are decoded, and runs of spaces become one.
 */
export function plainText(markdown: string): string {
  // Escaped marks are kept aside (as private-use characters) while the
  // marks around them go.
  const kept: string[] = [];
  return (
    markdown
      .replace(/\\([\\`*_{}[\]()#+\-.!~<>])/g, (_, c: string) => {
        kept.push(c);
        return String.fromCharCode(0xe000 + kept.length - 1);
      })
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1')
      .replace(/<[^>]+>/g, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      // Underscores mark emphasis only at word edges: snake_case stays.
      .replace(/(^|[^\p{L}\p{N}_])__(.+?)__(?![\p{L}\p{N}_])/gu, '$1$2')
      .replace(/(^|[^\p{L}\p{N}_])_(.+?)_(?![\p{L}\p{N}_])/gu, '$1$2')
      .replace(/~~(.+?)~~/g, '$1')
      .replace(/`+([^`]*)`+/g, '$1')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .replace(/[\ue000-\uf8ff]/g, c => kept[c.charCodeAt(0) - 0xe000] ?? '')
      .trim()
  );
}

/** The headings in one Markdown source, outside fenced code. Pure. */
export function headingsOf(source: string): { level: number; text: string }[] {
  const found: { level: number; text: string }[] = [];
  let fence: string | undefined;
  // The previous line, when it could be a setext heading's text.
  let paragraph: string | undefined;
  for (const line of source.split(/\r?\n/)) {
    const opens = FENCE.exec(line);
    if (fence) {
      if (opens && opens[1][0] === fence[0] && opens[1].length >= fence.length) fence = undefined;
      continue;
    }
    if (opens) {
      fence = opens[1];
      paragraph = undefined;
      continue;
    }
    const atx = ATX.exec(line);
    if (atx) {
      const text = plainText(atx[2] ?? '');
      if (text) found.push({ level: atx[1].length, text });
      paragraph = undefined;
      continue;
    }
    const html = HTML_HEADING.exec(line);
    if (html) {
      const text = plainText(html[2]);
      if (text) found.push({ level: Number(html[1]), text });
      paragraph = undefined;
      continue;
    }
    const setext = SETEXT.exec(line);
    if (setext && paragraph !== undefined) {
      const text = plainText(paragraph);
      if (text) found.push({ level: setext[1][0] === '=' ? 1 : 2, text });
      paragraph = undefined;
      continue;
    }
    // A setext heading's text is one line here: the line just before.
    const blank = !line.trim();
    paragraph = blank || /^ {4,}|^\t/.test(line) ? undefined : line;
  }
  return found;
}

/** The outline of a notebook's cells: Markdown cells' headings, in order. Pure. */
export function outlineOf(cells: Iterable<OutlineCell>): OutlineItem[] {
  const items: OutlineItem[] = [];
  let index = 0;
  for (const cell of cells) {
    if (cell.type === 'markdown') {
      for (const heading of headingsOf(cell.source)) items.push({ ...heading, cell: index });
    }
    index++;
  }
  return items;
}
