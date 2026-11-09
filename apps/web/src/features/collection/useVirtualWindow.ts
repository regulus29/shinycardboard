import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type RefObject } from 'react';
import { SCROLL_CONTAINER_ID } from './constants';
import { visibleRange, type VisibleRange } from './windowing';

/** Width assumed before the first measurement and under jsdom, which has no layout. */
export const FALLBACK_WIDTH = 1024;

/** Content width of an element, kept live with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => setWidth(el.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

export function getScroller(): HTMLElement | null {
  return document.getElementById(SCROLL_CONTAINER_ID);
}

interface WindowView {
  /** Scroll position relative to the top of the list (negative while the list is below the fold). */
  top: number;
  height: number;
}

export interface VirtualWindow {
  range: VisibleRange;
  /** Scroll the main container so the item at `offset` (list coordinates) is in view. */
  revealOffset: (offset: number, itemHeight: number) => void;
}

/**
 * Virtualization against the shell's scrolling `main` element. The list is a normal block whose
 * total height comes from `offsets`; only items inside the viewport plus `overscan` render.
 */
export function useVirtualWindow(listRef: RefObject<HTMLElement | null>, offsets: readonly number[], overscan: number, onScroll?: (scrollTop: number) => void): VirtualWindow {
  const [view, setView] = useState<WindowView>({ top: 0, height: 0 });

  useEffect(() => {
    const scroller = getScroller();
    const list = listRef.current;
    if (!scroller || !list) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      setView((prev) => (prev.top === -listTop && prev.height === scroller.clientHeight ? prev : { top: -listTop, height: scroller.clientHeight }));
      onScroll?.(scroller.scrollTop);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [listRef, onScroll, offsets]);

  const range = useMemo(() => visibleRange(offsets, view.top, view.height, overscan), [offsets, view, overscan]);

  const revealOffset = useCallback(
    (offset: number, itemHeight: number) => {
      const scroller = getScroller();
      const list = listRef.current;
      if (!scroller || !list) return;
      const listTop = list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      const itemTop = listTop + offset;
      const viewTop = scroller.scrollTop;
      const viewBottom = viewTop + scroller.clientHeight;
      if (itemTop < viewTop) scroller.scrollTop = itemTop;
      else if (itemTop + itemHeight > viewBottom) scroller.scrollTop = itemTop + itemHeight - scroller.clientHeight;
    },
    [listRef],
  );

  return { range, revealOffset };
}
