import type { Skin } from './api';
export type TimeOfDay = 'dawn' | 'afternoon' | 'dusk' | 'night';
export const TIMES: TimeOfDay[] = ['dawn', 'afternoon', 'dusk', 'night'];
export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: 'Dawn', afternoon: 'Afternoon', dusk: 'Dusk', night: 'Night' };
/* Bundled scenes (from the original AGPL project) — operator skins from /v1/skins are merged on top. */
export const BUNDLED: Skin[] = [
  { id: 'sunny-dawn', name: 'Sunny Morning', time: 'dawn', enabled: true, order: 0, video: '/assets/scenes/Day-sunny.mp4', accent: '#ffb454', ambience: { birds: 25 }, source: 'bundled' },
  { id: 'sunny', name: 'Sunny Day', time: 'afternoon', enabled: true, order: 1, video: '/assets/scenes/Day-sunny.mp4', accent: '#f2c14e', ambience: {}, source: 'bundled' },
  { id: 'rainy-day', name: 'Rainy Day', time: 'afternoon', enabled: true, order: 2, video: '/assets/scenes/Day-rainny.mp4', accent: '#38d6e8', ambience: { cityRain: 35 }, source: 'bundled' },
  { id: 'camp-dusk', name: 'Camp at Dusk', time: 'dusk', enabled: true, order: 3, video: '/assets/scenes/truckCampBackground.mp4', accent: '#ff8a3d', ambience: { campfire: 30, forestNight: 15 }, source: 'bundled' },
  { id: 'night-clear', name: 'Clear Night', time: 'night', enabled: true, order: 4, video: '/assets/scenes/Night-clear.mp4', accent: '#4f8cff', ambience: { forestNight: 20 }, source: 'bundled' },
  { id: 'night-rain', name: 'Rainy Night', time: 'night', enabled: true, order: 5, video: '/assets/scenes/Night-rainny.mp4', accent: '#7fb0ff', ambience: { cityRain: 40 }, source: 'bundled' },
];
export function autoTime(d = new Date()): TimeOfDay { const h = d.getHours(); return h >= 5 && h < 11 ? 'dawn' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 20 ? 'dusk' : 'night'; }
export function mergeSkins(operator: Skin[]): Skin[] { const map = new Map<string, Skin>(); BUNDLED.forEach(s => map.set(s.id, s)); operator.forEach(s => map.set(s.id, s)); return [...map.values()].filter(s => s.enabled).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)); }
export function pickSkin(skins: Skin[], time: TimeOfDay, def: string | null): Skin | undefined { const d = def && skins.find(s => s.id === def && s.time === time); return d || skins.find(s => s.time === time) || skins[0]; }
export const AMBIENCE: { key: string; label: string; file: string }[] = [
  { key: 'cityTraffic', label: 'City traffic', file: 'city_traffic.mp3' }, { key: 'cityRain', label: 'City rain', file: 'rain_city.mp3' }, { key: 'fireplace', label: 'Fireplace', file: 'fireplace.mp3' },
  { key: 'campfire', label: 'Campfire', file: 'campfire.mp3' }, { key: 'snow', label: 'Snow', file: 'snow.mp3' }, { key: 'summerStorm', label: 'Summer storm', file: 'summer_storm.mp3' },
  { key: 'fan', label: 'Fan', file: 'fan.mp3' }, { key: 'forestNight', label: 'Forest night', file: 'forest_night.mp3' }, { key: 'waves', label: 'Waves', file: 'waves.mp3' }, { key: 'ocean', label: 'Ocean', file: 'ocean.mp3' },
  { key: 'wind', label: 'Wind', file: 'wind.mp3' }, { key: 'people', label: 'People', file: 'people_talk_inside.mp3' }, { key: 'river', label: 'River', file: 'river.mp3' }, { key: 'rainForest', label: 'Rainforest', file: 'rain_forest.mp3' }, { key: 'birds', label: 'Birds', file: 'birds.mp3' },
];
