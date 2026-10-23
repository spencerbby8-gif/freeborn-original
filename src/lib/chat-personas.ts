/**
 * Preview-room conversational personas for the seeded founding members.
 * Openers arrive when a match forms; replies follow as the member writes.
 * Warm, on-brand, and clearly human in tone.
 */
type Persona = {
  opener: string;
  replies: string[];
};

export const personas: Record<string, Persona> = {
  Mara: {
    opener:
      "Hey! I saw we matched. Your profile felt honest, and that's rare on here. What does a good Sunday look like for you?",
    replies: [
      "I like that. I start most mornings in the garden with coffee, slow on purpose. Are you a morning person or a night owl?",
      "Okay that's a good answer. Real talk: what's the thing you're most intentional about in your life right now?",
      "I'm smiling at my phone, not going to lie. I'd love to hear the story behind that sometime over something warm to drink.",
      "This is the best conversation I've had on here, and I mean that plainly. No games, just glad we matched.",
    ],
  },
  Jonah: {
    opener:
      "Well hey. I'll be honest: I read your whole profile before I liked it. That's how I do everything. How's your week treating you?",
    replies: [
      "Good to hear. Mine's been early mornings and fence lines, the honest kind of tired. What do you do when you need to reset?",
      "I respect that. I figure the right person is worth doing things slowly with. What are you building toward these days?",
      "Ha! Alright, you've officially made my evening. I'd trade a basket of farm eggs for the full version of that story.",
      "Look, I'm not great at small talk but I'm good at showing up. If you're enjoying this, I am too.",
    ],
  },
  Elena: {
    opener:
      "Hi there. Something in your words felt gentle, so here I am. Tell me one true thing about you that isn't on your profile.",
    replies: [
      "Thank you for answering like that. It means more than you know. I collect moments like that. What made you choose Freeborn?",
      "I believe people reveal themselves in small answers. That was a lovely one. What does peace look like in your daily life?",
      "You have a warm way of putting things. I'm the kind of woman who remembers how someone makes her feel. Noted.",
      "I think this is the start of a good something. No rush. The best things I know were built slowly.",
    ],
  },
  Naomi: {
    opener:
      "Hello, you. The universe has a sense of humor matching us. I'm currently steeping chamomile and curious about you. What's lighting you up lately?",
    replies: [
      "Ooh I love that. I blend teas for a living and I'm convinced everyone has a blend. Yours sounds like something smoky and bright.",
      "Noted and adored. Ask me anything. I'm an open book with good margins. What's a question you wish people asked you?",
      "You write like someone who actually reads the profile. Rare! Okay, deal: next message you tell me your favorite small ritual.",
      "This conversation feels like a good first steep: gentle, warm, worth a second cup.",
    ],
  },
  Caleb: {
    opener:
      "Hey. The dogs helped me pick your profile, for the record. They have excellent judgment. How's your day going?",
    replies: [
      "Glad to hear it. Mine involved hay, one stubborn gate, and a sunset that made up for all of it. What's the best part of yours been?",
      "That's the kind of straight answer I like. I'm a slow-to-open kind of man but an honest one. What matters most to you in a person?",
      "Alright, that earned you the good story, saved for when we know each other a little better. Deal?",
      "I'll say it plain: I'm enjoying this more than I expected to. In a good way.",
    ],
  },
};

export function pickReply(name: string, memberMessageCount: number): string {
  const persona = personas[name];
  if (!persona) return "Hey! Glad we matched. Tell me something real about you.";
  const idx = Math.min(memberMessageCount - 1, persona.replies.length - 1);
  return persona.replies[Math.max(0, idx)];
}

export function pickOpener(name: string): string {
  return personas[name]?.opener ?? "Hey! Glad we matched. Say hello back.";
}
