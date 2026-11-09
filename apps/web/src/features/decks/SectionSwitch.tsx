import { ProgressBar, cx } from '../../ui';
import { SECTION_LABELS, SECTION_ORDER } from './constants';
import { useBuilder } from './builderContext';

/** Switches the active deck section. The card pool follows it. */
export function SectionSwitch() {
  const { completion, section, setSection } = useBuilder();
  return (
    <div className="dk-sections" role="group" aria-label="Deck section">
      {SECTION_ORDER.map((id) => {
        const status = completion.sections.find((s) => s.section === id);
        const count = status?.count ?? 0;
        const target = status?.target ?? 0;
        const active = id === section;
        return (
          <button key={id} type="button" className={cx('dk-sections__btn', active && 'is-active', status?.complete && 'is-complete')} aria-pressed={active} onClick={() => setSection(id)}>
            <span className="dk-sections__label">{SECTION_LABELS[id]}</span>
            <span className="dk-sections__count">{target > 0 ? `${count}/${target}` : count}</span>
            {target > 0 ? <ProgressBar value={Math.min(count, target)} max={target} label={`${SECTION_LABELS[id]} completion`} size="sm" tone={status?.complete ? 'success' : 'accent'} /> : null}
          </button>
        );
      })}
    </div>
  );
}
