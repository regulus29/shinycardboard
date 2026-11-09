/** Public surface of the data layer. Import from here: `import { useOwned, setOwnedQuantity } from '../../data'`. */
export { db, ShinyCardboardDB, SCHEMA_VERSIONS } from './db';
export { clock } from './clock';
export { newId, ownedId } from './ids';
export { subscribeLocalChanges, emitLocalChange } from './changeBus';
export {
  useOwned,
  useOwnedForPrinting,
  useTaggings,
  useTagCounts,
  useDecks,
  useRecentDecks,
  useDeck,
  useSavedSearches,
} from './hooks';
export {
  setOwnedQuantity,
  adjustOwnedQuantity,
  setCardTags,
  addTag,
  addTagToCards,
  removeTag,
  renameTag,
  deleteTag,
  emptyDeck,
  saveDeck,
  duplicateDeck,
  deleteDeck,
  saveSearch,
  deleteSearch,
  normalizeTag,
  type OwnedKey,
  type NewDeck,
  type SavedSearchInput,
} from './mutations';
export { readUserData, restoreBackup } from './backup';
export { CatalogProvider, CatalogGate, useCatalog, useRequiredCatalog, type CatalogState } from './catalog';
export { migrateRetiredKeys, resolvePrintingKey, type MigrationResult } from './catalogMigration';
export { useSearchContext, buildSearchContext } from './searchContext';
export { applyImport, countReplaceRemovals, type ImportMode, type ImportOutcome } from './importEntries';
export { setCardNote } from './cardNote';
