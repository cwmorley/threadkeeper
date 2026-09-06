// Small test seam. The CLI remains the primary interface while the prototype is being shaped.
const STRUCTURAL_WORDS = new Set(['Chapter', 'Period', 'Narrative', 'Part', 'Book']);
const ENTITY_NOISE_WORDS = new Set(['A', 'An', 'And', 'After', 'All', 'Another', 'Any', 'Before', 'But', 'Can', 'Could', 'Did', 'During', 'Each', 'Even', 'Every', 'First', 'For', 'From', 'Her', 'Here', 'His', 'How', 'I', 'If', 'In', 'It', 'Later', 'Many', 'Most', 'Must', 'My', 'Never', 'Next', 'No', 'Not', 'Now', 'Of', 'Once', 'Only', 'One', 'Our', 'Perhaps', 'Public', 'Quite', 'She', 'Some', 'That', 'The', 'Their', 'Then', 'There', 'These', 'They', 'This', 'Those', 'To', 'Very', 'Was', 'We', 'Well', 'When', 'Where', 'What', 'Which', 'Who', 'Why', 'Yes', 'You', 'Dr', 'Mr', 'Mrs', 'Miss', 'Ms', 'About', 'Are', 'Certainly', 'Does', 'Don', 'Good', 'Have', 'Just', 'Let', 'Nothing']);
const HONORIFIC_PREFIXES = new Set(['Captain', 'Colonel', 'Doctor', 'Dr', 'Inspector', 'Major', 'Mister', 'Miss', 'Mr', 'Mrs', 'Ms', 'Mademoiselle', 'Monsieur', 'Papa', 'Professor', 'Reverend', 'Superintendent']);
const LEADING_NOISE_WORDS = new Set([...ENTITY_NOISE_WORDS, 'Again', 'Both', 'Excepting', 'Had', 'Neither', 'Old', 'Or', 'Poor', 'So', 'Tell', 'Though', 'To', 'With', 'As', 'At', 'By', 'Into', 'Near', 'On', 'Presently', 'Suddenly', 'Take', 'Through', 'Under', 'Upon', 'Young', 'Uncle', 'Aunt']);
const ORDINAL = '(?:[IVXLCDM]+|[0-9]+|One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth|Ninth|Tenth)';
function isStructuralPhrase(value) {
  const first = value.split(' ')[0];
  return STRUCTURAL_WORDS.has(value) || (STRUCTURAL_WORDS.has(first) && new RegExp(`^${ORDINAL}$`, 'i').test(value.split(' ')[1] || ''));
}

function normalizeHeading(line) { return line.replace(/^#+\s*/, '').replace(/\s+/g, ' ').trim(); }
function isChapterHeading(line) {
  const normalized = normalizeHeading(line);
  if (new RegExp(String.raw`^(?:chapter|part|period|book)\s+${ORDINAL}\s+\d+\s*$`, 'i').test(normalized)) return false;
  return new RegExp(String.raw`^(?:chapter|part|period|book)\s+${ORDINAL}(?:\b|[.:—-])`, 'i').test(normalized) || /^the\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+(?:period|part)\b/i.test(normalized) || /^(?:prologue|epilogue|introduction|foreword|afterword)\b/i.test(normalized);
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
  const canonicalize = (value) => {
    const words = value.trim().split(/\s+/);
    while (words.length > 1 && (HONORIFIC_PREFIXES.has(words[0]) || LEADING_NOISE_WORDS.has(words[0]))) words.shift();
    return words.join(' ');
  };
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || isChapterHeading(trimmed)) continue;
    for (const match of trimmed.matchAll(pattern)) {
      const value = canonicalize(match[0].trim());
      if (isStructuralPhrase(value) || value.length < 3 || (value.split(' ').length === 1 && (ENTITY_NOISE_WORDS.has(value) || HONORIFIC_PREFIXES.has(value)))) continue;
      candidates.set(value, (candidates.get(value) || 0) + 1);
    }
  }
  return [...candidates.entries()].map(([name, mentions]) => ({ name, mentions }));
}
