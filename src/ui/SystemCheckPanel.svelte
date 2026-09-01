<script lang="ts">
  import { useConsoleContext } from "./console-context";
  import { statusLabel } from "./format";

  const { application } = useConsoleContext();

  // Readiness belongs to the application interface; every status card reacts
  // when the application installs a new state snapshot.
  const readiness = $derived(application.state.readiness);
  const blocked = $derived(readiness.matchCreation === "blocked");
</script>

<details class="panel readiness-panel" open>
  <summary>
    <span>
      <span class="eyebrow">System check</span><strong>Readiness</strong>
    </span>
    <span class="readiness-badge" data-state={blocked ? "blocked" : "ready"}>
      {blocked ? "Checks required" : "Storage ready"}
    </span>
  </summary>
  <dl class="status-grid" aria-live="polite">
    <div class="status-card" data-status={readiness.network}>
      <dt>Network</dt>
      <dd>{statusLabel(readiness.network)}</dd>
      <p>
        {readiness.network === "online"
          ? "A network connection is available."
          : "No network connection. The cached shell can still work."}
      </p>
    </div>
    <div class="status-card" data-status={readiness.serviceWorker}>
      <dt>Service worker</dt>
      <dd>{statusLabel(readiness.serviceWorker)}</dd>
      <p>
        {readiness.serviceWorker === "controlled"
          ? "This page uses the installed shell."
          : "Reload after installation so the service worker can control this page."}
      </p>
    </div>
    <div class="status-card" data-status={readiness.offline}>
      <dt>Offline shell</dt>
      <dd>{statusLabel(readiness.offline)}</dd>
      <p>
        {readiness.offline === "ready"
          ? "The required app shell is cached."
          : "The app shell is not ready for an offline launch yet."}
      </p>
    </div>
    <div class="status-card" data-status={readiness.validatedStorage}>
      <dt>Validated storage</dt>
      <dd>{statusLabel(readiness.validatedStorage)}</dd>
      <p>{application.state.validation.storageDetail}</p>
    </div>
  </dl>
</details>
