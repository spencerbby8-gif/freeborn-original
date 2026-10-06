import { Reveal } from "@/components/reveal";
import { VerifyBadge } from "@/components/verify-badge";

const members = [
  {
    name: "Mara",
    age: 29,
    city: "Austin, TX",
    job: "Functional nutritionist",
    prompt: "A value I will not compromise on…",
    answer: "Informed choice. I want a relationship where we can ask good questions and make health decisions without pressure.",
    traits: ["Long-term", "Natural health"],
    photo:
      "https://images.pexels.com/photos/32045367/pexels-photo-32045367.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    verified: true,
  },
  {
    name: "Jonah",
    age: 34,
    city: "Boise, ID",
    job: "Regenerative farmer",
    prompt: "My perfect Sunday…",
    answer: "Sunrise coffee, farmers market, a long walk, meal prep from scratch, and phones away by dinner.",
    traits: ["Life partner", "Outdoorsy"],
    photo:
      "https://images.pexels.com/photos/5029926/pexels-photo-5029926.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    verified: true,
  },
  {
    name: "Elena",
    age: 31,
    city: "Franklin, TN",
    job: "Midwife",
    prompt: "I'm looking for someone who…",
    answer: "Lives with conviction, cares about natural health, and wants a peaceful home more than a performative life.",
    traits: ["Intentional", "Family-minded"],
    photo:
      "https://images.pexels.com/photos/6893713/pexels-photo-6893713.png?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    verified: false,
  },
  {
    name: "Naomi",
    age: 27,
    city: "Portland, OR",
    job: "Herbalist & tea blender",
    prompt: "We will get along if…",
    answer: "You believe the kitchen is a pharmacy, the garden is a teacher, and a relationship should be tended like both.",
    traits: ["Natural wellness", "Plant parent"],
    photo:
      "https://images.pexels.com/photos/6962984/pexels-photo-6962984.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    verified: true,
  },
  {
    name: "Caleb",
    age: 38,
    city: "Asheville, NC",
    job: "Shepherd & homesteader",
    prompt: "The way to my heart…",
    answer: "Show up curious. Ask what the animals are saying, help bring in the hay, and stay for the long table dinner.",
    traits: ["Rooted", "Homesteading"],
    photo:
      "https://images.pexels.com/photos/8826797/pexels-photo-8826797.jpeg?auto=compress&cs=tinysrgb&fit=crop&h=1200&w=800",
    verified: false,
  },
];

export function Room() {
  return (
    <section className="relative border-t hairline">
      <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 lg:py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="eyebrow">The room you're walking into</p>
          <h2 className="mt-5 font-display text-[clamp(2rem,4.2vw,3.4rem)] font-semibold leading-[1.08] tracking-[-0.02em] text-pearl">
            Real people. Real prompts.{" "}
            <em className="font-medium italic text-gold-soft">No stack.</em>
          </h2>
          <p className="mt-6 text-[16px] leading-[1.8] text-mist">
            This is exactly what a profile looks like on Freeborn — a person,
            their intentions, and a conversation starter, before a single photo
            gets swiped.
          </p>
        </Reveal>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((member, i) => (
            <Reveal key={member.name} delay={i * 70}>
              <article className="deck-card group relative overflow-hidden rounded-[26px] border hairline bg-abyss" style={{ "--tilt": "0deg", "--lift": "0px" } as React.CSSProperties}>
                <div className="relative aspect-[3/3.2] w-full overflow-hidden">
                  <img
                    src={member.photo}
                    alt={`${member.name}, ${member.age} — ${member.job}`}
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-abyss via-abyss/10 to-transparent" />
                  {member.verified ? (
                    <span className="absolute right-4 top-4 rounded-full bg-night/55 p-1.5 backdrop-blur-sm">
                      <VerifyBadge size={20} />
                    </span>
                  ) : null}
                  <div className="absolute inset-x-4 bottom-3">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-display text-2xl font-semibold text-pearl">{member.name}</h3>
                      <span className="font-display text-xl text-gold-soft">{member.age}</span>
                    </div>
                    <p className="text-[11px] tracking-wide text-sand">
                      {member.job} · {member.city}
                    </p>
                  </div>
                </div>
                <div className="space-y-2.5 p-4">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gold">{member.prompt}</p>
                  <p className="text-[13px] leading-relaxed text-ivory/90">{member.answer}</p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {member.traits.map((trait) => (
                      <span
                        key={trait}
                        className="rounded-full border hairline bg-pearl/5 px-2.5 py-1 text-[10px] font-medium tracking-wide text-sand"
                      >
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            </Reveal>
          ))}

          {/* The invitation card completes the grid */}
          <Reveal delay={members.length * 70}>
            <a
              href="/auth?mode=sign-up"
              className="surface magic-border flex aspect-auto h-full min-h-[380px] flex-col items-center justify-center gap-5 rounded-[26px] p-8 text-center transition-transform duration-500 hover:-translate-y-1.5"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--gradient-ember-warm)] shadow-[var(--shadow-primary-btn)]">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff7f2" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
              <p className="font-display text-2xl font-semibold text-pearl">Your card belongs here.</p>
              <p className="max-w-[26ch] text-[13px] leading-relaxed text-mist">
                Join the founding members and show up as the person you actually are.
              </p>
              <span className="btn-ember btn-shine relative mt-1 overflow-hidden rounded-full px-6 py-3 text-[13px] font-bold">
                Create your profile
              </span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
