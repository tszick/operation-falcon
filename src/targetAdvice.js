import { sensorTargets } from './electronicWarfare.js';
// Advisory target only: an explicit player selection always wins.
export function advisedTarget(s, targets, aim, mission) {
  const visible = sensorTargets(s, targets).filter((t) => t.alive),
    selected = visible.find((t) => t.id === aim?.id);
  if (selected) return selected;
  visible.sort((a, b) => a.position.distance(s.position) - b.position.distance(s.position));
  return (
    (['escort-transport', 'defend-base', 'defend-city', 'air-superiority'].includes(
      mission.objective,
    )
      ? visible.find((t) => t.kind === 'air')
      : null) || visible[0]
  );
}
