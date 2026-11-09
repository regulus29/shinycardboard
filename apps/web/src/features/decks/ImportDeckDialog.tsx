import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Catalog } from '@sc/core';
import { paths } from '../../app/paths';
import { clock, saveDeck } from '../../data';
import { Badge, Button, Dialog, TextField, useToast } from '../../ui';
import { IMPORT_FILE_ACCEPT, MAX_DECK_NAME_LENGTH } from './constants';
import { toPatch } from './deckPatch';
import { buildImportPreview, sectionSummary } from './importModel';

interface ImportDeckDialogProps {
  open: boolean;
  onClose: () => void;
  catalog: Catalog;
}

/** Paste or load a deck list, check what matched, then save it as a new deck. */
export function ImportDeckDialog({ open, onClose, catalog }: ImportDeckDialogProps) {
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const toast = useToast();
  const preview = useMemo(() => (text.trim() ? buildImportPreview(text, catalog, clock.now()) : undefined), [text, catalog]);

  const close = () => {
    setText('');
    setName('');
    onClose();
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    setText(await file.text());
    if (!name) setName(file.name.replace(/\.[^.]+$/, ''));
  };

  const save = async () => {
    if (!preview || preview.empty) return;
    setSaving(true);
    try {
      const deck = await saveDeck({ ...toPatch(preview.deck), id: undefined, name: name.trim() || preview.deck.name });
      toast.show({ title: 'Deck imported', description: `${preview.matched.length} lines matched.`, tone: 'success' });
      close();
      navigate(paths.deck(deck.id));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Import a deck"
      description="Paste a deck list such as 3 Card Name per line, or load a text file."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving} disabled={!preview || preview.empty}>
            Save as new deck
          </Button>
        </>
      }
    >
      <div className="dk-import">
        <div className="dk-import__input">
          <label className="dk-label" htmlFor="dk-import-text">
            Deck list
          </label>
          <textarea id="dk-import-text" className="dk-textarea" rows={9} value={text} onChange={(event) => setText(event.target.value)} placeholder={'Legend\n1 Card Name\nMain Deck\n3 Card Name'} spellCheck={false} />
          <input ref={fileInput} type="file" accept={IMPORT_FILE_ACCEPT} className="dk-offscreen" aria-label="Deck list file" onChange={(event) => void loadFile(event.target.files?.[0])} />
          <Button variant="secondary" icon="upload" size="sm" onClick={() => fileInput.current?.click()}>
            Load a file
          </Button>
        </div>
        {preview ? (
          <div className="dk-import__preview" aria-live="polite">
            {preview.empty ? (
              <p className="dk-muted">No cards could be matched. Check the spelling or paste a list with one card per line.</p>
            ) : (
              <>
                <TextField label="Deck name" value={name} placeholder={preview.deck.name} maxLength={MAX_DECK_NAME_LENGTH} onChange={(event) => setName(event.target.value)} />
                <dl className="dk-facts">
                  <div>
                    <dt>Legend</dt>
                    <dd>{preview.legendName ?? 'Not found'}</dd>
                  </div>
                  <div>
                    <dt>Chosen champion</dt>
                    <dd>{preview.championName ?? 'Not set'}</dd>
                  </div>
                  <div>
                    <dt>Sections</dt>
                    <dd>{sectionSummary(preview).join(', ') || 'None'}</dd>
                  </div>
                </dl>
                <p>
                  <Badge tone="success">{preview.matched.length} matched</Badge> <Badge tone={preview.unmatched.length ? 'warning' : 'neutral'}>{preview.unmatched.length} unmatched</Badge>{' '}
                  <Badge tone={preview.issues.some((i) => i.severity === 'error') ? 'danger' : 'success'}>{preview.issues.length} rule notes</Badge>
                </p>
                {preview.unmatched.length ? (
                  <section aria-label="Unmatched lines">
                    <h3 className="dk-subhead">Not matched</h3>
                    <ul className="dk-list dk-list--scroll">
                      {preview.unmatched.map((line, i) => (
                        <li key={`${line}-${i}`} className="dk-list__warn">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
                <section aria-label="Matched cards">
                  <h3 className="dk-subhead">Matched</h3>
                  <ul className="dk-list dk-list--scroll">
                    {preview.matched.map((line) => (
                      <li key={`${line.section}-${line.cardKey}`}>
                        {line.count} {line.name} <span className="dk-muted">{line.section}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
