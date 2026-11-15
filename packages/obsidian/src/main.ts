import { Notice, Plugin } from 'obsidian';
import { NotebookView, VIEW_TYPE } from './view.ts';

export default class GanymedeNotebooksPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, leaf => new NotebookView(leaf));
    try {
      this.registerExtensions(['ipynb'], VIEW_TYPE);
    } catch (e) {
      console.error('Ganymede Notebooks: could not register .ipynb', e);
      new Notice('Ganymede Notebooks: another plugin already opens .ipynb files');
    }
  }
}
