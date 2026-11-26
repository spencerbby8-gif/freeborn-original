/** Browser-memory holds for threads currently mounted; contains no message content.
 * A hold/release token prevents overlapping route transitions from clearing a
 * newer thread. This is not a read receipt and is never persisted.
 */
const active = new Map<string, number>();

export function holdActiveChat(matchId: string): () => void {
  active.set(matchId, (active.get(matchId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const remaining = (active.get(matchId) ?? 1) - 1;
    if (remaining > 0) active.set(matchId, remaining);
    else active.delete(matchId);
  };
}

export function isActiveChat(matchId: string): boolean {
  return (active.get(matchId) ?? 0) > 0;
}
