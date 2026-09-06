// Small test seam. The CLI remains the primary interface while the prototype is being shaped.
const STOP_ENTITIES = new Set(['The', 'This', 'That', 'These', 'Those', 'There', 'Then', 'When', 'Where', 'What', 'Which', 'After', 'Before', 'Chapter', 'Period', 'Narrative', 'First', 'Second', 'Third', 'Part', 'Book', 'Miss', 'Mr', 'Mrs', 'Dr']);
function isStructuralPhrase(value) {
  const first = value.split(' ')[0];
  return STOP_ENTITIES.has(value) || ((first === 'Chapter' || first === 'Part' || first === 'Period' || first === 'Book') && /^(?:I|V|X|L|C|D|M|[0-9]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten)$/i.test(value.split(' ')[1] || ''));
}

function normalizeHeading(line) { return line.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim(); }
function isChapterHeading(line) {
  const normalized = normalizeHeading(line);
  return /^(?:chapter|part|period|book)\b/i.test(normalized) || /^the\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:period|part)\b/i.test(normalized) || /^(?:prologue|epilogue|introduction|foreword|afterword)\b/i.test(normalized);
}

export function splitScenesForTest(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const headings = lines.map((line, index) => ({ line: line.trim(), index })).filter(({ line }) => line && isChapterHeading(line));
  if (!headings.length) return [{ id: 'scene-001', ordinal: 1, title: 'Imported manuscript', text: raw.trim() }];
  const scenes = [];
  const preamble = lines.slice(0, headings[0].index).join('\n').trim();
  if (preamble) scenes.push({ id: 'scene-000', ordinal: 0, title: 'Preamble', text: preamble });
  headings.forEach((heading, index) => {
    const end = headings[index + 1]?.index ?? lines.length;
    scenes.push({ id: `scene-${String(index + 1).padStart(3, '0')}`, ordinal: index + 1, title: normalizeHeading(heading.line), text: lines.slice(heading.index, end).join('\n').trim() });
  });
  return scenes;
}

export function extractCandidateEntitiesForTest(text) {
  const candidates = new Map();
  const pattern = /\b[A-Z][a-z]+(?:[ \t]+[A-Z][a-z]+){0,2}\b/g;
  const sentenceStarters = new Set(['A', 'An', 'After', 'Before', 'During', 'For', 'From', 'In', 'Later', 'One', 'Only', 'Public', 'The', 'This', 'When', 'Years']);
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isChapterHeading(trimmed)) continue;
    for (const match of trimmed.matchAll(pattern)) {
      const value = match[0].trim();
      if (isStructuralPhrase(value) || value.length < 3) continue;
      const first = value.split(' ')[0];
      if (sentenceStarters.has(first) && first !== 'The') continue;
      candidates.set(value, (candidates.get(value) || 0) + 1);
    }
  }
  return [...candidates.entries()].map(([name, mentions]) => ({ name, mentions }));
}
