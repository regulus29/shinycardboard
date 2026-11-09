/** The Shiny Cardboard logo mark: a tilted foil card. Flat fills follow the theme accent (no ids, so safe to repeat). */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="var(--bg-raised)" stroke="var(--border-strong)" />
      <g transform="rotate(10 16 16)">
        <rect x="9" y="5.5" width="14" height="21" rx="3" fill="var(--accent)" />
        <path d="M16 10.5l3.4 3.7-3.4 3.7-3.4-3.7z" fill="var(--on-accent)" opacity="0.8" />
      </g>
    </svg>
  );
}
