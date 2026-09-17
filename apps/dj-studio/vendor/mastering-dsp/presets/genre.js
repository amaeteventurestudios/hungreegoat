/**
 * Genre Presets Module
 * One-click mastering starting points per genre/use-case.
 *
 * Each preset describes a full console state:
 * - eq: 5-band EQ gains (dB)
 * - toggles: on/off processing modules (checkbox ids)
 * - stereoWidth: percent (0-200)
 * - targetLufs: normalization target
 * - ceiling: true peak ceiling (dB)
 */
export const genrePresets = {
  electronic: {
    label: 'Electronic',
    description: 'Tight low end, wide highs, club-ready punch',
    eq: { low: 1.5, lowMid: -1, mid: 0, highMid: 0.5, high: 1.5 },
    toggles: {
      glueCompression: true,
      deharsh: false,
      cleanLowEnd: true,
      autoLevel: false,
      addPunch: true,
      cutMud: false,
      addAir: true,
      tapeWarmth: false,
      centerBass: true,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 115,
    targetLufs: -9,
    ceiling: -1
  },
  hiphop: {
    label: 'Hip-Hop',
    description: 'Heavy lows, warm mids, hard-hitting drums',
    eq: { low: 3, lowMid: -0.5, mid: 0, highMid: 0.5, high: 1 },
    toggles: {
      glueCompression: true,
      deharsh: false,
      cleanLowEnd: true,
      autoLevel: false,
      addPunch: true,
      cutMud: true,
      addAir: true,
      tapeWarmth: true,
      centerBass: true,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 105,
    targetLufs: -10,
    ceiling: -1
  },
  acoustic: {
    label: 'Acoustic',
    description: 'Natural dynamics, gentle warmth, open top end',
    eq: { low: 0.5, lowMid: 0, mid: 0.5, highMid: 1, high: 1.5 },
    toggles: {
      glueCompression: false,
      deharsh: false,
      cleanLowEnd: true,
      autoLevel: false,
      addPunch: false,
      cutMud: true,
      addAir: true,
      tapeWarmth: true,
      centerBass: false,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 100,
    targetLufs: -14,
    ceiling: -1
  },
  podcast: {
    label: 'Podcast',
    description: 'Voice clarity, level consistency, broadcast loudness',
    eq: { low: -1, lowMid: -1.5, mid: 2, highMid: 2.5, high: 0.5 },
    toggles: {
      glueCompression: true,
      deharsh: true,
      cleanLowEnd: true,
      autoLevel: true,
      addPunch: false,
      cutMud: true,
      addAir: false,
      tapeWarmth: false,
      centerBass: false,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 80,
    targetLufs: -16,
    ceiling: -1
  },
  loud: {
    label: 'Loud',
    description: 'Maximum impact — pushed level, saturated glue',
    eq: { low: 1.5, lowMid: -1, mid: 0.5, highMid: 1, high: 1.5 },
    toggles: {
      glueCompression: true,
      deharsh: false,
      cleanLowEnd: true,
      autoLevel: false,
      addPunch: true,
      cutMud: true,
      addAir: true,
      tapeWarmth: true,
      centerBass: true,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 110,
    targetLufs: -7,
    ceiling: -0.5
  },
  streaming: {
    label: 'Streaming',
    description: 'Balanced master tuned for platform normalization',
    eq: { low: 1, lowMid: -0.5, mid: 0, highMid: 0.5, high: 1 },
    toggles: {
      glueCompression: true,
      deharsh: true,
      cleanLowEnd: true,
      autoLevel: false,
      addPunch: true,
      cutMud: false,
      addAir: true,
      tapeWarmth: true,
      centerBass: true,
      normalizeLoudness: true,
      truePeakLimit: true
    },
    stereoWidth: 105,
    targetLufs: -14,
    ceiling: -1
  }
};

export function getGenrePreset(name) {
  return genrePresets[name] || null;
}
