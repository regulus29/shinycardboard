/**
 * Timestamp for a local edit. Never earlier than the record's previous updatedAt, so a slow or
 * rewound device clock cannot make a new edit lose to the version it just replaced.
 */
export function nextUpdatedAt(now: number, previousUpdatedAt?: number): number {
  return previousUpdatedAt === undefined ? now : Math.max(now, previousUpdatedAt + 1);
}
