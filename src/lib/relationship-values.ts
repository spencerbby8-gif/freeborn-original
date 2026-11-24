/** Original conversation prompts; reflection, not a compatibility/medical assessment.
 * No user profile, vaccination status, storage or external AI provider is involved.
 */
export const relationshipValues = [
  {id:'communication',label:'Communication',question:'When something bothers you, what helps you talk about it without feeling rushed or shut down?',followUp:'What would a considerate check-in look like during a busy week?'},
  {id:'commitment',label:'Commitment',question:'What does a committed relationship mean to you in everyday actions?',followUp:'When would you want to discuss whether a relationship is exclusive?'},
  {id:'boundaries',label:'Boundaries',question:'How do you like someone to respond when you say no or need more time?',followUp:'Which parts of your life would you rather keep private while getting to know someone?'},
  {id:'family',label:'Family & community',question:'What role would you like family, friends or community to have in a future relationship?',followUp:'How would we make space for the people who matter to each of us?'},
  {id:'future',label:'Future plans',question:'Which future plans would you want a partner to understand before things get serious?',followUp:'Are there choices about children, location or work that you would want to discuss, when you feel ready?'},
  {id:'money',label:'Money & everyday choices',question:'What feels fair to you when planning dates with different budgets?',followUp:'How would you like to talk about spending and saving if a relationship becomes serious?'},
  {id:'independence',label:'Independence',question:'How do you balance time together with your own friendships, interests and quiet time?',followUp:'How would you tell a partner you need some space without leaving them guessing?'},
  {id:'beliefs',label:'Beliefs & personal choice',question:'How would you like a partner to handle a belief or personal choice they do not share?',followUp:'Which differences feel workable if both people stay respectful?'},
  {id:'lifestyle',label:'Lifestyle & routines',question:'What does a good ordinary week look like for you, beyond special dates?',followUp:'Which routines matter to you, and where are you happy to be flexible?'},
  {id:'growth',label:'Learning & growth',question:'What is something you are learning or trying to change, and what kind of support is welcome?',followUp:'How could a partner encourage you without trying to manage you?'},
  {id:'conflict',label:'Handling disagreement',question:'When a disagreement gets tense, do you prefer a pause or a conversation straight away?',followUp:'How would we agree on a time to return to a discussion after taking a break?'},
  {id:'kindness',label:'Kindness & care',question:'Which small actions make you feel cared for in an ordinary day?',followUp:'How do you usually show care, and how would you ask what someone else appreciates?'},
] as const;
export const MAX_SELECTED_VALUES = 5;
export function buildValuesConversation(ids: readonly string[]) {
  const selected = new Set(ids);
  return relationshipValues.filter(value => selected.has(value.id)).slice(0, MAX_SELECTED_VALUES);
}
export function valuesConversationText(ids: readonly string[]) {
  const values = buildValuesConversation(ids);
  if (!values.length) return '';
  return ['A conversation about what matters to us', 'An invitation, not a test. Skip any question you do not want to answer.', '', ...values.flatMap((value,index)=>[`${index+1}. ${value.label}`,value.question,`If we want to go deeper: ${value.followUp}`,''])].join('\n').trim();
}
