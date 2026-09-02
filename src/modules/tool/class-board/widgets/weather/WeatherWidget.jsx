import React, { useEffect, useMemo, useState } from 'react';
import { getWeatherForecast, hasLiveWeatherLocation } from './weatherApi';
import { getWeatherOption, getWeatherOptionFromCode, normalizeWeatherDays } from './weatherOptions';

const stopPointer = (event) => event.stopPropagation();

export default function WeatherWidget({ config = {}, dragHandleProps }) {
  const liveLocation = hasLiveWeatherLocation(config);
  const requestKey = liveLocation ? `${config.latitude}:${config.longitude}` : '';
  const [requestState, setRequestState] = useState({ key: '', forecast: null, status: 'idle' });
  const days = useMemo(() => normalizeWeatherDays(config.days), [config.days]);

  useEffect(() => {
    let active = true;
    if (!requestKey) return () => { active = false; };
    void getWeatherForecast(config.latitude, config.longitude)
      .then((result) => {
        if (!active) return;
        setRequestState({ key: requestKey, forecast: result, status: 'ready' });
      })
      .catch(() => {
        if (!active) return;
        setRequestState({ key: requestKey, forecast: null, status: 'error' });
      });
    return () => { active = false; };
  }, [config.latitude, config.longitude, requestKey]);

  const currentRequest = requestState.key === requestKey ? requestState : null;
  const forecast = liveLocation ? currentRequest?.forecast || null : null;
  const status = !liveLocation ? 'idle' : currentRequest?.status || 'loading';

  const showsToday = days.includes('today');
  const tomorrow = days.includes('tomorrow') ? forecast?.tomorrow || null : null;
  // `내일`만 골랐으면 큰 칸이 내일을 그린다. 둘 다 골랐을 때만 아래에 내일 줄을 덧붙인다.
  const leadIsTomorrow = !showsToday && Boolean(tomorrow);
  const strip = showsToday ? tomorrow : null;

  const liveWeather = forecast?.today || null;
  const legacyWeather = getWeatherOption(config.condition);
  const leadWeather = leadIsTomorrow
    ? getWeatherOptionFromCode(tomorrow.weatherCode, 0)
    : liveWeather
      ? getWeatherOptionFromCode(liveWeather.weatherCode, liveWeather.windSpeed)
      : legacyWeather;
  const temperature = liveWeather?.temperature
    ?? (Number.isFinite(Number(config.temperature)) ? Math.round(Number(config.temperature)) : 20);
  const heading = leadIsTomorrow
    ? `내일 · ${config.locationName || '선택한 지역'}`
    : liveLocation ? config.locationName || '선택한 지역' : '오늘의 날씨';
  const summary = status === 'loading'
    ? '날씨 불러오는 중…'
    : status === 'error'
      ? '날씨를 다시 불러와 주세요'
      : config.weatherSource === 'live' && !liveLocation
        ? '편집에서 지역을 선택해 주세요'
        : leadIsTomorrow
          ? `${leadWeather.label} · ${tomorrow.high}℃ / ${tomorrow.low}℃`
          : `${leadWeather.label} · ${temperature}℃`;
  const stripWeather = strip ? getWeatherOptionFromCode(strip.weatherCode, 0) : null;

  return (
    <section
      {...dragHandleProps}
      className={`class-board-weather class-board-weather--${leadWeather.id}${strip ? ' has-tomorrow' : ''}`}
    >
      <span className="class-board-weather__icon" aria-hidden="true">{leadWeather.icon}</span>
      <div>
        <span>{heading}</span>
        <h2>{summary}</h2>
        {!leadIsTomorrow && liveWeather ? (
          <small>체감 {liveWeather.apparentTemperature}℃ · 바람 {liveWeather.windSpeed}km/h</small>
        ) : null}
        {config.message ? <p>{config.message}</p> : null}
        {liveLocation ? (
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" onPointerDown={stopPointer}>날씨 자료 Open-Meteo</a>
        ) : null}
      </div>
      {strip ? (
        <div className="class-board-weather__tomorrow">
          <span aria-hidden="true">{stripWeather.icon}</span>
          <strong>내일</strong>
          <em>{stripWeather.label}</em>
          <b>{strip.high}℃ <i>/ {strip.low}℃</i></b>
        </div>
      ) : null}
    </section>
  );
}
