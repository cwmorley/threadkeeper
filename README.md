# Threadkeeper

Threadkeeper is a local-first prototype for a narrative-state engine and AI writing partner. Its first job is deliberately narrow:

> Show the novelist what needs revision, the evidence for it, and what else will change when they revise it.

The intended result is a readable editorial report with a proposed action and a check for each important finding. See the [editorial output standard](docs/EDITORIAL-STANDARD.md), [current implementation status](docs/STATUS.md), and [verification record](VALIDATION.md).

The prototype currently has no external dependencies. It can:

- ingest a plain-text or Markdown manuscript;
- remove common Project Gutenberg wrapper/front-matter and trailing transcription apparatus when detected;
- split a manuscript into chapter/scene documents;
- create a machine-readable manifest and candidate entity index;
- produce a deterministic import/review report;
- produce a context packet and prompt for an AI-assisted Consequence Pass;
- optionally call an OpenAI-compatible endpoint when configured.

It is intentionally not a full editor and does not silently rewrite source material.

## See an editorial result

Read the [Roger Ackroyd editorial assessment](examples/roger-ackroyd-editorial-assessment.md) for a completed example: a revision decision, chapter-specific consequences, evidence references, a proposed prose rewrite, and checks for the resulting draft. Contains ending spoilers.

This assessment was written by Codex after directly reading relevant source passages. The CLI generated the diagnostics, but has not independently reproduced the assessment. Its name-based scenario matches missed the final confession, and the XVI–XX deep-summary sample omitted the ending. The example documents those gaps and provides an acceptance target for future automated analysis. Source preprocessing is heuristic; some publisher advertising remains in the present Roger Ackroyd import, so its word count is not verified as narrative-only.

## Quick start

```powershell
cd threadkeeper
npm test
node src/threadkeeper.mjs ingest corpus/pg69087.txt --out work/ackroyd-first-run
node src/threadkeeper.mjs review work/ackroyd-first-run
node src/threadkeeper.mjs scenario work/ackroyd-first-run --change "Make Dr. Sheppard innocent while preserving the final reveal."
node src/threadkeeper.mjs deep-summarize work/ackroyd-first-run --scenes "4-5,19-20,23-27"
```

Run with Node.js 22 or newer. The example creates local diagnostic reports and a prompt containing selected evidence. It does not produce a completed editorial assessment until an AI reads that evidence. Add the documented --call-ai option with a configured endpoint for AI generation; no API key is required for local prompt generation. Use a fresh output directory when comparing imports.

Outputs are written under the selected project directory:

- `manifest.json` — imported scenes and candidate entities
- `scenes\` — one Markdown file per imported scene/chapter
- `reports\import-report.md` — import diagnostics
- `reports\review.md` — deterministic review findings
- `prompts\consequence-*.md` — AI-ready context packets and instructions
- `prompts\summary.md` — AI-ready editorial summary packet
- `reports\ai-summary.md` — AI-generated editorial summary when `--call-ai` is configured
- `prompts\deep-summary.md` — bounded scene-evidence packet for deeper AI analysis
- `reports\deep-ai-summary.md` — deep AI summary when `--call-ai` is configured
- `reports\scenario-*.md` — revision impact analysis before any rewrite
- `prompts\scenario-*.md` — AI-ready revision scenario packets

## Optional AI endpoint

The prototype can call any OpenAI-compatible chat endpoint. Configure these environment variables in PowerShell before running `consequence`:

```powershell
$env:THREADKEEPER_API_KEY = "..."
$env:THREADKEEPER_BASE_URL = "https://api.openai.com/v1"
$env:THREADKEEPER_MODEL = "your-model"
node src/threadkeeper.mjs consequence work\moonstone --scene 2 --call-ai
```

Without those variables, the command still writes the complete prompt packet for manual review or later integration.

## AI editorial summary

After ingesting and reviewing a project, generate a summary packet from the deterministic results:

```powershell
node src/threadkeeper.mjs summarize work\moonstone
```

To include a revision scenario in the summary:

```powershell
node src/threadkeeper.mjs summarize work\moonstone --scenario work\moonstone\reports\scenario-example.md
```

With the optional endpoint variables configured, add `--call-ai` to write `reports\ai-summary.md`. The summary is advisory and evidence-linked; it cannot update canon or rewrite source prose automatically.

## Deep AI editorial summary

Use `deep-summarize` when the AI needs selected scene prose in addition to the deterministic results. Keep the evidence bounded around a target scene:

```powershell
node src/threadkeeper.mjs deep-summarize work\moonstone --scene 2 --window 2
```

You can select explicit scenes or the entire project when the context budget supports it:

```powershell
node src/threadkeeper.mjs deep-summarize work\moonstone --scenes "1-3,12,20-22" --scenario work\moonstone\reports\scenario-example.md
node src/threadkeeper.mjs deep-summarize work\moonstone --all-scenes --max-scene-chars 12000 --call-ai
```

The command includes the deterministic review, selected scene packets, optional revision scenario, and any completed consequence reports. It states the evidence boundary in the prompt so the model must identify what it cannot conclude from a sampled set.

## Current boundary

This is a vertical-slice foundation, not a claim that the continuity engine is solved. The current deterministic layer cleans common source wrappers, reduces obvious entity noise, and merges unambiguous surname aliases, but it does not yet infer plot causality, character knowledge, or intentional deception. The next meaningful work is to add accepted/provisional canon, character-knowledge state, temporal claims, and evidence-linked findings backed by real test cases.

## Revision scenarios

The `scenario` command models a major creative change before applying it. It identifies matching entities and scenes, separates direct impact from possible opportunities, and writes a reviewable impact report. It does not modify source prose or canon automatically.
