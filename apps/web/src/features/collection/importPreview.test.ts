import { describe, expect, it } from 'vitest';
import { buildImportPreview, filterIssues, looksLikeBackup } from './importPreview';
import { FIXTURE_CATALOG, KEYS } from './testFixture';

const CSV = ['printingKey,quantity,finish,condition', `${KEYS.vi},2,normal,NM`, `${KEYS.tide},1,foil,LP`, 'not-a-card,1,normal,NM'].join('\n');

describe('buildImportPreview', () => {
  it('reports format, matched rows, copies and issues', () => {
    const preview = buildImportPreview(CSV, FIXTURE_CATALOG, 1);
    expect(preview.result.format).toBe('shinycardboard');
    expect(preview.rows).toBe(2);
    expect(preview.copies).toBe(3);
    expect(preview.errors + preview.warnings).toBeGreaterThan(0);
    expect(preview.exactMatched + preview.result.fuzzyMatched).toBe(preview.rows);
  });

  it('filters issues by severity', () => {
    const { result } = buildImportPreview(CSV, FIXTURE_CATALOG, 1);
    expect(filterIssues(result.issues, 'all')).toHaveLength(result.issues.length);
    expect(filterIssues(result.issues, 'error').every((i) => i.severity === 'error')).toBe(true);
    expect(filterIssues(result.issues, 'warning').every((i) => i.severity === 'warning')).toBe(true);
  });

  it('never throws on junk input', () => {
    expect(() => buildImportPreview('\u0000\u0001', FIXTURE_CATALOG, 1)).not.toThrow();
  });

  it('recognizes JSON backups', () => {
    expect(looksLikeBackup('  {"owned":[]}')).toBe(true);
    expect(looksLikeBackup('name,qty')).toBe(false);
  });
});
