# model-switch

[![CI](https://github.com/aesgalexis/model-switch/actions/workflows/ci.yml/badge.svg)](https://github.com/aesgalexis/model-switch/actions/workflows/ci.yml)

A local reflex layer for OpenAI Codex: reuse fresh evidence and supply small
workspace facts before the agent repeats orientation work.

**Experimental · MIT · unofficial.** Not affiliated with OpenAI or TypeSafe.
The model/reasoning router remains an optional, separate prototype.

## What it does

| Layer | Responsibility | Status |
| --- | --- | --- |
| Facts | Classify calls, record bounded evidence, invalidate after mutations | Implemented |
| Deterministic reuse | Serve exact supported repeated reads from valid evidence | Implemented |
| Prompt hints | Supply workspace, branch, HEAD and bounded working-tree facts | Implemented; `inject` by default |
| TypeSafe Jev | Judge related evidence as reuse / refresh / uncertain | Optional, shadow only |
| Model router | Recommend or route model and reasoning effort via a local proxy | Separate experiment |

Reusing a result still executes the surrounding Codex tool call. It can avoid
the underlying Git/read/search operation. Prompt hints might prevent Codex from
choosing that call; that separate benefit needs a comparable experiment.
There is **no established savings percentage for normal sessions**.

## Install for Codex CLI

Use Node.js 22 or 24 and a signed-in Codex CLI. The real-CLI smoke test targets
Codex 0.155.1; CI tests the engine on Windows/Linux with Node 22/24.

```powershell
git clone https://github.com/aesgalexis/model-switch.git
cd model-switch
git checkout reflex-phase1-observe
npm ci
npm run install:codex
npm run reflex:doctor
```

Until [PR #1](https://github.com/aesgalexis/model-switch/pull/1) is merged, use
the development branch above; `main` does not contain the reflex implementation.

The installer adds an idempotent marked block to `~/.codex/config.toml`, creates
a timestamped backup, and preserves other settings. Re-running it migrates older
lowercase event names to `UserPromptSubmit`, `PreToolUse`, and `PostToolUse`.
If another inline hook uses the same event, installation stops before writing;
move those declarations to `~/.codex/hooks.json`, which Codex merges with TOML.

Review and trust the installed hooks in Codex (`/hooks` in CLI). Restart existing
CLI sessions after configuration changes. `doctor` checks configuration and local
files; it cannot certify that Codex has trusted or executed the hooks.

Then run `codex` normally inside any project. The engine runs directly from this
checkout, which must remain at this location. Update with `git pull`, followed by
`npm ci` if dependencies changed. Remove its managed integration with
`npm run uninstall:codex`.

## Client compatibility

Codex CLI is the validated environment. `exec_command` reaches the hooks as
`Bash`, including completion after a `write_stdin` poll. The official
[hooks documentation](https://learn.chatgpt.com/docs/hooks) also covers local
function calls and calls from code mode, with specialized-path exceptions.
Earlier Desktop measurements missed this lifecycle; current Desktop support
remains unverified. Validate each client/version before relying on its telemetry.

```powershell
npm run reflex:smoke
npm run reflex:smoke -- --legacy
```

The smoke test uses a scripted localhost model endpoint, isolated configuration,
and no real model or subscription credentials. It checks all three events and
confirms lowercase names do not fire. Only generated test hooks bypass interactive
hook trust for that subprocess; normal installation does not bypass trust.
Windows test subprocesses enable the documented elevated sandbox.

## Inspect and measure

```powershell
npm run reflex:doctor
npm run reflex:stats
npm run reflex:stats -- --workspace C:\path\to\project
npm run reflex:stats -- --all
npm run reflex:rotate
npm run reflex:benchmark -- --pairs 3 --output .model-switch/benchmarks/mechanism.json
npm run reflex:benchmark -- --live --model YOUR_MODEL --pairs 3 --output .model-switch/benchmarks/live.json
```

The default benchmark tests the mechanism without a model. `--live` consumes
subscription/API usage using your local Codex login and an explicitly chosen
model. It alternates off/inject order, uses identical warm facts and fresh
sessions, validates branch/HEAD answers, and records elapsed time, calls and usage.
See [benchmark protocol and results](docs/BENCHMARKS.md).

Each canonical workspace has isolated `state.json` and `events.jsonl` under
`~/.codex/model-switch-global/workspaces/<hashed-id>/`. Consumer repositories
receive no runtime files. Set `MODEL_SWITCH_GLOBAL_HOME` to relocate data, or
`MODEL_SWITCH_REFLEX_LOG` for an explicit log with adjacent `reflex-state.json`.
Rotation preserves evidence and prior logs; it also accepts `--workspace` / `--all`.

## Reuse and configuration

Exact candidates include HEAD/branch/root queries, selected status/diff forms,
complete file reads, bounded searches/listings, and safe semicolon compounds
whose every component independently qualifies. Partial reads, ambiguous shell
structures, stale evidence and unknown operations execute normally.

Tool-result reuse requires the same session/workspace and valid generations.
File reads also check size and modification time. Known edits invalidate affected
paths; other mutations invalidate applicable identity/workspace/external domains.
Edits, tests, builds and deploys are never skipped. Changes outside the observed
hook stream can escape generation tracking: this is an experimental cache, not
an authoritative filesystem monitor.

| Setting | Default | Effect |
| --- | --- | --- |
| `MODEL_SWITCH_PROMPT_HINT_MODE` | `inject` | `off`, `observe` (candidate only), or `inject` |
| `MODEL_SWITCH_PROMPT_HINT_MAX_AGE_MS` | `300000` | Age bound for prompt facts, including cross-session facts |
| `MODEL_SWITCH_REFLEX_CACHE_MAX_BYTES` | `32768` | Output limit; hard maximum 256 KiB |
| `MODEL_SWITCH_REFLEX_JEV_SHADOW` | `on` | Shadow evaluation when a TypeSafe key exists; `off` disables |

Hints may reuse fresh facts across sessions in the same workspace; exact result
reuse remains session-bound. A location hint can precede any Git evidence.
See [.env.example](.env.example) for all settings.

## Privacy

Telemetry contains redacted command diagnostics, semantic keys and hashed IDs,
without tool-response bodies. Local evidence can contain bounded read output;
common credential files, detected secrets and oversized output keep fingerprints
only. Filters are heuristic. Keep runtime data local and inspect before sharing.

The optional reflex Jev gate receives bounded metadata, without repository
contents, tool output or transcripts. The separate router sends the latest user
request to TypeSafe, capped by `MODEL_SWITCH_MAX_ROUTING_TEXT`. The proxy does not
log prompts or authorization headers. Errors and uncertain decisions fail open.

## Optional model router

```powershell
Copy-Item .env.example .env
# Set TYPESAFE_API_KEY in .env for Jev recommendations.
npm start
Invoke-RestMethod http://127.0.0.1:8317/health
```

Use [examples/codex-config.toml](examples/codex-config.toml) for provider setup.
`MODEL_SWITCH_MODE=observe` records recommendations without rewriting requests;
`route` applies them above the confidence threshold; `off` is passthrough.
Missing Jev credentials also mean passthrough. Router and reflex settings differ.

## Development

```powershell
npm ci
npm run check
```

`check` runs syntax checks and tests. CI covers Windows/Linux and Node 22/24.
The guarded `npm run repo:publish -- "Commit message"` validates, commits all
non-ignored changes and pushes the branch; inspect your changes first.

See [architecture](docs/ARCHITECTURE.md), [roadmap](docs/ROADMAP.md),
[changelog](CHANGELOG.md), and [release preparation](docs/RELEASE.md).
