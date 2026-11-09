import { SYNTAX_EXAMPLES, SYNTAX_FIELDS } from './omniboxModel';

interface SearchHelpProps {
  onPick: (query: string) => void;
}

/** Query syntax reference. Examples run when clicked. */
export function SearchHelp({ onPick }: SearchHelpProps) {
  return (
    <div className="search-help">
      <p className="search-help__intro">Terms are combined. Plain words match names, so you can also type things like "ogn 42" or "fury unit".</p>
      <h3 className="search-help__heading">Try</h3>
      <ul className="search-help__examples">
        {SYNTAX_EXAMPLES.map((example) => (
          <li key={example.query}>
            <button type="button" className="search-help__example" onClick={() => onPick(example.query)}>
              <code>{example.query}</code>
              <span>{example.note}</span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="search-help__heading">Fields</h3>
      <dl className="search-help__fields">
        {SYNTAX_FIELDS.map((row) => (
          <div key={row.field}>
            <dt>{row.field}</dt>
            <dd>
              <code>{row.values}</code>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
