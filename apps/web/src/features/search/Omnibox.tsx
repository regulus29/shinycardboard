import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { runSearch, suggestTokens, type Catalog, type ParseWarning, type SearchContext, type Suggestion } from '@sc/core';
import { Button, Dialog, IconButton, Popover, SearchField, cx } from '../../ui';
import { useCatalog, useSearchContext } from '../../data';
import { DESKTOP_MIN_WIDTH_REM, OMNIBOX_INPUT_ID, QUERY_PARAM } from '../../config/constants';
import { useMediaQuery } from '../../lib/useMediaQuery';
import { SUGGESTION_DEBOUNCE_MS } from '../collection/constants';
import { mergeWarnings } from '../collection/queryEdit';
import { applySuggestion, describeSuggestion, mergeSuggestions, queryLocation, SYNTAX_EXAMPLES } from './omniboxModel';
import { SavedSearchesManager } from './SavedSearchesManager';
import { SaveSearchDialog } from './SaveSearchDialog';
import { SearchHelp } from './SearchHelp';
import './search.css';

const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH_REM}rem)`;
const NO_SUGGESTIONS: Suggestion[] = [];
const NO_WARNINGS: ParseWarning[] = [];

/** Parse warnings for the committed query, shown as a subtle hint (the search itself still runs). */
function useWarnings(query: string, catalog: Catalog | null, ctx: SearchContext | undefined): ParseWarning[] {
  return useMemo(() => {
    if (!query.trim() || !catalog || !ctx) return NO_WARNINGS;
    return mergeWarnings(runSearch(query, catalog, ctx, { limit: 0 }).warnings, query);
  }, [query, catalog, ctx]);
}

/**
 * Global search box. The query lives in the URL (`?q=`): typing updates it after a short debounce
 * (replacing history on the collection), Enter submits at once, Esc closes the panel (then leaves the field), `/` focuses (see
 * useGlobalShortcuts). A combobox popup offers completions from core `suggestTokens`.
 */
export function Omnibox() {
  const { state } = useCatalog();
  const catalog = state.status === 'ready' ? state.catalog : null;
  const ctx = useSearchContext();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const urlQuery = params.get(QUERY_PARAM) ?? '';
  const desktop = useMediaQuery(DESKTOP_QUERY);
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [draft, setDraft] = useState(urlQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const committed = useRef(urlQuery.trim());

  const commit = useCallback(
    (query: string) => {
      const clean = query.trim();
      committed.current = clean;
      const target = queryLocation(location, clean);
      navigate({ pathname: target.pathname, search: target.search }, { replace: target.replace });
    },
    [location, navigate],
  );

  // Reflect navigation that did not come from typing (saved searches, Back, chips).
  useEffect(() => {
    if (urlQuery.trim() !== committed.current) {
      committed.current = urlQuery.trim();
      setDraft(urlQuery);
    }
  }, [urlQuery]);

  // Debounced live search while typing.
  useEffect(() => {
    if (draft.trim() === committed.current) return undefined;
    const timer = window.setTimeout(() => commit(draft), SUGGESTION_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, commit]);

  const suggestions = useMemo(
    () => (catalog && ctx && draft.trim() ? mergeSuggestions(draft, suggestTokens(draft, catalog, ctx)) : NO_SUGGESTIONS),
    [draft, catalog, ctx],
  );
  const warnings = useWarnings(urlQuery, catalog, ctx);
  useEffect(() => setActive(-1), [suggestions]);

  const accept = (suggestion: Suggestion) => {
    setDraft(applySuggestion(draft, suggestion));
    setActive(-1);
    document.getElementById(OMNIBOX_INPUT_ID)?.focus();
  };

  const runExample = (query: string) => {
    setDraft(query);
    commit(query);
    setOpen(false);
    setHelpOpen(false);
    setSavedOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const count = suggestions.length;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (count === 0) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Cycle through -1 (no highlight, plain Enter submits) and every suggestion.
      setActive((index) => ((index + 1 + step + count + 1) % (count + 1)) - 1);
    } else if (event.key === 'Enter' && open && active >= 0 && suggestions[active]) {
      event.preventDefault();
      accept(suggestions[active]);
    } else if (event.key === 'Escape') {
      // First Esc closes the panel and restores the committed query; a second one leaves the field.
      // The committed query is only ever cleared with the clear button.
      event.preventDefault();
      if (open) {
        setOpen(false);
        setDraft(urlQuery);
      } else {
        event.currentTarget.blur();
      }
    }
  };

  const showSuggestions = open && suggestions.length > 0;
  const showTips = open && !draft.trim();
  const showWarnings = open && warnings.length > 0 && draft.trim() === urlQuery.trim();
  const showPanel = showSuggestions || showTips || showWarnings || (open && !desktop);

  return (
    <div
      ref={wrapRef}
      className="omnibox"
      onBlur={(event) => {
        if (!wrapRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <SearchField
        id={OMNIBOX_INPUT_ID}
        label="Search cards"
        placeholder="Search cards, sets, tags"
        value={draft}
        onValueChange={(value) => {
          setDraft(value);
          setOpen(true);
        }}
        onSearch={(value) => {
          commit(value);
          setOpen(false);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        role="combobox"
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={showSuggestions && active >= 0 ? `${listId}-${active}` : undefined}
        trailing={
          <kbd className="omnibox__hint" aria-hidden="true">
            /
          </kbd>
        }
      />

      {desktop ? (
        <div className="omnibox__tools">
          <Popover
            label="Search syntax"
            align="end"
            className="omnibox__popover"
            trigger={(api) => <IconButton icon="info" label="Search syntax help" variant="ghost" {...api.props} />}
          >
            {() => <SearchHelp onPick={runExample} />}
          </Popover>
          <Popover
            label="Saved searches"
            align="end"
            className="omnibox__popover"
            trigger={(api) => <IconButton icon="bookmark" label="Manage saved searches" variant="ghost" {...api.props} />}
          >
            {(close) => (
              <SavedSearchesManager
                query={urlQuery}
                onNavigate={close}
                onSaveCurrent={() => {
                  close();
                  setSaveOpen(true);
                }}
              />
            )}
          </Popover>
        </div>
      ) : null}

      {showPanel ? (
        <div className="omnibox__panel" onMouseDown={(event) => event.preventDefault()}>
          {showSuggestions ? (
            <ul id={listId} role="listbox" aria-label="Search suggestions" className="omnibox__list">
              {suggestions.map((suggestion, index) => (
                <li
                  key={suggestion.text + index}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  className={cx('omnibox__option', index === active && 'is-active')}
                  onClick={() => accept(suggestion)}
                >
                  <span className="omnibox__option-text">{suggestion.text}</span>
                  <span className="omnibox__option-hint">{describeSuggestion(suggestion)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          {showWarnings ? (
            <p className="omnibox__warning" role="status">
              {warnings[0]?.message}
              {warnings.length > 1 ? ` (+${warnings.length - 1} more)` : ''}
            </p>
          ) : null}
          {showTips ? (
            <div className="omnibox__tips">
              <span className="omnibox__tips-title">Try</span>
              {SYNTAX_EXAMPLES.map((example) => (
                <button key={example.query} type="button" className="omnibox__tip" onClick={() => runExample(example.query)}>
                  {example.query}
                </button>
              ))}
            </div>
          ) : null}
          {!desktop ? (
            <div className="omnibox__phone-tools">
              <Button
                variant="ghost"
                size="sm"
                icon="info"
                onClick={() => {
                  setOpen(false);
                  setHelpOpen(true);
                }}
              >
                Syntax help
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon="bookmark"
                onClick={() => {
                  setOpen(false);
                  setSavedOpen(true);
                }}
              >
                Saved searches
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={helpOpen} onClose={() => setHelpOpen(false)} title="Search syntax" size="md">
        <SearchHelp onPick={runExample} />
      </Dialog>
      <Dialog open={savedOpen} onClose={() => setSavedOpen(false)} title="Saved searches" size="md">
        <SavedSearchesManager
          query={urlQuery}
          onNavigate={() => setSavedOpen(false)}
          onSaveCurrent={() => {
            setSavedOpen(false);
            setSaveOpen(true);
          }}
        />
      </Dialog>
      <SaveSearchDialog open={saveOpen} query={urlQuery} onClose={() => setSaveOpen(false)} />
    </div>
  );
}
