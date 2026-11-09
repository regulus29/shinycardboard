import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SavedSearch } from '@sc/core';
import { paths } from '../../app/paths';
import { Button, IconButton, TextField, useToast } from '../../ui';
import { deleteSearch, saveSearch, useSavedSearches } from '../../data';

interface SavedSearchesManagerProps {
  /** Current omnibox query; enables the Save current search button. */
  query: string;
  onSaveCurrent: () => void;
  onNavigate: () => void;
}

/** List of saved searches with rename and delete (delete offers Undo). */
export function SavedSearchesManager({ query, onSaveCurrent, onNavigate }: SavedSearchesManagerProps) {
  const toast = useToast();
  const searches = useSavedSearches() ?? [];
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const rename = async (event: FormEvent, saved: SavedSearch) => {
    event.preventDefault();
    try {
      if (draft.trim() && draft.trim() !== saved.name) await saveSearch({ id: saved.id, name: draft, query: saved.query });
      setEditing(null);
    } catch {
      toast.show({ title: 'Could not rename the search', description: 'Your change was not saved. Try again.', tone: 'danger' });
    }
  };

  const remove = async (saved: SavedSearch) => {
    try {
      await deleteSearch(saved.id);
    } catch {
      toast.show({ title: 'Could not delete the search', tone: 'danger' });
      return;
    }
    toast.show({
      title: `Deleted "${saved.name}"`,
      action: { label: 'Undo', onClick: () => void saveSearch({ id: saved.id, name: saved.name, query: saved.query }) },
    });
  };

  return (
    <div className="saved-manager">
      <Button variant="secondary" size="sm" icon="bookmark" disabled={!query.trim()} onClick={onSaveCurrent}>
        Save current search
      </Button>
      {searches.length === 0 ? (
        <p className="saved-manager__empty">Nothing saved yet. Search for something, then save it to pin it in the sidebar.</p>
      ) : (
        <ul className="saved-manager__list">
          {searches.map((saved) => (
            <li key={saved.id} className="saved-manager__row">
              {editing === saved.id ? (
                <form className="saved-manager__edit" onSubmit={(event) => void rename(event, saved)}>
                  <TextField label={`New name for ${saved.name}`} hideLabel size="sm" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} />
                  <Button type="submit" size="sm" variant="primary">
                    Save
                  </Button>
                </form>
              ) : (
                <>
                  <Link to={paths.collection(saved.query)} className="saved-manager__link" onClick={onNavigate}>
                    <span className="saved-manager__name">{saved.name}</span>
                    <code className="saved-manager__query">{saved.query}</code>
                  </Link>
                  <IconButton
                    icon="edit"
                    label={`Rename ${saved.name}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(saved.id);
                      setDraft(saved.name);
                    }}
                  />
                  <IconButton icon="trash" label={`Delete ${saved.name}`} size="sm" variant="ghost" onClick={() => void remove(saved)} />
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
