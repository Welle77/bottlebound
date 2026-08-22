---
id: W02
type: research
status: closed
blocked_by: []
claimed_by: codebox-research-offline-architecture
---

# Choose the offline web architecture

## Question

Which browser architecture and local persistence approach best support a single-device offline web application, exact Match restore, no accounts, and no server dependency?

## Resolution

Use a static, same-origin PWA with a root service worker and a versioned offline
app shell. Use IndexedDB as the authority for Match metadata, immutable Match
Events, and current snapshots. Commit each referee-confirmed event, snapshot,
and sequence update in one transaction. Use the Cache API only for replaceable
application assets. Defer application updates during an active Match.

The full primary-source research, risks, and planning consequences are in
[offline-web-architecture.md](../assets/offline-web-architecture.md).
