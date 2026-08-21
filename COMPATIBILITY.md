# Compatibility Contract

Studio Bridge Mobile exists to create and preserve Roblox project data, not to invent a new game format.

## File compatibility

Primary interchange:
- `.rbxlx` — Roblox XML place
- `.rbxmx` — Roblox XML model

Planned:
- `.rbxl` — Roblox binary place
- `.rbxm` — Roblox binary model

The XML root uses `<roblox version="4">`. Items use Roblox `Item`, `Properties`, `class`, and `referent` conventions.

## Measurements

- Position and size are expressed in Roblox **studs**.
- Rotation snapping is expressed in **degrees**.
- CFrame position is stored as X/Y/Z plus the 3×3 rotation matrix.
- Move and rotate increments are user-editable, matching Studio's configurable snapping model.

## Explorer / DataModel

The editor stores actual Roblox class names and parent-child hierarchy in the RBXLX DOM.

## Scripts

Script, LocalScript, and ModuleScript source is stored in a `ProtectedString` property named `Source`.

## Toolbox / Assets

The UI mirrors the Studio workflow categories (Creator Store / Inventory / Recent / Creations), but v0.1 only hands searches to the official Creator Store and can write asset-ID references for content properties.

Full model/package insertion needs an authenticated Roblox asset-fetch path plus RBXM/RBXL deserialization.

## Plugins

Official Studio plugins use Studio-only Plugin-security APIs such as Plugin, PluginToolbar, PluginToolbarButton, DockWidgetPluginGui, Selection, and ChangeHistoryService.

A Safari/PWA editor cannot truthfully execute those APIs. The app can:
- preserve plugin-related source/data where present in files,
- provide plugin-like extension points in its own UI later,
- export project files that official Studio can open.

It cannot claim browser-side execution is identical to Studio's Plugin runtime.

## Autosave / recovery

Studio has configurable auto-recovery. Studio Bridge mirrors the behavior conceptually with timed local recovery snapshots in IndexedDB and an Open Recovery menu.

## Test standard

A feature is only marked "Studio-compatible" after:
1. export to `.rbxlx`/`.rbxl`,
2. open in official Roblox Studio,
3. inspect Explorer/properties/scripts,
4. save again from Studio,
5. reopen in Studio Bridge,
6. compare relevant data.

Until that round-trip is performed, it is marked "targeted" rather than "guaranteed."
