import { Vec3 } from './math.js';
import { terrainWorld, terrainHeight } from './terrain.js';
import { unitDefinition } from './unitTypes.js';
import { playerStrikeRole } from './airSuperiority.js';
function extraUnit(id, type, team, position, extra = {}) {
  const def = unitDefinition(type);
  return {
    id,
    type,
    team,
    kind: def.kind,
    name: def.name,
    faction: team === 'enemy' ? 'west' : 'east',
    alive: true,
    health: def.health || 100,
    maxHealth: def.health || 100,
    radius: def.kind === 'air' ? 28 : 60,
    threats: def.weapons.filter((w) => w !== 'jammer'),
    position: position.clone(),
    previousPosition: position.clone(),
    velocity: new Vec3(),
    heading: 0,
    combatSeed: 17,
    ...extra,
  };
}
export function mirrorBattle(targets, mission, player) {
  const originalHome = targets.find((t) => t.id === 'BASE');
  const candidates = targets.filter((t) => t.team === 'enemy' && t.kind === 'air' && !t.pending);
  const role = playerStrikeRole(player) ? 'bomber' : 'fighter';
  const slot =
    candidates.find((t) => t.type === role) ||
    candidates.find((t) => t.type === 'fighter') ||
    candidates[0];
  if (!slot) throw new Error('A tükrözött küldetéshez hiányzik a játékos kezdőhelye.');
  const start = {
    position: slot.position.clone(),
    heading: slot.heading || 0,
    speed: Math.max(150, slot.velocity.length()),
    squad: slot.squad,
    formationSlot: slot.formationSlot,
  };
  const squad = slot.squad;
  const slotId = slot.id;
  for (const t of targets) {
    if (t.team !== 'neutral') t.team = t.team === 'enemy' ? 'ally' : 'enemy';
    t.home = false;
    if (t.id === 'BASE') t.renderedAsOriginBase = true;
    if (t.team === 'ally' && t.kind === 'air' && (!squad || t.squad === squad)) {
      t.radioCallSign = { flight: 'Falcon', number: 2 };
    }
    if (t.team === 'enemy' && t.kind === 'air' && !t.civilian) t.faction = 'west';
    if (t.team === 'enemy' && t.radioCallSign)
      t.radioCallSign = {
        ...t.radioCallSign,
        flight:
          { Falcon: 'Eagle', Viper: 'Hawk', Ironfist: 'Sentinel' }[t.radioCallSign.flight] ||
          t.radioCallSign.flight,
      };
    if (t.team === 'ally' && t.kind === 'air') t.faction = player.faction;
  }
  targets.splice(targets.indexOf(slot), 1);
  // References to the removed AI slot must now address the human aircraft.
  for (const t of targets)
    for (const field of ['defendId', 'aiTargetId']) if (t[field] === slotId) t[field] = 'PLAYER';
  let member = 0;
  for (const t of targets.filter(
    (t) => t.team === 'ally' && t.kind === 'air' && (!squad || t.squad === squad),
  )) {
    const group = Math.floor((member + 1) / 4);
    t.radioCallSign = {
      flight: ['Falcon', 'Viper', 'Ironfist', 'Wolf'][group],
      number: member < 3 ? member + 2 : ((member - 3) % 4) + 1,
    };
    member++;
  }
  if (squad)
    for (const t of targets.filter((t) => t.team === 'ally' && t.squad === squad))
      t.squad = 'FALCON';
  start.squad = squad ? 'FALCON' : undefined;
  const heroType =
    mission.objective === 'air-superiority' && playerStrikeRole(player) ? 'bomber' : 'fighter';
  const hero = extraUnit(
    'WESTERN-LEAD',
    heroType,
    'enemy',
    new Vec3(0, mission.naval ? 22 : 2, mission.naval ? -85 : -900),
    {
      aircraftId: mission.naval ? 'fa18' : heroType === 'bomber' ? 'b52' : 'f16',
      aiRole: 'takeoff',
      takeoffClock: 0,
      cruiseSpeed: 180,
      radioCallSign: { flight: 'Eagle', number: 1 },
      aiTargetId:
        mission.objective === 'ballistic-strike'
          ? 'SILO'
          : mission.objective === 'iron-veil'
            ? 'IV-SAM1'
            : undefined,
      defendId:
        mission.objective === 'escort-transport'
          ? 'TRANSPORT'
          : mission.objective === 'defend-base'
            ? 'BASE'
            : undefined,
      defendGroup: mission.objective === 'defend-city' ? 'city' : undefined,
    },
  );
  hero.velocity = new Vec3(0, 0, 30);
  if (mission.originalAirStart && !mission.naval) {
    hero.position = new Vec3(0, 1700, -23000);
    hero.previousPosition = hero.position.clone();
    hero.aiRole = 'interceptor';
    hero.velocity = new Vec3(0, 0, 165);
  }
  if (mission.objective === 'air-superiority') {
    hero.position = terrainWorld.airBattle.playerStart.position.clone();
    hero.previousPosition = hero.position.clone();
    hero.aiRole = heroType === 'bomber' ? undefined : 'interceptor';
    hero.heading = terrainWorld.airBattle.playerStart.heading;
    hero.squad = terrainWorld.airBattle.playerStart.squad;
    hero.formationSlot = terrainWorld.airBattle.playerStart.slot;
    hero.velocity = new Vec3(Math.sin(hero.heading) * 165, 0, Math.cos(hero.heading) * 165);
    if (heroType === 'bomber') hero.aiTargetId = 'ENEMY-BASE';
  }
  targets.push(hero);
  if (mission.naval) {
    const western = targets.filter((t) => t.team === 'enemy' && t.kind === 'air');
    western.forEach((t, i) => {
      t.position = new Vec3(-7, 22, 70 - i * 45);
      t.previousPosition = t.position.clone();
      t.heading = 0;
      t.velocity = new Vec3(0, 0, 70);
      t.aiRole = 'takeoff';
      t.takeoffClock = -i * 7;
      t.defendId = 'BASE';
      t.aircraftId = 'fa18';
    });
    start.recoveryExit = new Vec3(0, 2000, 35000);
  } else {
    let home = targets.find((t) => t.team === 'ally' && t.type === 'airbase');
    if (!home) {
      const direction = start.position.clone();
      direction.y = 0;
      direction.normalize();
      const p = start.position.clone().add(direction.scale(10000));
      p.y = terrainHeight(p.x, p.z) + 3;
      home = extraUnit('EASTERN-BASE', 'airbase', 'ally', p, { health: 320, maxHealth: 320 });
      terrainWorld.airfields ??= [];
      terrainWorld.airfields.push({ x: p.x, z: p.z, elevation: p.y - 3, heading: 0 });
      targets.push(home);
    }
    const elevation = home.position.y - 3;
    home.position.y = elevation;
    home.previousPosition = home.position.clone();
    home.home = true;
    home.remoteHome = true;
    home.name = 'Saját keleti repülőtér';
    start.airfield = {
      position: home.position.clone(),
      elevation,
      heading: home.heading || 0,
      halfWidth: 45,
      halfLength: 1600,
      home: false,
    };
  }
  if (mission.objective === 'ballistic-strike')
    targets.find((t) => t.id === 'SILO').targetId = originalHome.id;
  terrainWorld.sideStart = start;
  return targets;
}
