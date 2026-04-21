/**
 * Russian weekday in genitive case — for phrases like «прогноз для среды» (after «для»).
 * Uses local `Date#getDay()` (Sun=0 … Sat=6).
 */
export function russianWeekdayGenitive(date: Date): string {
  const day = date.getDay();
  const names: Record<number, string> = {
    0: 'воскресенья',
    1: 'понедельника',
    2: 'вторника',
    3: 'среды',
    4: 'четверга',
    5: 'пятницы',
    6: 'субботы'
  };
  return names[day] ?? '';
}
