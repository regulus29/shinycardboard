import rulesConfig from './rules.config.json';
import assistConfig from './assist.config.json';

/** All deck limits and card classification labels. Edit rules.config.json, never the code. */
export type RulesConfig = typeof rulesConfig;
export const defaultRules: RulesConfig = rulesConfig;

/** Tunable heuristics for fill suggestions (taste, not game rules). */
export type AssistConfig = typeof assistConfig;
export const defaultAssist: AssistConfig = assistConfig;
