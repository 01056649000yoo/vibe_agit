import React, { useState } from 'react';
import { searchWeatherLocations } from './weatherApi';
import { normalizeWeatherDays, WEATHER_DAYS, WEATHER_DAY_IDS } from './weatherOptions';

export default function WeatherSettings({ config = {}, onChange }) {
  const [query, setQuery] = useState(config.locationName || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => onChange({ ...config, ...patch });
  const days = normalizeWeatherDays(config.days);

  const toggleDay = (id) => {
    const next = days.includes(id)
      ? days.filter((item) => item !== id)
      : WEATHER_DAY_IDS.filter((item) => item === id || days.includes(item));
    // 둘 다 끄면 빈 화면이 되므로 그때는 오늘만 남긴다.
    update({ days: next.length > 0 ? next : ['today'] });
  };

  const search = async (event) => {
    event.preventDefault();
    setSearching(true);
    setError('');
    try {
      const next = await searchWeatherLocations(query);
      setResults(next);
      if (next.length === 0) setError('검색 결과가 없습니다. 시·군·구 이름으로 다시 찾아보세요.');
    } catch (searchError) {
      setError(searchError.message || '지역을 검색하지 못했습니다.');
    } finally {
      setSearching(false);
    }
  };

  const selectLocation = (location) => {
    update({
      weatherSource: 'live',
      locationName: location.name,
      latitude: location.latitude,
      longitude: location.longitude,
    });
    setQuery(location.name);
    setResults([]);
    setError('');
  };

  return (
    <div className="class-board-settings-grid">
      <form className="class-board-weather-search" onSubmit={search}>
        <label>
          <span>날씨 지역</span>
          <input maxLength={60} value={query} placeholder="예: 서울, 수원, 춘천" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <button type="submit" disabled={searching}>{searching ? '찾는 중…' : '지역 찾기'}</button>
      </form>
      {config.weatherSource === 'live' && config.locationName ? (
        <p className="class-board-weather-selected">현재 지역: <strong>{config.locationName}</strong></p>
      ) : null}
      {results.length > 0 ? (
        <div className="class-board-weather-results" aria-label="날씨 지역 검색 결과">
          {results.map((location) => (
            <button key={location.id} type="button" onClick={() => selectLocation(location)}>
              <strong>{location.name}</strong><span>{location.detail || '대한민국'}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="class-board-error" role="alert">{error}</p> : null}
      <div className="class-board-status-sections" role="group" aria-label="보여 줄 날">
        <span>보여 줄 날</span>
        {WEATHER_DAYS.map((day) => (
          <label key={day.id} className="class-board-checkbox-field">
            <input
              type="checkbox"
              checked={days.includes(day.id)}
              onChange={() => toggleDay(day.id)}
            />
            <span>
              <strong>{day.label}</strong>
              <small>{day.id === 'today' ? '지금 기온과 체감·바람' : '내일 최고·최저 기온과 날씨'}</small>
            </span>
          </label>
        ))}
      </div>

      <label>
        <span>날씨 한마디</span>
        <input maxLength={80} value={config.message || ''} onChange={(event) => update({ message: event.target.value })} />
      </label>
      <p className="class-board-note">
        기기 위치 권한은 사용하지 않습니다. 선택한 지역 좌표로 화면을 열 때 오늘과 내일을 한 번에 읽고
        30분 동안 재사용하므로, 내일을 켜도 요청은 늘지 않습니다. 자료: Open-Meteo(CC BY 4.0)
      </p>
    </div>
  );
}
