import { useColorScheme } from 'react-native';

export interface Theme {
  bg: string;
  panel: string;
  rowOpen: string;
  text: string;
  muted: string;
  border: string;
  divider: string;
  greyPanelBorder: string;
  /** Full alert border and chip. */
  accent: string;
  onAccent: string;
  /** Quiet outline and label. */
  quiet: string;
  link: string;
  lookAlikeText: string;
  lookAlikeBg: string;
  lookAlikeBorder: string;
  camera: string;
}

export const DARK: Theme = {
  bg: '#0f1012',
  panel: '#1a1c20',
  rowOpen: '#212328',
  text: '#f2f2f0',
  muted: '#a9adb3',
  border: '#3a3e45',
  divider: '#2c2f35',
  greyPanelBorder: '#33363c',
  accent: '#ff9f43',
  onAccent: '#1a1206',
  quiet: '#e5a50a',
  link: '#ffb469',
  lookAlikeText: '#ffd0a1',
  lookAlikeBg: '#2a2219',
  lookAlikeBorder: '#4a3a28',
  camera: '#24262a',
};

export const LIGHT: Theme = {
  bg: '#f6f6f4',
  panel: '#ffffff',
  rowOpen: '#f0f0ee',
  text: '#141516',
  muted: '#5c6168',
  border: '#c4c8cd',
  divider: '#e2e4e7',
  greyPanelBorder: '#c4c8cd',
  accent: '#aa5d0e',
  onAccent: '#ffffff',
  quiet: '#9b6600',
  link: '#b15900',
  lookAlikeText: '#6b3a00',
  lookAlikeBg: '#fff3e6',
  lookAlikeBorder: '#f0c999',
  camera: '#24262a',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}
