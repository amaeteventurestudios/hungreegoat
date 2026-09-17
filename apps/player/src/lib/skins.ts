import type { Skin, TimeVariant } from './api';
export type TimeOfDay = 'dawn' | 'afternoon' | 'dusk' | 'night';
export const TIMES: TimeOfDay[] = ['dawn', 'afternoon', 'dusk', 'night'];
export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: 'Dawn', afternoon: 'Afternoon', dusk: 'Dusk', night: 'Night' };

export function autoTime(d = new Date()): TimeOfDay { const h = d.getHours(); return h >= 5 && h < 11 ? 'dawn' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 20 ? 'dusk' : 'night'; }

/* The player carries no scene list of its own — every scene it can show, including the
   ones it originally shipped with, is a row in Control's skins registry (hgc/skins.py) and
   arrives here from GET /v1/skins. That is deliberate: a hardcoded local copy is exactly
   the "hidden list that keeps showing a disabled/deleted scene" failure mode this
   architecture must not have. The API already filters to enabled rows and sorts by order;
   this just re-applies both defensively so the player never depends on that ordering
   contract holding forever. */
export function mergeSkins(fromApi: Skin[]): Skin[] {
  return fromApi.filter(s => s.enabled).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/* Picking a skin is independent of time of day: prefer the flagged default, else the first
   enabled scene. Never re-picks just because the clock/time-of-day control changed. */
export function pickSkin(skins: Skin[], def: string | null): Skin | undefined {
  return (def && skins.find(s => s.id === def)) || skins.find(s => s.default) || skins[0];
}

/* The asset to actually render for a skin at a given time: the per-time variant if the
   operator attached one, otherwise the scene's own main visual. */
export function sceneAsset(skin: Skin | undefined, time: TimeOfDay): TimeVariant {
  if (!skin) return {};
  const v = skin.time_mode === 'variants' ? skin.time_variants?.[time] : undefined;
  return (v && (v.video || v.image)) ? v : { video: skin.video, image: skin.image };
}

export const AMBIENCE: { key: string; label: string; file: string }[] = [
  { key: 'cityTraffic', label: 'City traffic', file: 'city_traffic.mp3' }, { key: 'cityRain', label: 'City rain', file: 'rain_city.mp3' }, { key: 'fireplace', label: 'Fireplace', file: 'fireplace.mp3' },
  { key: 'campfire', label: 'Campfire', file: 'campfire.mp3' }, { key: 'snow', label: 'Snow', file: 'snow.mp3' }, { key: 'summerStorm', label: 'Summer storm', file: 'summer_storm.mp3' },
  { key: 'fan', label: 'Fan', file: 'fan.mp3' }, { key: 'forestNight', label: 'Forest night', file: 'forest_night.mp3' }, { key: 'waves', label: 'Waves', file: 'waves.mp3' }, { key: 'ocean', label: 'Ocean', file: 'ocean.mp3' },
  { key: 'wind', label: 'Wind', file: 'wind.mp3' }, { key: 'people', label: 'People', file: 'people_talk_inside.mp3' }, { key: 'river', label: 'River', file: 'river.mp3' }, { key: 'rainForest', label: 'Rainforest', file: 'rain_forest.mp3' }, { key: 'birds', label: 'Birds', file: 'birds.mp3' },
];
