import type { ProcessInfo, ProcessIdentity, RuleInput } from './types';

export const normalizePath = (path: string): string => path.startsWith('/') && !path.startsWith('//') ? path.replace(/\/+$/, '') : path.replaceAll('/', '\\').replace(/\\+$/, '').toLowerCase();
export const identityKey = (p: ProcessIdentity): string => `${p.pid}:${p.startedAt}:${normalizePath(p.path)}`;

// Keep identities, rather than PID alone: Windows can reuse an exited process's PID.
export function selectTargets(rule: Pick<RuleInput, 'path' | 'includeChildren'>, processes: ProcessInfo[], known: ProcessIdentity[]): ProcessIdentity[] {
  const selected = new Map<number, ProcessInfo>();
  const previous = new Set(known.map(identityKey));
  for (const p of processes) {
    if (p.path && (normalizePath(p.path) === normalizePath(rule.path) || (rule.includeChildren && previous.has(identityKey(p))))) selected.set(p.pid, p);
  }
  if (rule.includeChildren) {
    let grew = true;
    while (grew) {
      grew = false;
      for (const p of processes) {
        if (selected.has(p.pid) || !p.path) continue;
        const parent = selected.get(p.parentPid);
        if (parent && p.startedAt >= parent.startedAt) { selected.set(p.pid, p); grew = true; }
      }
    }
  }
  return [...selected.values()].map(({ pid, path, startedAt }) => ({ pid, path, startedAt }));
}
