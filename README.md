# Threadkeeper

Threadkeeper is a local-first prototype for a narrative-state engine and AI writing partner. Its first job is deliberately narrow:

> After a scene or chapter, show what changed, what is now true, what remains unresolved, and what may conflict with earlier material.

The prototype currently has no external dependencies. It can:

- ingest a plain-text or Markdown manuscript;
- split a manuscript into chapter/scene documents;
- create a machine-readable manifest and candidate entity index;
- produce a deterministic import/review report;
- produce a context packet and prompt for an AI-assisted Consequence Pass;
- optionally call an OpenAI-compatible endpoint when configured.

It is intentionally not a full editor and does not silently rewrite source material.

## Quick start

```powershell
cd "C:\Users\chris\OneDrive\Documents\Chris OS\Claude outputs\Threadkeeper"
node src/threadkeeper.mjs ingest corpus\the-moonstone.txt --out work\moonstone
node src/threadkeeper.mjs review work\moonstone
node src/threadkeeper.mjs consequence work\moonstone --scene 2
node src/threadkeeper.mjs scenario work\moonstone --change "Make the main suspect secretly responsible for the theft while preserving the final reveal."
```

Outputs are written under the selected project directory:

- `manifest.json` — imported scenes and candidate entities
- `scenes\` — one Markdown file per imported scene/chapter
- `reports\import-report.md` — import diagnostics
- `reports\review.md` — deterministic review findings
- `prompts\consequence-*.md` — AI-ready context packets and instructions
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

## Current boundary

This is a vertical-slice foundation, not a claim that the continuity engine is solved. The next meaningful work is to add accepted/provisional canon, character-knowledge state, temporal claims, and evidence-linked findings backed by real test cases.

## Revision scenarios

The `scenario` command models a major creative change before applying it. It identifies matching entities and scenes, separates direct impact from possible opportunities, and writes a reviewable impact report. It does not modify source prose or canon automatically.
