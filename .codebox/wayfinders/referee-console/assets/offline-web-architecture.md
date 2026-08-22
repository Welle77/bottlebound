# Offline web architecture research — W02

## Decision recommendation

Build the Referee Console as a **static, same-origin progressive web app (PWA)**:

- An HTTPS-served single-page application with a root-scoped service worker, web-app manifest, and all essential UI assets precached as a versioned app shell.
- **IndexedDB is the sole authority for Match data.** Keep the current Match snapshot, its ordered Match Event log, and local metadata in one small database. Treat the Cache API solely as a replaceable application-asset cache.
- After every referee-confirmed state change, atomically write the new event and the resulting snapshot in one IndexedDB `readwrite` transaction. Do not defer persistence to an unload handler.
- Restore on launch by loading the active-Match record and snapshot, validate its schema/rules version, and replay only when validation or migration needs it. The event log supports Undo and auditability; the snapshot makes normal launch fast and deterministic.
- Stay entirely local: no accounts, analytics, remote API, sync, background sync, or runtime CDN dependency. The initial installation/load necessarily needs a hosted HTTPS origin; after the app shell has installed, normal in-scope use works offline.

This is a fit for one referee on one phone or tablet: it has no coordination problem, writes are compact, and the live screen remains responsive because IndexedDB is asynchronous. IndexedDB stores significant structured data and runs updates in transactions, while Web Storage is synchronous and is better avoided for live Match persistence. [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)

## Proposed shape

### Delivery and app shell

Serve immutable, content-hashed build assets and an `index.html` from one HTTPS origin. Register `/sw.js` at the root, then precache the shell required to start a Match: HTML, JavaScript, CSS, icons, fixed rules data, and locally bundled fonts/images. On fetch, use cache-first for versioned shell assets; return the cached SPA entry for in-scope navigation; make no runtime request required to render, restore, or operate a Match.

The service-worker `install` event is designed for prepopulating an offline asset cache, and an active worker can intercept requests and supply cached responses. Service workers and registration are available only in secure contexts (HTTPS, with `localhost` for development). [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) [MDN: register()](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register)

Provide a manifest with stable `id`, `name`/`short_name`, `start_url`, `display: "standalone"`, theme/background colors, and appropriate 192px/512px plus maskable icons. Chromium installation promotion expects a manifest with names, icons, `start_url`, display, and no related native-app preference; installation from the web requires HTTPS or local development. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

The app must still be useful when the browser does not offer a PWA install path: it can run as an ordinary offline-capable website once visited and cached. PWA installation UX varies: Firefox desktop does not install manifest PWAs, iOS uses Share-menu installation, and an in-page `beforeinstallprompt` flow is unsupported on iOS. Treat installation as convenience, not as a prerequisite for data safety or use. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

### Match database

Use a database name scoped to the app, with these object stores:

| Store | Key | Contents | Purpose |
| --- | --- | --- | --- |
| `matches` | `matchId` | active flag, lifecycle, schema version, rules-data version, `lastEventSequence`, timestamps | selects the Active or reopenable Match and the latest compact summary |
| `events` | `[matchId, sequence]` | immutable Match Event payload, event schema version, recorded time | ordered history for Undo and rebuild |
| `snapshots` | `matchId` | complete canonical Match State, snapshot schema version, `throughSequence` | exact fast restore |
| `settings` | name | UI-only preferences and installation/persistence notices | never holds canonical Match State |

Create an index such as `events.byMatch` over `matchId` for efficient ordered retrieval. Store only data needed to restore and explain state; do not store player names or personal data. IndexedDB supports key-indexed structured-cloneable objects, is same-origin scoped, and is asynchronous. [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) [MDN: structured clone](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm)

On a domain command, compute the new Match State in memory, then open **one** `readwrite` transaction spanning `matches`, `events`, and `snapshots`. Write the next sequence event, replace the snapshot, and update `lastEventSequence`; only update the displayed “saved” acknowledgement after the transaction's `complete` event. An unhandled request error aborts and rolls back an IndexedDB transaction, and `complete` denotes a successful commit. [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) [MDN: IDBTransaction complete](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/complete_event)

Use an append-only event record for normal changes. Implement Undo as an explicit higher-level event, such as `undo-applied`, whose result is reflected in the new snapshot. Do not mutate historical event rows. W04 defines the exact Undo semantics. This storage decision preserves the necessary audit trail without making launch replay mandatory.

### Restore, migration, and deletion

At startup, first detect IndexedDB availability and open the database. Load the single `matches.active` record and its snapshot. Reject or migrate only recognized prior schemas; validate that `snapshot.throughSequence === lastEventSequence`, the rule-data version is compatible, and the state invariants hold. If a snapshot is missing or invalid but the event log is valid, rebuild in a worker or idle task, validate, and commit a replacement snapshot transactionally. If neither is valid, show a recovery screen and do not silently start a fresh Match over the data.

Version the database schema separately from the Match-event and snapshot schemas. Database upgrades run in IndexedDB's version-change transaction; keep them small, idempotent, and test upgrade paths with representative old records. Before a destructive local reset, require deliberate confirmation. Apply W07's one-summary retention and confirmed-removal rules.

## Persistence and quota policy

Browser origin data is **best-effort by default**, including IndexedDB and Cache API. It can be evicted under storage pressure; persistent storage can be requested with `navigator.storage.persist()`, but the browser decides whether to grant it. Check the result with `navigator.storage.persisted()`, show a non-blocking status when it is unavailable, and call `navigator.storage.estimate()` before storage-heavy migrations or optional exports. Persistent storage still does not protect against user clearing site data. [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) [MDN: StorageManager.persist()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

Request persistence after the referee has installed or deliberately begun a Match, not at first page paint. Keep the footprint small: one active Match, compact JSON-compatible records, the Undo history that W04 defines, and a small versioned asset cache. Delete old app-shell caches only after the new shell is active and verified; never delete IndexedDB data during service-worker activation.

Do not use `localStorage` as the Match store: it blocks JavaScript while reading/writing and Web Storage is capped at 10 MiB (5 MiB each for local and session storage), whereas IndexedDB is managed under each browser's origin quota. Do not use cookies (unnecessary request coupling), Cache API (request/response asset cache, not transactional records), or Origin Private File System (a file abstraction with no benefit for the small structured Match model). [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)

## Safe update behavior

Cache the complete new shell under a new version during worker `install`; leave the active cache untouched if installation fails. A new worker normally remains waiting until pages using the old worker close, so do **not** call `skipWaiting()` automatically during a live Match. Instead, announce “update ready” and offer “apply after ending/restarting Match”; applying it can close/reload only after the last successful Match write. The normal waiting lifecycle avoids running two service-worker versions concurrently, while immediate activation can cause a page loaded with old assets to have later fetches controlled by the new worker. [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) [web.dev: service worker lifecycle](https://web.dev/articles/service-worker-lifecycle)

Design every persisted event/snapshot to be read by the immediately succeeding app version, and retain read/migration support for at least the previously released schema. A service worker update check can occur on an in-scope navigation or after a functional event when the worker has not been fetched for 24 hours; therefore, a release can be discovered at any time the device reconnects. [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)

## Risks and mitigations

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| First visit while offline | No shell has been cached, so the app cannot begin. | Give an explicit pre-match “offline ready” indicator only after worker activation and complete precache; instruct referees to open/install while online before the event. |
| Storage is evicted or user clears browser data | The active Match may be unrecoverable because there is intentionally no server copy. | Request persistent storage, surface its grant state, keep storage small, and warn about clearing site data. W07 deliberately omits export from the first version. Safari can proactively evict script-created data for origins without recent interaction when cross-site tracking prevention is enabled. [MDN: storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) |
| Power loss/browser termination during save | The most recent interaction could be absent; a multi-store partial write would corrupt state. | Persist synchronously in product flow (not in `unload`), use one transaction for event + snapshot + match metadata, and mark success only at `complete`. Browser shutdown can abort transactions, and unload-created IndexedDB transactions cannot be relied on. [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) |
| Device/OS catastrophic failure after commit | A completed default transaction is not a hardware-backed guarantee in every browser. | Treat the transactional model as consistency, not a backup, and expose “saved” only after completion. W07 deliberately omits export from the first version. Firefox documents relaxed default durability; standards expose a `strict` durability option, but support must be feature-tested and not relied upon as the only protection. [MDN: Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB) [MDN: durability](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction/durability) |
| Update mid-Match | Mixed asset versions or an unwanted reload interrupts refereeing. | Version caches; allow the old worker/shell to remain through the Match; make activation a referee-controlled post-save action. |
| Browser mode/settings restrict storage or workers | Offline behavior or persistence may be unavailable, especially in private browsing or with strict privacy settings. | Run a start-up capability check for service worker, IndexedDB read/write, and quota; show a blocking pre-Match compatibility warning if canonical storage cannot be written. MDN notes that private browsing, cookie blocking, and automatic data deletion can prevent service-worker operation. [MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers) |
| PWA installation differs by browser | Referee may not find an install button, particularly on iOS/Firefox desktop. | Provide brief browser-specific installation help and keep the normal browser path fully functional after offline caching. [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) |

## Planning consequences

1. W01/W04 should define immutable Match Event envelopes, snapshot invariants, Undo event semantics, and deterministic replay before persistence is implemented.
2. The later feature needs acceptance checks for first load, offline reload, one atomic save per referee action, abrupt-process recovery to the last completed transaction, schema migration, update deferral during a Match, and storage-disabled failure messaging.
3. Outdoor validation (W08) should test target phone/tablet browsers after a cold offline launch and after a device/browser restart; do not infer offline readiness solely from the installed icon.

## Source quality and scope

Sources above are platform-owner documentation: MDN documents the standardized web platform and links its API pages to the relevant specifications; web.dev is Google's first-party PWA documentation. This note deliberately does not claim that browser storage is a durable backup: no browser-only design can eliminate device loss or a user-initiated site-data clear without an export or server copy.
