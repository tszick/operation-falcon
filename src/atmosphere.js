export function atmosphere(h) {
  h = Math.max(0, h);
  const gas = 287.05287,
    g = 9.80665;
  let temperature, pressure;
  if (h <= 11000) {
    temperature = 288.15 - 0.0065 * h;
    pressure = 101325 * (temperature / 288.15) ** (g / (gas * 0.0065));
  } else if (h <= 20000) {
    temperature = 216.65;
    pressure = 22632.06 * Math.exp((-g * (h - 11000)) / (gas * temperature));
  } else if (h <= 32000) {
    temperature = 216.65 + 0.001 * (h - 20000);
    pressure = 5474.889 * (temperature / 216.65) ** (-g / (gas * 0.001));
  } else if (h <= 47000) {
    temperature = 228.65 + 0.0028 * (h - 32000);
    pressure = 868.0187 * (temperature / 228.65) ** (-g / (gas * 0.0028));
  } else {
    temperature = 270.65;
    pressure = 110.9063 * Math.exp((-g * (h - 47000)) / (gas * temperature));
  }
  return {
    density: pressure / (gas * temperature),
    soundSpeed: Math.sqrt(1.4 * gas * temperature),
    temperatureK: temperature,
    pressurePa: pressure,
  };
}
