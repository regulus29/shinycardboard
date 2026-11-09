import { Badge, Button, Popover, type BadgeTone } from '../../ui';
import { provenanceEntries, type ProvenanceStatus } from './insightsModel';

const STATUS_TONE: Record<ProvenanceStatus, BadgeTone> = { confirmed: 'success', attested: 'info', unverified: 'warning' };
const STATUS_HELP: Record<ProvenanceStatus, string> = {
  confirmed: 'Checked against the published Core Rules.',
  attested: 'Reported by reliable community sources.',
  unverified: 'Not found in the rules text. Treat as a best guess.',
};

/** Shows where each deck rule comes from, so doubtful rules are visible. */
export function RulesPopover() {
  const entries = provenanceEntries();
  const unverified = entries.filter((e) => e.status === 'unverified').length;
  return (
    <Popover
      label="Rules and sources"
      role="dialog"
      align="end"
      className="dk-rules"
      trigger={(api) => (
        <Button variant="ghost" size="sm" icon="info" {...api.props}>
          Rules{unverified ? ` (${unverified} unverified)` : ''}
        </Button>
      )}
    >
      <div className="dk-rules__body">
        <h2 className="dk-rules__title">Where the rules come from</h2>
        <p className="dk-muted">Validation uses these limits. Unverified rules only ever raise warnings or follow the conservative reading.</p>
        <ul className="dk-rules__list">
          {entries.map((entry) => (
            <li key={entry.key} className="dk-rules__item">
              <div className="dk-rules__head">
                <span className="dk-rules__label">{entry.label}</span>
                <Badge tone={STATUS_TONE[entry.status]}>{entry.status}</Badge>
              </div>
              <p className="dk-muted">{entry.source}</p>
            </li>
          ))}
        </ul>
        <dl className="dk-rules__legend">
          {(Object.keys(STATUS_HELP) as ProvenanceStatus[]).map((status) => (
            <div key={status}>
              <dt>
                <Badge tone={STATUS_TONE[status]}>{status}</Badge>
              </dt>
              <dd>{STATUS_HELP[status]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Popover>
  );
}
