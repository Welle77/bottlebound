/**
 * Device-local console settings.
 *
 * Console settings persist per device through localStorage with safe
 * fallbacks: private-mode or blocked storage never throws and never changes
 * Match data. A failed save only loses the cross-restart preference; the
 * running session keeps its in-memory value.
 */

export const DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS = true;

const REQUIRE_PHYSICAL_CONFIRMATIONS_KEY =
  "bottlebound.require-physical-confirmations";

export type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

function resolveSettingsStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function loadRequirePhysicalConfirmations(
  storage: SettingsStorage | null = resolveSettingsStorage(),
): boolean {
  if (!storage) return DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS;
  try {
    const raw = storage.getItem(REQUIRE_PHYSICAL_CONFIRMATIONS_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
    return DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS;
  } catch {
    return DEFAULT_REQUIRE_PHYSICAL_CONFIRMATIONS;
  }
}

export function saveRequirePhysicalConfirmations(
  value: boolean,
  storage: SettingsStorage | null = resolveSettingsStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(REQUIRE_PHYSICAL_CONFIRMATIONS_KEY, String(value));
  } catch {
    // Keep the session value; the device simply will not remember it.
  }
}
