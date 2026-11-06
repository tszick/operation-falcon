import { Vec3 } from '../../src/math.js';
import { neutralAxes } from '../../src/multiplayer/protocol.js';
import { combatFlightInput } from '../../src/aiDefense.js';
// Test-only autopilot. It submits ordinary predicted controls, never changes
// aircraft state, loadout, damage, cooldowns or authoritative weapon limits.
export class CombatLoadPilot {
  lastCycle = -Infinity;
  lastDecoy = -Infinity;
  command(s, snapshot, id) {
    if (snapshot?.mission?.phase !== 'active' || s.dying || s.crashed) return null;
    const candidates = snapshot.players.filter(
      (p) => p.id !== id && !p.state.dying && !p.state.crashed,
    );
    const own = snapshot.players.find((p) => p.id === id);
    if (!own) return null;
    const aim = own.combat.aim;
    const target =
      candidates.find((p) => p.id === aim.id) ||
      candidates.sort(
        (a, b) => s.position.distance(a.state.position) - s.position.distance(b.state.position),
      )[0];
    if (!target) return null;
    const goal = new Vec3(
      target.state.position.x,
      target.state.position.y,
      target.state.position.z,
    );
    const distance = s.position.distance(goal);
    const controls = combatFlightInput({
      flight: { ...s, condition: structuredClone(s.condition) },
      cruiseSpeed: 200,
      navigationGoal: { kind: 'air', position: goal },
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
    const weapon = s.ammo.aam > 0 && distance > 600 ? 'aam' : 'gun';
    return {
      axes,
      toggles: [],
      combat: {
        weapon,
        fire: weapon === 'aam' ? aim.locked : s.ammo.gun > 0 && distance < 2500,
        cycle,
        countermeasures,
      },
    };
  }
}
