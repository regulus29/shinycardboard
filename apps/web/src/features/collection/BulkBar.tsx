import { useId, useState, type FormEvent } from 'react';
import { Button, TextField, useToast } from '../../ui';
import { addTagToCards, normalizeTag, useTagCounts } from '../../data';
import { pluralize } from './format';

interface BulkBarProps {
  selectedCount: number;
  resultCount: number;
  /** Explains why the selection shrank when results changed. */
  note?: string;
  /** Card keys behind the selected printings (one tag record per card, not per printing). */
  cardKeys: () => string[];
  onSelectAll: () => void;
  onClear: () => void;
}

/** Sticky action bar while printings are selected: bulk tag, select all results, clear. */
export function BulkBar({ selectedCount, resultCount, note, cardKeys, onSelectAll, onClear }: BulkBarProps) {
  const toast = useToast();
  const listId = useId();
  const tags = useTagCounts() ?? [];
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const clean = normalizeTag(tag);
    if (!clean || selectedCount === 0) return;
    setBusy(true);
    try {
      const keys = cardKeys();
      await addTagToCards(keys, clean);
      toast.show({ title: `Tagged ${pluralize(keys.length, 'card')}`, description: `Added "${clean}"`, tone: 'success' });
      setTag('');
    } catch {
      // the data layer already showed a storage error toast
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bulk" role="region" aria-label="Bulk actions">
      <p className="bulk__count">
        <strong>{selectedCount.toLocaleString()}</strong> selected
      </p>
      {note ? <p className="bulk__note">{note}</p> : null}
      <form className="bulk__form" onSubmit={submit}>
        <TextField
          label="Tag for selected cards"
          hideLabel
          size="sm"
          placeholder="Add tag"
          value={tag}
          list={listId}
          onChange={(event) => setTag(event.target.value)}
        />
        <datalist id={listId}>
          {tags.map((entry) => (
            <option key={entry.tag} value={entry.tag} />
          ))}
        </datalist>
        <Button type="submit" size="sm" variant="primary" icon="tag" loading={busy} disabled={!tag.trim() || selectedCount === 0}>
          Add tag
        </Button>
      </form>
      <div className="bulk__spacer" />
      <Button size="sm" variant="ghost" onClick={onSelectAll} disabled={selectedCount >= resultCount}>
        Select all {resultCount.toLocaleString()}
      </Button>
      <Button size="sm" variant="secondary" onClick={onClear}>
        Clear selection
      </Button>
    </div>
  );
}
