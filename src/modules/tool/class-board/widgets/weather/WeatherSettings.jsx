import React, { useState } from 'react';
import { searchWeatherLocations } from './weatherApi';

export default function WeatherSettings({ config = {}, onChange }) {
  const [query, setQuery] = useState(config.locationName || '');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const update = (patch) => onChange({ ...config, ...patch });

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
      <label>
        <span>날씨 한마디</span>
        <input maxLength={80} value={config.message || ''} onChange={(event) => update({ message: event.target.value })} />
      </label>
      <p className="class-board-note">기기 위치 권한은 사용하지 않습니다. 선택한 지역 좌표로 화면을 열 때 날씨를 읽고 30분 동안 재사용합니다. 자료: Open-Meteo(CC BY 4.0)</p>
    </div>
  );
}
