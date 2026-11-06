# Benchmark protocol

Two separate experiments are available. Both use isolated state and a disposable
Git fixture, disable Jev, alternate off/inject order, and verify actual output.
They do not read or alter the user's project evidence. Temporary state is removed
after execution; explicit output reports stay in the requested location.

## Mechanism, without a model

```powershell
npm run reflex:benchmark -- --pairs 3 --output .model-switch/benchmarks/mechanism.json
```

The harness observes real HEAD/branch/root outputs, then submits a prompt and
repeats the same three reads through PreToolUse, the real shell, and PostToolUse.
It checks byte-normalized answers and confirmed reuse. Process timings include
Node startup, state access and logging. Scripted tool counts cannot demonstrate
that a model would avoid any call. Token usage and avoided-call estimates stay null.

## Live CLI, paired fixture

```powershell
npm run reflex:benchmark -- --live --model YOUR_MODEL --pairs 3 --output .model-switch/benchmarks/live.json
```

Prerequisites: signed-in Codex CLI with local `auth.json`, a supported explicitly
selected model, and working platform sandbox. This consumes normal model usage.
`--codex /absolute/path/to/codex` selects a particular CLI executable. `--pairs`
accepts 1–30; default 3. Start small before running a larger experiment.

Each cohort gets the same three fresh warm facts and a fresh Codex session.
Only prompt-hint mode changes. The prompt requests branch and full HEAD, allows
fresh supplied facts, and prohibits edits/tests. Answers must contain the correct
branch and hash; the harness also checks that the fixture stayed clean.
It aborts on failed turns, missing hooks, wrong answers or modified fixtures.
An unsuccessful run does not produce a success report.

The live harness uses isolated Codex configuration, copies the local login only
into that temporary home, and removes it during cleanup. It does not copy user
skills, plugins or configuration. Only its generated hook commands bypass hook
trust in this subprocess. The workspace sandbox remains enabled; Windows uses
the documented `elevated` implementation. Normal installation still requires
hook review. See [official hooks](https://learn.chatgpt.com/docs/hooks) and
[Windows sandbox](https://learn.chatgpt.com/docs/windows/windows-sandbox).

Reports contain per-run wall time, observed tool calls, recognized orientation
operations, injected fact/byte counts, confirmed reuse and CLI token usage when
available. Missing usage is null, never zero. Live wall time includes CLI startup
and model/network latency. Hook-only process timings come from the separate
mechanism benchmark. Token counters are reported usage, not a monetary estimate;
cached-input pricing and subscription accounting are not inferred.

## Recorded experiment: 6 November 2026

Environment: Windows, Node 24.13.0, Codex CLI 0.155.1, model `gpt-6-luna`,
Jev off. Three pairs, six fresh sessions, correct answers in every session.
This was measured during 0.3.1 preparation on the working tree based on
`d6bcc7d`; the engine marker was `0.3.0/reflex-5`.

| Measurement | Hints off | Hints inject |
| --- | ---: | ---: |
| Completed turns | 3 | 3 |
| Observed shell tool calls | 3 | 0 |
| Recognized orientation operations | 5 | 0 |
| Median total wall time | 26,138 ms | 7,047 ms |
| Reported input tokens, sum | 94,704 | 40,602 |
| Reported output tokens, sum | 597 | 120 |
| Injected facts | 0 | 12 |

Raw sanitized measurements: [live JSON](benchmarks/2026-11-06-live-windows.json).
Input-token totals include all model requests in a turn; they are not prompt-size
measurements. A shell call can contain several operations. Confirmed fallback
reuse was zero in this live experiment; the treatment avoided choosing tools.

The separate mechanism run confirmed 18/18 repeated reads, with median hook
process times of 97 ms (off) and 95 ms (inject). This startup/state/logging cost
can exceed the cost of a cheap Git read. Avoiding the outer model/tool cycle is
therefore a distinct question from replacing a Git subprocess.

## Interpretation and next measurement

This fixture demonstrates the mechanism and an observed difference under one
model and a task explicitly about already-known facts. It does not establish a
savings rate for normal development, another model, Desktop, cold evidence, or
tasks requiring changes. `estimatedChecksAvoided` remains null. Warmup, network
latency, model caching and model variation can affect the small timing sample.

Next, compare at least 20 matched normal tasks, including cold state, code reads,
edits, branch changes and external mutations. Hold client/model/version and task
mix fixed; alternate treatment order and retain failed runs in the analysis.
Measure answer/task correctness, checks, total time, token counters and hook cost.
Do not expand applied reuse or apply Jev decisions based on this fixture alone.
