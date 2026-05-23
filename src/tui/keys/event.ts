/** The subset of opentui's keypress event our handlers read. */
export interface KeyEvent {
  name: string;
  ctrl?: boolean;
  shift?: boolean;
  sequence?: string;
  preventDefault?: () => void;
}
