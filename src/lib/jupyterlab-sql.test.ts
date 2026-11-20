import '../test/notebook-env';
import { describe, expect, it } from 'vitest';
import { MimeModel } from '@jupyterlab/rendermime';

// SQL highlighting (#708) through the app's own language registry, as
// rendered Markdown and the cell editors get it from `jupyterlab.ts`.

const { createStaticRendermime } = await import('./jupyterlab');

async function renderMarkdown(source: string): Promise<HTMLElement> {
  const renderer = createStaticRendermime().createRenderer('text/markdown');
  document.body.appendChild(renderer.node);
  await renderer.renderModel(new MimeModel({ data: { 'text/markdown': source } }));
  return renderer.node;
}

/** The text of every highlighted span in the fenced block. */
const spans = (node: HTMLElement) =>
  [...node.querySelectorAll('pre code span')].map(s => s.textContent);

describe('SQL in rendered Markdown', () => {
  it('highlights a duckdb fence as DuckDB SQL', async () => {
    const node = await renderMarkdown('```duckdb\nselect 1 qualify true\n```');
    expect(spans(node)).toEqual(expect.arrayContaining(['select', 'qualify']));
    node.remove();
  });

  it('highlights SQL inside a sql template in a ts fence', async () => {
    const node = await renderMarkdown('```ts\nawait jupyter.sql`select n from t`;\n```');
    expect(spans(node)).toEqual(expect.arrayContaining(['select', 'from']));
    node.remove();
  });

  it('leaves other templates in a ts fence as one string', async () => {
    const node = await renderMarkdown('```ts\njupyter.md`select n from t`;\n```');
    expect(spans(node)).not.toContain('select');
    node.remove();
  });
});
