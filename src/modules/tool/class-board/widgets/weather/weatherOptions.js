/*
 * 날씨 위젯이 보여 줄 날. 화면·설정창·저장 검증이 같은 이름을 써야 하므로 여기를 원본으로 둔다.
 * 이름을 바꾸면 `20261226_class_board_weather_days.sql`의 허용 목록도 함께 바꾼다.
 */
export const WEATHER_DAYS = Object.freeze([
  Object.freeze({ id: 'today', label: '오늘' }),
  Object.freeze({ id: 'tomorrow', label: '내일' }),
]);

export const WEATHER_DAY_IDS = Object.freeze(WEATHER_DAYS.map((day) => day.id));

/** 저장된 값이 무엇이든 정해진 순서·이름만 남긴다. 하나도 안 고르면 오늘만 본다. */
export const normalizeWeatherDays = (days) => {
  if (!Array.isArray(days)) return ['today'];
  const picked = WEATHER_DAY_IDS.filter((id) => days.includes(id));
  return picked.length > 0 ? picked : ['today'];
};

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
