import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateExperienceForPublish } from './experience-validation';

type Corpus = {
  cases: Array<{
    name: string;
    definition: unknown;
    expected: { canPublish: boolean; errorCodes: string[] };
  }>;
};

const corpus = JSON.parse(
  readFileSync(
    new URL('../fixtures/experience-publish-corpus.json', import.meta.url),
    'utf8'
  )
) as Corpus;

describe('experience publish differential corpus', () => {
  it.each(corpus.cases)('$name', ({ definition, expected }) => {
    const report = validateExperienceForPublish(definition);
    const errorCodes = [
      ...new Set(report.errors.map(({ code }) => code))
    ].sort();

    expect({ canPublish: report.canPublish, errorCodes }).toEqual(expected);
  });
});
