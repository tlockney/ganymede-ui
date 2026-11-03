import { useEffect, useState } from 'react';

/**
 * Below 720px the sidebar floats over the notebook instead of beside it.
 * 720px itself is wide: it is the Mac window's minimum width, where the
 * traffic lights need the toolbar's padding. Keep in step with app.css.
 */
export const NARROW_QUERY = '(max-width: 719.98px)';

/** A touch screen: the cells get their own controls (#200). */
export const TOUCH_QUERY = '(hover: none), (pointer: coarse)';

/** Whether `query` matches, live (an iPad split view can cross a width). */
export function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Whether the window is phone-narrow, live. */
export function useNarrow(): boolean {
  return useMedia(NARROW_QUERY);
}
