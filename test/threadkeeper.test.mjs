import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { splitScenesForTest, extractCandidateEntitiesForTest } from '../src/threadkeeper-test-api.mjs';
import { reviewModelDraft } from '../src/revision-assessment.mjs';

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

test('revision assessment includes the ending admission and corrected testimony, and rejects stale source', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadkeeper-revision-'));
  try {
    const input = path.join(tempDir, 'novel.txt');
    const output = path.join(tempDir, 'project');
    fs.writeFileSync(input, [
      '*** START OF THE PROJECT GUTENBERG EBOOK TEST ***',
      'CHAPTER I', 'Dr. Vale left the house. I did what little had to be done.',
      'CHAPTER II', 'Flora said she saw the victim alive.',
      'CHAPTER III', 'Flora said: I never saw my uncle. I was lying.',
      'CHAPTER IV', 'The bag and telephone were found.',
      'CHAPTER V', 'The detective explained the chair and timing.',
      'CHAPTER VI', 'Dr. Vale wrote: I meant to murder him all along.', 'THE END',
      '+==================================================================+', 'Publisher advertising',
      '*** END OF THE PROJECT GUTENBERG EBOOK TEST ***'
    ].join('\n'));
    const run = (...args) => spawnSync(process.execPath, ['src/threadkeeper.mjs', ...args], { cwd: path.resolve('.'), encoding: 'utf8' });
    assert.equal(run('ingest', input, '--out', output).status, 0);
    const manifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.preprocessing.removedTrailingApparatus, true);
    assert.ok(manifest.sourceSha256);
    assert.equal(fs.readFileSync(path.join(output, 'scenes', 'scene-006.md'), 'utf8').includes('Publisher advertising'), false);
    const result = run('assess-revision', output, '--change', 'Make Dr. Vale innocent while preserving the final reveal');
    assert.equal(result.status, 0, result.stderr);
    const reports = fs.readdirSync(path.join(output, 'reports')).filter((name) => name.startsWith('revision-'));
    assert.equal(reports.length, 1);
    const report = fs.readFileSync(path.join(output, 'reports', reports[0]), 'utf8');
    assert.match(report, /direct constraint conflict/i);
    assert.match(report, /scene-006/);
    assert.match(report, /scene-003[\s\S]*corrected testimony candidate/);
    fs.appendFileSync(input, '\nAnother line.');
    const stale = run('assess-revision', output, '--change', 'Make Dr. Vale innocent');
    assert.equal(stale.status, 1);
    assert.match(stale.stderr, /source changed since ingest/i);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('model-authored revision report only replaces diagnostic after grounded response', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadkeeper-model-'));
  const input = path.join(tempDir, 'novel.txt');
  const output = path.join(tempDir, 'project');
  const change = 'Make Mara innocent of murder';
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      assert.match(body, /scene-003/);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: server.draft } }] }));
    });
  });
  try {
    fs.writeFileSync(input, [
      'CHAPTER I', 'Mara arrived at the house.',
      'CHAPTER II', 'The telephone rang and Mara left.',
      'CHAPTER III', 'I meant to murder him all along.'
    ].join('\n'));
    assert.equal(spawnSync(process.execPath, ['src/threadkeeper.mjs', 'ingest', input, '--out', output], { cwd: path.resolve('.'), encoding: 'utf8' }).status, 0);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const run = () => new Promise((resolve) => {
      const child = spawn(process.execPath, ['src/threadkeeper.mjs', 'assess-revision', output, '--change', change, '--call-ai'], {
        cwd: path.resolve('.'),
        env: { ...process.env, THREADKEEPER_API_KEY: 'test', THREADKEEPER_MODEL: 'test', THREADKEEPER_BASE_URL: `http://127.0.0.1:${server.address().port}` }
      });
      let stderr = '';
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('close', (code) => resolve({ code, stderr }));
    });
    server.draft = 'This draft is too short and has no citations.';
    const rejected = await run();
    assert.equal(rejected.code, 1, rejected.stderr);
    const reportName = fs.readdirSync(path.join(output, 'reports')).find((name) => name.startsWith('revision-') && name.endsWith('.md'));
    assert.ok(reportName);
    assert.match(fs.readFileSync(path.join(output, 'reports', reportName), 'utf8'), /deterministic evidence pass/);
    server.draft = [
      '## Editorial decision',
      'Mara’s innocence conflicts with the final admission in scene-003, source line 6. The present confession must change; the surprise can survive.',
      'Scene-001, source line 2 establishes her arrival. Scene-002, source line 4 establishes a telephone call, but not the caller’s identity.',
      '## What should survive',
      'Keep the observed arrival and the fact of the call. Do not keep the inferred culprit merely because the old ending said so.',
      '## Consequences',
      'The downstream obligation is to give the new culprit a feasible opportunity and account for the call. The verification check is whether the early account and revised ending agree.',
      '## Example edit',
      'Proposed example edit for the final account: “I heard the shot after I crossed the hall.” This breaks the old confession and requires independent evidence for the time of the shot.',
      '## Coverage',
      'This assessment uses selected scenes only, not a whole-book audit.'
    ].join('\n').repeat(3);
    const accepted = await run();
    assert.equal(accepted.code, 0, accepted.stderr);
    const name = fs.readdirSync(path.join(output, 'reports')).find((item) => item.startsWith('revision-') && item.endsWith('.md'));
    assert.match(fs.readFileSync(path.join(output, 'reports', name), 'utf8'), /AI revision assessment/);
    const draftPath = path.join(tempDir, 'imported-draft.md');
    fs.writeFileSync(draftPath, server.draft);
    const imported = spawnSync(process.execPath, ['src/threadkeeper.mjs', 'assess-revision', output, '--change', change, '--draft', draftPath], { cwd: path.resolve('.'), encoding: 'utf8' });
    assert.equal(imported.status, 0, imported.stderr);
    assert.match(fs.readFileSync(path.join(output, 'reports', name), 'utf8'), /Imported revision assessment/);
    const reviewPath = path.join(output, 'reports', name.replace(/\.md$/, '-model-review.json'));
    assert.match(JSON.parse(fs.readFileSync(reviewPath, 'utf8')).origin, /imported draft/);
  } finally {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('editorial gate rejects a source line not included in the model packet', () => {
  const evidence = [
    { scene: { id: 'scene-001' }, reasons: ['opening/setup'], passages: [{ text: '1: Mara entered.' }] },
    { scene: { id: 'scene-002' }, reasons: ['ending/reveal'], passages: [{ text: '4: I killed him.' }] }
  ];
  const draft = ('Scene-001, source line 2 claims Mara entered. Scene-002, source line 4 is the confession. ' +
    'This conflicts with innocence. An example edit changes the confession; a downstream obligation is to verify the timeline. ').repeat(12);
  const review = reviewModelDraft(draft, evidence, { scene: { id: 'scene-002' } });
  assert.equal(review.accepted, false);
  assert.match(review.reasons.join(' '), /outside the evidence actually sent/);
});

test('editorial gate accepts an explicit cross-scene edit obligation without magic wording', () => {
  const evidence = [
    { scene: { id: 'scene-001' }, reasons: ['opening/setup'], passages: [{ text: '2: Mara heard the call.' }] },
    { scene: { id: 'scene-002' }, reasons: ['ending/reveal'], passages: [{ text: '4: I meant to murder him.' }] }
  ];
  const draft = [
    '## Editorial decision',
    'The request conflicts with the narrator admission at scene-002, source line 4. Preserve a surprising ending, but change its content.',
    'The phone call is observed in scene-001, source line 2. That observation does not establish the caller.',
    'A replacement solution must assign access, means, time, and motive; do not name an unsupported culprit.',
    '## What survives',
    'Keep the real call and the uncertainty it creates. Readers can still learn later why the first interpretation failed.',
    '## Verification',
    'Check the revised call account against the final explanation, including the message, receiver, and exact time.',
    '## Short example edit',
    'At scene-001, source line 2, let Mara say that the caller claimed to know the victim, without naming that person as fact.',
    'The confession in scene-002, source line 4 must then be rewritten to explain who placed the call and why Mara returned.',
    '## Coverage',
    'Only selected excerpts were examined. This is not a full manuscript audit.'
  ].join('\n') + ' A revised act needs independent evidence and a testable opportunity.'.repeat(18);
  const review = reviewModelDraft(draft, evidence, { scene: { id: 'scene-002' } });
  assert.equal(review.accepted, true, review.reasons.join(' '));
});

test('Roger Ackroyd revision retrieves the setup, correction, and final confession', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'threadkeeper-ackroyd-'));
  const output = path.join(tempDir, 'project');
  try {
    const run = (...args) => spawnSync(process.execPath, ['src/threadkeeper.mjs', ...args], { cwd: path.resolve('.'), encoding: 'utf8' });
    const ingest = run('ingest', 'corpus/pg69087.txt', '--out', output);
    assert.equal(ingest.status, 0, ingest.stderr);
    const assessment = run('assess-revision', output, '--change', 'Make Dr. Sheppard innocent of murder while preserving the events, clues, alibis, and final reveal');
    assert.equal(assessment.status, 0, assessment.stderr);
    const reportName = fs.readdirSync(path.join(output, 'reports')).find((name) => name.startsWith('revision-'));
    const report = fs.readFileSync(path.join(output, 'reports', reportName), 'utf8');
    const prompt = fs.readFileSync(path.join(output, 'prompts', reportName), 'utf8');
    for (const id of ['scene-004', 'scene-005', 'scene-019', 'scene-020', 'scene-024', 'scene-025', 'scene-026', 'scene-027']) {
      assert.match(report, new RegExp(`### ${id}`));
    }
    assert.match(report, /direct constraint conflict/i);
    for (const line of ['1652:', '1867:', '8258:', '8632:', '10470:']) assert.ok(prompt.includes(line), `missing source line ${line}`);
    assert.equal(fs.readFileSync(path.join(output, 'scenes', 'scene-027.md'), 'utf8').includes('The Books You Like to Read'), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
