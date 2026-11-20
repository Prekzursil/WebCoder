// [wave G item 98] Tablet detection for the classroom master-detail
// layout (and any future two-pane surface). 768dp is the canonical
// tablet breakpoint (Android sw600dp-adjacent, iPad class).
import { useWindowDimensions } from 'react-native';

export const TABLET_MIN_WIDTH = 768;

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= TABLET_MIN_WIDTH;
}
