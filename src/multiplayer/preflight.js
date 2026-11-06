import { aircraft } from '../aircraftSpec.js';
import { defaultLoadout, validateLoadout, plannedDeparture } from '../loadoutPlanner.js';
import { aircraftChoices } from './protocol.js';
export const missionChoices = ['strike', 'intercept', 'defend-base'];
export function defaultSelection(id) {
  const spec = aircraft.find((a) => a.id === id);
  return { aircraftId: id, loadout: defaultLoadout(spec), fuelFraction: 0.7 };
}
export function validateSelection(selection) {
  if (
    !selection ||
    !aircraftChoices.includes(selection.aircraftId) ||
    !Number.isFinite(selection.fuelFraction) ||
    selection.fuelFraction < 0.1 ||
    selection.fuelFraction > 1 ||
    Object.keys(selection).some((k) => !['aircraftId', 'loadout', 'fuelFraction'].includes(k))
  )
    return false;
  const choice = selection.loadout;
  if (
    !choice ||
    typeof choice.gun !== 'boolean' ||
    !Array.isArray(choice.stations) ||
    choice.stations.some((t) => t !== null && !['aam', 'agm', 'bomb'].includes(t)) ||
    Object.keys(choice).some((k) => !['gun', 'stations'].includes(k))
  )
    return false;
  const spec = aircraft.find((a) => a.id === selection.aircraftId);
  return (
    validateLoadout(spec, choice).valid &&
    plannedDeparture(spec, choice, { fuelFraction: selection.fuelFraction }).withinLimits
  );
}
export function validLobbyMessage(m) {
  if (!m || !Number.isSafeInteger(m.revision) || m.revision < 1) return false;
  const keys = {
    rematch: ['type', 'revision'],
    start: ['type', 'revision'],
    ready: ['type', 'revision', 'ready'],
    configure: ['type', 'revision', 'selection'],
    mission: ['type', 'revision', 'missionId'],
  }[m.type];
  if (!keys || Object.keys(m).some((k) => !keys.includes(k))) return false;
  return ['start', 'rematch'].includes(m.type)
    ? true
    : m.type === 'ready'
      ? typeof m.ready === 'boolean'
      : m.type === 'mission'
        ? missionChoices.includes(m.missionId)
        : validateSelection(m.selection);
}
