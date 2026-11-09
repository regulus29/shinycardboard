import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Link } from 'react-router-dom';
import { exportBackup } from '@sc/core';
import { paths } from '../../app/paths';
import { Badge, Button, Dialog, Icon, SegmentedControl, useToast } from '../../ui';
import { applyImport, countReplaceRemovals, readUserData, useOwned, useRequiredCatalog, type ImportMode } from '../../data';
import { dateStamp, downloadText, formatBytes } from '../../lib/download';
import { ALREADY_IMPORTED_SHARE, IMPORT_MAX_BYTES, ISSUE_PAGE_SIZE, MATCHED_PREVIEW_ROWS } from './constants';
import { pluralize } from './format';
import { FORMAT_LABELS, alreadyImportedShare, buildImportPreview, filterIssues, looksLikeBackup, type ImportPreview, type SeverityFilter } from './importPreview';

interface ImportDialogProps {
  open: boolean;
  onClose: () => void;
}

const MODE_OPTIONS = [
  { value: 'add' as const, label: 'Add to collection' },
  { value: 'replace' as const, label: 'Replace collection' },
];
const SEVERITY_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'error' as const, label: 'Errors' },
  { value: 'warning' as const, label: 'Warnings' },
];

const sizeOf = (text: string) => new Blob([text]).size;
/** Let the browser paint a busy state before a long synchronous parse. */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Import a collection CSV: choose a file or paste text, press Preview, review, then apply. */
export function ImportDialog({ open, onClose }: ImportDialogProps) {
  const catalog = useRequiredCatalog();
  const toast = useToast();
  const owned = useOwned() ?? [];
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState('');
  const [fileText, setFileText] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [backupNotice, setBackupNotice] = useState(false);
  const [sizeError, setSizeError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<ImportMode>('add');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [shown, setShown] = useState(ISSUE_PAGE_SIZE);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const source = fileText ?? pasted;
  const isBackup = looksLikeBackup(source);
  const issues = useMemo(() => (preview ? filterIssues(preview.result.issues, severity) : []), [preview, severity]);
  const removals = useMemo(() => (preview && mode === 'replace' ? countReplaceRemovals(owned, preview.result.entries) : 0), [preview, mode, owned]);
  const doubled = useMemo(() => (preview && mode === 'add' ? alreadyImportedShare(owned, preview.result.entries) : 0), [preview, mode, owned]);
  const looksImported = doubled >= ALREADY_IMPORTED_SHARE && (preview?.rows ?? 0) > 0;
  const canApply = Boolean(preview && preview.rows > 0) && !busy;

  const invalidate = () => {
    setPreview(null);
    setSizeError('');
    setShown(ISSUE_PAGE_SIZE);
  };

  const runPreview = async () => {
    if (isBackup) return;
    if (sizeOf(source) > IMPORT_MAX_BYTES) {
      setPreview(null);
      setSizeError(`That is ${formatBytes(sizeOf(source))}. Imports are limited to ${formatBytes(IMPORT_MAX_BYTES)}; split the file and import it in parts.`);
      return;
    }
    setSizeError('');
    setParsing(true);
    await nextFrame();
    setPreview(buildImportPreview(source, catalog, Date.now()));
    setShown(ISSUE_PAGE_SIZE);
    setParsing(false);
  };

  const load = async (file: File | undefined) => {
    if (!file) return;
    invalidate();
    setFileName(file.name);
    if (file.size > IMPORT_MAX_BYTES) {
      setFileText(null);
      setSizeError(`${file.name} is ${formatBytes(file.size)}. Imports are limited to ${formatBytes(IMPORT_MAX_BYTES)}; split the file and import it in parts.`);
      return;
    }
    setFileText(await file.text());
    setPasted('');
  };

  const reset = () => {
    setPasted('');
    setFileText(null);
    setFileName('');
    setPreview(null);
    setSizeError('');
    setMode('add');
    setSeverity('all');
    setConfirming(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  const downloadBackup = async () => {
    try {
      downloadText(`shiny-cardboard-backup-${dateStamp()}.json`, exportBackup(await readUserData()), 'application/json');
      setBackupNotice(true);
    } catch {
      toast.show({ title: 'Backup failed', tone: 'danger' });
    }
  };

  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const outcome = await applyImport(preview.result.entries, mode);
      const parts = [pluralize(outcome.added, 'new row'), `${outcome.updated.toLocaleString()} updated`];
      if (mode === 'replace') parts.push(`${outcome.removed.toLocaleString()} removed`);
      toast.show({ title: 'Import complete', description: parts.join(', '), tone: 'success' });
      close();
    } catch (error) {
      toast.show({ title: 'Import failed', description: error instanceof Error ? error.message : 'Nothing was changed.', tone: 'danger' });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const onApplyClick = () => (mode === 'replace' ? setConfirming(true) : void apply());

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    void load(event.dataTransfer.files[0]);
  };

  return (
    <>
      <Dialog
        open={open && !confirming}
        onClose={close}
        size="lg"
        title="Import collection"
        description="Shiny Cardboard CSV, TCGplayer CSV, or any CSV with name, set and quantity columns."
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            {preview ? (
              <Button variant="primary" icon="upload" disabled={!canApply} loading={busy} onClick={onApplyClick}>
                {mode === 'replace' ? 'Review replace' : 'Import'}
                {preview.rows > 0 ? ` ${pluralize(preview.rows, 'row')}` : ''}
              </Button>
            ) : (
              <Button variant="primary" disabled={!source.trim() || isBackup} loading={parsing} onClick={() => void runPreview()}>
                Preview
              </Button>
            )}
          </>
        }
      >
        <div className="import">
          <div
            className={`import__drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <Icon name="upload" size="1.5rem" />
            <p className="import__drop-text">{fileName ? `${fileName}${fileText !== null ? ` (${formatBytes(sizeOf(fileText))})` : ''}` : 'Drop a CSV file here'}</p>
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
              Choose file
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv,text/plain,.tsv,.txt"
              className="sr-only"
              aria-label="Choose a collection file"
              tabIndex={-1}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void load(event.target.files?.[0]);
                event.target.value = '';
              }}
            />
          </div>

          <label className="import__paste">
            <span className="import__paste-label">Or paste CSV text</span>
            <textarea
              className="import__textarea"
              rows={4}
              spellCheck={false}
              value={pasted}
              placeholder="name,set,number,quantity"
              onChange={(event) => {
                setPasted(event.target.value);
                setFileText(null);
                setFileName('');
                invalidate();
              }}
            />
          </label>

          {sizeError ? (
            <p className="import__note import__note--error" role="alert">
              {sizeError}
            </p>
          ) : null}
          {isBackup ? (
            <p className="import__note" role="status">
              This looks like a JSON backup. Restore backups from <Link to={paths.settings()} onClick={close}>Settings</Link>, which replaces everything safely.
            </p>
          ) : null}

          {preview ? (
            <section className="import__preview" aria-label="Import preview">
              <dl className="import__facts">
                <div>
                  <dt>Format</dt>
                  <dd>{FORMAT_LABELS[preview.result.format]}</dd>
                </div>
                <div>
                  <dt>Rows read</dt>
                  <dd>{preview.result.rowsRead.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Matched</dt>
                  <dd>{preview.exactMatched.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Fuzzy matched</dt>
                  <dd>{preview.result.fuzzyMatched.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Copies</dt>
                  <dd>{preview.copies.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Issues</dt>
                  <dd>
                    {preview.errors > 0 ? <Badge tone="danger">{preview.errors} errors</Badge> : null}{' '}
                    {preview.warnings > 0 ? <Badge tone="warning">{preview.warnings} warnings</Badge> : null}
                    {preview.errors + preview.warnings === 0 ? <Badge tone="success">None</Badge> : null}
                  </dd>
                </div>
              </dl>

              <SegmentedControl label="Import mode" value={mode} onValueChange={setMode} options={MODE_OPTIONS} />
              <p className="import__mode-note">
                {mode === 'add'
                  ? 'Imported quantities are added to the copies you already own.'
                  : `The imported rows become your whole collection. ${pluralize(removals, 'owned row')} not in the file will be removed.`}
              </p>
              {looksImported ? (
                <p className="import__note import__note--warn" role="status">
                  This file looks already imported: {Math.round(doubled * 100)}% of its rows match copies you own exactly, so adding would double them. Choose Replace if the file is your full collection.
                </p>
              ) : null}

              {preview.rows > 0 ? (
                <details className="import__matched">
                  <summary>Matched rows ({preview.rows.toLocaleString()})</summary>
                  <div className="import__table-wrap">
                    <table className="import__table">
                      <thead>
                        <tr>
                          <th scope="col">Card</th>
                          <th scope="col">Printing</th>
                          <th scope="col">Finish</th>
                          <th scope="col">Condition</th>
                          <th scope="col">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.result.entries.slice(0, MATCHED_PREVIEW_ROWS).map((entry) => {
                          const printing = catalog.printings[entry.printingKey];
                          return (
                            <tr key={entry.id}>
                              <td>{printing ? (catalog.cards[printing.cardKey]?.name ?? entry.printingKey) : entry.printingKey}</td>
                              <td>{printing ? `${printing.setId} ${printing.collectorNumber} ${printing.variant}` : '-'}</td>
                              <td>{entry.finish}</td>
                              <td>{entry.condition}</td>
                              <td>{entry.quantity}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {preview.rows > MATCHED_PREVIEW_ROWS ? <p className="import__mode-note">Showing the first {MATCHED_PREVIEW_ROWS} rows.</p> : null}
                </details>
              ) : null}

              {preview.result.issues.length > 0 ? (
                <div className="import__issues">
                  <SegmentedControl label="Filter issues by severity" size="sm" value={severity} onValueChange={setSeverity} options={SEVERITY_OPTIONS} />
                  <div className="import__table-wrap">
                    <table className="import__table">
                      <thead>
                        <tr>
                          <th scope="col">Line</th>
                          <th scope="col">Row</th>
                          <th scope="col">Severity</th>
                          <th scope="col">Message</th>
                        </tr>
                      </thead>
                      <tbody>
                        {issues.slice(0, shown).map((issue, index) => (
                          <tr key={`${issue.line}-${index}`}>
                            <td>{issue.line || '-'}</td>
                            <td className="import__raw">{issue.raw}</td>
                            <td>
                              <Badge tone={issue.severity === 'error' ? 'danger' : 'warning'}>{issue.severity}</Badge>
                            </td>
                            <td>{issue.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {issues.length > shown ? (
                    <Button variant="ghost" size="sm" onClick={() => setShown((count) => count + ISSUE_PAGE_SIZE)}>
                      Show more ({(issues.length - shown).toLocaleString()} left)
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        size="sm"
        title="Replace your collection?"
        description={`${pluralize(removals, 'owned row')} will be removed and ${pluralize(preview?.rows ?? 0, 'row')} imported.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Go back
            </Button>
            <Button variant="danger" loading={busy} onClick={() => void apply()}>
              Replace collection
            </Button>
          </>
        }
      >
        <p>Removed rows sync to your other devices. A backup lets you undo this by restoring it from Settings.</p>
        <Button variant="secondary" size="sm" icon="download" onClick={() => void downloadBackup()}>
          Download a backup first
        </Button>
        {backupNotice ? <p className="import__mode-note">Backup downloaded.</p> : null}
      </Dialog>
    </>
  );
}
