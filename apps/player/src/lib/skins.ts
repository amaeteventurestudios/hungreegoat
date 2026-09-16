import type { Skin, TimeVariant } from './api';
export type TimeOfDay = 'dawn' | 'afternoon' | 'dusk' | 'night';
export const TIMES: TimeOfDay[] = ['dawn', 'afternoon', 'dusk', 'night'];
export const TIME_LABEL: Record<TimeOfDay, string> = { dawn: 'Dawn', afternoon: 'Afternoon', dusk: 'Dusk', night: 'Night' };

/* The six scenes the player ships with (ids/names must match hgc/skins.py BUILT_IN on the
   control backend, which manages their enabled/order/default/accent/ambience state and can
   attach an operator-uploaded visual override). A scene is independent of time of day —
   TIME only drives the light/vignette overlay in Scene.tsx, never which scene is showing.
   Only two of these six have footage that actually matches their name, both from the
   original AGPL project: Day-sunny.mp4 is a genuine study-room desk scene, and
   truckCampBackground.mp4 is a genuine camping van. Day-rainny.mp4, Night-clear.mp4 and
   Night-rainny.mp4 were previously (wrongly) assigned to Rainforest/Cafe/Riverfront —
   pulling a real frame from each proved they are the *same* study-room composition, just
   recolored for weather/time of day, not distinct environments. Showing that footage under
   another scene's name would be exactly the "silently fall back while displaying another
   scene name" the UI must never do, so these four have no video/image until an operator
   uploads real footage; `placeholder: true` drives the honest "Placeholder art" disclosure
   in Mixer.tsx instead. */
export const BUILT_IN: Skin[] = [
  { id: 'study-room', name: 'Study Room', enabled: true, order: 0, video: '/assets/scenes/Day-sunny.mp4', accent: '#f2c14e', time_mode: 'always', ambience: {}, source: 'built-in' },
  { id: 'camping-van', name: 'Camping Van', enabled: true, order: 1, video: '/assets/scenes/truckCampBackground.mp4', accent: '#ff8a3d', time_mode: 'always', ambience: { campfire: 30, forestNight: 15 }, source: 'built-in' },
  { id: 'rainforest', name: 'Rainforest', enabled: true, order: 2, accent: '#38d6e8', time_mode: 'always', ambience: { rainForest: 35, birds: 20 }, source: 'built-in', placeholder: true },
  { id: 'beach', name: 'Beach', enabled: true, order: 3, accent: '#ffb454', time_mode: 'always', ambience: { waves: 35 }, source: 'built-in', placeholder: true },
  { id: 'cafe', name: 'Cafe', enabled: true, order: 4, accent: '#7fb0ff', time_mode: 'always', ambience: { people: 20 }, source: 'built-in', placeholder: true },
  { id: 'riverfront', name: 'Riverfront', enabled: true, order: 5, accent: '#4f8cff', time_mode: 'always', ambience: { river: 30 }, source: 'built-in', placeholder: true },
];
const BUILT_IN_IDS = new Set(BUILT_IN.map(b => b.id));

export function autoTime(d = new Date()): TimeOfDay { const h = d.getHours(); return h >= 5 && h < 11 ? 'dawn' : h >= 11 && h < 17 ? 'afternoon' : h >= 17 && h < 20 ? 'dusk' : 'night'; }

/* Merge the bundled scene assets with the control backend's authoritative state
   (enabled/order/accent/ambience/default, and any operator-uploaded override). A built-in
   never disappears even if the backend hasn't seen it yet; a backend row's video/image
   (an override) always wins over the local placeholder. */
export function mergeSkins(fromApi: Skin[]): Skin[] {
  const byId = new Map(fromApi.map(s => [s.id, s]));
  const out: Skin[] = BUILT_IN.map(b => {
    const row = byId.get(b.id);
    if (!row) return b;
    const overridden = !!(row.video || row.image);
    return { ...b, ...row, video: overridden ? row.video : b.video, image: overridden ? row.image : b.image, placeholder: overridden ? false : b.placeholder };
  });
  fromApi.forEach(s => { if (!BUILT_IN_IDS.has(s.id)) out.push(s); });
  return out.filter(s => s.enabled).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
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
