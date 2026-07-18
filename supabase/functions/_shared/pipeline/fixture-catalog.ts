// In-memory ExerciseCatalog over a fixture list — used by the eval harness and
// parse-cli --local so the pipeline runs hermetically (no DB). Mirrors the
// production RPC's semantics via the pg_trgm-compatible trigram scorer.
import type {
  CatalogExercise,
  ExerciseCatalog,
  ScoredCandidate,
} from './resolution.ts';
import { trigramSimilarity } from './trigram.ts';

export interface FixtureExercise {
  id: string;
  canonical_name: string;
  aliases: string[];
}

export class InMemoryCatalog implements ExerciseCatalog {
  constructor(private readonly exercises: FixtureExercise[]) {}

  exactMatch(raw: string): Promise<CatalogExercise | null> {
    const needle = raw.trim().toLowerCase();
    for (const exercise of this.exercises) {
      if (
        exercise.canonical_name.toLowerCase() === needle ||
        exercise.aliases.some((alias) => alias.toLowerCase() === needle)
      ) {
        return Promise.resolve({ id: exercise.id, name: exercise.canonical_name });
      }
    }
    return Promise.resolve(null);
  }

  candidates(raw: string, limit: number): Promise<ScoredCandidate[]> {
    const scored = this.exercises
      .map((exercise) => {
        const names = [exercise.canonical_name, ...exercise.aliases];
        const score = Math.max(
          ...names.map((name) => trigramSimilarity(name, raw))
        );
        return { id: exercise.id, name: exercise.canonical_name, score };
      })
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return Promise.resolve(scored);
  }
}
