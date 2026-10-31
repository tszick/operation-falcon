import { refuellingHint } from './aerialRefuelling.js';
import { ironVeilGuide } from './ironVeil.js';
import { advisedTarget } from './targetAdvice.js';
import { firingStatus } from './firingStatus.js';
import { attitude, DEG } from './math.js';
import { approachSpeeds, approachSpeedAction } from './performance.js';
import { weaponAvailable, weaponLabel, weaponKeys } from './armament.js';
import { fireSolution } from './weaponDynamics.js';
import { flapStatus } from './flaps.js';
import { sensorTargets, navigationJammed } from './electronicWarfare.js';
// Short, ordered cockpit reminders. Detailed instructions remain in H.
export function phaseGuide(s, mission, aim, weapons, targets) {
  const step = (key, text, done = false) => ({ key, text, done });
  if (mission.spec.objective === 'aerial-refuelling')
    return (
      mission.spec.side === 'east'
        ? [
            step('T / 2', mission.phaseHint),
            step('C', 'Védd az ütegeket; a tanker nem tud tüzelni.'),
          ]
        : [
            step('A / D / W / S', refuellingHint(s)),
            step('R / F', 'Tanker mögött 48 m-rel, 6 m-rel lejjebb; kövesd a türkiz pontot.'),
            step('G / X / B / SHIFT', 'Futó, fékszárny, légfék és utánégető kikapcsolva.'),
            step('—', '9 m-en belül, legfeljebb 6 m/s eltérés; tartsd 5 másodpercig.'),
          ]
    ).map((v, i) => ({ ...v, active: i === 0 }));
  if (mission.spec.objective === 'flight-test' && !s.approach?.active)
    return [
      step('R / W / S', mission.phaseHint),
      step('—', 'A repülési tesztpontokat folyamatosan, fegyverzet nélkül teljesítsd.'),
    ].map((v, i) => ({ ...v, active: i === 0 }));
  if (s.recoveryExit && (mission.aborted || ['return', 'emergency'].includes(mission.phaseId))) {
    const delta = s.recoveryExit.clone().sub(s.position),
      heading = (Math.atan2(delta.x, delta.z) / DEG + 360) % 360;
    return [
      step(
        'A / D',
        `KIVONULÁS: ${Math.round(heading)}° · ${(delta.length() / 1000).toFixed(1)} km`,
      ),
      step('W / S', 'Tarts biztonságos magasságot a tenger felett'),
      step('—', 'Nincs saját fedélzet; repülj a kijelölt pontba'),
    ].map((v, i) => ({ ...v, active: i === 0 }));
  }

  if (mission.spec.naval && (!s.airborne || (s.onGround && !s.landing?.success)))
    return (
      s.spec.vtol
        ? [
            step('Z', `Fúvócső ${s.naval?.nozzle || 0}° · 45 rövid / 90 függőleges`),
            step('R', 'Gáz fel; nehéz géppel nekifutás, S: orr fel'),
            step('Z / G', 'Emelkedés után fokozatosan 0°; futó be'),
          ]
        : [
            step('R', 'Teljes gáz; Falcon Two előbb indul'),
            step('U', 'Katapult indítása · 5 s után'),
            step('S / G', 'Emelkedj; pozitív emelkedésnél futó be'),
          ]
    ).map((v, i) => ({ ...v, active: i === 0 }));
  if (mission.spec.naval && s.approach?.active)
    return (
      s.spec.vtol
        ? [
            step('G / Z', 'Futó ki; lassítás után fúvócső 90°'),
            step('R / F', 'Finom gáz: lebegés, süllyedés <3 m/s'),
            step('WASD / QE', 'Kis döntéssel igazodj a fedélzet fölé'),
          ]
        : [
            step('G / X / K', 'Futó, fékszárny és fékezőhorog ki'),
            step('R / F', '3,5° siklás a ferde fedélzet tengelyén'),
            step('S', 'Stabil orrhelyzet; ne lebegtesd ki'),
            step('R', 'Elvétett kötél: teljes gáz és átstartolás'),
          ]
    ).map((v, i) => ({ ...v, active: i === 0 }));
  const preferred = advisedTarget(s, targets, aim, mission.spec);
  const airTarget = preferred ? preferred.kind === 'air' : mission.spec.kind === 'air';
  const choices = (airTarget ? ['aam', 'gun'] : ['agm', 'bomb', 'gun']).filter((type) =>
    weaponAvailable(s, type),
  );
  const suggested = choices.includes(weapons.selected) ? weapons.selected : choices[0];
  const weaponStep = () =>
    step(
      suggested ? weaponKeys[suggested] : '—',
      suggested ? weaponLabel(s, suggested) : 'Nincs megfelelő lőszer: térj haza',
      weapons.selected === suggested,
    );
  if (navigationJammed(s, targets))
    return [
      step('EGÉR', 'Szemmel keresd az antennás zavarókocsit'),
      step('1 / 4', 'Ágyú vagy bomba: kézzel célozz'),
      step('A / D', 'Vagy repülj ki a zavarási körből'),
      step('T', 'Odakint újra befoghatod a zavarót'),
    ].map((item, i) => ({ ...item, active: i === 0 }));
  if (mission.spec.objective === 'iron-veil' && mission.phaseId?.startsWith('iron-'))
    return ironVeilGuide(mission, s, targets);
  targets = sensorTargets(s, targets);
  const target = preferred;
  const bearing = target
    ? ((Math.atan2(target.position.x - s.position.x, target.position.z - s.position.z) * 180) /
        Math.PI +
        360) %
      360
    : 0;
  const attitudeNow = attitude(s.orientation);
  const flap = flapStatus(s);
  const headingError = ((bearing - attitudeNow.heading / DEG + 540) % 360) - 180;
  const elevation = target
    ? Math.atan2(
        target.position.y - s.position.y,
        Math.hypot(target.position.x - s.position.x, target.position.z - s.position.z),
      ) /
        DEG -
      attitudeNow.pitch / DEG
    : 0;
  const course = `${Math.round(bearing).toString().padStart(3, '0')}°`;
  const speed = Math.round(approachSpeeds(s).target),
    rotation = Math.round((approachSpeeds(s).target * 0.95) / 5) * 5,
    speedAction = approachSpeedAction(s);
  const firing = firingStatus(s, targets, aim, weapons);
  const solution =
    target && suggested === weapons.selected
      ? fireSolution(s, target, weapons.selected, { heat: weapons.gunHeat || 0 })
      : null;
  let steps = [];
  switch (mission.phaseId) {
    case 'transport-flight': {
      const t = targets.find((t) => t.playerControlled);
      steps = [
        step(
          'KIJÁRAT',
          `Észak felé: ${Math.max(0, ((t?.exitZ || 24000) - s.position.z) / 1000).toFixed(1)} km`,
        ),
        step('MAGASSÁG', 'Tarts biztonságos magasságot; a Falcon gépek fedeznek'),
        step('C', 'Rakétaveszély: elterelők és kíméletes kitérés'),
      ];
      break;
    }
    case 'bomb-run':
      steps = [
        step('4', 'Inert bomba kiválasztása', weapons.selected === 'bomb'),
        step('A / D', 'Egyenes rárepülés a körre; kerüld a bedöntést'),
        step('SZÓKÖZ', 'CCIP a célkörbe: egyenként oldj'),
        step('—', `${s.bombingPractice?.hits || 0}/2 találat · ${s.ammo.bomb}/3 bomba maradt`),
      ];
      break;
    case 'bombs-pending':
      steps = [
        step('VÁRJ', 'A ledobott bombák becsapódását várjuk'),
        step('F', 'Gáz alapjáraton', s.throttle < 0.01),
        step('CTRL', 'Maradj álló helyzetben', s.speed < 5),
      ];
      break;
    case 'canyon-run':
      steps = [
        step('A / D', 'Finom bedöntéssel kövesd a völgyet'),
        step('W / S', 'Türkiz kapuk sorban; 40–350 m AGL'),
        step('R / F', 'Őrizd a sebességet; ne fékezz túl'),
        step('—', mission.phaseHint),
      ];
      break;
    case 'canyon-climb':
      steps = [
        step('R', 'Felhúzás előtt gyűjts sebességet'),
        step('S', 'Időben, fokozatosan húzd fel az orrot'),
        step('—', 'Figyeld az IAS-t, az AGL-t és a G-t'),
        step('W', 'Gerinc után finoman vedd vissza az orrot'),
      ];
      break;
    case 'landing-setup':
      steps = [
        step('N', 'Leszállási segéd bekapcsolása'),
        step('G', 'Futómű kiengedése', s.gear),
        step('X', 'Fékszárny kiengedése', flap.deployed),
        step('R / F', `Tarts kb. ${speed} km/h-t; V/S és AGL`),
      ];
      break;
    case 'civil-intercept':
      steps = [
        step('A / D', `Fordulj a civil gép felé: ${course}`, Math.abs(headingError) < 8),
        step('W / S', 'Tartsd a gép előtt a civil célt', Math.abs(elevation) < 8),
        step('T', 'Békés befogás, várd meg a jelzést', aim.locked),
        step('—', 'TŰZTILALOM — NE HASZNÁLJ FEGYVERT'),
      ];
      break;
    case 'civil-departure': {
      const home =
        (Math.atan2(
          (s.recoveryExit?.x ?? s.airfield?.position.x ?? 0) - s.position.x,
          (s.recoveryExit?.z ?? s.airfield?.position.z ?? 0) - s.position.z,
        ) /
          DEG +
          360) %
        360;
      steps = [
        step('✓', 'Befogás sikeres; a civil visszafordul', true),
        step('—', 'Ne lőj; hagyd elhagyni a légteret'),
        step('A / D', `Elindulhatsz haza: ${Math.round(home)}°`),
        step('N', 'Hazatérés után leszállási segéd'),
      ];
      break;
    }
    case 'emergency':
      steps = [
        step('A / D', 'Finoman ellensúlyozd a bedőlést'),
        step('R / F', 'Tarts sebességet; kerüld a nagy G-t'),
        step('A / D', `Fordulj a BASE felé; figyeld az AGL-t`),
        step('N', 'Készülj kényszerleszállásra'),
      ];
      break;
    case 'preflight':
    case 'takeoff':
      steps = [
        step(
          s.spec.hasAB ? 'R / SHIFT' : 'R',
          s.spec.hasAB ? 'Teljes gáz, utánégető' : 'Teljes gáz',
          s.throttle >= 0.95 && (!s.spec.hasAB || s.afterburner),
        ),
        step(
          'S',
          s.spec.id === 'b52'
            ? 'B–52: csak enyhe orremelés, kb. 3–5°; hagyd felgyorsulni.'
            : `${rotation}–${rotation + 20} km/h: finoman orr fel`,
          s.airborne,
        ),
        step('G', 'Emelkedés után futómű be', !s.gear),
        step('X', 'Fékszárny be', flap.retracted),
      ];
      break;
    case 'climb':
      steps = [
        step('G', 'Futómű behúzása', !s.gear),
        step('X', 'Fékszárny behúzása', flap.retracted),
        step('S', 'Finoman emelkedj 150 m fölé', s.agl >= 150),
      ];
      break;
    case 'jammer-attack':
      steps = [
        step('A / D', `Zavaró a gép elé: ${course}`),
        step('T', 'Befogás a zavarási körön kívül', aim.locked),
        weaponStep(),
        step('SZÓKÖZ', 'Zavaró kiiktatása, utána a fő cél'),
      ];
      break;
    case 'escort-cover':
      steps = [
        step('EGÉR', 'Kék jel: a védendő szállító'),
        step('T', 'Válassz egy közeledő támadót'),
        weaponStep(),
        step('—', 'Kísérd ki a szállítót; utána leszállás'),
      ];
      break;
    case 'intercept':
    case 'target-approach':
      steps = [
        step('A / D', `Fordulj a cél felé: ${course}`, Math.abs(headingError) < 8),
        step(
          'W / S',
          target ? `Célmagasság: ${Math.round(target.position.y)} m` : 'Kövesd a cél jelzését',
          Math.abs(elevation) < 8,
        ),
        step('T', 'Egyszer: célbefogás', aim.locked),
        weaponStep(),
      ];
      break;
    case 'air-combat':
    case 'ground-attack':
      steps = [
        weaponStep(),
        step('A / D', `Cél a gép elé: ${course}`, aim.locked),
        step(
          weapons.selected === 'gun' ? '1' : 'T',
          weapons.selected === 'bomb'
            ? 'Bombánál a CCIP-kört figyeld'
            : weapons.selected === 'gun'
              ? 'Az előretartás kis körét figyeld'
              : 'Befogás: tartsd elöl 2 mp-ig',
          aim.locked || weapons.selected === 'bomb' || weapons.selected === 'gun',
        ),
        step(
          'SZÓKÖZ',
          weapons.selected === 'bomb'
            ? 'CCIP a célon: kioldás'
            : weapons.selected === 'gun'
              ? 'Rövid sorozatokkal lőj'
              : 'LOCK jelzés után tűz',
        ),
      ];
      break;
    case 'return': {
      const home =
        ((Math.atan2(
          (s.recoveryExit?.x ?? s.airfield?.position.x ?? 0) - s.position.x,
          (s.recoveryExit?.z ?? s.airfield?.position.z ?? 0) - s.position.z,
        ) *
          180) /
          Math.PI +
          360) %
        360;
      steps = [
        step(
          'A / D',
          `${s.recoveryExit ? 'KIVONULÁS' : 'BASE'} irány: ${Math.round(home).toString().padStart(3, '0')}°`,
        ),
        ...(s.spec.hasAB ? [step('SHIFT', 'Utánégető kikapcsolása', !s.afterburner)] : []),
        step(speedAction.key, speedAction.text, speedAction.done),
        step(
          s.recoveryExit ? '—' : 'N',
          s.recoveryExit
            ? 'Repülj a kijelölt kivonulási ponthoz'
            : 'Leszállási segéd, ha szükséges',
        ),
      ];
      break;
    }
    case 'landing':
    case 'flare':
      steps = [
        step('G', 'Futómű kiengedése', s.gear),
        step('X', 'Fékszárny kiengedése', flap.deployed),
        step(speedAction.key, speedAction.text, speedAction.done),
        step('S', '10–15 m-en szintbe; süllyedés <3 m/s'),
      ];
      break;
    case 'rollout':
      steps = [
        step('F', 'Gáz teljesen le', s.throttle < 0.01),
        step('CTRL', 'Kerékfék, amíg megállsz', s.speed < 5),
      ];
      break;
  }
  const active = steps.findIndex((item) => !item.done);
  if (
    ['air-combat', 'ground-attack', 'jammer-attack'].includes(mission.phaseId) &&
    solution &&
    weapons.selected !== 'bomb'
  ) {
    const ready =
      firing.canFire &&
      ['good', 'marginal'].includes(solution.status) &&
      (weapons.selected === 'gun' || aim.locked);
    steps[steps.length - 1] = step(
      ready
        ? 'SZÓKÖZ'
        : firing.status === 'lock'
          ? 'T'
          : firing.status === 'cooldown'
            ? '—'
            : 'A / D',
      ready
        ? solution.status === 'marginal'
          ? 'Határeset; közelítve jobb az esély'
          : 'Tűzkész: rövid sorozat / indítás'
        : firing.canFire
          ? solution.label
          : firing.label,
    );
  }
  return steps.map((item, index) => ({ ...item, active: index === active }));
}
