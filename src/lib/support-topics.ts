/** Fixed labels persisted as part of the existing support message, not a moderation report. */
export const SUPPORT_TOPICS = {
  account: "Account or sign-in",
  profile: "Profile or photos",
  discovery: "Discovery or preferences",
  matches: "Likes or matches",
  messages: "Messages, calls or stories",
  verification: "Verification",
  privacy: "Privacy or safety question",
  notifications: "Notifications or email",
  billing: "Membership or billing question",
  technical: "App issue or bug",
  other: "Something else",
} as const;
export type SupportTopic = keyof typeof SUPPORT_TOPICS;

export function isSupportTopic(value: unknown): value is SupportTopic {
  return typeof value === "string" && Object.hasOwn(SUPPORT_TOPICS, value);
}
