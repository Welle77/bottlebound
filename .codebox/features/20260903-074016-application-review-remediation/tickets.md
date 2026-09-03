# T01: Harden CI and command governance

**What to build:** Make the repository gate safe to run on pull requests and make its canonical command discoverable and immutable.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Pull-request checkout does not persist credentials, and a canary verifies no credential header remains.
- [x] All GitHub Actions use full reviewed commit SHAs.
- [x] A repository check rejects mutable action references.
- [x] The constitution names `pnpm run check` consistently with package scripts and CI.

# T02: Preserve historical Action Resolution cost

**What to build:** Ensure restored and replayed Matches preserve the exact action economy of every Action Resolution, including Powerful Abilities, under the current single schema.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] The canonical event contract records or deterministically resolves exact action cost.
- [x] Schema and canonical validation accept only the current complete contract.
- [x] Historical Powerful Ability replay consumes two actions.
- [x] A following action is rejected after replayed Powerful Ability resolution.
- [x] Restore, replay, undo, and store tests preserve the same action count.

# T03: Inject validated-storage readiness probing

**What to build:** Make application storage readiness probing explicit and substitutable through the application seam.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Application dependencies expose the storage-probe adapter.
- [x] Production composition supplies the IndexedDB implementation.
- [x] Application-level tests cover ready, failed, and unavailable probe results.
- [x] The application module does not read ambient IndexedDB directly.

# T04: Make effect status fully offline

**What to build:** Ensure active effect status icons are available without a runtime network request and remain visible in an offline Match.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] Every emitted effect-status icon is precached or bundled inline.
- [x] The app-shell status check includes required icon assets.
- [x] An offline browser test verifies effect icon loading.
- [x] Existing service-worker and Rules Reference checks remain green.

# F01: Keep T01 repository-gate guarantees enforced

**What to build:** Preserve the T01 CI credential, immutable-action, and
canonical-command contracts as a focused repository check.

**Focused verification:** Run the T01 contract test and `pnpm run check`.

- [ ] The contract test rejects mutable `uses:` references.
- [ ] The contract test verifies checkout credential isolation and the
  extraheader canary.
- [ ] The contract test verifies `pnpm run check` is named consistently by the
  constitution, package scripts, and CI.

# F02: Keep T03 application storage probing injected

**What to build:** Preserve the application-owned storage-probe seam and its
production IndexedDB composition while later application changes land.

**Focused verification:** Run the application and validated-storage probe tests,
then `pnpm run check`.

- [ ] Application tests still observe injected ready, failed, and unavailable
  probe outcomes.
- [ ] The application module still has no runtime IndexedDB dependency.

# F03: Keep T04 offline effect-status availability enforced

**What to build:** Preserve inline effect-status assets, shell cache coverage,
and offline browser evidence while later remediation changes land.

**Focused verification:** Run the effect-status and service-worker tests, the
offline effect browser check, and the production build.

- [ ] Effect-status icons remain bundled inline in the application entry.
- [ ] The service-worker shell status still covers the application entry.
- [ ] A controlled offline Match still loads a rendered effect icon.
