# Verification record

Date: 2026-09-06. Environment: Windows, Node.js v24.20.0.

## Results observed before initial GitHub publication

- `npm test`: 5 passed, 0 failed. Four tests use the duplicated test seam; one integration test invokes the production ingest CLI. This is limited coverage, not proof of the editorial workflow.
- Fresh Roger Ackroyd ingest: command succeeded, 27 chapter units, 70,067 counted words. Some advertising remains in the final chapter; the word count is not certified as narrative-only.
- Deterministic review: file generated successfully.
- Innocence scenario: 1 matched entity and 16 matched chapters. The final confession is missing from these name-based matches; this is a known retrieval failure.
- Deep summary with explicit chapters `4-5,19-20,23-27`: generated a packet containing 9 selected chapters. This improves evidence selection but does not prove completeness or semantic quality. Per-scene truncation may still omit relevant prose.
- `git diff --check`: passed.
- AI endpoint invocation: not performed in this verification run. No automated editorial report was generated.
- Independent review and hosted CI: not performed for this initial prototype publication.

## Reproduce the command smoke check

Use a new output directory for each comparison, because re-ingestion can leave old generated files behind.

```sh
npm test
node src/threadkeeper.mjs ingest corpus/pg69087.txt --out work/verification-new
node src/threadkeeper.mjs review work/verification-new
node src/threadkeeper.mjs scenario work/verification-new --change "Make Dr. Sheppard innocent while preserving the final reveal."
node src/threadkeeper.mjs deep-summarize work/verification-new --scenes "4-5,19-20,23-27"
```

The [editorial assessment](examples/roger-ackroyd-editorial-assessment.md) is a separately authored source-based example. Future automated results should be evaluated against the [editorial standard](docs/EDITORIAL-STANDARD.md), not just these command exit codes.

## Revision assessment implementation check — 2026-09-23

- `npm test`: 8 passed, 0 failed. New production-CLI tests cover final admission retrieval, testimony-correction selection, source-change refusal, acceptance/rejection of a mocked model response, and a corpus-backed Roger Ackroyd retrieval check. The older four unit tests still use a duplicated test seam.
- Fresh Roger Ackroyd import: 27 chapter units, 69,949 counted words. Gutenberg publisher advertising after `THE END` is no longer included in the generated last chapter. This remains a heuristic import count, not a certified narrative-only word count.
- `assess-revision` on the Sheppard-innocence request: selected 13 of 27 chapters, including IV–V, XIX–XX, XXIV–XXVII; flagged the explicit first-person murder admission in XXVII. The evidence packet contains original source lines 1652 and 1867. The report states that the speaker's identity still requires confirmation before turning that pattern into a canonical claim.
- Source hash is recorded and checked before assessment. A modified source is refused until re-imported.
- The deterministic report is a bounded evidence-backed diagnosis and revision brief, not the full reference editorial assessment. Model-generated output must be evaluated separately for connected causality, accurate citations, and workable proposed edits.
- Local `llama3.1:8b` attempt on a compact 28,936-byte evidence packet: returned a generic draft without source-line citations and with unsafe advice to "correct" testimony. It was rejected and saved as a noncanonical draft under the local project's `prompts/` directory; the writer-facing diagnostic was not replaced. A larger initial nonstreaming attempt failed before returning content. Neither run satisfies the editorial acceptance standard.
