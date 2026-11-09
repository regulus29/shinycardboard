import { Badge, Button, Icon } from '../../ui';
import { issueFix, type IssueFix } from './assistModel';
import { useBuilder } from './builderContext';
import { FOCUS_CHAMPION_EVENT } from './constants';
import { groupIssues } from './insightsModel';

/** Validation results in plain language, with a one click fix where one exists. */
export function ValidationPanel() {
  const { issues, catalog, rules, edit, setSection, openLegendPicker } = useBuilder();
  const { errors, warnings } = groupIssues(issues);

  const run = (fix: IssueFix) => {
    if ('edit' in fix) edit(fix.edit);
    else if ('goto' in fix) setSection(fix.goto);
    else if (fix.open === 'legend') openLegendPicker();
    else window.dispatchEvent(new CustomEvent(FOCUS_CHAMPION_EVENT));
  };

  const group = (title: string, tone: 'danger' | 'warning', list: typeof issues) =>
    list.length === 0 ? null : (
      <div className="dk-issues">
        <h3 className="dk-subhead">
          {title} <Badge tone={tone}>{list.length}</Badge>
        </h3>
        <ul className="dk-issues__list">
          {list.map((issue, index) => {
            const fix = issueFix(issue, catalog, rules);
            return (
              <li key={`${issue.code}-${issue.cardKey ?? ''}-${index}`} className={`dk-issue dk-issue--${tone}`}>
                <Icon name="alert" />
                <span className="dk-issue__text">{issue.message}</span>
                {fix ? (
                  <Button variant="secondary" size="sm" onClick={() => run(fix)}>
                    {fix.label}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    );

  return (
    <section className="dk-panel" aria-labelledby="dk-validation-title">
      <h2 id="dk-validation-title" className="dk-panel__title">
        Validation
      </h2>
      {issues.length === 0 ? (
        <p className="dk-ok">
          <Icon name="check" /> This deck is legal under the rules.
        </p>
      ) : (
        <>
          {group('Errors', 'danger', errors)}
          {group('Warnings', 'warning', warnings)}
        </>
      )}
    </section>
  );
}
