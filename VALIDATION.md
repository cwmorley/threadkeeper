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
