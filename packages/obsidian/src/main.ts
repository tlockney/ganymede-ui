import { Plugin } from 'obsidian';
import { NotebookView, VIEW_TYPE } from './view.ts';

export default class GanymedeNotebooksPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(VIEW_TYPE, leaf => new NotebookView(leaf));
    this.registerExtensions(['ipynb'], VIEW_TYPE);
  }
}
