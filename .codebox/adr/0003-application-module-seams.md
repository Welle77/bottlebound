# Application operations use one injected module seam

The Referee Console application operations currently import UI state and UI
helpers, while UI modules can patch a broad shared state object. Storage, time,
and randomness also enter through ambient singletons. This makes application
behavior hard to test through one interface and prevents strict dependency
direction.

## Decision

Use one Svelte-backed application module created by a factory. The factory
requires Match Store, clock, and random-source adapters and returns read-only
application state plus intent-specific operations.

Keep temporary interaction state in the UI module. The application owns Match,
persistence, readiness, error, and summary state. Cross-module callers use
declared module interfaces, and dependency analysis includes resolved runtime
and type-only imports.

Do not add a framework-neutral subscription adapter while Svelte is the only
UI adapter. Do not expose a generic application-state patch operation.

## Consequences

- Production composition supplies every ambient dependency explicitly.
- Tests create isolated applications with deterministic adapters.
- UI modules can change interaction state without expanding the application
  interface.
- Existing backwards imports and broad state patching must migrate before
  dependency direction becomes blocking.
- A future second UI adapter needs a new decision about the state interface.
