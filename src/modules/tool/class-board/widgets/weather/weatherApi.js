const WEATHER_CACHE_TTL_MS = 30 * 60 * 1000;
const LOCATION_CACHE_TTL_MS = 60 * 60 * 1000;
const requestCache = new Map();
const pendingRequests = new Map();

const fetchJson = async (url) => {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`날씨 서버 응답 오류 (${response.status})`);
    return response.json();
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
};

const cachedRequest = (key, ttlMs, request) => {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.savedAt < ttlMs) return Promise.resolve(cached.value);
  if (pendingRequests.has(key)) return pendingRequests.get(key);
  const pending = request().then((value) => {
    requestCache.set(key, { value, savedAt: Date.now() });
    return value;
  }).finally(() => pendingRequests.delete(key));
  pendingRequests.set(key, pending);
  return pending;
};

export const hasLiveWeatherLocation = (config = {}) => (
  config.weatherSource === 'live'
  && typeof config.latitude === 'number'
  && typeof config.longitude === 'number'
  && Number.isFinite(config.latitude)
  && Number.isFinite(config.longitude)
);

export const searchWeatherLocations = async (query) => {
  const normalized = String(query || '').trim().slice(0, 60);
  if (normalized.length < 2) throw new Error('지역 이름을 두 글자 이상 입력해 주세요.');
  const key = `location:${normalized.toLocaleLowerCase('ko-KR')}`;
  return cachedRequest(key, LOCATION_CACHE_TTL_MS, async () => {
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', normalized);
    url.searchParams.set('count', '5');
    url.searchParams.set('language', 'ko');
    url.searchParams.set('countryCode', 'KR');
    const data = await fetchJson(url);
    return (Array.isArray(data?.results) ? data.results : []).slice(0, 5).map((item) => ({
      id: String(item.id || `${item.latitude}:${item.longitude}`),
      name: String(item.name || '').slice(0, 80),
      detail: [item.admin1, item.admin2, item.admin3].filter(Boolean).join(' · ').slice(0, 120),
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
    })).filter((item) => item.name && Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
  });
};

export const getCurrentWeather = async (latitude, longitude) => {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error('날씨 지역 좌표가 올바르지 않습니다.');
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLon = Math.round(lon * 1000) / 1000;
  const key = `weather:${roundedLat}:${roundedLon}`;
  return cachedRequest(key, WEATHER_CACHE_TTL_MS, async () => {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(roundedLat));
    url.searchParams.set('longitude', String(roundedLon));
    url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    const data = await fetchJson(url);
    const current = data?.current;
    if (!current || !Number.isFinite(Number(current.temperature_2m))) {
      throw new Error('현재 날씨 정보가 비어 있습니다.');
    }
    return {
      temperature: Math.round(Number(current.temperature_2m)),
      apparentTemperature: Number.isFinite(Number(current.apparent_temperature))
        ? Math.round(Number(current.apparent_temperature))
        : Math.round(Number(current.temperature_2m)),
      weatherCode: Number(current.weather_code),
      windSpeed: Number.isFinite(Number(current.wind_speed_10m))
        ? Math.round(Number(current.wind_speed_10m))
        : 0,
      isDay: Number(current.is_day) === 1,
      observedAt: String(current.time || ''),
    };
  });
};
