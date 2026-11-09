import { Vec3 } from '../../src/math.js';
import { neutralAxes } from '../../src/multiplayer/protocol.js';
import { combatFlightInput } from '../../src/aiDefense.js';
// Test-only autopilot. It submits ordinary predicted controls, never changes
// aircraft state, loadout, damage, cooldowns or authoritative weapon limits.
export class CombatLoadPilot {
  constructor({ flightOnly = false } = {}) {
    this.flightOnly = flightOnly;
  }
  lastCycle = -Infinity;
  lastDecoy = -Infinity;
  command(s, snapshot, id) {
    if ((snapshot?.mission && snapshot.mission.phase !== 'active') || s.dying || s.crashed)
      return null;
    if (this.flightOnly) {
      const goal = new Vec3(s.position.x, 3000, s.position.z + 10000);
      const axes = {
        ...neutralAxes(),
        ...combatFlightInput({
          flight: { ...s, condition: structuredClone(s.condition) },
          cruiseSpeed: 180,
          navigationGoal: { kind: 'air', position: goal },
        }),
      };
      for (const key of ['pitch', 'roll', 'yaw', 'throttle'])
        axes[key] = Math.max(-1, Math.min(1, axes[key] || 0));
      axes.brake = !!axes.brake;
      return {
        axes,
        toggles: [],
        combat: { weapon: 'gun', fire: false, cycle: false, countermeasures: false },
      };
    }
    const own = snapshot.players.find((p) => p.id === id);
    if (!own) return null;
    const candidates =
      snapshot.scenario === 'arena'
        ? snapshot.players
            .filter((p) => p.id !== id && !p.state.dying && !p.state.crashed)
            .map((p) => ({ ...p, kind: 'air', position: p.state.position }))
        : snapshot.combat.targets.filter(
            (t) =>
              t.alive &&
              !t.exited &&
              !t.pending &&
              t.team !== own.state.team &&
              t.team !== 'neutral',
          );
    const aim = own.combat.aim;
    const target =
      candidates.find((p) => p.id === aim.id) ||
      candidates.sort(
        (a, b) =>
          Number(b.kind === 'air') - Number(a.kind === 'air') ||
          s.position.distance(a.position) - s.position.distance(b.position),
      )[0];
    if (!target) return null;
    const goal = new Vec3(target.position.x, target.position.y, target.position.z);
    const distance = s.position.distance(goal);
    const controls = combatFlightInput({
      flight: { ...s, condition: structuredClone(s.condition) },
      cruiseSpeed: 200,
      navigationGoal: { kind: target.kind, position: goal },
    });
    const axes = { ...neutralAxes(), ...controls };
    for (const key of ['pitch', 'roll', 'yaw', 'throttle'])
      axes[key] = Math.max(-1, Math.min(1, axes[key] || 0));
    axes.brake = !!axes.brake;
    const cycle =
      (!aim.id || !candidates.some((p) => p.id === aim.id)) && s.elapsed - this.lastCycle > 1;
    if (cycle) this.lastCycle = s.elapsed;
    const countermeasures = s.incomingMissiles > 0 && s.elapsed - this.lastDecoy > 2;
    if (countermeasures) this.lastDecoy = s.elapsed;
    const weapon =
      target.kind === 'ground' && s.ammo.agm > 0
        ? 'agm'
        : target.kind === 'air' && s.ammo.aam > 0 && distance > 600
          ? 'aam'
          : 'gun';
    return {
      axes,
      toggles: [],
      combat: {
        weapon,
        fire: ['aam', 'agm'].includes(weapon) ? aim.locked : s.ammo.gun > 0 && distance < 2500,
        cycle,
        countermeasures,
      },
    };
  }
}
