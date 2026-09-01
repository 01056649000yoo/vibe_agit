import React, { useEffect, useState } from 'react';
import { getCurrentWeather, hasLiveWeatherLocation } from './weatherApi';
import { getWeatherOption, getWeatherOptionFromCode } from './weatherOptions';

const stopPointer = (event) => event.stopPropagation();

export default function WeatherWidget({ config = {}, dragHandleProps }) {
  const liveLocation = hasLiveWeatherLocation(config);
  const requestKey = liveLocation ? `${config.latitude}:${config.longitude}` : '';
  const [requestState, setRequestState] = useState({ key: '', weather: null, status: 'idle' });

  useEffect(() => {
    let active = true;
    if (!requestKey) return () => { active = false; };
    void getCurrentWeather(config.latitude, config.longitude)
      .then((result) => {
        if (!active) return;
        setRequestState({ key: requestKey, weather: result, status: 'ready' });
      })
      .catch(() => {
        if (!active) return;
        setRequestState({ key: requestKey, weather: null, status: 'error' });
      });
    return () => { active = false; };
  }, [config.latitude, config.longitude, requestKey]);

  const currentRequest = requestState.key === requestKey ? requestState : null;
  const liveWeather = liveLocation ? currentRequest?.weather || null : null;
  const status = !liveLocation ? 'idle' : currentRequest?.status || 'loading';

  const legacyWeather = getWeatherOption(config.condition);
  const weather = liveWeather
    ? getWeatherOptionFromCode(liveWeather.weatherCode, liveWeather.windSpeed)
    : legacyWeather;
  const temperature = liveWeather?.temperature
    ?? (Number.isFinite(Number(config.temperature)) ? Math.round(Number(config.temperature)) : 20);
  const heading = liveLocation ? config.locationName || '선택한 지역' : '오늘의 날씨';
  const summary = status === 'loading'
    ? '날씨 불러오는 중…'
    : status === 'error'
      ? '날씨를 다시 불러와 주세요'
      : config.weatherSource === 'live' && !liveLocation
        ? '편집에서 지역을 선택해 주세요'
        : `${weather.label} · ${temperature}℃`;
  return (
    <section {...dragHandleProps} className={`class-board-weather class-board-weather--${weather.id}`}>
      <span className="class-board-weather__icon" aria-hidden="true">{weather.icon}</span>
      <div>
        <span>{heading}</span>
        <h2>{summary}</h2>
        {liveWeather ? <small>체감 {liveWeather.apparentTemperature}℃ · 바람 {liveWeather.windSpeed}km/h</small> : null}
        {config.message ? <p>{config.message}</p> : null}
        {liveLocation ? (
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" onPointerDown={stopPointer}>날씨 자료 Open-Meteo</a>
        ) : null}
      </div>
    </section>
  );
}
