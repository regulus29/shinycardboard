import { useMemo } from 'react';
import { formatDeckText } from '@sc/core';
import { downloadText } from '../../lib/download';
import { Button, Dialog, useToast } from '../../ui';
import { useBuilder } from './builderContext';
import { copyText } from './clipboard';
import { EXPORT_MIME } from './constants';

/** Deck list as plain text, ready to copy or save. */
export function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { deck, catalog } = useBuilder();
  const toast = useToast();
  const text = useMemo(() => (open ? formatDeckText(deck, catalog) : ''), [open, deck, catalog]);
  const fileName = `${deck.name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'deck'}.txt`;

  const copy = async () => {
    const ok = await copyText(text);
    toast.show({ title: ok ? 'Deck list copied' : 'Could not copy', tone: ok ? 'success' : 'danger' });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Export deck list"
      description="Plain text, one card per line. Import it into another deck or share it."
      size="md"
      footer={
        <>
          <Button variant="secondary" icon="download" onClick={() => downloadText(fileName, text, EXPORT_MIME)}>
            Download .txt
          </Button>
          <Button icon="copy" onClick={() => void copy()}>
            Copy to clipboard
          </Button>
        </>
      }
    >
      <label className="dk-label" htmlFor="dk-export-text">
        Deck list
      </label>
      <textarea id="dk-export-text" className="dk-textarea" rows={14} readOnly value={text} onFocus={(event) => event.currentTarget.select()} />
    </Dialog>
  );
}
