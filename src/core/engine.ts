import type { StoredState, RuleInput, RulePatch, Rule, TickInput, TickResult, LimitEvent, ProcessInfo, RuleView, Usage } from './types';
import { identityKey, normalizePath, selectTargets } from './processes';

export const GRACE_SECONDS = 20 * 60;
export const MAX_GRACE_SECONDS = 30 * 60;
export const dayKey = (now: number): string => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const nextDay = (now: number): string => { const d = new Date(now); d.setDate(d.getDate() + 1); return dayKey(d.getTime()); };
const freshUsage = (day: string): Usage => ({ day, usedSeconds: 0, phase: 'ready', warned: [] });
const clockLabel = (now: number): string => new Date(now).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });

export class LimitEngine {
  state: StoredState;
  constructor(initial?: StoredState) {
    this.state = initial ?? { version: 1, latestTime: 0, rules: [], usage: {}, tracked: {}, events: [], history: [] };
    for (const rule of this.state.rules) {
      rule.graceSeconds ??= GRACE_SECONDS;
      const usage = this.state.usage[rule.id];
      if (usage?.phase === 'grace' && usage.graceDeadline !== undefined) usage.graceStartedAt ??= usage.graceDeadline - rule.graceSeconds * 1000;
    }
  }

  private event(kind: LimitEvent['kind'], title: string, message: string, now: number, ruleId?: string): LimitEvent {
    const e = { id: crypto.randomUUID(), kind, title, message, at: now, ruleId };
    this.state.events.push(e); this.state.events = this.state.events.slice(-250); return e;
  }

  private rotate(now: number): boolean {
    const day = dayKey(now); let changed = false;
    for (const rule of this.state.rules) {
      const usage = this.state.usage[rule.id];
      if (usage && usage.day < day) {
        this.state.history.push({ day: usage.day, ruleId: rule.id, name: rule.name, usedSeconds: usage.usedSeconds, limitSeconds: rule.limitSeconds });
        this.state.usage[rule.id] = freshUsage(day); changed = true;
      }
    }
    for (const rule of [...this.state.rules]) {
      if (!rule.pending || rule.pending.effectiveDay > day) continue;
      if (rule.pending.delete) {
        this.state.rules = this.state.rules.filter(r => r.id !== rule.id); delete this.state.usage[rule.id]; delete this.state.tracked[rule.id];
      } else {
        if (rule.pending.limitSeconds !== undefined) rule.limitSeconds = rule.pending.limitSeconds;
        if (rule.pending.graceSeconds !== undefined) rule.graceSeconds = rule.pending.graceSeconds;
        if (rule.pending.includeChildren !== undefined) rule.includeChildren = rule.pending.includeChildren;
        delete rule.pending;
      }
    }
    if (changed) this.event('reset', '今日额度已恢复', '昨日记录已保存。', now);
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 14);
    this.state.history = this.state.history.filter(h => h.day >= dayKey(cutoff.getTime()));
    return changed;
  }

  private safeNow(now: number, elapsedSeconds = 0): number {
    const effective = now < this.state.latestTime ? this.state.latestTime + Math.max(0, elapsedSeconds) * 1000 : now;
    this.state.latestTime = effective; return effective;
  }

  addRule(input: RuleInput, now: number): Rule {
    this.validateBudget(input.limitSeconds);
    const graceSeconds = input.graceSeconds ?? GRACE_SECONDS; this.validateGrace(graceSeconds);
    if (!input.name.trim() || !input.path.trim()) throw new Error('请选择应用并填写名称。');
    now = this.safeNow(now); this.rotate(now);
    if (this.state.rules.some(r => normalizePath(r.path) === normalizePath(input.path))) throw new Error('这个应用已经有限额，请编辑原规则。');
    const rule: Rule = { ...input, graceSeconds, name: input.name.trim(), id: crypto.randomUUID(), createdAt: now };
    this.state.rules.push(rule); this.state.usage[rule.id] = freshUsage(dayKey(now)); this.state.tracked[rule.id] = [];
    this.event('change', `已添加 ${rule.name}`, `每日 ${Math.round(rule.limitSeconds / 60)} 分钟；${graceSeconds ? `到时延迟 ${graceSeconds / 60} 分钟关闭` : '到点立即关闭'}。`, now, rule.id);
    return rule;
  }

  changeRule(id: string, patch: RulePatch, now: number): void {
    now = this.safeNow(now); this.rotate(now);
    const rule = this.findRule(id); const pending = { ...rule.pending, effectiveDay: nextDay(now) };
    if (patch.name !== undefined) { if (!patch.name.trim()) throw new Error('名称不能为空。'); rule.name = patch.name.trim(); }
    if (patch.limitSeconds !== undefined) {
      this.validateBudget(patch.limitSeconds);
      if (patch.limitSeconds > rule.limitSeconds) pending.limitSeconds = patch.limitSeconds;
      else { rule.limitSeconds = patch.limitSeconds; delete pending.limitSeconds; }
    }
    if (patch.includeChildren !== undefined) {
      if (rule.includeChildren && !patch.includeChildren) pending.includeChildren = false;
      else { rule.includeChildren = patch.includeChildren; delete pending.includeChildren; }
    }
    if (patch.graceSeconds !== undefined) {
      this.validateGrace(patch.graceSeconds);
      if (patch.graceSeconds > rule.graceSeconds) pending.graceSeconds = patch.graceSeconds;
      else {
        rule.graceSeconds = patch.graceSeconds; delete pending.graceSeconds;
        const usage = this.state.usage[id];
        if (usage?.phase === 'grace') usage.graceDeadline = Math.min(usage.graceDeadline ?? now, (usage.graceStartedAt ?? now) + patch.graceSeconds * 1000);
      }
    }
    const hasPending = pending.limitSeconds !== undefined || pending.graceSeconds !== undefined || pending.includeChildren !== undefined || pending.delete;
    rule.pending = hasPending ? pending : undefined;
    this.event('change', `${rule.name} 的规则已更新`, hasPending ? '放宽部分明天生效。' : '修改已生效，已用时间保留。', now, id);
  }

  removeRule(id: string, now: number): void {
    now = this.safeNow(now); this.rotate(now);
    const rule = this.findRule(id); rule.pending = { effectiveDay: nextDay(now), delete: true };
    this.event('change', `${rule.name} 将于明天移除`, '今天仍生效。', now, id);
  }

  recordError(message: string, now: number): LimitEvent | undefined {
    const previous = [...this.state.events].reverse().find(event => event.kind === 'error' && event.message === message);
    if (!previous || now - previous.at >= 60_000) return this.event('error', '运行需要检查', message, now);
  }

  tick(input: TickInput): TickResult {
    const unavailable = new Set((input.unavailablePaths ?? []).map(normalizePath));
    const elapsed = Math.max(0, Number.isFinite(input.elapsedSeconds) ? input.elapsedSeconds : 0);
    const now = this.safeNow(input.now, elapsed);
    const midnight = new Date(now); midnight.setHours(0, 0, 0, 0);
    const from = now - (input.awake === false ? 0 : elapsed * 1000);
    const countable = (rule: Rule, targets: { startedAt: number }[], start: number, end: number): number => targets.length
      ? Math.max(0, (end - Math.max(start, rule.createdAt, Math.min(...targets.map(target => target.startedAt)))) / 1000) : 0;
    // Credit the old day's portion before rotate archives it; sleep has a zero-length interval.
    for (const rule of this.state.rules) {
      if (unavailable.has(normalizePath(rule.path))) continue;
      const usage = this.state.usage[rule.id];
      if (!usage || usage.day >= dayKey(now) || usage.phase === 'blocked') continue;
      const [year, month, day] = usage.day.split('-').map(Number);
      const oldEnd = new Date(year, month - 1, day + 1).getTime();
      const oldStart = new Date(year, month - 1, day).getTime();
      const targets = selectTargets(rule, input.processes, this.state.tracked[rule.id] ?? []);
      usage.usedSeconds += countable(rule, targets, Math.max(from, oldStart), Math.min(now, oldEnd));
    }
    this.rotate(now);
    const result: TickResult = { kill: [], alerts: [] };
    const emit = (kind: LimitEvent['kind'], title: string, message: string, id: string) => result.alerts.push(this.event(kind, title, message, now, id));
    for (const rule of this.state.rules) {
      const usage = this.state.usage[rule.id] ?? (this.state.usage[rule.id] = freshUsage(dayKey(now)));
      if (unavailable.has(normalizePath(rule.path))) {
        // An unreadable identity is not evidence of exit. Keep the session and deadline;
        // a deadline may still expire, but there is no safely identified process to kill.
        if (usage.phase === 'grace' && (usage.graceDeadline ?? Infinity) <= now) {
          usage.phase = 'blocked'; emit('blocked', `${rule.name} 今日已锁定`, '明天 00:00 恢复。', rule.id);
        }
        continue;
      }
      const previous = this.state.tracked[rule.id] ?? [];
      const wasBlocked = usage.phase === 'blocked';
      const wasGrace = usage.phase === 'grace';
      const targets = selectTargets(rule, input.processes, previous);
      this.state.tracked[rule.id] = targets;
      const oldRemaining = rule.limitSeconds - usage.usedSeconds;
      const dt = countable(rule, targets, Math.max(from, midnight.getTime()), now);
      if (targets.length && usage.phase !== 'blocked') usage.usedSeconds += dt;
      if (usage.phase === 'ready') {
        const remaining = rule.limitSeconds - usage.usedSeconds;
        for (const threshold of [30 * 60, 10 * 60, 60]) {
          if (oldRemaining > threshold && remaining <= threshold && remaining > 0 && !usage.warned.includes(String(threshold))) {
            usage.warned.push(String(threshold)); emit('warning', `${rule.name} 还剩 ${threshold / 60} 分钟`, '每日可用时间即将用完。', rule.id);
          }
        }
        if (remaining <= 0) {
          if (targets.length && rule.graceSeconds > 0) {
            const exhaustedAt = oldRemaining > 0 ? now - Math.max(0, dt - oldRemaining) * 1000 : now;
            usage.phase = 'grace'; usage.graceStartedAt = exhaustedAt; usage.graceDeadline = exhaustedAt + rule.graceSeconds * 1000;
            emit('grace', `${rule.name} 今日额度已用完`, `${clockLabel(usage.graceDeadline)} 自动关闭。`, rule.id);
          } else {
            usage.phase = 'blocked'; emit('blocked', `${rule.name} 今日额度已用完`, '明天 00:00 恢复。', rule.id);
          }
        }
      }
      if (usage.phase === 'grace') {
        const remaining = ((usage.graceDeadline ?? now) - now) / 1000;
        const survivingSession = new Set(targets.map(identityKey));
        const replaced = wasGrace && previous.length > 0 && !previous.some(target => survivingSession.has(identityKey(target)));
        if (!targets.length || replaced || remaining <= 0) {
          usage.phase = 'blocked'; emit('blocked', `${rule.name} 今日已锁定`, '明天 00:00 恢复。', rule.id);
        } else {
          for (const threshold of [5 * 60, 60]) {
            const key = `grace-${threshold}`;
            if (remaining <= threshold && !usage.warned.includes(key)) {
              usage.warned.push(key); emit('warning', `${rule.name} 将在 ${Math.ceil(remaining / 60)} 分钟内关闭`, `最终截止 ${clockLabel(usage.graceDeadline!)}，届时自动关闭。`, rule.id);
            }
          }
        }
      }
      if (usage.phase === 'blocked') {
        result.kill.push(...targets);
        const known = new Set(previous.map(identityKey));
        const lastAttempt = [...this.state.events].reverse().find(e => e.kind === 'attempt' && e.ruleId === rule.id);
        if (wasBlocked && targets.some(p => !known.has(identityKey(p))) && (!lastAttempt || now - lastAttempt.at >= 30_000)) {
          emit('attempt', `${rule.name} 今日额度已用完`, '明天 00:00 恢复。', rule.id);
        }
      }
    }
    result.kill = [...new Map(result.kill.map(p => [identityKey(p), p])).values()];
    return result;
  }

  views(processes: ProcessInfo[]): RuleView[] {
    return this.state.rules.map(rule => {
      const usage = this.state.usage[rule.id] ?? freshUsage(dayKey(this.state.latestTime || Date.now()));
      const count = selectTargets(rule, processes, this.state.tracked[rule.id] ?? []).length;
      return { ...rule, usedSeconds: usage.usedSeconds, remainingSeconds: Math.max(0, rule.limitSeconds - usage.usedSeconds), phase: usage.phase, graceDeadline: usage.graceDeadline, running: count > 0, processCount: count };
    });
  }

  private findRule(id: string): Rule { const rule = this.state.rules.find(r => r.id === id); if (!rule) throw new Error('这条规则不存在或已经移除。'); return rule; }
  private validateBudget(seconds: number): void { if (!Number.isInteger(seconds) || seconds < 1 || seconds > 86_400) throw new Error('每日额度必须在1秒到24小时之间。'); }
  private validateGrace(seconds: number): void { if (!Number.isInteger(seconds) || seconds < 0 || seconds > MAX_GRACE_SECONDS) throw new Error('延迟关闭时间必须在0到30分钟之间。'); }
}
