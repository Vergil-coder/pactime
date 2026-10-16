/** Session-only discovery gesture for test builds; never a security boundary. */
export class TestToolsGate {
  unlocked = false;
  private clicks: number[] = [];
  tap(now = Date.now()): boolean {
    if (this.unlocked) return true;
    this.clicks = this.clicks.filter(at => now >= at && now - at <= 5000);
    this.clicks.push(now);
    if (this.clicks.length >= 5) { this.unlocked = true; this.clicks = []; }
    return this.unlocked;
  }
}
