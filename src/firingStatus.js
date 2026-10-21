import { tailGunStatus } from './tailGunnery.js';
import { armament } from './armament.js';
import { damageResponse } from './damage.js';
import { navigationJammed, sensorTargets } from './electronicWarfare.js';
import { fireSolution } from './weaponDynamics.js';
// The cockpit and trigger use the same permission decision, not just the range.
export function firingStatus(s, targets, aim, weapons) {
  if (s.rearView) {
    const status = tailGunStatus(s);
    return weapons.tailCooldown > 0 && status.canFire
      ? { ...status, canFire: false, status: 'cooldown', label: 'FAROKGÉPÁGYÚ ELŐKÉSZÍTÉSE' }
      : status;
  }
  const type = weapons.selected,
    guided = type === 'aam' || type === 'agm';
  const blocked = (status, label, solution = null) => ({ canFire: false, status, label, solution });
  if (s.training) return blocked('training', 'GYAKORLAT — FEGYVERZET NÉLKÜL');
  if (s.dying || s.crashed) return blocked('disabled', 'IRÁNYÍTÁS ELVESZETT');
  if (guided && !damageResponse(s).weapons)
    return blocked('disabled', 'FEGYVERRENDSZER HIBA — RAKÉTAINDÍTÁS TILTVA');
  if (!armament(s.spec).weapons[type])
    return blocked('unequipped', 'EZ A FEGYVER NINCS FELSZERELVE');
  if (s.ammo[type] <= 0) return blocked('empty', 'NINCS LŐSZER');
  if (guided && navigationJammed(s, targets))
    return blocked('jammed', 'JELZAVARÁS — RAKÉTAINDÍTÁS TILTVA · REPÜLJ KI A KÖRBŐL');
  const target = sensorTargets(s, targets).find((t) => t.id === aim?.id && t.alive);
  if (guided && (!aim?.locked || !target)) return blocked('lock', 'ELŐBB FOGD BE A CÉLT — T');
  if (guided && (type === 'aam') !== (target.kind === 'air'))
    return blocked('wrong-type', 'A FEGYVER NEM EHHEZ A CÉLHOZ VALÓ');
  const solution = target ? fireSolution(s, target, type, { heat: weapons.gunHeat || 0 }) : null;
  if (guided && !solution?.canLaunch)
    return blocked(
      solution?.status || 'lock',
      solution?.label || 'ELŐBB FOGD BE A CÉLT — T',
      solution,
    );
  if (weapons.cooldown > 0)
    return blocked('cooldown', `FEGYVER ELŐKÉSZÍTÉSE · ${weapons.cooldown.toFixed(1)} S`, solution);
  return {
    canFire: true,
    status: solution?.status || 'ready',
    label: solution?.label || 'TŰZKÉSZ',
    solution,
    target,
  };
}
