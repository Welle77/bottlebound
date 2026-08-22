export type CanonicalStorageProbeResult =
  { status: "ready" } | { status: "failed"; reason: string };

const PROBE_DATABASE = "bottlebound-canonical-storage-probe";
const PROBE_STORE = "probe";

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      "error",
      () => reject(request.error ?? new Error("IndexedDB request failed.")),
      {
        once: true,
      },
    );
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve(), { once: true });
    transaction.addEventListener(
      "abort",
      () =>
        reject(
          transaction.error ?? new Error("IndexedDB transaction aborted."),
        ),
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () =>
        reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
      { once: true },
    );
  });
}

async function deleteProbeDatabase(factory: IDBFactory): Promise<void> {
  await waitForRequest(factory.deleteDatabase(PROBE_DATABASE));
}

async function performCanonicalStorageProbe(
  factory: IDBFactory,
): Promise<void> {
  const openRequest = factory.open(PROBE_DATABASE, 1);
  openRequest.addEventListener("upgradeneeded", () => {
    if (!openRequest.result.objectStoreNames.contains(PROBE_STORE)) {
      openRequest.result.createObjectStore(PROBE_STORE);
    }
  });

  const database = await waitForRequest(openRequest);

  try {
    const transaction = database.transaction(PROBE_STORE, "readwrite");
    const store = transaction.objectStore(PROBE_STORE);
    store.put({ checkedAt: Date.now() }, "canonical-write");
    store.delete("canonical-write");
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }

  await deleteProbeDatabase(factory);
}

export async function probeCanonicalStorage(
  factory: IDBFactory = globalThis.indexedDB,
): Promise<CanonicalStorageProbeResult> {
  try {
    await performCanonicalStorageProbe(factory);
    return { status: "ready" };
  } catch {
    return {
      status: "failed",
      reason:
        "IndexedDB could not complete the canonical write and removal check.",
    };
  }
}
