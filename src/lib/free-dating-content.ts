/** Public copy, not a billing configuration or a claim of production/provider health.
 * Evidence and release limits: docs/growth/FREE-DATING-CLAIM-LEDGER.md.
 * Keep present-tense access distinct from the planned, unavailable membership UI.
 */
export const FREE_DATING_PATH = '/free-dating';
export const FREE_DATING_TITLE = 'Free dating with matching and messaging | Freeborn';
export const FREE_DATING_DESCRIPTION = 'See what is included on Freeborn without a paid plan: profiles, discovery, likes, matching and chat. Understand mutual interest, privacy and messaging limits before joining.';
export const freeDatingFeatures = [
  {id:'profile',name:'Create your profile',access:'Included',detail:'Introduce yourself with photos, interests and relationship goals.',boundary:'For adults 18+. Account and onboarding requirements still apply.'},
  {id:'discovery',name:'Discover people',access:'Included',detail:'Explore profiles and choose what matters to you.',boundary:'Results depend on available profiles, your preferences and other members’ visibility choices. People nearby are not guaranteed.'},
  {id:'likes',name:'Express interest',access:'Included',detail:'Send a like when someone catches your interest.',boundary:'A like is not a promise of a match, a conversation or a reply.'},
  {id:'matching',name:'Match through mutual interest',access:'Included',detail:'A match conversation starts with both people liking each other.',boundary:'Blocks, privacy choices and the state of the conversation can still prevent contact.'},
  {id:'chat',name:'Read and send chat messages',access:'Included',detail:'Continue an available conversation without a paid messaging plan.',boundary:'You must be a participant in an open conversation. Unmatching or blocking can end your ability to send.'},
  {id:'media',name:'Share photos and voice notes',access:'Included',detail:'Use supported photo and voice-note attachments in an available chat.',boundary:'File formats, upload sizes, abuse limits and device permissions still apply. Share only what you are comfortable sharing.'},
] as const;

export const freeDatingQuestions = [
  {q:'Is Freeborn free to use?',a:'You can create a profile, discover people, like, match and message without a paid plan. Photos and voice notes are also part of the current chat experience. There is no paid plan available at the moment; this describes current access, not a permanent pricing promise.'},
  {q:'Can I message anyone immediately?',a:'No. Opening a match conversation requires both people to like each other. Privacy settings, blocks and the status of a conversation can still prevent contact. Free messaging does not override another person’s choices.'},
  {q:'Why might a conversation be unavailable if messaging is free?',a:'Payment is not the only reason contact can be restricted. A conversation may not be open, someone may have unmatched or blocked the other person, or a privacy setting may restrict who can message. Do not treat an unavailable conversation as permission to contact that person elsewhere.'},
  {q:'Do I need to download an app?',a:'No app-store download is required to use Freeborn in a supported browser. You still need internet access. Browser permissions and device support can affect media features; browser access does not mean offline messaging or guaranteed closed-app notifications.'},
  {q:'Will I find people near me?',a:'This page does not promise local matches or a particular number of members. Availability depends on the current service, location, preferences and member visibility. A country or city name is not proof that compatible people are available there.'},
  {q:'What about membership or premium screens?',a:'The membership area describes a planned offering, not an available purchase. It does not currently take a payment or create a subscription. Core access described here does not require buying that planned membership. Future pricing or feature changes would need their own current product information and terms.'},
  {q:'Does a verification badge guarantee someone is safe?',a:'No. A verification badge is not a background check or a guarantee of identity, intentions or safety. Read what a check actually covers, protect your private information and use the available block and report controls when needed.'},
  {q:'Is Freeborn for adults only?',a:'Yes. Freeborn is for adults aged 18 and over. Free access does not remove account, onboarding, safety or eligibility requirements.'},
] as const;
