import { useEffect, useState } from 'react';

/** Below this width the sidebar floats over the notebook instead of beside it. */
export const NARROW_QUERY = '(max-width: 720px)';

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
