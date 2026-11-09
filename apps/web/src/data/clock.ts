/** Time source for all record stamps. Tests replace `clock.now` for determinism. */
export const clock = {
  now: (): number => Date.now(),
};
