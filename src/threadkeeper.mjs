#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assessRevision } from './revision-assessment.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

const STRUCTURAL_WORDS = new Set(['Chapter', 'Period', 'Narrative', 'Part', 'Book']);
const ENTITY_NOISE_WORDS = new Set([
  'A', 'An', 'And', 'After', 'All', 'Another', 'Any', 'Before', 'But', 'Can',
  'Could', 'Did', 'During', 'Each', 'Even', 'Every', 'First', 'For', 'From',
  'Her', 'Here', 'His', 'How', 'I', 'If', 'In', 'It', 'Later', 'Many', 'Most',
  'Must', 'My', 'Never', 'Next', 'No', 'Not', 'Now', 'Of', 'Once', 'Only',
  'One', 'Our', 'Perhaps', 'Public', 'Quite', 'She', 'Some', 'That', 'The',
  'Their', 'Then', 'There', 'These', 'They', 'This', 'Those', 'To', 'Very',
  'Was', 'We', 'Well', 'When', 'Where', 'What', 'Which', 'Who', 'Why', 'Yes', 'You',
  'Dr', 'Mr', 'Mrs', 'Miss', 'Ms', 'About', 'Are', 'Certainly', 'Does', 'Don',
  'Good', 'Have', 'Just', 'Let', 'Nothing'
]);
const HONORIFIC_PREFIXES = new Set([
  'Captain', 'Colonel', 'Doctor', 'Dr', 'Inspector', 'Major', 'Mister', 'Miss',
  'Mr', 'Mrs', 'Ms', 'Mademoiselle', 'Monsieur', 'Papa', 'Professor', 'Reverend', 'Superintendent'
]);
const LEADING_NOISE_WORDS = new Set([
  ...ENTITY_NOISE_WORDS, 'Again', 'Both', 'Excepting', 'Had', 'Neither', 'Old',
  'Or', 'Poor', 'So', 'Tell', 'Though', 'To', 'With', 'As', 'At', 'By', 'Into',
  'Near', 'On', 'Presently', 'Suddenly', 'Take', 'Through', 'Under', 'Upon',
  'Young', 'Uncle', 'Aunt'
]);
const ORDINAL = '(?:[IVXLCDM]+|[0-9]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)';

function isStructuralPhrase(value) {
  const first = value.split(' ')[0];
  return STRUCTURAL_WORDS.has(value)
    || (STRUCTURAL_WORDS.has(first) && new RegExp(`^${ORDINAL}$`, 'i').test(value.split(' ')[1] || ''));
}

function die(message) {
  console.error(`Threadkeeper: ${message}`);
  process.exitCode = 1;
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command, positional: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    } else {
      args.positional.push(token);
    }
  }
  return args;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'scenario';
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

function cleanText(text) {
  return text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function prepareSource(text) {
  const normalized = cleanText(text);
  const lines = normalized.split('\n');
  const startMarker = lines.findIndex((line) => /^\s*\*\*\* START OF THE PROJECT GUTENBERG EBOOK\b/i.test(line));
  const endMarker = lines.findIndex((line, index) => index > startMarker && /^\s*\*\*\* END OF THE PROJECT GUTENBERG EBOOK\b/i.test(line));
  if (startMarker === -1 && endMarker === -1) {
    return {
      text: normalized,
      lineOffset: 0,
      sourceType: 'manuscript',
      removedWrapper: false,
      removedLinesBeforeNarrative: 0,
      removedTrailingApparatus: false
    };
  }

  let bodyEnd = endMarker === -1 ? lines.length : endMarker;
  let bodyStart = startMarker === -1 ? 0 : startMarker + 1;
  const transcriberNotes = lines.findIndex((line, index) => index > bodyStart && /^\s*transcriber[’']s notes\s*:/i.test(line));
  if (transcriberNotes >= 0 && transcriberNotes < bodyEnd) bodyEnd = transcriberNotes;
  const lastChapterHeading = lines.reduce((last, line, index) => {
    return index > bodyStart && new RegExp(`^\\s*chapter\\s+${ORDINAL}(?:\\b|[.:—-])`, 'i').test(line) ? index : last;
  }, -1);
  const advertisementDivider = lines.findIndex((line, index) => index > lastChapterHeading && index < bodyEnd && /^\s*={20,}\s*$/.test(line));
  const endOfNarrative = lines.findIndex((line, index) => index > lastChapterHeading && index < bodyEnd && /^\s*THE END\s*$/i.test(line));
  const removedTrailingApparatus = advertisementDivider >= 0 || transcriberNotes >= 0 || (endOfNarrative >= 0 && endOfNarrative + 1 < bodyEnd);
  if (advertisementDivider >= 0) bodyEnd = advertisementDivider;
  if (endOfNarrative >= 0) bodyEnd = Math.min(bodyEnd, endOfNarrative + 1);
  const firstHeading = lines.slice(bodyStart, bodyEnd).findIndex((line) => line.trim() && isChapterHeading(line.trim()));
  if (firstHeading >= 0) bodyStart += firstHeading;

  return {
    text: lines.slice(bodyStart, bodyEnd).join('\n').trim(),
    lineOffset: bodyStart,
    sourceType: 'project-gutenberg',
    removedWrapper: true,
    removedLinesBeforeNarrative: bodyStart - (startMarker === -1 ? 0 : startMarker + 1),
    removedTrailingApparatus
  };
}

function normalizeHeading(line) {
  return line.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim();
}

function isChapterHeading(line) {
  const normalized = normalizeHeading(line);
  if (new RegExp(String.raw`^(?:chapter|part|period|book)\s+${ORDINAL}\s+\d+\s*$`, 'i').test(normalized)) return false;
  return new RegExp(String.raw`^(?:chapter|part|period|book)\s+${ORDINAL}(?:\b|[.:—-])`, 'i').test(normalized)
    || /^the\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:period|part)\b/i.test(normalized)
    || /^(?:prologue|epilogue|introduction|foreword|afterword)\b/i.test(normalized);
}

function splitScenes(text) {
  const prepared = prepareSource(text);
  const lines = prepared.text.split('\n');
  const headings = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (line && isChapterHeading(line)) headings.push({ index, title: normalizeHeading(line) });
  }

  if (headings.length === 0) {
    return [{ id: 'scene-001', ordinal: 1, title: 'Imported manuscript', startLine: 1, endLine: lines.length, text: lines.join('\n').trim() }];
  }

  const scenes = [];
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i];
    const next = headings[i + 1];
    const start = heading.index;
    const end = next ? next.index : lines.length;
    const sceneText = lines.slice(start + 1, end).join('\n').trim();
    scenes.push({
      id: `scene-${String(i + 1).padStart(3, '0')}`,
      ordinal: i + 1,
      title: heading.title,
      startLine: start + 1 + prepared.lineOffset,
      endLine: end + prepared.lineOffset,
      text: sceneText
    });
  }

  const preamble = lines.slice(0, headings[0].index).join('\n').trim();
  if (preamble && !prepared.removedWrapper) {
    scenes.unshift({
      id: 'scene-000', ordinal: 0, title: 'Preamble', startLine: 1,
      endLine: headings[0].index + prepared.lineOffset, text: preamble
    });
  }
  return scenes;
}

function wordCount(text) {
  return (text.match(/\b[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*\b/gu) || []).length;
}

function sentenceCount(text) {
  return Math.max(0, (text.match(/[.!?](?:["'”’)]*)?(?=\s|$)/g) || []).length);
}

function canonicalizeCandidate(value) {
  const words = value.trim().split(/\s+/);
  while (words.length > 1 && (HONORIFIC_PREFIXES.has(words[0]) || LEADING_NOISE_WORDS.has(words[0]))) words.shift();
  return words.join(' ');
}

function isEntityNoise(value) {
  const words = value.split(' ');
  return value.length < 3
    || isStructuralPhrase(value)
    || (words.length === 1 && (ENTITY_NOISE_WORDS.has(value) || HONORIFIC_PREFIXES.has(value)));
}

function mergeEntityCandidates(entries) {
  const normalized = new Map();
  for (const entry of entries) {
    const name = canonicalizeCandidate(entry.name);
    if (isEntityNoise(name)) continue;
    const current = normalized.get(name) || { name, mentions: 0 };
    current.mentions += entry.mentions;
    normalized.set(name, current);
  }

  const byName = new Map([...normalized].map(([name, entry]) => [name, entry]));
  const fullNamesBySurname = new Map();
  for (const name of normalized.keys()) {
    const words = name.split(' ');
    if (words.length > 1) {
      const surname = words.at(-1);
      const names = fullNamesBySurname.get(surname) || [];
      names.push(name);
      fullNamesBySurname.set(surname, names);
    }
  }
  const used = new Set();
  const merged = [];
  for (const entry of [...normalized.values()].sort((a, b) => b.name.split(' ').length - a.name.split(' ').length || b.mentions - a.mentions)) {
    if (used.has(entry.name)) continue;
    const words = entry.name.split(' ');
    const aliases = [];
    if (words.length > 1) {
      const surname = words.at(-1);
      const surnameEntry = byName.get(surname);
      const fullNames = fullNamesBySurname.get(surname) || [];
      if (surnameEntry && surnameEntry.name !== entry.name && fullNames.length === 1) {
        used.add(surnameEntry.name);
        aliases.push(surnameEntry.name);
        entry.mentions += surnameEntry.mentions;
      }
    }
    used.add(entry.name);
    merged.push(aliases.length ? { ...entry, aliases } : { ...entry });
  }
  return merged.sort((a, b) => b.mentions - a.mentions || a.name.localeCompare(b.name));
}

function extractCandidateEntities(text) {
  const candidates = new Map();
  const pattern = /\b[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}\b/g;
  for (const line of cleanText(text).split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isChapterHeading(trimmed)) continue;
    for (const match of trimmed.matchAll(pattern)) {
      const value = canonicalizeCandidate(match[0].trim());
      if (isEntityNoise(value)) continue;
      const count = candidates.get(value) || 0;
      candidates.set(value, count + 1);
    }
  }
  return mergeEntityCandidates([...candidates.entries()].map(([name, mentions]) => ({ name, mentions })));
}

function extractMarkers(text) {
  const markers = [];
  const patterns = [
    { type: 'relative-time', regex: /\b(?:yesterday|today|tomorrow|last night|this morning|the next day|three days later|a week later|that evening)\b/gi },
    { type: 'uncertainty', regex: /\b(?:perhaps|maybe|possibly|seemed|appeared|could have|might have|I think|I suppose)\b/gi },
    { type: 'open-edit', regex: /(?:\[\s*(?:TODO|TBD|FIXME|CHECK)[^\]]*\]|\?{2,}|TODO|TBD|FIXME)/gi }
  ];
  for (const { type, regex } of patterns) {
    for (const match of text.matchAll(regex)) markers.push({ type, value: match[0], index: match.index });
  }
  return markers;
}

function sceneSummary(scene) {
  const paragraphs = scene.text.split(/\n\s*\n/).filter(Boolean);
  const sentences = sentenceCount(scene.text);
  return {
    id: scene.id,
    ordinal: scene.ordinal,
    title: scene.title,
    startLine: scene.startLine,
    endLine: scene.endLine,
    wordCount: wordCount(scene.text),
    paragraphCount: paragraphs.length,
    sentenceCount: sentences,
    averageSentenceLength: sentences ? Math.round(wordCount(scene.text) / sentences * 10) / 10 : 0,
    candidateEntities: extractCandidateEntities(scene.text).slice(0, 30),
    markers: extractMarkers(scene.text)
  };
}

function markdownScene(scene) {
  return `---\ntype: scene\nscene_id: ${scene.id}\nordinal: ${scene.ordinal}\nsource_start_line: ${scene.startLine}\nsource_end_line: ${scene.endLine}\n---\n\n# ${scene.title}\n\n${scene.text}\n`;
}

function relative(from, to) {
  return path.relative(from, to).replaceAll('\\', '/');
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function importReport(manifest) {
  const warnings = [];
  const empty = manifest.scenes.filter((scene) => scene.wordCount < 20);
  if (empty.length) warnings.push(`- ${empty.length} scene(s) contain fewer than 20 words: ${empty.map((scene) => scene.id).join(', ')}`);
  const duplicateTitles = manifest.scenes
    .map((scene) => scene.title.toLowerCase())
    .filter((title, index, values) => values.indexOf(title) !== index);
  if (duplicateTitles.length) warnings.push(`- Duplicate scene titles detected: ${[...new Set(duplicateTitles)].join(', ')}`);
  const openMarkers = manifest.scenes.flatMap((scene) => scene.markers.filter((marker) => marker.type === 'open-edit').map((marker) => `${scene.id}: ${marker.value}`));
  if (openMarkers.length) warnings.push(`- Explicit open-edit markers found: ${openMarkers.join('; ')}`);

  return `# Import Report\n\n## Summary\n\n- Source: ${manifest.source}\n- Imported scenes: ${manifest.scenes.length}\n- Total words: ${manifest.totalWordCount.toLocaleString()}\n- Candidate entities: ${manifest.entities.length}\n- Generated: ${manifest.generatedAt}\n\n## Warnings\n\n${warnings.length ? warnings.join('\n') : '- No deterministic import warnings.'}\n\n## Important boundary\n\nCandidate entities are extraction hints, not accepted canon. No source prose was rewritten.\n`;
}

async function ingest(args) {
  const input = args.positional[0];
  if (!input) return die('ingest requires an input text or Markdown file.');
  const output = path.resolve(args.out || 'work/project');
  const inputPath = path.resolve(input);
  const text = await readText(inputPath);
  const preprocessing = prepareSource(text);
  const scenes = splitScenes(text);
  const summaries = scenes.map(sceneSummary);
  const entityMap = new Map();
  for (const scene of summaries) {
    for (const entity of scene.candidateEntities) entityMap.set(entity.name, (entityMap.get(entity.name) || 0) + entity.mentions);
  }
  const manifest = {
    schemaVersion: '0.1',
    project: path.basename(output),
    source: inputPath,
    sourceSha256: createHash('sha256').update(text).digest('hex'),
    generatedAt: new Date().toISOString(),
    preprocessing: {
      sourceType: preprocessing.sourceType,
      removedWrapper: preprocessing.removedWrapper,
      removedLinesBeforeNarrative: preprocessing.removedLinesBeforeNarrative,
      removedTrailingApparatus: preprocessing.removedTrailingApparatus
    },
    totalWordCount: summaries.reduce((sum, scene) => sum + scene.wordCount, 0),
    scenes: summaries,
    entities: mergeEntityCandidates([...entityMap.entries()].map(([name, mentions]) => ({ name, mentions })))
  };

  await ensureDir(output);
  await ensureDir(path.join(output, 'scenes'));
  await ensureDir(path.join(output, 'reports'));
  await ensureDir(path.join(output, 'prompts'));
  await writeJson(path.join(output, 'manifest.json'), manifest);
  for (const scene of scenes) await fs.writeFile(path.join(output, 'scenes', `${scene.id}.md`), markdownScene(scene), 'utf8');
  await fs.writeFile(path.join(output, 'reports', 'import-report.md'), importReport(manifest), 'utf8');
  console.log(`Imported ${manifest.scenes.length} scene(s), ${manifest.totalWordCount.toLocaleString()} words.`);
  console.log(`Project: ${output}`);
}

function reviewReport(manifest) {
  const findings = [];
  const repeated = manifest.entities.filter((entity) => entity.mentions >= 8).slice(0, 25);
  if (repeated.length) findings.push({ severity: 'info', type: 'entity-coverage', message: `Frequently mentioned candidate entities: ${repeated.map((entry) => `${entry.name} (${entry.mentions})`).join(', ')}.` });
  const timeScenes = manifest.scenes.filter((scene) => scene.markers.some((marker) => marker.type === 'relative-time'));
  if (timeScenes.length >= 2) findings.push({ severity: 'review', type: 'timeline', message: `Relative-time language appears in ${timeScenes.length} scenes. A temporal review is warranted; the prototype does not yet infer exact dates.` });
  const uncertaintyScenes = manifest.scenes.filter((scene) => scene.markers.some((marker) => marker.type === 'uncertainty'));
  if (uncertaintyScenes.length) findings.push({ severity: 'review', type: 'epistemic-language', message: `Uncertainty markers appear in ${uncertaintyScenes.length} scenes. These may indicate unreliable narration, deliberate ambiguity, or facts that need confirmation.` });
  const shortScenes = manifest.scenes.filter((scene) => scene.wordCount < 100);
  if (shortScenes.length) findings.push({ severity: 'info', type: 'scene-size', message: `${shortScenes.length} scene(s) are under 100 words. Confirm whether these are intentional fragments, headings, or import boundaries.` });

  return `# Deterministic Review\n\nGenerated: ${new Date().toISOString()}\n\nThis report is a first-pass diagnostic. It does not claim that a flagged pattern is a story flaw.\n\n## Findings\n\n${findings.length ? findings.map((finding, index) => `### ${index + 1}. ${finding.type} (${finding.severity})\n\n${finding.message}`).join('\n\n') : 'No deterministic findings.'}\n\n## Candidate entities\n\n${manifest.entities.slice(0, 50).map((entity) => `- ${entity.name} — ${entity.mentions} mention(s)`).join('\n')}\n`;
}

async function loadManifest(project) {
  return JSON.parse(await readText(path.join(project, 'manifest.json')));
}

async function review(args) {
  const project = path.resolve(args.positional[0] || 'work/project');
  const manifest = await loadManifest(project);
  await fs.writeFile(path.join(project, 'reports', 'review.md'), reviewReport(manifest), 'utf8');
  console.log(`Wrote ${path.join(project, 'reports', 'review.md')}`);
}

function buildSummaryPrompt(manifest, reviewText, scenarioText = '') {
  const sceneInventory = manifest.scenes.map((scene) => {
    const markerTypes = [...new Set(scene.markers.map((marker) => marker.type))];
    return `- ${scene.id} — ${scene.title} — ${scene.wordCount} words${markerTypes.length ? ` — markers: ${markerTypes.join(', ')}` : ''}`;
  }).join('\n');
  const entityList = manifest.entities.slice(0, 80)
    .map((entity) => `${entity.name} (${entity.mentions}${entity.aliases?.length ? `; aliases: ${entity.aliases.join(', ')}` : ''})`)
    .join(', ');

  return `# Threadkeeper AI Editorial Summary\n\nYou are an evidence-first developmental editor reviewing a narrative-state diagnostic. Produce a concise but useful summary for the novelist. Do not rewrite the manuscript, invent facts, or promote an extraction hint to canon. Distinguish confirmed observations, interpretation, possible intentional ambiguity, and unresolved uncertainty. Reference scene IDs and titles whenever making a specific claim.\n\n## Required output\n\n1. Executive summary in plain English.\n2. What appears structurally healthy.\n3. Highest-priority continuity or narrative risks, ranked by consequence.\n4. Timeline and relative-time watchlist.\n5. Character, entity, and knowledge-state watchlist.\n6. Potential deliberate ambiguity versus likely extraction noise or possible flaw.\n7. Revision-scenario implications, if supplied.\n8. Three to seven concrete next actions for the writer.\n9. A short list of decisions that require author judgment rather than AI inference.\n\nFor each flagged risk, include: evidence, confidence (high/medium/low), why it matters, and the smallest useful next check. Do not call something a contradiction merely because the deterministic layer found a repeated word, uncertainty marker, or differing description.\n\n## Project\n\n- Name: ${manifest.project}\n- Source: ${manifest.source}\n- Source type: ${manifest.preprocessing?.sourceType || 'unknown'}\n- Imported scenes: ${manifest.scenes.length}\n- Total words: ${manifest.totalWordCount.toLocaleString()}\n- Preprocessing: ${manifest.preprocessing?.removedWrapper ? 'source wrapper removed' : 'no wrapper removal'}; ${manifest.preprocessing?.removedTrailingApparatus ? 'trailing apparatus removed' : 'no trailing apparatus removal'}\n\n## Scene inventory\n\n${sceneInventory}\n\n## Candidate entities\n\n${entityList || '(none extracted)'}\n\n## Deterministic review\n\n${reviewText}\n\n## Optional revision scenario\n\n${scenarioText || '(none supplied)'}\n`;
}

async function summarize(args) {
  const project = path.resolve(args.positional[0] || 'work/project');
  const manifest = await loadManifest(project);
  const reviewPath = path.join(project, 'reports', 'review.md');
  const reviewText = await fs.readFile(reviewPath, 'utf8').catch(() => reviewReport(manifest));
  let scenarioText = '';
  if (args.scenario && typeof args.scenario === 'string') {
    const scenarioPath = path.resolve(args.scenario);
    scenarioText = await readText(scenarioPath);
  }

  const prompt = buildSummaryPrompt(manifest, reviewText, scenarioText);
  const promptPath = path.join(project, 'prompts', 'summary.md');
  await ensureDir(path.join(project, 'prompts'));
  await ensureDir(path.join(project, 'reports'));
  await fs.writeFile(promptPath, prompt, 'utf8');
  console.log(`Wrote ${promptPath}`);

  if (args['call-ai']) {
    try {
      const result = await callAI(prompt);
      if (result) {
        const reportPath = path.join(project, 'reports', 'ai-summary.md');
        await fs.writeFile(reportPath, `# AI Editorial Summary — ${manifest.project}\n\n${result}\n`, 'utf8');
        console.log(`Wrote ${reportPath}`);
      } else {
        console.log('AI variables are not configured; prompt packet is ready for manual review.');
      }
    } catch (error) {
      return die(error.message);
    }
  }
}

function parseSceneSelection(value, manifest) {
  if (!value || typeof value !== 'string') return [];
  const selected = new Set();
  for (const token of value.split(',')) {
    const trimmed = token.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Math.min(Number(range[1]), Number(range[2]));
      const end = Math.max(Number(range[1]), Number(range[2]));
      for (let ordinal = start; ordinal <= end; ordinal += 1) selected.add(ordinal);
    } else if (/^\d+$/.test(trimmed)) {
      selected.add(Number(trimmed));
    }
  }
  return manifest.scenes.filter((scene) => selected.has(scene.ordinal));
}

function selectDeepScenes(manifest, args) {
  if (args['all-scenes']) return manifest.scenes;
  const explicit = parseSceneSelection(args.scenes, manifest);
  if (explicit.length) return explicit;

  const target = Number(args.scene);
  if (Number.isFinite(target) && target > 0) {
    const windowSize = Math.max(0, Number(args.window || 2));
    return manifest.scenes.filter((scene) => Math.abs(scene.ordinal - target) <= windowSize);
  }

  const ordinals = new Set([1, 2, 3, Math.ceil(manifest.scenes.length / 2), manifest.scenes.length - 1, manifest.scenes.length]);
  return manifest.scenes.filter((scene) => ordinals.has(scene.ordinal));
}

function truncateEvidence(text, maxChars) {
  if (text.length <= maxChars) return text;
  const head = Math.floor(maxChars * 0.65);
  const tail = maxChars - head;
  return `${text.slice(0, head)}\n\n[... evidence truncated for context budget ...]\n\n${text.slice(-tail)}`;
}

function buildDeepSummaryPrompt(manifest, reviewText, scenarioText, scenePackets, consequenceReports) {
  const sceneEvidence = scenePackets.map(({ scene, text }) => `## ${scene.id} — ${scene.title}\n\n${text}`).join('\n\n');
  const consequences = consequenceReports.length
    ? consequenceReports.map(({ name, text }) => `### ${name}\n\n${text}`).join('\n\n')
    : '(No completed AI consequence reports were found; use the scene evidence and deterministic state only.)';
  return `# Threadkeeper Deep AI Editorial Summary\n\nYou are a senior developmental editor and narrative-continuity analyst. Analyze the supplied narrative-state evidence and selected scene packets. This is an evidence-linked review, not a rewrite. Do not invent events, character knowledge, chronology, motives, or authorial intent. Treat candidate entities and deterministic markers as fallible signals. Distinguish confirmed observation, strong inference, plausible interpretation, and unknown.\n\nThe evidence is bounded. If only selected scenes are supplied, explicitly say what cannot be concluded about unprovided scenes. Do not pretend a sampled review is a complete audit.\n\n## Required output\n\n1. A concise synopsis of the story movement represented by the evidence.\n2. The strongest continuity and causality observations, with scene references.\n3. A ranked watchlist of possible contradictions, unresolved dependencies, or suspicious discontinuities. For each: evidence, confidence, why it matters, and the smallest confirming check.\n4. Character-state and reader-knowledge transitions: who learns, believes, hides, misunderstands, or appears to misunderstand what.\n5. Timeline and relative-time analysis, including competing interpretations rather than false precision.\n6. Clue, setup, payoff, red-herring, and reveal dependencies visible in the evidence.\n7. Tone, POV, voice, and pacing observations limited to the supplied prose.\n8. Implications of the proposed revision scenario, including what should remain untouched.\n9. Three to seven prioritized next actions for the writer.\n10. A short “do not overreact” section identifying flags that are probably extraction noise or deliberate ambiguity.\n\nUse scene IDs and titles for claims. Quote only short fragments when necessary. Never rewrite source prose or update canon automatically.\n\n## Project state\n\n- Project: ${manifest.project}\n- Source: ${manifest.source}\n- Imported scenes: ${manifest.scenes.length}\n- Total words: ${manifest.totalWordCount.toLocaleString()}\n- Source type: ${manifest.preprocessing?.sourceType || 'unknown'}\n- Preprocessing: ${manifest.preprocessing?.removedWrapper ? 'wrapper removed' : 'no wrapper removal'}; ${manifest.preprocessing?.removedTrailingApparatus ? 'trailing apparatus removed' : 'no trailing apparatus removal'}\n- Evidence scenes supplied below: ${scenePackets.length}\n\n## Deterministic review\n\n${reviewText}\n\n## Revision scenario\n\n${scenarioText || '(No revision scenario supplied.)'}\n\n## Selected scene evidence\n\n${sceneEvidence}\n\n## Completed consequence reports\n\n${consequences}\n`;
}

async function deepSummarize(args) {
  const project = path.resolve(args.positional[0] || 'work/project');
  const manifest = await loadManifest(project);
  const reviewPath = path.join(project, 'reports', 'review.md');
  const reviewText = await fs.readFile(reviewPath, 'utf8').catch(() => reviewReport(manifest));
  let scenarioText = '';
  if (args.scenario && typeof args.scenario === 'string') scenarioText = await readText(path.resolve(args.scenario));

  const selectedScenes = selectDeepScenes(manifest, args);
  const maxSceneChars = Math.max(2000, Number(args['max-scene-chars'] || 24000));
  const scenePackets = [];
  for (const scene of selectedScenes) {
    const scenePath = path.join(project, 'scenes', `${scene.id}.md`);
    const text = await readText(scenePath);
    scenePackets.push({ scene, text: truncateEvidence(text, maxSceneChars) });
  }

  const consequenceReports = [];
  const reportFiles = await fs.readdir(path.join(project, 'reports')).catch(() => []);
  for (const name of reportFiles.filter((file) => /^consequence-.*\.md$/i.test(file))) {
    consequenceReports.push({ name, text: await readText(path.join(project, 'reports', name)) });
  }

  const prompt = buildDeepSummaryPrompt(manifest, reviewText, scenarioText, scenePackets, consequenceReports);
  const promptPath = path.join(project, 'prompts', 'deep-summary.md');
  await ensureDir(path.join(project, 'prompts'));
  await ensureDir(path.join(project, 'reports'));
  await fs.writeFile(promptPath, prompt, 'utf8');
  console.log(`Selected ${scenePackets.length} scene(s) for deep summary evidence.`);
  console.log(`Wrote ${promptPath}`);

  if (args['call-ai']) {
    try {
      const result = await callAI(prompt);
      if (result) {
        const reportPath = path.join(project, 'reports', 'deep-ai-summary.md');
        await fs.writeFile(reportPath, `# Deep AI Editorial Summary — ${manifest.project}\n\n${result}\n`, 'utf8');
        console.log(`Wrote ${reportPath}`);
      } else {
        console.log('AI variables are not configured; deep-summary prompt packet is ready for manual review.');
      }
    } catch (error) {
      return die(error.message);
    }
  }
}

function buildConsequencePrompt(manifest, scene, previousScenes) {
  const entityList = manifest.entities.slice(0, 100).map((entity) => `${entity.name} (${entity.mentions} mentions)`).join(', ');
  const previous = previousScenes.map((item) => `## ${item.title}\n\n${item.text}`).join('\n\n');
  return `# Threadkeeper Consequence Pass\n\nYou are a feedback-first narrative-state partner. Do not rewrite the manuscript. Analyze the target scene against the preceding material and return an evidence-linked state update.\n\n## Required output\n\n1. Events that occurred\n2. Facts established or changed\n3. Character-state changes\n4. Relationship changes\n5. What each important character now knows, believes, or misunderstands\n6. Plot threads advanced or stalled\n7. New setups and open loops\n8. Possible continuity conflicts with earlier material\n9. Voice, POV, pacing, or causality observations\n10. Three concrete suggestions for the next scene\n\nFor every possible conflict, quote or reference the relevant scene title and explain whether it could be intentional. Use confidence labels: high, medium, or low. Separate confirmed observations from interpretations. Do not promote anything to canon automatically.\n\n## Candidate entities\n\n${entityList || '(none extracted)'}\n\n## Earlier material\n\n${previous || '(no earlier scenes supplied)'}\n\n## Target scene\n\n## ${scene.title}\n\n${scene.text}\n`;
}

async function callAI(prompt, options = {}) {
  const local = options.localModel;
  if (local) {
    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      signal: AbortSignal.timeout(600000),
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: local, stream: true, messages: [{ role: 'user', content: prompt }], options: { num_ctx: 32768, num_predict: 2500, temperature: 0.2 } })
    });
    if (!response.ok) throw new Error(`Local AI returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
    let pending = '';
    let answer = '';
    const decoder = new TextDecoder();
    for await (const chunk of response.body) {
      pending += decoder.decode(chunk, { stream: true });
      const records = pending.split('\n');
      pending = records.pop() || '';
      for (const record of records) {
        if (!record.trim()) continue;
        const payload = JSON.parse(record);
        if (payload.error) throw new Error(`Local AI error: ${payload.error}`);
        answer += payload.message?.content || '';
      }
    }
    pending += decoder.decode();
    if (pending.trim()) {
      const payload = JSON.parse(pending);
      if (payload.error) throw new Error(`Local AI error: ${payload.error}`);
      answer += payload.message?.content || '';
    }
    return answer;
  }
  const apiKey = process.env.THREADKEEPER_API_KEY;
  const baseUrl = (process.env.THREADKEEPER_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.THREADKEEPER_MODEL;
  if (!apiKey || !model) return null;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(300000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'user', content: prompt }] })
  });
  if (!response.ok) throw new Error(`AI endpoint returned ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content || '(No AI content returned.)';
}

async function consequence(args) {
  const project = path.resolve(args.positional[0] || 'work/project');
  const manifest = await loadManifest(project);
  const sceneNumber = Number(args.scene || 1);
  const scene = manifest.scenes.find((item) => item.ordinal === sceneNumber) || manifest.scenes[sceneNumber - 1];
  if (!scene) return die(`scene ${sceneNumber} was not found.`);
  const allScenes = await Promise.all(manifest.scenes.filter((item) => item.ordinal < scene.ordinal).slice(-3).map(async (item) => ({ ...item, text: await readText(path.join(project, 'scenes', `${item.id}.md`)) })));
  const targetText = await readText(path.join(project, 'scenes', `${scene.id}.md`));
  const prompt = buildConsequencePrompt(manifest, { ...scene, text: targetText }, allScenes);
  const promptPath = path.join(project, 'prompts', `consequence-${scene.id}.md`);
  await fs.writeFile(promptPath, prompt, 'utf8');
  console.log(`Wrote ${promptPath}`);
  if (args['call-ai']) {
    try {
      const result = await callAI(prompt);
      if (result) {
        const reportPath = path.join(project, 'reports', `consequence-${scene.id}.md`);
        await fs.writeFile(reportPath, `# Consequence Pass — ${scene.title}\n\n${result}\n`, 'utf8');
        console.log(`Wrote ${reportPath}`);
      } else {
        console.log('AI variables are not configured; prompt packet is ready for manual review.');
      }
    } catch (error) {
      return die(error.message);
    }
  }
}

function scenarioImpact(manifest, change) {
  const lowerChange = change.toLowerCase();
  const containsPhrase = (text, phrase) => new RegExp(`(^|[^a-z0-9])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^a-z0-9])`, 'i').test(text);
  const matchedEntities = manifest.entities.filter((entity) => [entity.name, ...(entity.aliases || [])].some((name) => containsPhrase(lowerChange, name.toLowerCase())));
  const matchedNames = new Set(matchedEntities.flatMap((entity) => [entity.name, ...(entity.aliases || [])]).map((name) => name.toLowerCase()));
  const affectedScenes = manifest.scenes.filter((scene) => {
    const sceneEntities = scene.candidateEntities.map((entity) => entity.name.toLowerCase());
    return sceneEntities.some((entity) => [...matchedNames].some((matched) => entity.includes(matched) || matched.includes(entity)));
  });
  const keywords = ['plot', 'subplot', 'character', 'relationship', 'timeline', 'reveal', 'ending', 'motive', 'secret', 'mystery', 'rule', 'setting', 'narrator', 'perspective', 'death', 'survive', 'romance', 'antagonist', 'protagonist', 'conceal', 'suspect', 'theft', 'knowledge', 'uncertainty'];
  const changeDomains = keywords.filter((keyword) => containsPhrase(lowerChange, keyword));
  const relativeTimeScenes = manifest.scenes.filter((scene) => scene.markers.some((marker) => marker.type === 'relative-time'));
  return { matchedEntities, affectedScenes, changeDomains, relativeTimeScenes };
}

function scenarioReport(manifest, change, impact, scenarioId) {
  const entityLines = impact.matchedEntities.length
    ? impact.matchedEntities.map((entity) => `- ${entity.name} — ${entity.mentions} candidate mention(s)`).join('\n')
    : '- No existing entity names were matched. Treat this as a new or underspecified canon change.';
  const sceneLines = impact.affectedScenes.length
    ? impact.affectedScenes.map((scene) => `- [[${scene.id}]] — ${scene.title} — ${scene.wordCount.toLocaleString()} words`).join('\n')
    : '- No scenes were matched by extracted entity mentions.';
  const domainLines = impact.changeDomains.length ? impact.changeDomains.map((domain) => `- ${domain}`).join('\n') : '- No domain keywords were detected; AI or writer clarification is required.';
  return `# Revision Scenario — ${scenarioId}\n\n## Proposed change\n\n${change}\n\n## What the prototype matched\n\n### Entities\n\n${entityLines}\n\n### Candidate affected scenes\n\n${sceneLines}\n\n### Detected change domains\n\n${domainLines}\n\n## Impact categories to review\n\n### Required changes\n\n- Confirm whether the proposed change alters accepted canon or is only an alternate draft direction.\n- Recheck every matched scene for character motivation, knowledge state, and event causality.\n- Recheck all scenes after the first reveal or turning point related to the change.\n- Re-run timeline and setup/payoff validation after any accepted edit.\n\n### Likely changes\n\n- Character arcs and relationship progression.\n- Reader knowledge and reveal timing.\n- Plot-thread status and unresolved loops.\n- Voice, POV, and emotional interpretation of earlier scenes.\n\n### Possible opportunities\n\n- Earlier passages may become foreshadowing rather than exposition.\n- Apparent contradictions may become deliberate deception or misdirection.\n- Dormant subplots may gain a new causal role.\n- Existing scenes may become more economical if duplicated explanation is removed.\n\n## Revision order\n\n1. Decide the intended canon and reveal timing.\n2. Resolve character knowledge and belief changes.\n3. Resolve timeline and causal dependencies.\n4. Update plot threads, setups, and payoffs.\n5. Revise affected scenes in reading order.\n6. Run a new Consequence Pass on each accepted scene.\n7. Run final continuity, voice, and reader-knowledge reviews.\n\n## Current limitations\n\nThis is an impact scaffold, not a semantic proof. It does not yet infer plot causality, distinguish intentional contradiction from error, or know whether a character's knowledge changed. Those are the next narrative-state features to implement.\n\nNo source prose or canon was changed.\n`;
}

function scenarioPrompt(manifest, change, impact, targetText) {
  const entityList = impact.matchedEntities.map((entity) => entity.name).join(', ') || '(none matched)';
  const sceneList = impact.affectedScenes.map((scene) => `${scene.id}: ${scene.title}`).join('\n') || '(none matched)';
  return `# Threadkeeper Revision Scenario\n\nYou are analyzing a proposed change to an existing novel. Do not rewrite anything yet. Treat the current manuscript as evidence, not as unquestionable canon. Distinguish accepted fact, draft implication, writer intent, and speculation.\n\n## Proposed change\n\n${change}\n\n## Matched entities\n\n${entityList}\n\n## Candidate affected scenes\n\n${sceneList}\n\n## Required analysis\n\n1. State the direct blast radius.\n2. Identify hard contradictions with evidence and scene references.\n3. Identify soft contradictions or changes in interpretation.\n4. Identify character-knowledge changes.\n5. Identify timeline and causal changes.\n6. Identify setup/payoff changes.\n7. Identify scenes that become stronger opportunities under this revision.\n8. Identify scenes that should remain untouched.\n9. Produce an ordered revision plan.\n10. List the fewest clarifying decisions the writer must make before edits begin.\n\nUse confidence labels: high, medium, low. Flag intentional ambiguity as a possibility. No automatic canon updates.\n\n## Current project context\n\nCandidate entities in project: ${manifest.entities.slice(0, 80).map((entity) => `${entity.name} (${entity.mentions})`).join(', ')}\n\n${targetText}\n`;
}

async function scenario(args) {
  const project = path.resolve(args.positional[0] || 'work/project');
  const change = args.change;
  if (!change || typeof change !== 'string') return die('scenario requires --change "describe the proposed creative change".');
  const manifest = await loadManifest(project);
  const impact = scenarioImpact(manifest, change);
  const scenarioId = slugify(change);
  await ensureDir(path.join(project, 'reports'));
  await ensureDir(path.join(project, 'prompts'));
  await fs.writeFile(path.join(project, 'reports', `scenario-${scenarioId}.md`), scenarioReport(manifest, change, impact, scenarioId), 'utf8');
  const targetText = (await Promise.all(impact.affectedScenes.slice(0, 12).map(async (scene) => {
    const scenePath = path.join(project, 'scenes', `${scene.id}.md`);
    try { return await readText(scenePath); } catch { return ''; }
  }))).filter(Boolean).join('\n\n');
  const prompt = scenarioPrompt(manifest, change, impact, targetText || 'No scene text supplied by the deterministic layer yet.');
  await fs.writeFile(path.join(project, 'prompts', `scenario-${scenarioId}.md`), prompt, 'utf8');
  console.log(`Matched ${impact.matchedEntities.length} entity candidate(s) and ${impact.affectedScenes.length} scene(s).`);
  console.log(`Wrote ${path.join(project, 'reports', `scenario-${scenarioId}.md`)}`);
  console.log(`Wrote ${path.join(project, 'prompts', `scenario-${scenarioId}.md`)}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    if (args.command === 'ingest') return await ingest(args);
    if (args.command === 'review') return await review(args);
    if (args.command === 'consequence') return await consequence(args);
    if (args.command === 'summarize') return await summarize(args);
    if (args.command === 'deep-summarize') return await deepSummarize(args);
    if (args.command === 'scenario') return await scenario(args);
    if (args.command === 'assess-revision') return await assessRevision(args, { loadManifest, readText, ensureDir, callAI, slugify, die });
    console.log('Usage: node src/threadkeeper.mjs <ingest|review|consequence|summarize|deep-summarize|scenario|assess-revision> ...');
  } catch (error) {
    die(error.stack || error.message);
  }
}

await main();
