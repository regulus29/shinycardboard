import { Omnibox } from '../features/search/Omnibox';

/**
 * Global omnibox slot in the top bar. The implementation lives in features/search; the input keeps
 * `OMNIBOX_INPUT_ID` (for the `/` shortcut) and the `?q=` contract (see QUERY_PARAM).
 */
export function OmniboxSlot() {
  return <Omnibox />;
}
