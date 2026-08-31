import { castDraft, produce } from "immer";
import type {
  CoinFlipAttempt,
  CoinFlipTieBreakStep,
  DigitalCoinFlipResult,
  RandomSource,
} from "./match-types";

const UINT32_RANGE = 0x1_0000_0000;

export const cryptoRandomSource: RandomSource = {
  nextUint32(): number {
    const value = new Uint32Array(1);
    globalThis.crypto.getRandomValues(value);
    const [result] = value;
    if (result === undefined) {
      throw new Error("Cryptographic randomness did not return a value.");
    }
    return result;
  },
};

function drawValidUint32(random: RandomSource): number {
  const value = random.nextUint32();
  if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
    throw new Error(
      "The random source must return an unsigned 32-bit integer.",
    );
  }
  return value;
}

export function nextBounded(
  random: RandomSource,
  upperExclusive: number,
): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1) {
    throw new Error("The random bound must be a positive safe integer.");
  }
  const limit = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  // Rejection sampling: every draw is validated before the bound comparison.
  for (let value = drawValidUint32(random); ; value = drawValidUint32(random)) {
    if (value < limit) return value % upperExclusive;
  }
}

function drawIndexWithCoinFlips(
  random: RandomSource,
  upperExclusive: number,
  priorAttempts: readonly CoinFlipAttempt[] = [],
): {
  readonly selectedIndex: number;
  readonly attempts: readonly CoinFlipAttempt[];
} {
  const bitCount = Math.ceil(Math.log2(upperExclusive));
  const { flips, candidate } = Array.from({ length: bitCount }, () =>
    nextBounded(random, 2) === 1 ? ("heads" as const) : ("tails" as const),
  ).reduce(
    (drawn, flip) => ({
      flips: [...drawn.flips, flip],
      candidate: drawn.candidate * 2 + (flip === "heads" ? 1 : 0),
    }),
    { flips: [] as readonly DigitalCoinFlipResult[], candidate: 0 },
  );
  const accepted = candidate < upperExclusive;
  const attempts: readonly CoinFlipAttempt[] = [
    ...priorAttempts,
    { flips, candidate, accepted },
  ];
  if (accepted) return { selectedIndex: candidate, attempts };
  return drawIndexWithCoinFlips(random, upperExclusive, attempts);
}

export function orderByCoinFlips<T>(
  values: readonly T[],
  random: RandomSource,
): {
  readonly ordered: readonly T[];
  readonly steps: readonly CoinFlipTieBreakStep[];
} {
  // The shuffle is a sequence of swaps; immer keeps each intermediate
  // snapshot immutable while the draft expresses the swap directly.
  const shuffled = produce(
    { ordered: [...values], steps: [] as readonly CoinFlipTieBreakStep[] },
    (draft) => {
      for (
        let position = draft.ordered.length - 1;
        position > 0;
        position -= 1
      ) {
        const upperExclusive = position + 1;
        const { selectedIndex, attempts } = drawIndexWithCoinFlips(
          random,
          upperExclusive,
        );
        const displaced = draft.ordered[position];
        const promoted = draft.ordered[selectedIndex];
        if (displaced === undefined || promoted === undefined) {
          throw new Error(
            "The initiative shuffle references an absent roster entry.",
          );
        }
        draft.ordered[position] = promoted;
        draft.ordered[selectedIndex] = displaced;
        draft.steps.push(
          castDraft({ position, upperExclusive, attempts, selectedIndex }),
        );
      }
    },
  );
  return { ordered: shuffled.ordered, steps: shuffled.steps };
}
