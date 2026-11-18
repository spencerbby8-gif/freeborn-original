"use client";

/**
 * Fixture data for the /preview screens.
 *
 * Shapes are literal copies of what the real endpoints return, so the components
 * under review are the production ones. Each person below corresponds to a row in
 * the reference sheet so the comparison is like-for-like.
 */

export type Person = {
  id: string;
  name: string;
  age: number;
  occupation: string;
  city: string;
  distanceKm: number;
  photo: string;
  verified: boolean;
  bio: string;
  likes: number;
  matched: boolean;
  lastMessage: string;
  lastAt: string;
  unread: number;
  story: boolean;
};

export const PEOPLE: Person[] = [
  {
    id: "p-maya",
    name: "Maya",
    age: 26,
    occupation: "Marketing Manager",
    city: "Brooklyn",
    distanceKm: 1,
    photo: "/images/samples/mara.jpg",
    verified: true,
    bio: "That hike last weekend was everything. Looking for someone to find the next trail with.",
    likes: 12,
    matched: true,
    lastMessage: "That hike last weekend was…",
    lastAt: "9:24 PM",
    unread: 2,
    story: true,
  },
  {
    id: "p-jordan",
    name: "Jordan",
    age: 29,
    occupation: "Product Designer",
    city: "Brooklyn",
    distanceKm: 2,
    photo: "/images/samples/elena.jpg",
    verified: true,
    bio: "Sounds perfect! I love that spot.",
    likes: 9,
    matched: true,
    lastMessage: "Sounds perfect! I love that spot.",
    lastAt: "6:41 PM",
    unread: 1,
    story: true,
  },
  {
    id: "p-lena",
    name: "Lena",
    age: 27,
    occupation: "Photographer",
    city: "Brooklyn",
    distanceKm: 3,
    photo: "/images/samples/naomi.jpg",
    verified: false,
    bio: "Sunset this weekend?",
    likes: 7,
    matched: true,
    lastMessage: "You: Sunset this weekend? 🌅",
    lastAt: "Yesterday",
    unread: 0,
    story: true,
  },
  {
    id: "p-sophie",
    name: "Sophie",
    age: 28,
    occupation: "Yoga Instructor",
    city: "Brooklyn",
    distanceKm: 4,
    photo: "/images/samples/mara.jpg",
    verified: true,
    bio: "Haha that's so true!",
    likes: 5,
    matched: true,
    lastMessage: "Haha that's so true!",
    lastAt: "Yesterday",
    unread: 0,
    story: true,
  },
  {
    id: "p-tessa",
    name: "Tessa",
    age: 25,
    occupation: "UX Researcher",
    city: "Brooklyn",
    distanceKm: 5,
    photo: "/images/samples/elena.jpg",
    verified: true,
    bio: "Completely agree!",
    likes: 4,
    matched: true,
    lastMessage: "You: Completely agree!",
    lastAt: "May 8",
    unread: 0,
    story: false,
  },
  {
    id: "p-chris",
    name: "Chris",
    age: 31,
    occupation: "Architect",
    city: "Queens",
    distanceKm: 6,
    photo: "/images/samples/jonah.jpg",
    verified: false,
    bio: "Let's grab a matcha sometime?",
    likes: 2,
    matched: true,
    lastMessage: "Let's grab a matcha sometime?",
    lastAt: "May 7",
    unread: 0,
    story: false,
  },
  {
    id: "p-noah",
    name: "Noah",
    age: 30,
    occupation: "Chef",
    city: "Brooklyn",
    distanceKm: 3,
    photo: "/images/samples/caleb.jpg",
    verified: false,
    bio: "Great chat today!",
    likes: 3,
    matched: true,
    lastMessage: "You: Great chat today!",
    lastAt: "May 6",
    unread: 0,
    story: false,
  },
  {
    id: "p-elena",
    name: "Elena",
    age: 27,
    occupation: "Illustrator",
    city: "Manhattan",
    distanceKm: 8,
    photo: "/images/samples/naomi.jpg",
    verified: false,
    bio: "Shared a photo",
    likes: 1,
    matched: true,
    lastMessage: "Shared a photo 📷",
    lastAt: "May 6",
    unread: 0,
    story: false,
  },
];

export type Notice = {
  id: string;
  kind: "like" | "message" | "match" | "view" | "nearby";
  title: string;
  body: string;
  when: string;
  photo?: string;
};

export const NOTICES: Notice[] = [
  { id: "n1", kind: "like", title: "Maya liked your profile", body: "2 minutes ago", when: "2m", photo: "/images/samples/mara.jpg" },
  { id: "n2", kind: "like", title: "Jordan liked your profile", body: "12 minutes ago", when: "12m", photo: "/images/samples/elena.jpg" },
  { id: "n3", kind: "message", title: "Sophie sent you a message", body: "Haha that's so true!", when: "1h", photo: "/images/samples/mara.jpg" },
  { id: "n4", kind: "match", title: "You and Tessa matched!", body: "3 hours ago", when: "3h", photo: "/images/samples/elena.jpg" },
  { id: "n5", kind: "view", title: "Your profile got 25 new views", body: "5 hours ago", when: "5h" },
  { id: "n6", kind: "nearby", title: "New people near you", body: "Check out 8 new profiles in Brooklyn.", when: "1d" },
];

export type Me = {
  name: string;
  age: number;
  city: string;
  photo: string;
  photos: string[];
  verified: boolean;
  headline: string;
  profileViews: number;
  likesReceived: number;
  matches: number;
};

export const ME: Me = {
  name: "Aria",
  age: 27,
  city: "Brooklyn",
  photo: "/harness/portrait.jpg",
  photos: ["/harness/portrait.jpg", "/images/samples/naomi.jpg", "/images/samples/mara.jpg", "/images/samples/elena.jpg"],
  verified: true,
  headline: "Curious mind, kind heart, always up for a new adventure.",
  profileViews: 152,
  likesReceived: 24,
  matches: 8,
};

export const CARD = {
  id: "fixture-1",
  name: "Aria",
  age: 27,
  city: "Brooklyn",
  occupation: "Graphic Designer",
  headline:
    "Designing by day, chasing sunsets by night. I believe in deep talks, random adventures, and good coffee.",
  traits: ["Hiking", "Ambient music", "Matcha lover"],
  interests: [] as string[],
  photo: "/harness/portrait.jpg",
  photos: ["/harness/portrait.jpg"],
  verified: true,
  presence: "today",
  distanceKm: 4,
  heightCm: 168,
  isNew: true,
  likes: 2,
  gender: "woman",
};

export const INTERESTS = [
  "Hiking", "Photography", "Travel", "Matcha", "Ambient music", "Yoga", "Foodie", "Art",
];
