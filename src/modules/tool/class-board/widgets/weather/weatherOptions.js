export const WEATHER_OPTIONS = Object.freeze([
  { id: 'sunny', icon: '☀️', label: '맑음' },
  { id: 'partly-cloudy', icon: '🌤️', label: '구름 조금' },
  { id: 'cloudy', icon: '☁️', label: '흐림' },
  { id: 'rain', icon: '🌧️', label: '비' },
  { id: 'snow', icon: '🌨️', label: '눈' },
  { id: 'wind', icon: '💨', label: '바람' },
]);

export const getWeatherOption = (condition) => (
  WEATHER_OPTIONS.find((item) => item.id === condition) || WEATHER_OPTIONS[0]
);

export const getWeatherOptionFromCode = (code, windSpeed = 0) => {
  if (Number(windSpeed) >= 35) return getWeatherOption('wind');
  if (code === 0) return getWeatherOption('sunny');
  if ([1, 2].includes(code)) return getWeatherOption('partly-cloudy');
  if ([3, 45, 48].includes(code)) return getWeatherOption('cloudy');
  if ([71, 73, 75, 77, 85, 86].includes(code)) return getWeatherOption('snow');
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)) {
    return getWeatherOption('rain');
  }
  return getWeatherOption('partly-cloudy');
};
