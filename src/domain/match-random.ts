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
    const result = value[0];
    if (result === undefined) {
      throw new Error("Cryptographic randomness did not return a value.");
    }
    return result;
  },
};

export function nextBounded(
  random: RandomSource,
  upperExclusive: number,
): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1) {
    throw new Error("The random bound must be a positive safe integer.");
  }
  const limit = Math.floor(UINT32_RANGE / upperExclusive) * upperExclusive;
  let value: number;
  do {
    value = random.nextUint32();
    if (!Number.isInteger(value) || value < 0 || value >= UINT32_RANGE) {
      throw new Error(
        "The random source must return an unsigned 32-bit integer.",
      );
    }
  } while (value >= limit);
  return value % upperExclusive;
}

function drawIndexWithCoinFlips(
  random: RandomSource,
  upperExclusive: number,
): { selectedIndex: number; attempts: CoinFlipAttempt[] } {
  const bitCount = Math.ceil(Math.log2(upperExclusive));
  const attempts: CoinFlipAttempt[] = [];
  for (;;) {
    const flips: DigitalCoinFlipResult[] = [];
    let candidate = 0;
    for (let bit = 0; bit < bitCount; bit += 1) {
      const flip = nextBounded(random, 2) === 1 ? "heads" : "tails";
      flips.push(flip);
      candidate = candidate * 2 + (flip === "heads" ? 1 : 0);
    }
    const accepted = candidate < upperExclusive;
    attempts.push({ flips, candidate, accepted });
    if (accepted) return { selectedIndex: candidate, attempts };
  }
}

export function orderByCoinFlips<T>(
  values: readonly T[],
  random: RandomSource,
): { ordered: T[]; steps: CoinFlipTieBreakStep[] } {
  const ordered = [...values];
  const steps: CoinFlipTieBreakStep[] = [];
  for (let position = ordered.length - 1; position > 0; position -= 1) {
    const upperExclusive = position + 1;
    const { selectedIndex, attempts } = drawIndexWithCoinFlips(
      random,
      upperExclusive,
    );
    [ordered[position], ordered[selectedIndex]] = [
      ordered[selectedIndex] as T,
      ordered[position] as T,
    ];
    steps.push({ position, upperExclusive, attempts, selectedIndex });
  }
  return { ordered, steps };
}
