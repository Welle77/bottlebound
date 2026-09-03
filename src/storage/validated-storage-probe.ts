export type ValidatedStorageProbeResult =
  | { readonly status: "ready" }
  | { readonly status: "failed"; readonly reason: string };

export type ValidatedStorageProbe = () => Promise<ValidatedStorageProbeResult>;

const PROBE_DATABASE = "bottlebound-validated-storage-probe";
const PROBE_STORE = "probe";

function waitForRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener(
      "success",
      () => {
        resolve(request.result);
      },
      { once: true },
    );
    request.addEventListener(
      "error",
      () => {
        reject(request.error ?? new Error("IndexedDB request failed."));
      },
      {
        once: true,
      },
    );
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener(
      "complete",
      () => {
        resolve();
      },
      { once: true },
    );
    transaction.addEventListener(
      "abort",
      () => {
        reject(
          transaction.error ?? new Error("IndexedDB transaction aborted."),
        );
      },
      { once: true },
    );
    transaction.addEventListener(
      "error",
      () => {
        reject(transaction.error ?? new Error("IndexedDB transaction failed."));
      },
      { once: true },
    );
  });
}

async function deleteProbeDatabase(factory: IDBFactory): Promise<void> {
  await waitForRequest(factory.deleteDatabase(PROBE_DATABASE));
}

async function performValidatedStorageProbe(
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
    store.put({ checkedAt: Date.now() }, "validated-write");
    store.delete("validated-write");
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }

  await deleteProbeDatabase(factory);
}

export async function probeValidatedStorage(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): Promise<ValidatedStorageProbeResult> {
  try {
    await performValidatedStorageProbe(factory);
    return { status: "ready" };
  } catch {
    return {
      status: "failed",
      reason:
        "IndexedDB could not complete the validated write and removal check.",
    };
  }
}

export function createIndexedDbStorageProbe(
  factory: IDBFactory | undefined = globalThis.indexedDB,
): ValidatedStorageProbe {
  return () => probeValidatedStorage(factory);
}
