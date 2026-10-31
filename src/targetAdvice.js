import { sensorTargets } from './electronicWarfare.js';
// Advisory target only: an explicit player selection always wins.
export function advisedTarget(s, targets, aim, mission) {
  const visible = sensorTargets(s, targets).filter((t) => t.alive),
    selected = visible.find((t) => t.id === aim?.id);
  if (selected) return selected;
  const objectives = visible.filter((t) => !t.incidental);
  objectives.sort((a, b) => a.position.distance(s.position) - b.position.distance(s.position));
  return (
    (mission.battlefield ||
    ['escort-transport', 'defend-base', 'defend-city', 'air-superiority'].includes(
      mission.objective,
    )
      ? objectives.find((t) => t.kind === 'air')
      : null) || objectives[0]
  );
}
