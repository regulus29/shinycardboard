import { useId, useMemo, useState, type FormEvent } from 'react';
import { Chip, TextField } from '../../ui';
import { addTag, removeTag, setCardNote, useTagCounts, useTaggings } from '../../data';
import { NOTES_MAX_LENGTH, TAG_SUGGESTION_LIMIT } from './constants';
import { useDraft } from './useDraft';

interface TagEditorProps {
  cardKey: string;
}

/** Tags are per card (shared by every printing): removable chips, an add field with existing-tag suggestions, and a note. */
export function TagEditor({ cardKey }: TagEditorProps) {
  const taggings = useTaggings();
  const known = useTagCounts();
  const record = taggings?.find((row) => row.cardKey === cardKey);
  const tags = record?.tags ?? [];
  const [input, setInput] = useState('');
  const note = useDraft(record?.note ?? '');
  const inputId = useId();

  const suggestions = useMemo(() => {
    const typed = input.trim().toLowerCase();
    const taken = new Set(tags.map((tag) => tag.toLowerCase()));
    return (known ?? [])
      .filter(({ tag }) => !taken.has(tag.toLowerCase()) && tag.toLowerCase().includes(typed))
      .slice(0, TAG_SUGGESTION_LIMIT);
  }, [known, tags, input]);

  const add = async (tag: string) => {
    if (!tag.trim()) return;
    try {
      await addTag(cardKey, tag);
      setInput('');
    } catch {
      // the data layer already showed a storage error
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void add(input);
  };

  const saveNote = () => {
    if (note.settle()) void setCardNote(cardKey, note.value).catch(() => undefined);
  };

  return (
    <section className="detail-section" aria-labelledby="tags-heading">
      <header className="detail-section__header">
        <h2 id="tags-heading" className="detail-section__title">
          Tags and notes
        </h2>
        <span className="detail-section__meta">Applies to every printing</span>
      </header>
      {tags.length > 0 ? (
        <ul className="tag-chips" aria-label="Tags on this card">
          {tags.map((tag) => (
            <li key={tag}>
              <Chip removeLabel="Remove tag" onRemove={() => void removeTag(cardKey, tag).catch(() => undefined)}>
                {tag}
              </Chip>
            </li>
          ))}
        </ul>
      ) : (
        <p className="detail-section__empty">No tags yet.</p>
      )}
      <form className="tag-form" onSubmit={submit}>
        <TextField id={inputId} label="Add tag" hideLabel size="sm" placeholder="Add a tag" value={input} onChange={(event) => setInput(event.target.value)} />
      </form>
      {suggestions.length > 0 ? (
        <div className="tag-suggestions" role="group" aria-label="Existing tags">
          {suggestions.map(({ tag, count }) => (
            <Chip key={tag} onClick={() => void add(tag)}>
              {tag}
              <span className="tag-suggestions__count">{count}</span>
            </Chip>
          ))}
        </div>
      ) : null}
      <label className="card-note">
        <span className="card-note__label">Note</span>
        <textarea
          className="card-note__input"
          rows={3}
          maxLength={NOTES_MAX_LENGTH}
          placeholder="Anything worth remembering about this card"
          value={note.value}
          onChange={(event) => note.change(event.target.value)}
          onBlur={saveNote}
        />
      </label>
    </section>
  );
}
