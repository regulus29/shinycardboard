import { useEffect, useState, type FormEvent } from 'react';
import { Button, Dialog, TextField, useToast } from '../../ui';
import { saveSearch } from '../../data';

interface SaveSearchDialogProps {
  open: boolean;
  query: string;
  onClose: () => void;
}

/** Name dialog for saving the current query as a smart folder in the sidebar. */
export function SaveSearchDialog({ open, query, onClose }: SaveSearchDialogProps) {
  const toast = useToast();
  const [name, setName] = useState(query);
  const [busy, setBusy] = useState(false);

  // Start from the query text each time the dialog opens.
  useEffect(() => {
    if (open) setName(query);
  }, [open, query]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !query.trim()) return;
    setBusy(true);
    try {
      const saved = await saveSearch({ name, query });
      toast.show({ title: 'Search saved', description: `"${saved.name}" now appears in the sidebar.`, tone: 'success' });
      onClose();
    } catch {
      // the data layer already showed a storage error
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Save search"
      description="Saved searches appear in the sidebar and update as your collection changes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="save-search-form" variant="primary" loading={busy} disabled={!name.trim() || !query.trim()}>
            Save search
          </Button>
        </>
      }
    >
      <form id="save-search-form" onSubmit={submit} className="save-search">
        <TextField label="Name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
        <p className="save-search__query">
          Query: <code>{query}</code>
        </p>
      </form>
    </Dialog>
  );
}
