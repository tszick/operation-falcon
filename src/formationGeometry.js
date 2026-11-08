// Stations are relative to the actual leader's nose, independent of map heading.
export function formationStation(number) {
  if (number <= 1) return { lateral: 0, trail: 0, height: 0 };
  return {
    lateral: (number % 2 ? 550 : -550) * Math.ceil((number - 1) / 2),
    trail: -450 * (number - 1),
    height: 100 + 30 * (number - 2),
  };
}
