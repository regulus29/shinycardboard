import { useState } from 'react';
import type { Condition, Finish, OwnedEntry } from '@sc/core';
import { Badge, Button, IconButton, Select, Stepper, TextField, useToast } from '../../ui';
import { setOwnedQuantity, useOwnedForPrinting } from '../../data';
import { CONDITIONS, FINISHES, OWNED_DEFAULTS } from '../../config/constants';
import { CONDITION_LABELS, FINISH_LABELS, NOTES_MAX_LENGTH } from './constants';
import { useDraft } from './useDraft';

interface OwnedEditorProps {
  printingKey: string;
  cardName: string;
}

const FINISH_OPTIONS = FINISHES.map((value) => ({ value, label: FINISH_LABELS[value] }));
const CONDITION_OPTIONS = CONDITIONS.map((value) => ({ value, label: `${value} - ${CONDITION_LABELS[value]}` }));

const sortRows = (rows: OwnedEntry[]) =>
  [...rows].sort((a, b) => FINISHES.indexOf(a.finish) - FINISHES.indexOf(b.finish) || CONDITIONS.indexOf(a.condition) - CONDITIONS.indexOf(b.condition));

function OwnedRow({ row, cardName }: { row: OwnedEntry; cardName: string }) {
  const toast = useToast();
  const notes = useDraft(row.notes ?? '');
  const key = { printingKey: row.printingKey, finish: row.finish, condition: row.condition };
  const label = `${FINISH_LABELS[row.finish]} ${row.condition}`;
  const saveNotes = () => {
    if (notes.settle()) void setOwnedQuantity(key, row.quantity, notes.value.trim()).catch(() => undefined);
  };

  /** Removal is immediate but reversible from the toast. */
  const remove = async () => {
    const { quantity, notes: previousNotes } = row;
    try {
      await setOwnedQuantity(key, 0);
    } catch {
      return;
    }
    toast.show({
      title: `Removed ${label} copies`,
      action: { label: 'Undo', onClick: () => void setOwnedQuantity(key, quantity, previousNotes).catch(() => undefined) },
    });
  };

  return (
    <li className="owned-row">
      <div className="owned-row__kind">
        <Badge tone={row.finish === 'foil' ? 'accent' : 'neutral'}>{FINISH_LABELS[row.finish]}</Badge>
        <span className="owned-row__condition" title={CONDITION_LABELS[row.condition]}>
          {row.condition}
        </span>
      </div>
      <Stepper size="sm" value={row.quantity} label={`Quantity of ${cardName} (${label})`} onChange={(next) => void setOwnedQuantity(key, next).catch(() => undefined)} />
      <TextField
        label={`Notes for ${label}`}
        hideLabel
        size="sm"
        placeholder="Notes"
        maxLength={NOTES_MAX_LENGTH}
        value={notes.value}
        onChange={(event) => notes.change(event.target.value)}
        onBlur={saveNotes}
        onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
      />
      <IconButton icon="trash" label={`Remove ${label} copies`} size="sm" variant="ghost" onClick={() => void remove()} />
    </li>
  );
}

/** Owned copies of one printing: a row per finish and condition, with an add-row form. */
export function OwnedEditor({ printingKey, cardName }: OwnedEditorProps) {
  const rows = useOwnedForPrinting(printingKey);
  const [adding, setAdding] = useState(false);
  const [finish, setFinish] = useState<Finish>(OWNED_DEFAULTS.finish);
  const [condition, setCondition] = useState<Condition>(OWNED_DEFAULTS.condition);
  const [quantity, setQuantity] = useState(1);
  const sorted = sortRows(rows ?? []);
  const exists = sorted.some((row) => row.finish === finish && row.condition === condition);

  const addRow = async () => {
    try {
      await setOwnedQuantity({ printingKey, finish, condition }, quantity);
      setAdding(false);
      setQuantity(1);
    } catch {
      // the data layer already showed a storage error
    }
  };

  const total = sorted.reduce((sum, row) => sum + row.quantity, 0);
  return (
    <section className="detail-section" aria-labelledby="owned-heading">
      <header className="detail-section__header">
        <h2 id="owned-heading" className="detail-section__title">
          Owned copies
        </h2>
        <span className="detail-section__meta">{total} total</span>
      </header>
      {rows === undefined ? null : sorted.length === 0 ? (
        <p className="detail-section__empty">You do not own this printing yet.</p>
      ) : (
        <ul className="owned-rows">
          {sorted.map((row) => (
            <OwnedRow key={row.id} row={row} cardName={cardName} />
          ))}
        </ul>
      )}
      {adding ? (
        <form
          className="owned-add"
          onSubmit={(event) => {
            event.preventDefault();
            void addRow();
          }}
        >
          <Select<Finish> label="Finish" size="sm" value={finish} onValueChange={setFinish} options={FINISH_OPTIONS} />
          <Select<Condition> label="Condition" size="sm" value={condition} onValueChange={setCondition} options={CONDITION_OPTIONS} />
          <Stepper size="sm" min={1} value={quantity} label="Quantity to add" onChange={setQuantity} />
          <div className="owned-add__actions">
            <Button type="submit" size="sm" variant="primary" disabled={exists}>
              Add row
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              Cancel
            </Button>
          </div>
          {exists ? <p className="owned-add__note">A row for that finish and condition exists. Adjust its quantity above.</p> : null}
        </form>
      ) : (
        <div className="owned-actions">
          {sorted.length === 0 ? (
            <Button variant="primary" size="sm" icon="plus" onClick={() => void setOwnedQuantity({ printingKey }, 1).catch(() => undefined)}>
              Add one copy
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" icon="plus" onClick={() => setAdding(true)}>
            Add finish or condition
          </Button>
        </div>
      )}
    </section>
  );
}
