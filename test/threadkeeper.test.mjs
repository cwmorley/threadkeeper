import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { splitScenesForTest, extractCandidateEntitiesForTest } from '../src/threadkeeper-test-api.mjs';

test('splits chapter headings into ordered scenes', () => {
  const scenes = splitScenesForTest('Prelude\n\nCHAPTER I. Arrival\n\nMara arrived.\n\nCHAPTER II. The Map\n\nElias lied.');
  assert.equal(scenes.length, 3);
  assert.equal(scenes[0].title, 'Preamble');
  assert.equal(scenes[1].title, 'CHAPTER I. Arrival');
  assert.equal(scenes[2].ordinal, 2);
});

test('does not mistake ordinary prose beginning with part for a chapter heading', () => {
  const scenes = splitScenesForTest('CHAPTER I. Arrival\n\nMara stayed, in part, because the map was missing.\n\nCHAPTER II. The Map\n\nElias lied.');
  assert.equal(scenes.length, 2);
  assert.match(scenes[0].text, /in part, because/);
});

test('extracts repeated capitalized entity candidates without treating common headings as entities', () => {
  const entities = extractCandidateEntitiesForTest('Mara Venn met Elias Rook. Mara Venn distrusted Elias Rook. Chapter One.');
  assert.equal(entities.find((item) => item.name === 'Mara Venn')?.mentions, 2);
  assert.equal(entities.some((item) => item.name === 'Chapter One'), false);
});

test('filters pronouns and discourse words while retaining character names', () => {
  const entities = extractCandidateEntitiesForTest('She said Yes, but Caroline watched. Dr. Sheppard entered. Caroline waited.');
  assert.equal(entities.find((item) => item.name === 'Caroline')?.mentions, 2);
  assert.equal(entities.find((item) => item.name === 'Sheppard')?.mentions, 1);
  assert.equal(entities.some((item) => ['She', 'Yes', 'But', 'Dr'].includes(item.name)), false);
});

test('ingest removes Gutenberg wrapper and trailing apparatus', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadkeeper-'));
  try {
    const input = path.join(tempDir, 'fixture.txt');
    const output = path.join(tempDir, 'project');
    fs.writeFileSync(input, [
      '*** START OF THE PROJECT GUTENBERG EBOOK TEST ***',
      'Title: Test',
      '',
      'CONTENTS',
      'CHAPTER I 1',
      '',
      'CHAPTER I. Arrival',
      '',
      'Mara arrived.',
      '',
      '=======================================================================',
      'ADVERTISEMENT',
      '',
      'Transcriber’s Notes:',
      'Nothing here.',
      '*** END OF THE PROJECT GUTENBERG EBOOK TEST ***'
    ].join('\n'));

    const result = spawnSync(process.execPath, ['src/threadkeeper.mjs', 'ingest', input, '--out', output], {
      cwd: path.resolve('.'),
      encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.preprocessing.sourceType, 'project-gutenberg');
    assert.equal(manifest.preprocessing.removedTrailingApparatus, true);
    assert.equal(manifest.scenes.length, 1);
    assert.equal(manifest.scenes[0].title, 'CHAPTER I. Arrival');
    assert.equal(manifest.totalWordCount, 2);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
