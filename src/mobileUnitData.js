// Public capability classes; health/damage and salvo cadence are explicit gameplay values.
export const mobileRules = Object.freeze({
  missileRange: 6000,
  jammerRange: 3000,
  droneRange: 40000,
  droneCruise: 113 / 3.6,
  droneSprint: 185 / 3.6,
  droneEndurance: 2400,
  droneDamage: 40,
  droneStock: 8,
  droneActiveLimit: 2,
  droneFirstLaunch: 120,
  droneReload: 90,
});
export const mobileUnitTypes = {
  'mobile-sam': {
    name: 'Mobil rakétás légvédelem',
    category: 'Tüzelő mobil egység',
    kind: 'ground',
    weapons: ['missile'],
    health: 55,
    speed: 14,
    radarRange: 6000,
    radarAntennaHeight: 3,
    radarMinElevation: 0.1,
    missileStock: 4,
    role: 'Közeli rakétás légvédelem',
    size: 'Könnyű terepjáró · négy indítócső',
    description:
      'Könnyű mobil légvédelem, négy infravörös rakétával. Névleges lőtáv 0,25–6 km, célmagasság 10–3500 m AGL; tereptakarás és a tényleges rakétaenergia is korlátozza. A nehéz SAM-nél rövidebb hatótávú és kisebb sebzésű, gépágyúja nincs. Infracsapdával eltéríthető. Általános játékmodell a Verba/Gibka képességosztály alapján, nem pontos típusmásolat.',
  },
  'mobile-jammer': {
    name: 'Jelzavaró teherautó',
    category: 'Mobil zavaró egység',
    kind: 'ground',
    weapons: ['jammer'],
    health: 45,
    speed: 14,
    range: 3000,
    role: 'Mozgó radar / GPS zavarás',
    size: 'Antennás híradó-teherautó',
    description:
      'A konvoj mögött haladó, fegyvertelen zavarókocsi. 3 km-es játékbeli zónája kisebb az állandó zavaróállomás 7 km-es körénél. Csak az ellenoldal navigációját és befogását zavarja; a fizikai objektumok továbbra is látszanak. Ágyúval vagy bombával a zónán belül is megsemmisíthető. Az együttes radar/GPS-kiesés és a pontos körhatár játékbeli egyszerűsítés.',
  },
  'drone-command': {
    name: 'Mobil drónirányító',
    category: 'Tüzelő mobil parancsnoki egység',
    kind: 'ground',
    weapons: ['drone'],
    health: 60,
    speed: 11,
    role: 'Földi objektumok dróntámadása',
    size: 'Parancsnoki teherautó · indítócsövekkel',
    description:
      'Nyolc egyszer használatos csapásmérő drónt hordoz. Egyszerre legfeljebb kettő repülhet saját indításából, 1–2 darabos rajokban; az első előkészítés 120 s, az új rajok között legalább 90 s telik el. Csak ellenséges földi objektumot vagy egységet támad, repülő vadászt nem. A már elindított drónok a kocsi pusztulása után is folytatják előre kijelölt feladatukat. A készlet és az indítási ütem játékbeli érték.',
  },
  'attack-drone': {
    name: 'Csapásmérő drón',
    category: 'Földi célú önálló légi fenyegetés',
    kind: 'air',
    weapons: [],
    health: 14,
    speed: 113 / 3.6,
    role: 'Egyszer használatos földi csapás',
    size: 'Kb. 2,5 m fesztáv',
    description:
      'A Switchblade 600 alapváltozat képességosztályára hangolt, általános drón: 40 km repült út, legfeljebb 40 perc repülés, 113 km/h utazó- és 185 km/h végfázis-sebesség. Páncéltörő jellegű, helyi csapást mér; egy találat nem pusztít el teljes repülőteret (40 játékbeli életerőpont). Légi célra nem támad. Gépágyúval és levegő–levegő rakétával lelőhető; infracsapda és dipól nem állítja meg. A sebzés, terepkövetés és autonóm rávezetés játékbeli közelítés, nem valós fegyverhatás-számítás.',
  },
};
