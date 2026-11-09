import { useState, type FormEvent } from 'react';
import { Button, Drawer, Dialog, EmptyState, IconButton, Skeleton, TextField, useToast } from '../../ui';
import { deleteTag, normalizeTag, renameTag, useTagCounts } from '../../data';
import { pluralize } from './format';
import { fieldValues } from './queryEdit';

interface TagsPanelProps {
  open: boolean;
  onClose: () => void;
  query: string;
  /** Toggle `tag:"name"` in the query. */
  onToggleTag: (tag: string) => void;
}

/** Drawer listing every tag with its card count: filter by clicking, rename inline, delete with confirm. */
export function TagsPanel({ open, onClose, query, onToggleTag }: TagsPanelProps) {
  const toast = useToast();
  const tags = useTagCounts();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{ tag: string; count: number } | null>(null);
  const active = fieldValues(query, 'tag');

  const startRename = (tag: string) => {
    setEditing(tag);
    setDraft(tag);
  };

  const saveRename = async (event: FormEvent) => {
    event.preventDefault();
    if (editing === null) return;
    const target = normalizeTag(draft);
    try {
      if (target && target !== editing) {
        const changed = await renameTag(editing, target);
        toast.show({ title: `Renamed on ${pluralize(changed, 'card')}`, description: `"${editing}" is now "${target}"`, tone: 'success' });
      }
      setEditing(null);
    } catch {
      // reported by the data layer
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      const changed = await deleteTag(pendingDelete.tag);
      toast.show({ title: `Deleted "${pendingDelete.tag}"`, description: `Removed from ${pluralize(changed, 'card')}`, tone: 'success' });
      setPendingDelete(null);
    } catch {
      // reported by the data layer
    }
  };

  return (
    <>
      <Drawer open={open} onClose={onClose} side="right" title="Tags" description="Click a tag to filter the collection by it.">
        {tags === undefined ? (
          <Skeleton height="8rem" />
        ) : tags.length === 0 ? (
          <EmptyState icon="tag" title="No tags yet" description="Select cards and use Add tag, or tag a card from its detail page." />
        ) : (
          <ul className="tags-list">
            {tags.map(({ tag, count }) => (
              <li key={tag} className="tags-list__row">
                {editing === tag ? (
                  <form className="tags-list__edit" onSubmit={saveRename}>
                    <TextField label={`New name for ${tag}`} hideLabel size="sm" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} />
                    <Button type="submit" size="sm" variant="primary">
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      className="tags-list__filter"
                      aria-pressed={active.includes(tag.toLowerCase())}
                      onClick={() => {
                        onToggleTag(tag);
                        onClose();
                      }}
                    >
                      <span className="tags-list__name">{tag}</span>
                      <span className="tags-list__count">{count.toLocaleString()}</span>
                    </button>
                    <IconButton icon="edit" label={`Rename ${tag}`} size="sm" variant="ghost" onClick={() => startRename(tag)} />
                    <IconButton icon="trash" label={`Delete ${tag}`} size="sm" variant="ghost" onClick={() => setPendingDelete({ tag, count })} />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Drawer>
      <Dialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        size="sm"
        title="Delete tag?"
        description={pendingDelete ? `"${pendingDelete.tag}" will be removed from ${pluralize(pendingDelete.count, 'card')}. This cannot be undone.` : undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirmDelete}>
              Delete tag
            </Button>
          </>
        }
      >
        <p>Cards keep their other tags and notes.</p>
      </Dialog>
    </>
  );
}
