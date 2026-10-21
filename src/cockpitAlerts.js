export class CockpitAlerts {
  constructor() {
    this.reset();
  }
  reset() {
    this.pattern = null;
  }
  next(s, aim, active = true) {
    if (!active) return null;
    const warning = s.threatWarning || s.warning,
      urgent = /ÁTESÉS|TALAJKÖZELSÉG/.test(warning);
    const profile = s.crashed
      ? null
      : s.threatWarning
        ? { id: 'missile', interval: 0.7, count: 1, frequency: 740, volume: 0.018 }
        : s.damage >= 15 || s.dying
          ? { id: 'damage', interval: 10, count: 3, frequency: 620, volume: 0.012 }
          : warning
            ? {
                id: urgent ? 'urgent' : 'warning',
                interval: urgent ? 1 : 10,
                count: urgent ? 1 : 3,
                frequency: 560,
                volume: 0.012,
              }
            : aim?.locked
              ? { id: 'lock', interval: 1, count: 1, frequency: 1000, volume: 0.008 }
              : aim?.progress > 0
                ? { id: 'acquiring', interval: 0.65, count: 1, frequency: 450, volume: 0.008 }
                : null;
    if (!profile) {
      this.reset();
      return null;
    }
    const time = s.elapsed || 0;
    if (this.pattern?.id !== profile.id)
      this.pattern = { id: profile.id, next: time, cycle: time, left: profile.count };
    const p = this.pattern;
    if (time + 1e-6 < p.next) return null;
    if (!p.left) {
      p.cycle = time;
      p.left = profile.count;
    }
    p.left--;
    p.next = p.left ? time + 0.28 : p.cycle + profile.interval;
    return { ...profile, duration: 0.12, type: 'sine' };
  }
}
