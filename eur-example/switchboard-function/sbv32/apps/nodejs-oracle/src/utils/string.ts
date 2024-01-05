export function toLogName(address: string, feedName?: string) {
  return `${feedName ? "(" + feedName + ") " : ""}${address}`;
}
