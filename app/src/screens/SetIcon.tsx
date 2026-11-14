import { SvgXml } from 'react-native-svg';

/** A set's symbol, drawn from the SVG text in the phone database; nothing when the set has none. */
export function SetIcon({ svg, size, color }: { svg: string | null; size: number; color: string }) {
  if (svg === null) return null;
  return <SvgXml xml={svg} width={size} height={size} fill={color} />;
}
