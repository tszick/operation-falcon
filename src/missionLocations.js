// Fictional operations placed on real geography. Coordinates are for the briefing map;
// each flight still uses the simulator's local procedural world, not geospatial terrain.
export const missionLocations = Object.freeze({
  landing: { name: 'Kansas · USA', lat: 38.5, lon: -98.5, surface: 'grass' },
  canyon: { name: 'Grand Canyon · Arizona, USA', lat: 36.1, lon: -112.1, surface: 'desert' },
  civil: { name: 'Georgia · USA', lat: 32.4, lon: -83.2, surface: 'grass' },
  'practice-bombing': {
    name: 'Sziklás-hegység · Colorado, USA',
    lat: 39.3,
    lon: -106.3,
    surface: 'rocky',
  },
  convoy: { name: 'Atlasz előtere · Marokkó', lat: 31.2, lon: -6.7, surface: 'desert' },
  'defend-base': { name: 'Lappföld · Észak-Finnország', lat: 68.1, lon: 26.8, surface: 'winter' },
  'escort-transport': { name: 'Kaukázus · Grúzia', lat: 42.2, lon: 44.4, surface: 'rocky' },
  'defend-city': { name: 'Rajna-vidék · Németország', lat: 50.8, lon: 6.9, surface: 'grass' },
  airbase: { name: 'Negev · naplemente', lat: 30.6, lon: 34.8, surface: 'sunset' },
  ballistic: { name: 'Közép-Ázsia · éjszakai művelet', lat: 46.3, lon: 65.5, surface: 'night' },
  'air-superiority': {
    name: 'Balti-tenger déli térsége · Lengyelország',
    lat: 54.2,
    lon: 18.2,
    surface: 'grass',
  },
  'iron-veil': { name: 'Zagrosz-hegység · hegyi folyosó', lat: 33.2, lon: 47.1, surface: 'rocky' },
  'carrier-defense': { name: 'Arab-tenger · nyílt víz', lat: 17.5, lon: 64.5, surface: 'ocean' },
});
export function missionLocation(mission) {
  return missionLocations[mission.id] || null;
}
export function mapPosition(location) {
  return { x: ((location.lon + 180) / 360) * 100, y: ((90 - location.lat) / 180) * 100 };
}
