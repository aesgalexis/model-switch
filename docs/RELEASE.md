# 0.3.1 experimental release preparation

This candidate packages the reflex implementation currently reviewed in
[PR #1](https://github.com/aesgalexis/model-switch/pull/1). It is installed from
source; `package.json` remains private and no npm publication is planned.

## Release notes

model-switch adds a local evidence layer around Codex CLI: exact repeated
read-only queries can reuse valid results, and prompt hints provide fresh
orientation before another tool call is selected. TypeSafe Jev remains an
optional metadata-only shadow evaluator; the original router remains available.

This candidate fixes legacy global hook names, improves installer diagnostics,
corrects POSIX compound fallback execution, and adds cross-platform CI and
reproducible smoke/benchmark commands. See [CHANGELOG.md](../CHANGELOG.md).

In a six-turn Windows fixture experiment, controls made three shell calls and
injected turns made none, with correct branch/HEAD answers throughout. Median
wall time was 26.1 s versus 7.0 s. These are small fixture measurements, not
established real-workflow savings. See [BENCHMARKS.md](BENCHMARKS.md).

## Install or upgrade

Check out the release commit or the PR branch, run `npm ci`, then
`npm run install:codex` and `npm run reflex:doctor`. Review/trust hooks in Codex
and restart existing sessions. The installer backs up config changes and
migrates old event names. Uninstall with `npm run uninstall:codex`.

Hints default to `inject`; choose `MODEL_SWITCH_PROMPT_HINT_MODE=observe` or `off`
for measurement. Jev is optional. Runtime evidence is local, outside consumer
repositories, and may contain bounded read output. Heuristic redaction is not
a guarantee that arbitrary output contains no secrets.

## Publication checks

- `npm run check` passes on Windows/Linux with Node 22/24.
- `npm run reflex:smoke` observes all three events with Codex CLI 0.155.1.
- `npm run reflex:smoke -- --legacy` observes no legacy events.
- Benchmark output is reviewed before being copied out of ignored storage.
- PR description and candidate commit agree; release targets that exact commit.

Prepare a **draft prerelease** while PR #1 is under review. Publish the release
and merge the PR only after reviewing the final changes and CI. Desktop support,
unobserved external mutations, and representative normal-session measurements
remain limitations of this experiment.
