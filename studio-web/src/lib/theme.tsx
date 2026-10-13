import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

export type ColorScheme = 'dark' | 'light';

const STORAGE_KEY = 'lumen.colorScheme';

interface ThemeState {
  colorScheme: ColorScheme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeState>({ colorScheme: 'dark', toggle: () => {} });

function readStored(): ColorScheme {
  return localStorage.getItem(STORAGE_KEY) === 'light' ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readStored);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, colorScheme);
    document.documentElement.dataset.colorScheme = colorScheme;
  }, [colorScheme]);

  const toggle = useCallback(() => setColorScheme((c) => (c === 'dark' ? 'light' : 'dark')), []);
  return <ThemeContext.Provider value={{ colorScheme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  return useContext(ThemeContext);
}
