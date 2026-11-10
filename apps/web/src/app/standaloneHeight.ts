/**
 * iOS home screen apps can launch with a layout viewport shorter than the screen, leaving an empty band
 * under the tab bar until the window is nudged. The screen size is reliable, so in standalone mode the
 * shell takes it as its height through the --app-height variable.
 */
export const APP_HEIGHT_VAR = '--app-height';

interface ScreenSize {
  width: number;
  height: number;
}

/** Full screen height in the current orientation, from the fixed screen size. */
export function screenHeightFor(screen: ScreenSize, viewportWidth: number, viewportHeight: number): number {
  const long = Math.max(screen.width, screen.height);
  const short = Math.min(screen.width, screen.height);
  return viewportWidth <= viewportHeight ? long : short;
}

function isStandalone(): boolean {
  const iosFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosFlag || window.matchMedia('(display-mode: standalone)').matches;
}

/** Keep --app-height in step with the screen while the app runs as an installed app. */
export function watchStandaloneHeight(): void {
  if (!isStandalone()) return;
  const apply = () => document.documentElement.style.setProperty(APP_HEIGHT_VAR, `${screenHeightFor(window.screen, window.innerWidth, window.innerHeight)}px`);
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
