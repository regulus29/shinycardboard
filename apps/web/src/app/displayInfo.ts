/** Readout of the display measurements, shown in Settings to troubleshoot layout on installed phone apps. */
export interface DisplayInfo {
  mode: string;
  window: string;
  visualViewport: string;
  screen: string;
  shell: string;
  safeTop: string;
  safeBottom: string;
}

const px = (value: number) => `${Math.round(value)}`;
const size = (w: number, h: number) => `${px(w)} x ${px(h)}`;

/** Resolve a CSS length (such as env(safe-area-inset-bottom)) to pixels with a throwaway element. */
function resolveLength(value: string): string {
  const probe = document.createElement('div');
  probe.style.cssText = `position:fixed;visibility:hidden;height:${value}`;
  document.body.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return px(height);
}

export function readDisplayInfo(): DisplayInfo {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const standalone = iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
  const viewport = window.visualViewport;
  const shell = document.querySelector('.shell')?.getBoundingClientRect();
  return {
    mode: standalone ? 'Installed app' : 'Browser tab',
    window: size(window.innerWidth, window.innerHeight),
    visualViewport: viewport ? size(viewport.width, viewport.height) : 'n/a',
    screen: size(window.screen.width, window.screen.height),
    shell: shell ? `${size(shell.width, shell.height)} at top ${px(shell.top)}` : 'n/a',
    safeTop: resolveLength('env(safe-area-inset-top, 0px)'),
    safeBottom: resolveLength('env(safe-area-inset-bottom, 0px)'),
  };
}
