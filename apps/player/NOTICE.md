# NOTICE — licensing of the HUNGREE Goat player

`apps/player` is a derivative work of **lofi-music-website** by Gilles Momeni (menoc61),
obtained via the fork `amaeteventurestudios/lofi--afrobeats-music-website`, licensed under the
**GNU Affero General Public License v3.0** (see `LICENSE` in this directory).

Consequently this application is distributed under AGPL-3.0. In compliance with the licence:
- the complete corresponding source of the player is published at
  https://github.com/amaeteventurestudios/hungreegoat/tree/main/apps/player and linked from the
  player's Credits panel (AGPL §13 network-use clause);
- the original copyright and licence notices are preserved in this directory;
- the original author's UI credit ("Made by") and GitHub-star/portfolio widgets were removed as UI
  elements (the licence does not require them in the interface); authorship attribution is kept here
  and in the Credits panel.

What was retained from the original: the immersive-scene interaction model (full-screen looping
scene video, mood/mixer board with ambient sound sliders, focus timer + to-do list, footer player),
the five scene videos and the ambient sound loops shipped with the original repository.
What was replaced: branding, colours, typography, all demo music (replaced by the live HUNGREE Goat
broadcast and the real HUNGREE Goat catalog), the state layer (Redux → React context), the build
(CRA → Vite), and the day/night model (now Dawn / Afternoon / Dusk / Night with operator-managed skins).

The remainder of the hungreegoat monorepo (website, control console, infrastructure) is separate
software and is not covered by this notice.
