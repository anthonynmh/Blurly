export const isWindows = (): boolean =>
  typeof navigator !== 'undefined' && /Windows/i.test(navigator.userAgent);
