// A message's body only ever contains plain, human-typed text — e.g.
// "hey whats the matter @Parks RPK" — never any embedded markup. Which
// users were mentioned is tracked in the message_mentions table instead
// (see migration 0058), fetched alongside a message the same way
// reactions already are. This keeps the composer truly WYSIWYG: a plain
// RN TextInput can't render part of its own value in a different style,
// so an earlier version that embedded a `@[Name](id)` token directly in
// the draft showed that raw markup while still typing — this design has
// nothing to hide from the box in the first place.
export interface MentionCandidate {
  id: string;
  fullName: string;
}

export type MessageBodySegment = { type: "text"; value: string } | { type: "mention"; userId: string; name: string };

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Splits a message body into plain-text/mention segments for rendering,
// given the set of users lib/messages.ts already resolved as actually
// mentioned in this message (via message_mentions) — not by re-detecting
// "@Name"-shaped text, which would risk false positives on coincidental
// text. Longest names are matched first so one name that's a prefix of
// another (e.g. "Parks" vs "Parks RPK") doesn't shadow the longer one.
export function highlightMentions(body: string, mentions: MentionCandidate[]): MessageBodySegment[] {
  if (mentions.length === 0) return [{ type: "text", value: body }];

  const sorted = [...mentions].sort((a, b) => b.fullName.length - a.fullName.length);
  const byName = new Map(sorted.map((m) => [m.fullName, m]));
  const pattern = new RegExp(`@(${sorted.map((m) => escapeRegExp(m.fullName)).join("|")})`, "g");

  const segments: MessageBodySegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, match.index) });
    }
    const mention = byName.get(match[1])!;
    segments.push({ type: "mention", userId: mention.id, name: mention.fullName });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }
  return segments;
}

// Matches a still-being-typed "@query" at the very end of the draft —
// deliberately not cursor-position-aware, so this only triggers for a
// mention typed at the point you're actively composing, not for
// re-editing a mention earlier in an already-typed message. Keeps this
// working identically on web (mouse) and native (touch) without needing
// platform-specific selection handling.
const TRAILING_MENTION_QUERY_PATTERN = /(?:^|\s)@(\S{0,30})$/;

export function matchTrailingMentionQuery(draft: string): string | null {
  const match = TRAILING_MENTION_QUERY_PATTERN.exec(draft);
  return match ? match[1] : null;
}

// Replaces the trailing "@query" (see above) with the plain display name
// plus a trailing space — exactly what ends up in the sent message, no
// markup, ready to keep typing after it.
export function insertMentionIntoDraft(draft: string, query: string, candidate: MentionCandidate): string {
  const atIndex = draft.length - query.length - 1;
  const before = draft.slice(0, atIndex);
  return `${before}@${candidate.fullName} `;
}

export function filterMentionCandidates(candidates: MentionCandidate[], query: string): MentionCandidate[] {
  const q = query.toLowerCase();
  return candidates.filter((c) => c.fullName.toLowerCase().includes(q)).slice(0, 6);
}
