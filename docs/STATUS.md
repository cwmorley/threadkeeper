# Implementation status

Updated: 2026-09-06.

## Delivered

- Dependency-free Node CLI for ingest, review, consequence, scenario, summarize, and deep-summarize.
- Local prompt generation; optional endpoint invocation for consequence and summary commands.
- A full Gutenberg corpus with its original license notice.
- An actual [editorial assessment](../examples/roger-ackroyd-editorial-assessment.md), authored by Codex from source passages.
- A durable [editorial output standard](EDITORIAL-STANDARD.md).

## Important gaps

- The CLI has not independently reproduced the example editorial assessment.
- Scenario retrieval by entity names missed the final confession in XXVII. The XVI–XX deep-summary sample missed the ending.
- Events, character knowledge, and causal dependencies are not yet modeled as validated state.
- Alias inference is heuristic; count changes do not prove identity resolution.
- Some publisher advertising remains after THE END in the current Roger Ackroyd import.
- Re-ingestion into an existing directory may leave stale generated files from earlier runs. Use a fresh output directory for comparisons.
- Several unit tests execute a duplicated test seam; those tests do not validate the production implementation. The ingest integration test does execute the CLI.
- Deep-summary selection and truncation need stronger validation and coverage accounting. Existing consequence reports are included without a complete provenance/freshness check.

## Next implementation target

Make the automatic summary workflow satisfy the Roger Ackroyd acceptance case: validate revision constraints, retrieve setup and reveal evidence, produce findings with citations and edits, and disclose omissions. Add production-level regression coverage for those behaviors before declaring the automated editorial workflow complete.

## Publication scope

This initial repository publication contains the prototype, corpus, example assessment, and project documentation. Generated local work/ runs and credentials are excluded. A passing test suite is implementation evidence only; it does not demonstrate literary analysis quality.

