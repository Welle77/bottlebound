/* eslint-disable functional/immutable-data, functional/prefer-readonly-type -- Test harness builds event histories and storage fixtures incrementally; this is the sanctioned mutability boundary for tests. */
import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS,
  loadRequirePhysicalConfirmations,
  saveRequirePhysicalConfirmations,
  type SettingsStorage,
} from "../src/ui/console-settings";

class MemoryStorage implements SettingsStorage {
  readonly #values: Map<string, string>;
  constructor(initial: Record<string, string> = {}) {
    this.#values = new Map(Object.entries(initial));
  }
  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }
}

function memoryStorage(initial?: Record<string, string>): SettingsStorage {
  return new MemoryStorage(initial);
}

describe("loadRequirePhysicalConfirmations", () => {
  it("defaults to ON when storage is unavailable", () => {
    expect(loadRequirePhysicalConfirmations(null)).toBe(
      DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS,
    );
    expect(loadRequirePhysicalConfirmations(null)).toBe(true);
  });

  it("defaults to ON when reading throws", () => {
    const throwing: SettingsStorage = {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => undefined,
    };
    expect(loadRequirePhysicalConfirmations(throwing)).toBe(true);
  });

  it("reads a stored OFF preference", () => {
    expect(
      loadRequirePhysicalConfirmations(
        memoryStorage({
          "bottlebound.require-physical-confirmations": "false",
        }),
      ),
    ).toBe(false);
  });

  it("reads a stored ON preference", () => {
    expect(
      loadRequirePhysicalConfirmations(
        memoryStorage({ "bottlebound.require-physical-confirmations": "true" }),
      ),
    ).toBe(true);
  });

  it("falls back to the default on an unknown stored value", () => {
    expect(
      loadRequirePhysicalConfirmations(
        memoryStorage({ "bottlebound.require-physical-confirmations": "off" }),
      ),
    ).toBe(DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS);
  });
});

describe("saveRequirePhysicalConfirmations", () => {
  it("writes the preference so a later load reads it back", () => {
    const storage = memoryStorage();
    saveRequirePhysicalConfirmations(false, storage);
    expect(loadRequirePhysicalConfirmations(storage)).toBe(false);
    saveRequirePhysicalConfirmations(true, storage);
    expect(loadRequirePhysicalConfirmations(storage)).toBe(true);
  });

  it("does nothing without storage", () => {
    expect(() => saveRequirePhysicalConfirmations(false, null)).not.toThrow();
  });

  it("swallows a throwing write", () => {
    const throwing: SettingsStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota exceeded", "QuotaExceededError");
      },
    };
    expect(() =>
      saveRequirePhysicalConfirmations(false, throwing),
    ).not.toThrow();
  });
});

describe("default setting contract", () => {
  it("keeps manual physical confirmations required by default", () => {
    expect(DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS).toBe(true);
  });

  it("never touches storage when loading with no argument and blocked access", () => {
    vi.stubGlobal(
      "localStorage",
      new Proxy(
        {},
        {
          get() {
            throw new DOMException("denied", "SecurityError");
          },
        },
      ),
    );
    try {
      expect(loadRequirePhysicalConfirmations()).toBe(true);
      expect(() => saveRequirePhysicalConfirmations(false)).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
