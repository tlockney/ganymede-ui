import { FileSystemAdapter, FileView, loadPrism, Platform, TFile } from 'obsidian';
import type { TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { NotebookError, parseNotebook } from './notebook.ts';
import { applyOpen, captureOpen, renderError, renderNotebook } from './render.ts';
import type { Highlight } from './render.ts';
import { appliesTo, ganymedeOpenUrl, offerOpenInGanymede, RenderSequencer } from './viewlogic.ts';

export const VIEW_TYPE = 'ganymede-notebook';

interface PrismLike {
  languages: Record<string, unknown>;
  highlightElement(el: Element): void;
}

/** Obsidian's Prism, or null: code then shows as plain text. */
async function prismHighlighter(): Promise<Highlight | undefined> {
  try {
    const prism = (await loadPrism()) as PrismLike | undefined;
    if (!prism?.languages || typeof prism.highlightElement !== 'function') return undefined;
    return (code, lang) => {
      if (prism.languages[lang]) prism.highlightElement(code);
    };
  } catch (e) {
    console.warn('Ganymede Notebooks: Prism unavailable, showing code unhighlighted', e);
    return undefined;
  }
}

export class NotebookView extends FileView {
  // A slow render never lands after a newer one or after the file closed.
  private readonly renders = new RenderSequencer();

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.navigation = true;
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file?.basename ?? 'Notebook';
  }

  getIcon(): string {
    return 'file-code';
  }

  canAcceptExtension(extension: string): boolean {
    return extension === 'ipynb';
  }

  onload(): void {
    super.onload();
    // Changes from Obsidian Sync arrive as vault modify events.
    this.registerEvent(
      this.app.vault.on('modify', (f: TAbstractFile) => {
        if (appliesTo(f.path, this.file?.path) && f instanceof TFile) void this.render(f);
      }),
    );
    this.addAction('code', 'Show/hide all code', () => this.toggleCode());
    // Only on macOS desktop, where Ganymede can read the vault's files; on
    // iPad and iPhone it can't see Obsidian's sandbox.
    if (offerOpenInGanymede(Platform)) {
      this.addAction('external-link', 'Open in Ganymede', () => this.openInGanymede());
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.render(file);
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.renders.invalidate();
    this.contentEl.empty();
  }

  private toggleCode(): void {
    const all = Array.from(this.contentEl.querySelectorAll('details.ganymede-nb-code'));
    const open = all.some(d => !d.hasAttribute('open'));
    for (const d of all) d.toggleAttribute('open', open);
  }

  private openInGanymede(): void {
    const adapter = this.app.vault.adapter;
    if (!this.file || !(adapter instanceof FileSystemAdapter)) return;
    window.open(ganymedeOpenUrl(adapter.getFullPath(this.file.path)));
  }

  private async render(file: TFile): Promise<void> {
    const token = this.renders.begin();
    const root = this.contentEl;
    root.addClass('ganymede-nb-view');
    try {
      const [text, highlight] = await Promise.all([
        this.app.vault.cachedRead(file),
        prismHighlighter(),
      ]);
      if (!this.renders.isCurrent(token)) return;
      const nb = parseNotebook(text);
      // Render into a detached element so a newer render never interleaves.
      const staging = root.ownerDocument.createElement('div');
      renderNotebook(nb, staging, highlight);
      // Keep the code cells the reader expanded.
      applyOpen(staging, captureOpen(root));
      // "Readable line length" is a vault setting that isn't in the public typings.
      const getConfig = (this.app.vault as unknown as { getConfig?: (k: string) => unknown })
        .getConfig;
      const readable = getConfig?.call(this.app.vault, 'readableLineLength') === true;
      staging.firstElementChild?.classList.toggle('is-readable-line-width', readable);
      root.replaceChildren(...Array.from(staging.childNodes));
    } catch (e) {
      if (!this.renders.isCurrent(token)) return;
      const message =
        e instanceof NotebookError ? e.message : `Could not read the file: ${String(e)}`;
      renderError(root, message);
    }
  }
}
