import test from 'node:test';
import assert from 'node:assert/strict';
import { splitScenesForTest, extractCandidateEntitiesForTest } from '../src/threadkeeper-test-api.mjs';

test('splits chapter headings into ordered scenes', () => {
  const scenes = splitScenesForTest('Prelude\n\nCHAPTER I. Arrival\n\nMara arrived.\n\nCHAPTER II. The Map\n\nElias lied.');
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].title, 'Preamble');
  assert.equal(scenes[1].title, 'CHAPTER I. Arrival');
  assert.equal(scenes[2].ordinal, 2);
});

test('extracts repeated capitalized entity candidates without treating common headings as entities', () => {
  const entities = extractCandidateEntitiesForTest('Mara Venn met Elias Rook. Mara Venn distrusted Elias Rook. Chapter One.');
  assert.equal(entities.find((item) => item.name === 'Mara Venn')?.mentions, 2);
  assert.equal(entities.some((item) => item.name === 'Chapter One'), false);
});
