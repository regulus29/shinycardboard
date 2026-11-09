import {
  DEFAULT_GROUP,
  DEFAULT_SCOPE,
  DEFAULT_SORT,
  GROUP_KEYS,
  PARAMS,
  SCOPES,
  SORT_KEYS,
  VIEWS,
  type GroupKey,
  type Scope,
  type SortKey,
  type ViewMode,
} from './constants';

/** Everything the collection page keeps in the URL, so a view is shareable and survives reload. */
export interface CollectionParams {
  query: string;
  scope: Scope;
  sort: SortKey;
  descending: boolean;
  group: GroupKey;
  /** Null means "use the default view from settings". */
  view: ViewMode | null;
}

const DESC = 'desc';

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function readParams(search: URLSearchParams): CollectionParams {
  const view = search.get(PARAMS.view);
  return {
    query: search.get(PARAMS.query) ?? '',
    scope: pick(search.get(PARAMS.scope), SCOPES, DEFAULT_SCOPE),
    sort: pick(search.get(PARAMS.sort), SORT_KEYS, DEFAULT_SORT),
    descending: search.get(PARAMS.dir) === DESC,
    group: pick(search.get(PARAMS.group), GROUP_KEYS, DEFAULT_GROUP),
    view: VIEWS.includes(view as ViewMode) ? (view as ViewMode) : null,
  };
}

function setOrDelete(search: URLSearchParams, key: string, value: string | null) {
  if (value === null || value === '') search.delete(key);
  else search.set(key, value);
}

/** Copy of `base` with `patch` applied; defaults are removed so URLs stay short. */
export function writeParams(base: URLSearchParams, patch: Partial<CollectionParams>): URLSearchParams {
  const next = new URLSearchParams(base);
  const merged = { ...readParams(base), ...patch };
  setOrDelete(next, PARAMS.query, merged.query.trim());
  setOrDelete(next, PARAMS.scope, merged.scope === DEFAULT_SCOPE ? null : merged.scope);
  setOrDelete(next, PARAMS.sort, merged.sort === DEFAULT_SORT ? null : merged.sort);
  setOrDelete(next, PARAMS.dir, merged.descending && merged.sort !== DEFAULT_SORT ? DESC : null);
  setOrDelete(next, PARAMS.group, merged.group === DEFAULT_GROUP ? null : merged.group);
  setOrDelete(next, PARAMS.view, merged.view);
  return next;
}

/** Search string (with leading ?) for links that carry the current list context, such as card detail. */
export function listContextSearch(search: URLSearchParams): string {
  const text = writeParams(new URLSearchParams(), readParams(search)).toString();
  return text ? `?${text}` : '';
}
