import React from 'react';
import { getWeatherOption } from './weatherOptions';

export default function WeatherWidget({ config = {}, dragHandleProps }) {
  const weather = getWeatherOption(config.condition);
  const temperature = Number.isFinite(Number(config.temperature)) ? Math.round(Number(config.temperature)) : 20;
  return (
    <section {...dragHandleProps} className={`class-board-weather class-board-weather--${weather.id}`}>
      <span className="class-board-weather__icon" aria-hidden="true">{weather.icon}</span>
      <div>
        <span>오늘의 날씨</span>
        <h2>{weather.label} · {temperature}℃</h2>
        {config.message ? <p>{config.message}</p> : null}
      </div>
    </section>
  );
}
