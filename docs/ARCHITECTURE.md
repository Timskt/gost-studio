# GOST Studio architecture

GOST Studio is a desktop control plane, not a fork of the GOST runtime.

## Boundary with upstream

The app communicates with GOST through stable, user-visible boundaries:

1. native GOST YAML/JSON configuration;
2. the GOST CLI (`gost -C <config>`);
3. the optional GOST Web API and Prometheus endpoint;
4. an explicit compatibility lock in `compatibility/gost.lock.json`.

The UI does not import `github.com/go-gost/x` or copy the runtime implementation into this repository. This keeps the application easy to update when GOST changes and makes unknown upstream configuration fields available in the raw editor.

## Runtime update policy

- `scripts/update-gost.mjs` reads the current `master` commits for `go-gost/gost` and `go-gost/x`.
- The lock file records the exact commits used by the application and release pipeline.
- Release builds will package one GOST binary per target platform alongside the desktop app.
- A scheduled workflow can open a reviewable update PR instead of silently changing a user's runtime.
- The compatibility adapter is the only place that translates between the friendly UI model and native GOST config.

## UI model vs native model

The editor keeps a small, readable UI model for common actions:

```text
Service → listener + handler + chain
Chain   → strategy + nodes
Node    → address + dialer + connector
```

The serializer writes native GOST objects (`services`, `chains`, `hops`, `nodes`, `handler`, `listener`). Root-level fields not owned by the friendly editor are preserved in `raw` and remain editable in the advanced YAML view.

## Desktop boundary

The Tauri shell owns process lifecycle and platform concerns:

- start/stop the selected GOST binary;
- read the process state and PID;
- later: locate binaries, choose config files, stream logs, and manage upgrades.

The React layer owns presentation, config editing, validation, and a browser-safe fallback for UI development.
