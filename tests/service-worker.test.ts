import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type WorkerRequestBody = {
  readonly method: string;
  readonly mode: string;
  readonly url: string;
};

type WorkerEventRequest = {
  readonly request: WorkerRequestBody;
};

type WorkerEventResponse = {
  readonly respondWith: (response: Promise<unknown>) => void;
};

type WorkerEvent = WorkerEventRequest & WorkerEventResponse;

function createTestCell<T>(initialValue: T) {
  let value = initialValue;
  return {
    get current(): T {
      return value;
    },
    set(next: T): void {
      value = next;
    },
  };
}

describe("service worker navigation responses", () => {
  it("does not use a redirected cached response for a navigation", async () => {
    const listeners = createTestCell<
      readonly (readonly [string, (event: WorkerEvent) => void])[]
    >([]);
    const redirectedResponse = { redirected: true };
    const responsePromiseCell = createTestCell<Promise<unknown> | undefined>(
      undefined,
    );
    const cachesApi = {
      match: () => Promise.resolve(redirectedResponse),
      open: () =>
        Promise.resolve({
          addAll: () => Promise.resolve(),
          match: () => Promise.resolve(undefined),
        }),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    };

    runInNewContext(
      readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"),
      {
        caches: cachesApi,
        fetch: () => Promise.resolve({ redirected: false }),
        self: {
          location: { origin: "https://bottlebound.win" },
          addEventListener: (
            type: string,
            listener: (event: WorkerEvent) => void,
          ) => {
            listeners.set([...listeners.current, [type, listener]]);
          },
        },
        URL,
      },
    );

    const fetchListener = listeners.current.find(
      ([type]) => type === "fetch",
    )?.[1];
    fetchListener?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://bottlebound.win/",
      },
      respondWith: (response: Promise<unknown>) => {
        responsePromiseCell.set(response);
      },
    });

    await expect(responsePromiseCell.current).resolves.not.toBe(
      redirectedResponse,
    );
  });
});
