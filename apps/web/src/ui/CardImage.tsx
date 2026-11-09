import { useEffect, useState } from 'react';
import { cx } from './cx';
import { Icon } from './Icon';
import { CARD_ASPECT } from '../config/constants';
import './display.css';

export interface CardImageProps {
  src: string | null | undefined;
  /** Card name; used as alt text and as the fallback caption. */
  alt: string;
  /** Subtle animated foil sheen over the art. */
  foil?: boolean;
  /** Load eagerly (above the fold, detail pages). Default is lazy. */
  priority?: boolean;
  /** Rarity key for the rarity glow, for example "epic". */
  rarity?: string;
  className?: string;
}

type LoadState = 'loading' | 'loaded' | 'failed';

/**
 * Card art at the fixed 744:1039 aspect ratio. Shows a skeleton while loading and a
 * styled placeholder if the image fails or the device is offline. Retries on reconnect.
 */
export function CardImage({ src, alt, foil = false, priority = false, rarity, className }: CardImageProps) {
  const [state, setState] = useState<LoadState>(src ? 'loading' : 'failed');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState(src ? 'loading' : 'failed');
  }, [src]);

  useEffect(() => {
    if (state !== 'failed' || !src) return;
    const retry = () => {
      setState('loading');
      setAttempt((n) => n + 1);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [state, src]);

  return (
    <div
      className={cx('ui-card-image', foil && 'is-foil', `is-${state}`, className)}
      data-rarity={rarity?.toLowerCase()}
      style={{ aspectRatio: `${CARD_ASPECT.width} / ${CARD_ASPECT.height}` }}
    >
      {state === 'loading' ? <span className="ui-skeleton ui-card-image__skeleton" aria-hidden="true" /> : null}
      {src && state !== 'failed' ? (
        <img
          key={attempt}
          src={src}
          alt={alt}
          width={CARD_ASPECT.width}
          height={CARD_ASPECT.height}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
        />
      ) : null}
      {state === 'failed' ? (
        <div className="ui-card-image__fallback" role="img" aria-label={`${alt} (art unavailable)`}>
          <Icon name="deck" size="1.75rem" />
          <span className="ui-card-image__caption">{alt}</span>
        </div>
      ) : null}
      {foil && state === 'loaded' ? <span className="ui-card-image__foil" aria-hidden="true" /> : null}
    </div>
  );
}
