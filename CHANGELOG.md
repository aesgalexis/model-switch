# Changelog

## 0.3.1 — experimental release candidate

- Migrate global Codex TOML hooks to exact lifecycle event names. Preserve other
  settings, back up changes, recognize CRLF, quote paths correctly, and refuse
  overlapping foreign event declarations before writing invalid TOML.
- Distinguish outdated installations in `reflex:doctor`; accept a valid global
  integration without requiring project-local hooks.
- Fix Linux integration-test expectations and group compound POSIX fallbacks so
  cached reads do not execute the tail of an original compound command.
- Test Windows/Linux on Node 22/24 using the lockfile.
- Add a real-CLI smoke test with a scripted local endpoint and isolated state.
- Add offline mechanism and opt-in live off/inject paired benchmarks, with
  verified answers, explicit usage and conservative interpretation.
- Publish the six-turn Windows fixture measurements and synchronize installation,
  defaults, storage paths, compatibility and privacy documentation.

The reflex engine includes evidence generations, granular file invalidation,
exact read-only reuse, proactive hints, telemetry and optional Jev shadow judgments.
The existing model router remains separate. Desktop and broad real-session
savings remain unverified; no applied semantic reuse is introduced.
