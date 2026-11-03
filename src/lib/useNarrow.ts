import { useEffect, useState } from 'react';

/**
 * Below 720px the sidebar floats over the notebook instead of beside it.
 * 720px itself is wide: it is the Mac window's minimum width, where the
 * traffic lights need the toolbar's padding. Keep in step with app.css.
 */
export const NARROW_QUERY = '(max-width: 719.98px)';

/** Whether the window is phone-narrow, live (an iPad split view can cross it). */
export function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}
