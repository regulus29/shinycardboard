import { useRef, type PointerEvent } from 'react';
import { CardImage } from '../../ui';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { REDUCED_MOTION_QUERY, TILT_MAX_DEG } from './constants';

interface CardArtProps {
  src: string;
  alt: string;
  rarity: string;
  foil: boolean;
}

/**
 * Large card art with a pointer-driven tilt and glare. Position is written straight to CSS custom
 * properties (no re-render per move). Disabled for reduced motion and non-mouse pointers.
 */
export function CardArt({ src, alt, rarity, foil }: CardArtProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useMediaQuery(REDUCED_MOTION_QUERY);

  const move = (event: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el || reduced || event.pointerType !== 'mouse') return;
    const box = el.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    el.style.setProperty('--tilt-x', `${((0.5 - y) * 2 * TILT_MAX_DEG).toFixed(2)}deg`);
    el.style.setProperty('--tilt-y', `${((x - 0.5) * 2 * TILT_MAX_DEG).toFixed(2)}deg`);
    el.style.setProperty('--glare-x', `${(x * 100).toFixed(1)}%`);
    el.style.setProperty('--glare-y', `${(y * 100).toFixed(1)}%`);
  };

  const rest = () => {
    const el = ref.current;
    if (!el) return;
    for (const name of ['--tilt-x', '--tilt-y', '--glare-x', '--glare-y']) el.style.removeProperty(name);
  };

  return (
    <div ref={ref} className="card-art" onPointerMove={move} onPointerLeave={rest}>
      <div className="card-art__inner">
        <CardImage src={src} alt={alt} rarity={rarity} foil={foil} priority />
        <span className="card-art__glare" aria-hidden="true" />
      </div>
    </div>
  );
}
