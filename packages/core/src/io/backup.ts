import { SYNC_COLLECTIONS, type UserData } from '../types';
import { validateCollectionRecords } from '../sync/records';
import { isPlainObject } from '../sync/validate';
import { IO_CONFIG } from './config';

type Obj = Record<string, unknown>;

function summarize(problems: string[]): string {
  const shown = problems.slice(0, IO_CONFIG.maxReportedBackupProblems).join('; ');
  const more = problems.length - IO_CONFIG.maxReportedBackupProblems;
  return `Invalid backup: ${shown}${more > 0 ? ` (and ${more} more)` : ''}`;
}

/** Full backup as a JSON string, versioned. */
export function exportBackup(data: UserData, now: number = Date.now()): string {
  const envelope = {
    app: IO_CONFIG.backupAppId,
    version: IO_CONFIG.backupVersion,
    exportedAt: now,
    data,
  };
  return JSON.stringify(envelope, null, 2);
}

function parseJson(json: string): { value: unknown } | { error: string } {
  try {
    return { value: JSON.parse(json) as unknown };
  } catch {
    return { error: 'Not a valid backup: the file is not valid JSON' };
  }
}

function checkEnvelope(root: unknown): string | null {
  if (!isPlainObject(root) || root.app !== IO_CONFIG.backupAppId) {
    return `Not a Shiny Cardboard backup (missing app marker "${IO_CONFIG.backupAppId}")`;
  }
  const version = root.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return 'Invalid backup: version must be a positive whole number';
  }
  if (version > IO_CONFIG.backupVersion) {
    return `This backup is version ${version} but this app reads up to version ${IO_CONFIG.backupVersion}. Update the app and try again`;
  }
  return isPlainObject(root.data) ? null : 'Invalid backup: data must be an object';
}

/** Parse and validate a backup. Unknown extra fields are kept; any malformed or out of range record rejects the file. */
export function importBackup(json: string): { data: UserData } | { error: string } {
  if (json.length > IO_CONFIG.maxInputChars) {
    return { error: `Invalid backup: the file is larger than ${IO_CONFIG.maxInputChars} characters` };
  }
  const parsed = parseJson(json);
  if ('error' in parsed) return parsed;
  const envelopeProblem = checkEnvelope(parsed.value);
  if (envelopeProblem) return { error: envelopeProblem };

  const data = (parsed.value as { data: Obj }).data;
  const problems: string[] = [];
  for (const name of SYNC_COLLECTIONS) {
    const records = data[name];
    if (Array.isArray(records)) problems.push(...validateCollectionRecords(name, records));
    else problems.push(`data.${name} must be a list`);
  }
  if (problems.length > 0) return { error: summarize(problems) };
  return { data: data as unknown as UserData };
}
