import { Fragment, type ReactNode } from 'react';

/**
 * Bezpečné zobrazení jednoduchého Markdownu (právní texty provozovny): nadpisy, odstavce, seznamy,
 * citace, tabulky, oddělovač, tučné/kurzíva/kód a odkazy (jen https a mailto). Žádné HTML se nevkládá –
 * vše jsou React prvky, takže text od provozovny nemůže spustit skript.
 */

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'ul' | 'ol'; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'table'; head: string[]; rows: string[][] }
  | { kind: 'hr' };

const isTableRow = (l: string): boolean => /^\s*\|.*\|\s*$/.test(l);
const cells = (l: string): string[] =>
  l
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length, text: h[2].trim() });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: 'hr' });
      i++;
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ kind: 'table', head, rows });
      continue;
    }
    if (/^\s*>/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) parts.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push({ kind: 'quote', text: parts.join('\n') });
      continue;
    }
    const ul = /^\s*[-*+]\s+/;
    const ol = /^\s*\d+[.)]\s+/;
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line);
      const re = ordered ? ol : ul;
      const items: string[] = [];
      while (i < lines.length && (re.test(lines[i]) || (/^\s{2,}\S/.test(lines[i]) && items.length))) {
        if (re.test(lines[i])) items.push(lines[i].replace(re, ''));
        else items[items.length - 1] += ' ' + lines[i].trim();
        i++;
      }
      blocks.push({ kind: ordered ? 'ol' : 'ul', items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i]) && !/^\s*>/.test(lines[i]) && !ul.test(lines[i]) && !ol.test(lines[i]) && !isTableRow(lines[i])) {
      para.push(lines[i++].trim());
    }
    blocks.push({ kind: 'p', text: para.join(' ') });
  }
  return blocks;
}

/** Řádkové formátování: **tučně**, *kurzíva*, `kód`, [odkaz](https://…). */
function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = key;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(<strong key={k++}>{inline(tok.slice(2, -2), k * 100)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok);
      const href = lm?.[2] ?? '';
      if (lm && /^(https:\/\/|mailto:)/i.test(href))
        out.push(
          <a key={k++} href={href} target="_blank" rel="noreferrer noopener">
            {lm[1]}
          </a>,
        );
      else out.push(lm?.[1] ?? tok);
    } else out.push(<em key={k++}>{inline(tok.slice(1, -1), k * 100)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, className }: { text: string; className?: string }): JSX.Element {
  const blocks = parseMarkdown(text);
  return (
    <div className={className ?? 'md'}>
      {blocks.map((b, i) => {
        switch (b.kind) {
          case 'h': {
            const level = Math.min(6, b.level + 1);
            const Tag = `h${level}` as 'h2';
            return <Tag key={i}>{inline(b.text)}</Tag>;
          }
          case 'p':
            return <p key={i}>{inline(b.text)}</p>;
          case 'ul':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={i}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it)}</li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={i}>
                {b.text.split('\n').map((l, j) => (
                  <Fragment key={j}>
                    {inline(l)}
                    <br />
                  </Fragment>
                ))}
              </blockquote>
            );
          case 'table':
            return (
              <div key={i} className="md__table">
                <table>
                  <thead>
                    <tr>
                      {b.head.map((h, j) => (
                        <th key={j} scope="col">
                          {inline(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, x) => (
                          <td key={x}>{inline(c)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <hr key={i} />;
        }
      })}
    </div>
  );
}
