import type { AppSnapshot, LimitEvent } from './types';
import { dayKey } from './engine';

/** Historical events remain in History; only a reminder matching the current rule is actionable. */
export function activeReminder(snapshot: AppSnapshot): LimitEvent | undefined {
  const eligible = (event: LimitEvent): boolean => {
    if (event.kind === 'error') return !snapshot.health.monitoring;
    if (dayKey(event.at) !== snapshot.date) return false;
    const rule = snapshot.rules.find(rule => rule.id === event.ruleId);
    if (!rule) return false;
    if (event.kind === 'blocked' || event.kind === 'attempt') return rule.phase === 'blocked';
    if (event.kind === 'grace') return rule.phase === 'grace';
    if (event.kind === 'warning') return rule.phase === 'grace' || (rule.phase === 'ready' && rule.remainingSeconds > 0 && rule.remainingSeconds <= 1800);
    return false;
  };
  if (snapshot.reminderEventId) return snapshot.events.find(event => event.id === snapshot.reminderEventId && eligible(event));
  return snapshot.mode === 'demo' ? snapshot.events.find(eligible) : undefined;
}
