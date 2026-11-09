import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SearchField } from '../ui';
import { OMNIBOX_INPUT_ID, QUERY_PARAM } from '../config/constants';
import { paths } from './paths';

/**
 * Global omnibox slot in the top bar.
 *
 * PHASE 2 OWNS THE BODY OF THIS COMPONENT (suggestions, parsing, arrow-key results). Keep:
 *  - the input id `OMNIBOX_INPUT_ID`, so the `/` shortcut in useGlobalShortcuts finds it;
 *  - the `?q=` URL contract: submitting navigates to `paths.collection(query)`.
 * This default implementation is a plain search box that does exactly that.
 */
export function OmniboxSlot() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const urlQuery = params.get(QUERY_PARAM) ?? '';
  const [value, setValue] = useState(urlQuery);

  // Reflect external navigation (saved searches, back button) in the field.
  useEffect(() => setValue(urlQuery), [urlQuery]);

  return (
    <SearchField
      id={OMNIBOX_INPUT_ID}
      label="Search cards"
      placeholder="Search cards, sets, tags"
      value={value}
      onValueChange={setValue}
      onSearch={(query) => navigate(paths.collection(query))}
      trailing={<kbd className="omnibox__hint" aria-hidden="true">/</kbd>}
    />
  );
}
