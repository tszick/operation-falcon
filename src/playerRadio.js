import { radioLines } from './radioLines.js';
const variants = new Map(
  radioLines
    .filter((line) => line.baseLineId)
    .map((line) => [line.playerCallSign + ':' + line.baseLineId, line]),
);
export const playerRadioCallSign = (s) => (s.spec?.transport ? 'Nomad One' : 'Falcon One');
export function playerRadioLine(line, callSign = 'Falcon One') {
  if (!['control', 'pilot'].includes(line.speaker)) return line;
  const variant =
    callSign === 'Nomad One' && line.text.includes('Falcon One')
      ? variants.get(callSign + ':' + line.id)
      : null;
  if (callSign === 'Nomad One' && line.text.includes('Falcon One') && !variant)
    throw new Error('Missing recorded player callsign: ' + line.id);
  return {
    ...line,
    ...variant,
    group: line.group,
    ...(line.speaker === 'pilot' ? { callSign } : {}),
  };
}
