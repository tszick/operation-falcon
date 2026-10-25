// Screen quadrilaterals registered to the approved strike-frame cockpit asset.
export const FRAME = { width: 1672, height: 941, top: 475 };
export const screenWells = {
  weapons: [
    [94, 690],
    [433, 650],
    [483, 843],
    [111, 897],
  ],
  radar: [
    [589, 580],
    [892, 580],
    [902, 846],
    [580, 848],
  ],
  engine: [
    [968, 571],
    [1139, 571],
    [1139, 694],
    [969, 694],
  ],
  mission: [
    [979, 744],
    [1184, 744],
    [1192, 872],
    [980, 873],
  ],
  controls: [
    [1320, 625],
    [1604, 651],
    [1604, 759],
    [1304, 722],
  ],
  guide: [
    [1296, 774],
    [1612, 814],
    [1612, 930],
    [1283, 879],
  ],
};
// Text controls remain independent live hit targets on the angled upper panel.
export const controlWells = {
  'config-gear': [
    [1325, 629],
    [1405, 637],
    [1402, 669],
    [1322, 661],
  ],
  'config-flaps': [
    [1417, 639],
    [1497, 647],
    [1494, 679],
    [1414, 671],
  ],
  'config-airbrake': [
    [1509, 649],
    [1589, 657],
    [1586, 689],
    [1506, 681],
  ],
  'config-assist': [
    [1318, 675],
    [1398, 683],
    [1395, 715],
    [1315, 707],
  ],
  'config-afterburner': [
    [1410, 685],
    [1490, 693],
    [1487, 725],
    [1407, 717],
  ],
  'config-wheel-brake': [
    [1502, 695],
    [1582, 703],
    [1579, 735],
    [1499, 727],
  ],
};
export function cockpitHeight(width, height) {
  // The engine well sits below the raised central lip; keep the lower HUD clear.
  const hudFloor = height * 0.53 + (height < 650 ? 112 : 177);
  const frontInset = (screenWells.engine[0][1] - FRAME.top) / (FRAME.height - FRAME.top);
  return Math.min(height * 0.3, Math.max(height * 0.18, (height - hudFloor) / (1 - frontInset)));
}
export function cockpitHudFooterY(width, height) {
  return Math.min(
    height * 0.53 + (height < 650 ? 80 : 145),
    height - cockpitHeight(width, height) - 24,
  );
}
export function wellQuad(name, width, height) {
  return screenWells[name].map(([x, y]) => [
    (x / FRAME.width) * width,
    ((y - FRAME.top) / (FRAME.height - FRAME.top)) * height,
  ]);
}
export function homography(width, height, points) {
  const source = [
      [0, 0],
      [width, 0],
      [width, height],
      [0, height],
    ],
    rows = [];
  source.forEach(([x, y], i) => {
    const [u, v] = points[i];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u], [0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  });
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let row = col + 1; row < 8; row++)
      if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const div = rows[col][col];
    if (Math.abs(div) < 1e-9) throw new Error('Degenerate cockpit screen');
    for (let k = col; k <= 8; k++) rows[col][k] /= div;
    for (let row = 0; row < 8; row++)
      if (row !== col) {
        const f = rows[row][col];
        for (let k = col; k <= 8; k++) rows[row][k] -= f * rows[col][k];
      }
  }
  return rows.map((r) => r[8]);
}
export function matrix3d(h) {
  return [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
}
export function compactObjective(row) {
  if (row.id === 'practice-hits')
    return `Találat ${row.hits ?? row.text.match(/(\d+)\/2/)?.[1] ?? 0}/${row.requiredHits ?? 2} · bomba ${row.remainingBombs ?? row.text.match(/bomba:\s*(\d+)/)?.[1] ?? 0}`;
  const ironLabels = {
    'iv-rearm': 'Leszállás / feltöltés',
    'iv-jammer': 'Jelzavaró (opció)',
    'iv-flak': 'Üteg (opció)',
    'iv-command': 'Bunker (opció)',
    'iv-convoy': 'Konvoj (opció)',
    'iv-counter': 'Ellencsapás',
  };
  if (ironLabels[row.id]) return ironLabels[row.id];
  if (row.id === 'iv-corridor') return 'SAM: ' + (row.text.match(/\d\/2/)?.[0] || '0/2');
  if (row.id === 'iv-road')
    return row.done
      ? 'Erősítés megállítva'
      : 'Híd / konvoj ' + (row.text.match(/\d+:\d{2}/)?.[0] || '');
  if (row.id === 'iv-transport')
    return row.done
      ? 'Nomad: kijutott'
      : row.text
          .replace('Nomad One:', 'Nomad:')
          .replace('indulásra vár', 'várakozik')
          .replace('kijárat ', '');
  if (row.id === 'iv-wingmen') return 'Viper: ' + (row.text.match(/\d\/2/)?.[0] || '0/2');
  const wingmen = { wingman: 'F2', 'wingman-three': 'F3', 'wingman-four': 'F4' };
  if (wingmen[row.id]) return wingmen[row.id];
  if (row.id === 'carrier') return row.text.replace('Anyahajó:', 'Hajó:');
  const labels = {
    'test-takeoff': 'Felszállás',
    'test-level': 'Szinttartás',
    'test-left': 'Bal forduló',
    'test-right': 'Jobb forduló',
    destroyer: 'Romboló',
    return: 'Hazatérés',
    bridge: 'Híd lezárása',
    convoy: 'Konvoj',
    enemyBase: 'Reptér',
    enemySam: 'Rakétavédelem',
    landing: 'Leszállás',
    'civil-lock': 'Befogás',
    'civil-exit': 'Távozás',
    transport: 'Szállító',
    enemies: 'Ellenség',
    main: 'Elsődleges feladat',
  };
  if (row.id === 'invasion-bases') return row.text;
  if (row.id === 'attackers' && row.text.startsWith('Repülők:')) return row.text.split(' · ')[0];
  if (row.id === 'city') return row.text.split(' · ')[0];
  if (row.id === 'waves')
    return row.text
      .replace(/^Hullám \d\/\d · (\d+) gép újratölt$/, '$1 újratölt')
      .replace(/^Hullám \d\/\d · (\d+) gép kivonul$/, '$1 kivonul')
      .replace(/^(\d+)\. hullám: (\d+) mp$/, 'Raj $1: $2 mp')
      .replace(/^Hullám /, '')
      .replace(' · támadók ', ' · ');
  if (row.id === 'ballistic')
    return row.done
      ? 'Csapás elhárítva'
      : row.text.includes('Rakéta')
        ? 'RAKÉTA A LEVEGŐBEN'
        : 'SILÓ ' + (row.text.match(/\d+:\d{2}/)?.[0] || '');
  if (row.id === 'attackers') return row.text.replace(/^Támadók(?: leküzdve)?:\s*/, '');
  return (
    labels[row.id] || (row.id === 'base' ? row.text.replace('Saját reptér:', 'Bázis:') : row.text)
  );
}
