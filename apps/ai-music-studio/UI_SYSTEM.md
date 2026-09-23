# UI System — shadcn First

## Direction
Premium light-first Studio UI:
- off-white/neutral surfaces
- black/slate typography
- restrained amber/gold accent
- soft borders
- subtle shadows
- generous whitespace
- dense information only where useful

Dark mode may be supported, but it is not the primary design target.

## Primitive Rule
Use shadcn/ui for common controls, with Base UI as the primitive base unless a documented blocker appears.

Prefer shadcn for:
- Sidebar
- Card
- Button
- Tabs
- Dialog
- Sheet
- Drawer
- Badge
- Input
- Textarea
- Select
- Combobox
- Slider
- Switch
- Progress
- Table/Data Table
- Tooltip
- Popover
- Dropdown Menu
- Command
- Skeleton
- Spinner
- Resizable panels

## Custom Domain Components
- AudioWaveform
- ABCompare
- ArrangementTimeline
- StemChannel
- StemMixer
- TempoPreview
- EnergyCurve
- AudioMiniPlayer
- JobProgressCard

## Layout Rules
- Grid and Flexbox first
- shared spacing scale
- shared radii
- shared typography
- repeated visual patterns use shared components
- avoid magic fixed heights
- avoid absolute positioning for structural layout
- responsive from desktop through mobile

## Visual QA
At minimum:
- 1440×900
- 1280×800
- 1024×768
- approximately 390px mobile

Check clipping, overflow, baseline alignment, form consistency, waveform resizing, sidebar behavior, long names/titles, modal sizing, and empty/loading/error states.
