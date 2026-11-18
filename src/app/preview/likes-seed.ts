import type { LikesSeed } from "@/components/app/likes-view";
import type { Person } from "./fixtures";
import { PEOPLE } from "./fixtures";

/**
 * The four rows the reference's Likes screen shows, mapped onto fixture people.
 * Two arrive as fresh likes (glowing heart, untouched) and two have already been
 * returned, so both states of the heart disc are visible at once.
 */
const ROWS: { name: keyof typeof BY_NAME; matched: boolean; superlike: boolean; km: number; ago: string }[] = [
  { name: "Maya", matched: false, superlike: false, km: 1, ago: "2026-11-12T07:02:00Z" },
  { name: "Jordan", matched: false, superlike: false, km: 3, ago: "2026-11-12T03:14:00Z" },
  { name: "Lena", matched: true, superlike: false, km: 2, ago: "2026-11-11T20:40:00Z" },
  { name: "Sophie", matched: true, superlike: true, km: 6, ago: "2026-11-10T18:05:00Z" },
];

const BY_NAME = Object.fromEntries(PEOPLE.map((p) => [p.name, p])) as Record<string, Person>;

export const LIKES_SEED: LikesSeed = {
  likedYou: ROWS.map(({ name, matched, superlike, km, ago }) => {
    const p = BY_NAME[name];
    return {
      id: p.id,
      name: p.name,
      age: p.age,
      city: p.city,
      occupation: p.occupation,
      distanceKm: km,
      photo: p.photo,
      verified: p.verified,
      likedAt: ago,
      superlike,
      matched,
      matchId: matched ? `m-${p.id}` : null,
    };
  }),
  liked: [BY_NAME.Tessa, BY_NAME.Chris].map((p) => ({
    id: p.id,
    name: p.name,
    city: p.city,
    photo: p.photo,
    verified: p.verified,
    likedAt: "2026-11-09T15:30:00Z",
  })),
};
