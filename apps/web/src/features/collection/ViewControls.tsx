import { Button, SegmentedControl, Select } from '../../ui';
import { GROUP_KEYS, GROUP_LABELS, SCOPES, SCOPE_LABELS, SORT_KEYS, SORT_LABELS, type GroupKey, type Scope, type SortKey } from './constants';
import type { CollectionParams } from './params';

const SCOPE_OPTIONS = SCOPES.map((value) => ({ value, label: SCOPE_LABELS[value] }));
const SORT_OPTIONS = SORT_KEYS.map((value) => ({ value, label: SORT_LABELS[value] }));
const GROUP_OPTIONS = GROUP_KEYS.map((value) => ({ value, label: GROUP_LABELS[value] }));

interface ViewControlsProps {
  params: CollectionParams;
  update: (patch: Partial<CollectionParams>) => void;
}

export function ScopeControl({ params, update }: ViewControlsProps) {
  return <SegmentedControl<Scope> label="Scope" size="sm" className="collection__scope" value={params.scope} onValueChange={(scope) => update({ scope })} options={SCOPE_OPTIONS} />;
}

/** Group, sort and direction controls, shared by the desktop toolbar and the phone sheet. */
export function OrderControls({ params, update }: ViewControlsProps) {
  return (
    <div className="collection__selects">
      <Select<GroupKey> label="Group by" size="sm" value={params.group} onValueChange={(group) => update({ group })} options={GROUP_OPTIONS} />
      <Select<SortKey> label="Sort by" size="sm" value={params.sort} onValueChange={(sort) => update({ sort, descending: false })} options={SORT_OPTIONS} />
      <Button variant="ghost" size="sm" aria-pressed={params.descending} disabled={params.sort === 'relevance'} onClick={() => update({ descending: !params.descending })}>
        {params.descending ? 'Descending' : 'Ascending'}
      </Button>
    </div>
  );
}

/** Number of non-default scope, group and sort choices, for the phone sheet badge. */
export function orderChangeCount(params: CollectionParams): number {
  return Number(params.scope !== 'all') + Number(params.group !== 'none') + Number(params.sort !== 'relevance');
}
