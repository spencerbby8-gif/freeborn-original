'use client';

import { useState } from 'react';
import { buildValuesConversation, MAX_SELECTED_VALUES, relationshipValues, valuesConversationText } from '@/lib/relationship-values';

/** Deliberately ephemeral: no forms, network calls, analytics, URLs or storage of selections. */
export function ValuesConversation() {
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const prompts = buildValuesConversation(selected);
  function toggle(id: string) {
    setNotice('');
    setSelected(current => current.includes(id) ? current.filter(value => value !== id) : current.length < MAX_SELECTED_VALUES ? [...current, id] : current);
  }
  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(valuesConversationText(selected));
      setNotice('Copied. Nothing has been sent to anyone.');
    } catch {
      setNotice('Copy is unavailable in this browser. You can select and copy the questions below instead.');
    }
  }
  return (
    <section aria-labelledby="builder-heading" className="my-10 rounded-2xl border border-[var(--color-line)] bg-[var(--color-ink)]/60 p-5 sm:p-8">
      <h2 id="builder-heading" className="font-display text-2xl">Build your conversation</h2>
      <p id="values-help" className="mt-3 text-sm leading-relaxed">Choose up to five topics. You do not need to type any answers. Choices stay in this page’s memory and reset when you reload; this tool does not save them or send them to Freeborn, an AI service or another person. Your browser or device may retain anything you choose to copy to its clipboard.</p>
      <fieldset aria-describedby="values-help values-count" className="mt-6">
        <legend className="font-medium">What matters to you?</legend>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {relationshipValues.map(value => (
            <label key={value.id} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-[var(--color-line)] p-3 has-[:checked]:border-[var(--color-gold-500)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2">
              <input type="checkbox" checked={selected.includes(value.id)} disabled={selected.length >= MAX_SELECTED_VALUES && !selected.includes(value.id)} onChange={() => toggle(value.id)} className="h-5 w-5 accent-[var(--color-gold-500)]" />
              <span>{value.label}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p id="values-count" className="mt-4 text-sm" aria-live="polite">{selected.length} of {MAX_SELECTED_VALUES} selected. {selected.length === MAX_SELECTED_VALUES ? 'Uncheck a topic to choose another.' : 'Your questions appear below.'}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={copy} disabled={!prompts.length} className="min-h-11 rounded-full bg-[var(--color-gold-500)] px-5 py-2 font-semibold text-[var(--color-night)] disabled:opacity-50">Copy questions</button>
        <button type="button" onClick={() => {setSelected([]);setNotice('Selection cleared.');}} disabled={!prompts.length} className="min-h-11 rounded-full border border-[var(--color-line)] px-5 py-2 disabled:opacity-50">Clear selection</button>
      </div>
      <p role="status" className="mt-3 min-h-6 text-sm">{notice}</p>
      {prompts.length > 0 && <div aria-label="Your conversation questions" className="mt-6 border-t border-[var(--color-line)] pt-6">
        <p className="text-sm">An invitation, not a test. Skip any question you do not want to answer.</p>
        <ol className="mt-5 space-y-6">
          {prompts.map((value,index) => <li key={value.id}><h3 className="font-semibold">{index+1}. {value.label}</h3><p className="mt-2">{value.question}</p><p className="mt-2 text-sm">If we want to go deeper: {value.followUp}</p></li>)}
        </ol>
      </div>}
    </section>
  );
}
