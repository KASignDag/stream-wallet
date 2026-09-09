export function normalizeMnemonic(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function pickConfirmationPositions(wordCount: number, random = crypto.getRandomValues(new Uint8Array(16))): number[] {
  if (wordCount < 3) throw new Error("At least three recovery words are required.");
  const positions = new Set<number>();
  for (const byte of random) {
    positions.add(byte % wordCount);
    if (positions.size === 3) break;
  }
  for (let index = 0; positions.size < 3; index++) positions.add(index % wordCount);
  return [...positions].sort((a, b) => a - b);
}

export function confirmationMatches(mnemonic: string, positions: number[], answers: string[]): boolean {
  const words = normalizeMnemonic(mnemonic).split(" ");
  return positions.every((position, index) => words[position] === answers[index]?.trim().toLowerCase());
}

export function shortAddress(address: string): string {
  if (address.length < 25) return address;
  return `${address.slice(0, 16)}…${address.slice(-12)}`;
}
