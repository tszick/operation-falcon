import { catalogEntry } from './equipmentCatalog.js';
import { unitTypes } from './unitTypes.js';
const aircraftRoles = {
  INT: 'Elfogó',
  AS: 'Vadász',
  MR: 'Vadász',
  ATK: 'Csapásmérő',
  BMR: 'Bombázó',
  TRP: 'Szállítógép',
  TNK: 'Tankergép',
  TRN: 'Gyakorlógép',
  EXP: 'Kísérleti gép',
};
// Concise recognition label for instruments; world markers retain catalogue IDs.
export function targetTypeLabel(target) {
  if (target.civilian || target.type === 'civil') return 'Civil repülő';
  const id = target.aircraftId || target.spec?.id;
  if (id) {
    const entry = catalogEntry('aircraft', id);
    if (entry?.code.startsWith('CIV-')) return 'Civil repülő';
    const role = aircraftRoles[entry?.code.split('-')[1]];
    if (role) return role;
  }
  if (target.type === 'tanker') return 'Tankergép';
  if (target.type === 'fighter') return 'Vadász';
  if (target.type === 'destroyer') return 'Romboló';
  return unitTypes[target.type]?.name || (target.kind === 'air' ? 'Repülőgép' : 'Földi cél');
}
