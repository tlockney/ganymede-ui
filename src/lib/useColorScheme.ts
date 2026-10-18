import { useEffect, useState } from 'react';

export type Scheme = 'light' | 'dark';

const query = () => window.matchMedia('(prefers-color-scheme: dark)');

/** The system appearance, live. */
export function useColorScheme(): Scheme {
  const [scheme, setScheme] = useState<Scheme>(() =>
    query().matches ? 'dark' : 'light',
  );
  useEffect(() => {
    const mq = query();
    const onChange = () => setScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return scheme;
}
