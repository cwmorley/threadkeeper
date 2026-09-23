# Implementation status

Updated: 2026-09-23.

## Delivered

- Dependency-free Node CLI for ingest, review, consequence, scenario, summarize, deep-summarize, and assess-revision.
- Local prompt generation; optional endpoint invocation for consequence and summary commands.
- A full Gutenberg corpus with its original license notice.
- An actual [editorial assessment](../examples/roger-ackroyd-editorial-assessment.md), authored by Codex from source passages.
- A durable [editorial output standard](EDITORIAL-STANDARD.md).
- Revision evidence retrieval with mandatory opening/ending coverage for identity changes, source SHA-256 freshness checks, original line references, a constrained admission detector, testimony-correction candidates, and an optional model-authored report with minimum citation checks.
- A production-CLI regression test for the revision case and stale-source refusal. Gutenberg `THE END` trailers are removed on fresh imports.
- The model gate now checks paired scene/line citations against the exact packet sent, reports specific rejection reasons, and retains a deterministic report when AI fails. This remains a structural floor, not semantic validation.
- An external editorial draft can be imported with `assess-revision --draft`; it receives the same structural gate and explicit unverified-origin label rather than being silently presented as endpoint output.
- An optional `--codex` route runs the full evidence packet through an ephemeral, read-only Codex CLI session. A real Roger Ackroyd run with `gpt-6-sol` produced a source-cited editorial assessment that passed the gate and was reviewed against the acceptance standard. It remains a proposal, not accepted canon.

## Important gaps

- The deterministic revision command detects the ending admission in the Roger Ackroyd case, but cannot itself reproduce the full reference assessment. The tested Codex route produced a materially useful report for this case; other manuscripts and models still need qualitative review beyond the minimum grounding gate.
- A local `llama3.1:8b` trial returned a generic draft with no source-line citations and misleading testimony advice. It was rejected rather than shown as a completed assessment. The endpoint workflow is tested with a mock, but the real-model acceptance case remains open.
- The older `scenario` and `deep-summarize` commands retain their prior retrieval limitations. Use `assess-revision` for a major revision question.
- Events, character knowledge, and causal dependencies are not yet modeled as validated state.
- Alias inference is heuristic; count changes do not prove identity resolution.
- Existing imports made before the trailer fix retain publisher advertising; fresh imports stop at THE END.
- Re-ingestion into an existing directory may leave stale generated files from earlier runs. Use a fresh output directory for comparisons.
- Several unit tests execute a duplicated test seam; those tests do not validate the production implementation. The ingest integration test does execute the CLI.
- Deep-summary selection and truncation need stronger validation and coverage accounting. Existing consequence reports are included without a complete provenance/freshness check.

## Next implementation target

Test the same workflow on a second, structurally different manuscript and revision request. Add semantic checks for connected clue dependencies, narrator identity, and testimony-state transitions without baking Roger Ackroyd into the engine. A citation gate is only a floor; it cannot establish that an edit or replacement solution works.

## Publication scope

This initial repository publication contains the prototype, corpus, example assessment, and project documentation. Generated local work/ runs and credentials are excluded. A passing test suite is implementation evidence only; it does not demonstrate literary analysis quality.
