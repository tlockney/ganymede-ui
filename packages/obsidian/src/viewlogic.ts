// The view's decisions, without Obsidian, so they can be tested.

/** Whether a vault `modify` event for `modifiedPath` concerns the open file. */
export function appliesTo(modifiedPath: string, currentPath: string | null | undefined): boolean {
  return !!currentPath && modifiedPath === currentPath;
}

/**
 * Whether to offer "Open in Ganymede": only on macOS desktop, where Ganymede
 * can read the vault's files. iPad reports isMacOS but is not the desktop
 * app, and on iPhone and iPad Ganymede can't see Obsidian's sandbox.
 */
export function offerOpenInGanymede(platform: {
  isMacOS: boolean;
  isDesktopApp: boolean;
}): boolean {
  return platform.isMacOS && platform.isDesktopApp;
}

export function ganymedeOpenUrl(fullPath: string): string {
  return `ganymede://open?path=${encodeURIComponent(fullPath)}`;
}

/**
 * Tokens for async renders: only the latest `begin()` is current, and
 * `invalidate()` (the file was closed) makes every token stale.
 */
export class RenderSequencer {
  private n = 0;

  begin(): number {
    return ++this.n;
  }

  isCurrent(token: number): boolean {
    return token === this.n;
  }

  invalidate(): void {
    this.n++;
  }
}
