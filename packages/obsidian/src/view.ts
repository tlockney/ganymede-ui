import {
  Component,
  FileSystemAdapter,
  FileView,
  MarkdownRenderer,
  Platform,
  TFile,
} from 'obsidian';
import type { TAbstractFile, WorkspaceLeaf } from 'obsidian';
import { NotebookError, parseNotebook } from './notebook.ts';
import { renderError, renderNotebook } from './render.ts';

export const VIEW_TYPE = 'ganymede-notebook';

export class NotebookView extends FileView {
  // Bumped on every render and unload so a slow render never lands after a
  // newer one or after the file was closed.
  private generation = 0;
  // Owns the Markdown renderer's child components for the current render.
  private current: Component | null = null;

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
        if (this.file && f.path === this.file.path && f instanceof TFile) void this.render(f);
      }),
    );
    // Only on macOS desktop, where Ganymede can read the vault's files; on
    // iPad and iPhone it can't see Obsidian's sandbox.
    if (Platform.isMacOS && Platform.isDesktopApp) {
      this.addAction('external-link', 'Open in Ganymede', () => this.openInGanymede());
    }
  }

  async onLoadFile(file: TFile): Promise<void> {
    await this.render(file);
  }

  async onUnloadFile(_file: TFile): Promise<void> {
    this.generation++;
    this.dropCurrent();
    this.contentEl.empty();
  }

  private openInGanymede(): void {
    const adapter = this.app.vault.adapter;
    if (!this.file || !(adapter instanceof FileSystemAdapter)) return;
    const path = adapter.getFullPath(this.file.path);
    window.open(`ganymede://open?path=${encodeURIComponent(path)}`);
  }

  private dropCurrent(): void {
    if (this.current) this.removeChild(this.current);
    this.current = null;
  }

  private async render(file: TFile): Promise<void> {
    const gen = ++this.generation;
    const root = this.contentEl;
    root.addClass('ganymede-nb-view');
    const comp = new Component();
    this.addChild(comp);
    try {
      const nb = parseNotebook(await this.app.vault.cachedRead(file));
      if (gen !== this.generation) {
        this.removeChild(comp);
        return;
      }
      // Render into a detached element so a newer render never interleaves.
      const staging = root.ownerDocument.createElement('div');
      await renderNotebook(nb, staging, (md, el) =>
        MarkdownRenderer.render(this.app, md, el, file.path, comp),
      );
      if (gen !== this.generation) {
        this.removeChild(comp);
        return;
      }
      root.replaceChildren(...Array.from(staging.childNodes));
      this.dropCurrent();
      this.current = comp;
    } catch (e) {
      if (gen !== this.generation) {
        this.removeChild(comp);
        return;
      }
      this.dropCurrent();
      this.removeChild(comp);
      const message =
        e instanceof NotebookError ? e.message : `Could not read the file: ${String(e)}`;
      renderError(root, message);
    }
  }
}
