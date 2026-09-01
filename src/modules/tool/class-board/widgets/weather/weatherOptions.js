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
