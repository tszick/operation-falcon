const opponents = {
  f22: 'su57',
  f35: 'j20',
  su35: 'f35',
  su57: 'f22',
  j10: 'f35',
  j20: 'f22',
  f14: 'mig31',
  f15: 'su27',
  f16: 'mig29',
  fa18: 'mig29',
  mirage: 'mig29',
  rafale: 'su35',
  euro: 'su35',
  gripen: 'j10',
  f4: 'mig25',
  f15e: 'su27',
  tornado: 'mig29',
  a10: 'mig29',
  mig25: 'f14',
  mig31: 'f14',
  su27: 'f15',
  mig29: 'f16',
  su24: 'fa18',
  mig27: 'f16',
  su25: 'f16',
};
const names = {
  f22: 'F-22A Raptor',
  f35: 'F-35A Lightning II',
  su35: 'Su-35S Flanker-E',
  su57: 'Su-57E Felon',
  j10: 'Chengdu J-10C',
  j20: 'Chengdu J-20',
  mig29: 'MiG-29 Fulcrum',
  su27: 'Su-27 Flanker',
  mig25: 'MiG-25 Foxbat',
  mig31: 'MiG-31 Foxhound',
  f14: 'F-14 Tomcat',
  f15: 'F-15 Eagle',
  f16: 'F-16 Fighting Falcon',
  fa18: 'F/A-18 Hornet',
  tu95: 'Tu-95 Bear',
  b52: 'B-52 Stratofortress',
  il76: 'Il-76 Candid',
  c130: 'C-130 Hercules',
};
export function enemyAircraft(mission, player = { faction: 'west' }) {
  if (mission.id === 'civil')
    return { id: 'airliner', name: 'Civil utasszállító', faction: 'neutral' };
  let faction = player.faction === 'west' ? 'east' : 'west';
  const id =
    mission.id === 'bomber'
      ? faction === 'east'
        ? 'tu95'
        : 'b52'
      : mission.id === 'transport'
        ? faction === 'east'
          ? 'il76'
          : 'c130'
        : opponents[player.id] || (faction === 'east' ? 'mig29' : 'f16');
  if (id === 'j10' || id === 'j20') faction = 'china';
  return { id, name: names[id], faction };
}
