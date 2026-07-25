/**
 * Re-export seed data and types from store for convenience.
 * External consumers should import from fixture-api/seeds.
 */

export { SEEDS, type SeedData, type JournalEntry, type ScenarioRule, getFixedClock, generateId, type TestStore } from "./store";
