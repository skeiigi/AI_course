/**
 * Выбор вида активности.
 *
 * Внутри настоящие переключатели input type="radio": браузер сам даёт им
 * перемещение стрелками, выбор пробелом и правильное объявление в программах
 * чтения с экрана.
 *
 * Переключатель не спрятан, а растянут на всю карточку и сделан прозрачным.
 * Так он остаётся кликабельным и попадает под курсор в любой точке карточки,
 * а видимый кружок рисуется отдельным элементом.
 */

import type { CSSProperties } from 'react';

import type { Activity } from '../api';
import { minutesLabel } from '../dates';

interface Props {
  activities: Activity[];
  selectedId: number | null;
  onSelect: (activityId: number) => void;
}

export function ActivityPicker({ activities, selectedId, onSelect }: Props) {
  return (
    <fieldset className="picker">
      <legend className="picker__legend">Вид активности</legend>
      <div className="picker__list">
        {activities.map((activity) => (
          <label
            key={activity.id}
            className="activity"
            style={{ '--activity-color': activity.color } as CSSProperties}
          >
            <input
              className="activity__input"
              type="radio"
              name="activity"
              value={activity.id}
              checked={activity.id === selectedId}
              onChange={() => onSelect(activity.id)}
            />
            <span className="activity__mark" aria-hidden="true" />
            <span className="activity__text">
              <span className="activity__name">{activity.name}</span>
              <span className="activity__duration">{minutesLabel(activity.duration_minutes)}</span>
              {activity.description !== '' && (
                <span className="activity__description">{activity.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
