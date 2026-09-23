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

## Model-gate hardening — 2026-09-23

- The prior implementation checked a compact local-model draft against the full evidence selection. It could therefore accept a line the model never received. The gate now uses the actual sent packet and requires scene/line pairs, an ending citation for detected conflicts, a correction citation when relevant, and explicit downstream and verification language.
- The deterministic report is written before an AI request, so a missing endpoint, failed call, or rejected draft does not leave the writer without a report. A sidecar JSON review records acceptance status and rejection reasons; a rejected draft remains labeled under `prompts/`.
- `npm test`: 10 passed, 0 failed, including production-CLI model-failure and imported-draft tests, a direct test that refuses an unsupplied source line, and a check that a concrete cross-scene obligation can pass without formulaic wording. These checks validate the gate's behavior, not the quality of a future model's literary reasoning.
- A direct, read-only ephemeral Codex CLI run on the Roger Ackroyd packet produced a substantive draft. Importing it exposed an overliteral gate rule: the draft named a specific later-scene obligation without using the word “downstream.” The gate was revised to recognize that cross-scene link, and the draft passed while preserving its imported, unverified-origin label.
- The new `assess-revision --codex` route then ran the full packet end to end with the reported `gpt-6-sol` model. It passed the gate with paired source-line citations and produced the report under `work/roger-assessment/reports/revision-*.md`. Human review in this session found that it covers the requested constraint conflict; IV/V and XXV–XXVII; call, dictaphone, chair, bag, timing, mechanical ability, motive; Ralph’s concealment; Flora’s intentional correction; a bounded brief and example edit with consequences; and explicit coverage limits. This is acceptance evidence for this specific scenario, not proof that the engine works on other novels or that its alternative solution is complete.
