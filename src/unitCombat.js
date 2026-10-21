import { aircraftFlightSpec } from './aiAircraftSpec.js';
import { unitDefinition } from './unitTypes.js';
import { Quat } from './math.js';
import { weaponProfiles } from './weaponDynamics.js';
export function combatSource(t, player) {
  const spec =
    t.flight?.spec ||
    (t.kind === 'air'
      ? aircraftFlightSpec(t.aircraftId || 'mig29')
      : {
          ...unitDefinition(t.type),
          radarCone: 180,
          radarRange: unitDefinition(t.type).radarRange || 0,
          faction:
            t.faction ||
            (t.team === 'ally'
              ? player?.spec.faction
              : player?.spec.faction === 'west'
                ? 'east'
                : 'west'),
        });
  return {
    id: t.id,
    team: t.team,
    position: t.position,
    velocity: t.velocity,
    spec,
    orientation:
      t.kind === 'ground'
        ? null
        : t.flight?.orientation || Quat.euler(t.heading || 0, t.pitch || 0, t.bank || 0),
    ground: t.kind === 'ground',
    alive: t.alive,
    crashed: !!t.flight?.crashed,
    dying: !!t.flight?.dying,
    condition: t.flight?.condition,
  };
}
export function groundCombatRows(type) {
  const def = unitDefinition(type),
    rows = [];
  if (def.kind !== 'ground') return rows;
  if (def.radarRange) rows.push(['Radar', `${def.radarRange / 1000} km · körkörös`]);
  if (def.radarMinElevation !== undefined)
    rows.push([
      'Alsó radarnyaláb',
      `${def.radarMinElevation}° · antenna az egység referenciapontja felett ${def.radarAntennaHeight} m. Tereptakarás és radarhorizont is korlátozza; azonos szabály mindkét oldalon. Játékbeli általános radarprofil.`,
    ]);
  if (['carrier', 'destroyer'].includes(type))
    rows.push(
      ['Rakéta', 'RIM-7 Sea Sparrow · félaktív radaros; a hajó támogatása kell a találatig'],
      ['Rakétakészlet', type === 'carrier' ? '2 db' : '6 db'],
      [
        'SeaRAM közelvédelem',
        '2 db RIM-116 RAM · 0,18–9 km névleges játékbeli tartomány; kizárólag közeledő rakéták elfogására, nem garantált találat',
      ],
    );
  if (def.weapons.includes('missile'))
    rows.push([
      'Rakéta lőtáv',
      `${(['carrier', 'destroyer'].includes(type) ? weaponProfiles.seaSparrow : weaponProfiles.sam).minRange / 1000}–${(['carrier', 'destroyer'].includes(type) ? weaponProfiles.seaSparrow : weaponProfiles.sam).maxRange / 1000} km névleges; a tényleges indítást a radar, a mozgás és a terep is korlátozza.`,
    ]);
  if (def.weapons.includes('gun'))
    rows.push([
      'Gépágyú hatásos táv',
      `${(type === 'carrier' ? weaponProfiles.carrierGun : weaponProfiles.groundGun).effectiveRange / 1000} km alapérték, azonos magassági korrekcióval mindkét oldalon.`,
    ]);
  if (def.weapons.includes('flak'))
    rows.push(['Légvédelmi gránát lőtáv', `${(def.flakRange || 6500) / 1000} km`]);
  return rows;
}
