import { attachRoadBridges } from './bridgeCrossings.js';
import { spawnRefuelling } from './aerialRefuelling.js';
import { createBattlefieldTargets } from './battlefieldScenario.js';
import { mirrorBattle } from './sideBattle.js';
import { assignCoalitionRoster } from './coalitionRoster.js';
import { transportAircraft } from './heavyAircraftData.js';
import { spawnIronVeil } from './ironVeil.js';
import { superiorityPlan, formatCallSign } from './airSuperiority.js';
import { Vec3 } from './math.js';
import {
  configureTerrain,
  terrainWorld,
  terrainHeight,
  pathHeading,
  convoyPose,
} from './terrain.js';
import { unitDefinition } from './unitTypes.js';
import { enemyAircraft } from './enemies.js';
export function createBattleTargets(m, player, { rng = Math.random } = {}) {
  if (m.battlefield) return attachRoadBridges(createBattlefieldTargets(m, player, rng));
  const canonical = m.mirrored
    ? { ...player, faction: 'west', id: m.naval ? 'fa18' : 'f16' }
    : player;
  const units = attachRoadBridges(createCanonicalTargets(m, canonical, rng));
  if (m.mirrored) mirrorBattle(units, m, player);
  if (m.side) assignCoalitionRoster(units, player, rng);
  return units;
}
function createCanonicalTargets(m, player, rng) {
  const airBattle = m.objective === 'air-superiority' ? superiorityPlan(player, rng) : null;
  const bearing = rng() * Math.PI * 2,
    radius = 22000 + rng() * 6000,
    anchor =
      m.objective === 'iron-veil'
        ? new Vec3((rng() - 0.5) * 3000, 0, 26000 + rng() * 2500)
        : airBattle?.enemyBase ||
          new Vec3(Math.sin(bearing) * radius, 0, Math.cos(bearing) * radius),
    enemies = player.faction === 'west' ? 'east' : 'west';
  configureTerrain(
    { ...m, id: ['bridge-block', 'iron-veil'].includes(m.objective) ? 'bridge' : m.id },
    anchor,
    rng,
  );
  if (airBattle) terrainWorld.airBattle = airBattle;
  const units = [];
  function add(id, type, team, position, extra = {}) {
    const def = unitDefinition(type),
      opponent = enemyAircraft(
        { id: type },
        team === 'ally' ? { ...player, faction: enemies } : player,
      ),
      air = def.kind === 'air';
    position = position.clone();
    if (!air) position.y = terrainHeight(position.x, position.z) + 3;
    const t = {
      id,
      type,
      team,
      name: def.name,
      role: def.role,
      kind: def.kind,
      threats: def.weapons.filter((w) => w !== 'jammer'),
      faction: team === 'neutral' ? 'neutral' : team === 'ally' ? player.faction : enemies,
      alive: true,
      position,
      previousPosition: position.clone(),
      velocity: new Vec3(),
      heading: 0,
      radius: air ? 28 : 60,
      health: def.health || 100,
      maxHealth: def.health || 100,
      ...(def.weapons.includes('jammer') ? { jamRadius: def.range } : {}),
      combatSeed: Math.floor(rng() * 0xffffffff),
      ...extra,
    };
    if (type === 'airbase') {
      terrainWorld.airfields ??= [];
      terrainWorld.airfields.push({
        x: position.x,
        z: position.z,
        elevation: position.y - 3,
        heading: t.heading,
      });
    }
    if (air) {
      t.aircraftId = type === 'civil' ? 'airliner' : opponent.id;
      t.cruiseSpeed = def.speed || 145;
      t.heading = Math.atan2(-position.x, -position.z);
      t.velocity = new Vec3(
        Math.sin(t.heading) * t.cruiseSpeed,
        0,
        Math.cos(t.heading) * t.cruiseSpeed,
      );
      if (type === 'fighter' || type === 'bomber' || type === 'transport') t.name = opponent.name;
    }
    if (t.aiRole === 'escortee') t.routeX = t.position.x;
    units.push(t);
    return t;
  }
  if (m.objective === 'aerial-refuelling') {
    spawnRefuelling(m, player, add);
    return units;
  }
  if (m.naval) {
    const home = add('BASE', 'carrier', 'ally', new Vec3(), {
      home: true,
      health: 600,
      maxHealth: 600,
    });
    home.position.y = 0;
    home.previousPosition = home.position.clone();
    const ally = add('ALLY-FIGHTER1', 'fighter', 'ally', new Vec3(-7, 22, 70), {
      aiRole: 'takeoff',
      takeoffClock: 0,
      heading: 0,
      cruiseSpeed: 190,
      defendId: 'BASE',
      radioCallSign: { flight: 'Falcon', number: 2 },
    });
    ally.aircraftId = 'fa18';
    ally.name = 'F/A-18C Hornet';
    ally.velocity = new Vec3(0, 6, 70);
    const cover = add('ALLY-FIGHTER2', 'fighter', 'ally', new Vec3(250, 450, 1200), {
      aiRole: 'interceptor',
      cruiseSpeed: 190,
      defendId: 'BASE',
      radioCallSign: { flight: 'Falcon', number: 3 },
    });
    cover.aircraftId = 'fa18';
    cover.name = 'F/A-18C Hornet';
    cover.heading = 0;
    cover.velocity = new Vec3(0, 0, 190);
    const extraCover = add('ALLY-FIGHTER3', 'fighter', 'ally', new Vec3(-450, 500, 900), {
      aiRole: 'interceptor',
      cruiseSpeed: 190,
      defendId: 'BASE',
      radioCallSign: { flight: 'Falcon', number: 4 },
    });
    extraCover.aircraftId = 'fa18';
    extraCover.name = 'F/A-18C Hornet';
    extraCover.heading = 0;
    extraCover.velocity = new Vec3(0, 0, 190);
    for (let i = 0; i < 4; i++) {
      const bomber = i === 3,
        position = new Vec3((i - 1.5) * 1200, bomber ? 1800 : 2400, 24000 + (i % 2) * 1500),
        t = add(`NAVAL-W1-${i}`, bomber ? 'bomber' : 'fighter', 'enemy', position, {
          wave: 1,
          pending: false,
          alive: true,
          squad: 'BANDIT-1',
          formationSlot: i,
          aiTargetId: 'BASE',
        });
      t.aircraftId = bomber ? 'tu95' : 'mig29';
      t.name = bomber ? 'Tu-95 Bear' : 'MiG-29A';
      t.cruiseSpeed = bomber ? 140 : 180;
      t.heading = Math.atan2(-position.x, -position.z);
      t.velocity = new Vec3(
        Math.sin(t.heading) * t.cruiseSpeed,
        0,
        Math.cos(t.heading) * t.cruiseSpeed,
      );
      if (!bomber) delete t.aiTargetId;
    }
    const ship = add('ENEMY-DESTROYER', 'destroyer', 'enemy', new Vec3(13000, 0, 19500));
    ship.position.y = 0;
    ship.heading = Math.atan2(-ship.position.x, -ship.position.z);
    ship.velocity = new Vec3(Math.sin(ship.heading) * 10, 0, Math.cos(ship.heading) * 10);
    return units;
  }
  if (m.objective === 'practice-bombing') {
    add('RANGE', 'target-range', 'neutral', new Vec3(4500, 0, 8500), {
      practiceTarget: true,
      radius: 50,
    });
    return units;
  }
  if (['landing', 'canyon'].includes(m.objective)) return [];
  const home = add('BASE', 'airbase', 'ally', new Vec3(), {
    home: true,
    health: 320,
    maxHealth: 320,
  });
  if (m.objective === 'iron-veil') {
    spawnIronVeil(add, anchor, player, rng);
    return units;
  }
  if (airBattle) {
    const base = add('ENEMY-BASE', 'airbase', 'enemy', anchor, { health: 320, maxHealth: 320 });
    const side = new Vec3(
      Math.cos(airBattle.playerStart.heading),
      0,
      -Math.sin(airBattle.playerStart.heading),
    );
    add('ALLY-SAM', 'sam-system', 'ally', side.clone().scale(650), { defendId: home.id });
    add('ENEMY-SAM', 'sam-system', 'enemy', anchor.clone().add(side.clone().scale(650)), {
      defendId: base.id,
    });
    for (const row of airBattle.units) {
      const faction = row.team === 'ally' ? player.faction : enemies,
        bomber = row.type === 'bomber',
        id =
          faction === 'west'
            ? bomber
              ? 'b52'
              : 'f15'
            : faction === 'china'
              ? 'j10'
              : bomber
                ? 'tu95'
                : 'su27',
        names = {
          b52: 'B-52 Stratofortress',
          f15: 'F-15 Eagle',
          tu95: 'Tu-95 Bear',
          su27: 'Su-27 Flanker',
          j10: 'Chengdu J-10C',
        };
      const t = add(row.id, row.type, row.team, row.position, {
        squad: row.squad,
        formationSlot: row.slot,
        radioCallSign: row.radioCallSign,
        aiTargetId: bomber ? (row.team === 'ally' ? base.id : home.id) : undefined,
        aiRole: bomber ? undefined : 'interceptor',
        cruiseSpeed: row.speed,
      });
      t.aircraftId = id;
      t.name = formatCallSign(row.radioCallSign) + ' · ' + names[id];
      t.heading = row.heading;
      t.velocity = new Vec3(Math.sin(t.heading) * row.speed, 0, Math.cos(t.heading) * row.speed);
      t.pitch = 0;
    }
    return units;
  }
  if (m.objective === 'escort') {
    const t = add('CIVIL', 'civil', 'neutral', new Vec3(anchor.x, 2400, anchor.z), {
      civilian: true,
      airspaceRadius: radius + 4000,
    });
    return [t, home];
  }
  if (m.objective === 'bridge-block') {
    const bridge = add('BRIDGE', 'bridge', 'enemy', anchor);
    bridge.position.y = terrainWorld.river.level + 14;
    bridge.heading = pathHeading(terrainWorld.road, 0);
    bridge.radius = terrainWorld.river.width * 0.55;
    const convoy = add('CONVOY', 'convoy', 'enemy', anchor, {
      routeMode: 'bridge',
      routeDistance: -6000,
      routeDirection: 1,
      bridgeId: bridge.id,
    });
    Object.assign(convoy, convoyPose(convoy));
    add('MOBILE-JAMMER', 'mobile-jammer', 'enemy', convoy.position, {
      followId: convoy.id,
      followGap: 240,
      routeDistance: convoy.routeDistance - 240,
      routeDirection: 1,
    });
    add('MOBILE-SAM', 'mobile-sam', 'enemy', convoy.position, {
      followId: convoy.id,
      followGap: 140,
      routeDistance: convoy.routeDistance - 140,
      routeDirection: 1,
    });
    for (const t of units.filter((t) => t.followId)) Object.assign(t, convoyPose(t));
    const droneStart = anchor.clone().normalize().scale(14000);
    droneStart.y = 0;
    add('DRONE-COMMAND', 'drone-command', 'enemy', droneStart, {
      aiTargetId: home.id,
      droneStock: 8,
      droneSalvo: 2,
    });
    return units;
  }
  if (m.objective === 'defend-base') {
    const a = anchor.clone().normalize(),
      side = new Vec3(a.z, 0, -a.x);
    add(
      'BOMBER',
      'bomber',
      'enemy',
      a
        .clone()
        .scale(29000)
        .add(new Vec3(0, 1800, 0)),
      { aiTargetId: home.id },
    );
    for (let i = 0; i < 2; i++)
      add(
        `FIGHTER${i + 1}`,
        'fighter',
        'enemy',
        a
          .clone()
          .scale(27500)
          .add(side.clone().scale(i ? 2200 : -2200))
          .add(new Vec3(0, 2300 + i * 200, 0)),
        { aiRole: 'interceptor' },
      );
    add('ALLY-BUNKER', 'bunker', 'ally', new Vec3(-650, 0, 250));
    add('ALLY-SAM', 'sam-system', 'ally', new Vec3(650, 0, -250), { defendId: home.id });
    add('ALLY-SAM2', 'sam-system', 'ally', new Vec3(-650, 0, -250), { defendId: home.id });
    const wingman = add(
      'ALLY-FIGHTER',
      'fighter',
      'ally',
      a
        .clone()
        .scale(6500)
        .add(side.clone().scale(900))
        .add(new Vec3(0, 2400, 0)),
      { aiRole: 'interceptor' },
    );
    const friendly =
      player.faction === 'west'
        ? ['f15', 'F-15 Eagle']
        : player.faction === 'china'
          ? ['j10', 'Chengdu J-10C']
          : ['su27', 'Su-27 Flanker'];
    wingman.aircraftId = friendly[0];
    wingman.name = friendly[1];
    wingman.cruiseSpeed = 210;
    wingman.heading = Math.atan2(a.x, a.z);
    wingman.velocity = new Vec3(a.x * 210, 0, a.z * 210);
    return units;
  }
  if (m.objective === 'escort-transport') {
    for (const [x, z] of [[-2300, 6000]])
      terrainWorld.peaks.push({ x, z, height: 850 + rng() * 350, radius: 1500, platform: 100 });
    const transport = add('TRANSPORT', 'transport', 'ally', new Vec3(-700, 1700, -22000), {
      aiRole: 'escortee',
      exitZ: 24000,
      heading: 0,
    });
    transport.heading = 0;
    transport.velocity = new Vec3(0, 0, transport.cruiseSpeed);
    if (player.transport) {
      transport.playerControlled = true;
      transport.aircraftId = player.id;
      transport.name = player.name;
      for (let i = 0; i < 2; i++) {
        const spec =
          player.faction === 'west'
            ? ['f15e', 'F-15E Strike Eagle']
            : player.faction === 'china'
              ? ['j10', 'Chengdu J-10C']
              : ['su35', 'Su-35S'];
        const escort = add(
          `TRANSPORT-ESCORT${i + 1}`,
          'fighter',
          'ally',
          new Vec3(i ? 600 : -600, 1900, -22500),
          {
            aiRole: 'interceptor',
            defendId: transport.id,
            radioCallSign: { flight: 'Falcon', number: i + 1 },
          },
        );
        escort.aircraftId = spec[0];
        escort.name = spec[1];
        escort.heading = 0;
        escort.velocity = new Vec3(0, 0, 165);
      }
    } else {
      const spec = transportAircraft.find((a) => a.faction === player.faction);
      if (spec) {
        transport.aircraftId = spec.id;
        transport.name = spec.name;
      }
    }
    add('FIGHTER1', 'fighter', 'enemy', new Vec3(-6500, 2200, 16500), { aiTargetId: transport.id });
    for (const [i, x, z] of [[1, -2300, 6000]])
      add(`FLAK${i}`, 'sam', 'enemy', new Vec3(x, 0, z), { aiTargetId: transport.id });
    return units;
  }
  if (m.objective === 'defend-city') {
    terrainWorld.cityRoads = Array.from({ length: 12 }, (_, i) => ({
      x: i < 6 ? -2250 + i * 900 : 0,
      z: i < 6 ? 16000 : 13750 + (i - 6) * 900,
      angle: i < 6 ? Math.PI / 2 : 0,
      bend: 0,
      phase: 0,
      width: 42,
      min: -2400,
      max: 2400,
      city: true,
    }));
    const city = new Vec3(0, 0, 16000),
      direction = new Vec3(Math.sin(bearing) * 0.45, 0, 1).normalize(),
      side = new Vec3(direction.z, 0, -direction.x);
    // Metropolis blocks: broad flight corridors, low outer skyline and a tall core.
    // Keep 25 independent objectives; scale and silhouette supply the city, not extra meshes.
    for (let x = -2; x <= 2; x++)
      for (let z = -2; z <= 2; z++) {
        const ring = Math.max(Math.abs(x), Math.abs(z)),
          height =
            (ring === 0 ? 820 : ring === 1 ? 400 : 180) +
            rng() * (ring === 0 ? 80 : ring === 1 ? 160 : 120);
        add(
          `CITY-${x + 2}-${z + 2}`,
          'city-building',
          'ally',
          city.clone().add(new Vec3(x * 900, 0, z * 900)),
          {
            buildingHeight: height,
            buildingWidth: 80 + rng() * 60,
            buildingDepth: 80 + rng() * 60,
            city: true,
          },
        );
      }
    const friendly =
      player.faction === 'west'
        ? ['f15', 'F-15 Eagle']
        : player.faction === 'china'
          ? ['j10', 'Chengdu J-10C']
          : ['su27', 'Su-27 Flanker'];
    for (let i = 0; i < 2; i++) {
      const t = add(
        `ALLY-FIGHTER${i + 1}`,
        'fighter',
        'ally',
        new Vec3(i ? 8 : -8, 2, -300 + i * 200),
        {
          aiRole: 'takeoff',
          takeoffClock: -i * 6,
          heading: 0,
          cruiseSpeed: 220,
          defendGroup: 'city',
        },
      );
      t.aircraftId = friendly[0];
      t.name = friendly[1];
      t.velocity = new Vec3(0, 0, 25);
    }
    for (let wave = 1; wave <= 2; wave++)
      for (let i = 0; i < (wave === 1 ? 4 : 3); i++) {
        const fighter = i < (wave === 1 ? 2 : 1),
          t = add(
            `W${wave}-${fighter ? 'F' : 'B'}${i}`,
            fighter ? 'fighter' : 'bomber',
            'enemy',
            city
              .clone()
              .add(direction.clone().scale(27000 + (wave - 1) * 5000))
              .add(side.clone().scale((i - 1.5) * 1800))
              .add(new Vec3(0, fighter ? 2500 : 1900, 0)),
            {
              wave,
              pending: wave === 2,
              alive: wave === 1,
              aiRole: fighter ? 'interceptor' : undefined,
              preferCity: !fighter,
            },
          );
        const d = city.clone().sub(t.position);
        t.heading = Math.atan2(d.x, d.z);
        t.velocity = new Vec3(
          Math.sin(t.heading) * t.cruiseSpeed,
          0,
          Math.cos(t.heading) * t.cruiseSpeed,
        );
      }
    return units;
  }
  if (m.objective === 'ballistic-strike') {
    add('SILO', 'ballistic-silo', 'enemy', anchor, { launchAt: m.launchDelay || 300 });
    add('JAMMER', 'jammer', 'enemy', anchor.clone().add(new Vec3(1600, 0, -500)), {
      jamRadius: 7000,
      radius: 35,
    });
    add('SILO-GUARD', 'fighter', 'enemy', anchor.clone().add(new Vec3(-3000, 2500, -6000)), {
      aiRole: 'interceptor',
    });
    return units;
  }
  if (m.objective === 'airbase-strike') {
    add('ENEMY-BASE', 'airbase', 'enemy', anchor);
    add('ENEMY-SAM', 'sam-system', 'enemy', anchor.clone().add(new Vec3(280, 0, 220)));
    add('JAMMER', 'jammer', 'enemy', anchor.clone().add(new Vec3(1800, 0, -500)), {
      jamRadius: 7000,
      radius: 35,
    });
    // A separate road leads the attacking convoy toward our base, not in circles.
    const angle = bearing + Math.PI * 0.55;
    terrainWorld.road = {
      x: 0,
      z: 0,
      angle: Math.atan2(Math.cos(angle), Math.sin(angle)),
      bend: 0,
      phase: 0,
      width: 14,
      min: 1000,
      max: 50000,
    };
    if (terrainWorld.river) {
      for (let t = 1000; t < 20000; t += 200) {
        const p = new Vec3(Math.sin(angle) * t, 0, Math.cos(angle) * t),
          r = terrainWorld.river,
          dx = p.x - r.x,
          dz = p.z - r.z;
        if (Math.abs(-dx * Math.sin(r.angle) + dz * Math.cos(r.angle)) < r.width + 1200) {
          terrainWorld.river = null;
          break;
        }
      }
    }
    const convoy = add('ATTACK-CONVOY', 'convoy', 'enemy', new Vec3(), {
      routeMode: 'base-attack',
      routeDistance: 8000,
      routeDirection: -1,
      aiTargetId: home.id,
    });
    Object.assign(convoy, convoyPose(convoy));
    const escort = add('ATTACK-MOBILE-SAM', 'mobile-sam', 'enemy', convoy.position, {
      followId: convoy.id,
      followGap: 180,
      routeDirection: -1,
      routeDistance: convoy.routeDistance + 180,
    });
    Object.assign(escort, convoyPose(escort));
    return units;
  }
  return units;
}
