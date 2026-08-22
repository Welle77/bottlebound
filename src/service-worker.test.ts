import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type WorkerEvent = {
  request: {
    method: string;
    mode: string;
    url: string;
  };
  respondWith: (response: Promise<unknown>) => void;
};

describe("service worker navigation responses", () => {
  it("does not use a redirected cached response for a navigation", async () => {
    const listeners = new Map<string, (event: WorkerEvent) => void>();
    const redirectedResponse = { redirected: true };
    let responsePromise: Promise<unknown> | undefined;
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
          ) =>
            listeners.set(type, listener),
        },
        URL,
      },
    );

    listeners.get("fetch")?.({
      request: {
        method: "GET",
        mode: "navigate",
        url: "https://bottlebound.win/",
      },
      respondWith: (response: Promise<unknown>) => {
        responsePromise = response;
      },
    });

    await expect(responsePromise).resolves.not.toBe(redirectedResponse);
  });
});
