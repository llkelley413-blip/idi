# Studio Bridge Mobile v0.2

**Unofficial Roblox-compatible mobile editor prototype. Not affiliated with Roblox.**

This build focuses on the compatibility bridge needed to move projects between an iPhone editor and official Roblox Studio.

## Implemented through v0.2

- Studio-like top ribbon with Home / Model / Avatar / UI / Script / Plugins tabs
- File > New Project
- **File > Open File...**
- **File > Save**
- **File > Save As...**
- File > Save Backup Copy
- File > Open Recovery
- Roblox XML v4 (`.rbxlx` / `.rbxmx`) import/export
- Structural compatibility validator:
  - root/version check
  - duplicate referent check
  - missing Properties check
  - dangling `Ref` check
- Explorer hierarchy
- Properties editor for common scalar types, Vector2/3, Color3, and CFrame position
- Script / LocalScript / ModuleScript source editing
- Insert Folder / Model / Part / scripts / remotes / values / basic GUI objects
- Move / Scale / Rotate modes using **stud** and **degree** snapping controls
- Local/World-space UI toggle placeholder
- Basic touch viewport
- Toolbox-style panel with official Creator Store search handoff
- Asset-ID references for MeshPart, Decal, Sound, and ImageLabel
- IndexedDB auto-recovery snapshots
- Offline-capable PWA shell

## Important compatibility rule

The app's project format is NOT proprietary. The working document is Roblox XML v4, and Save As exports `.rbxlx`/`.rbxmx`.

Unknown XML elements/properties loaded from a Roblox XML file are retained in the DOM unless specifically edited.

## Not yet implemented

- `.rbxl` / `.rbxm` binary serializer/deserializer
- Full Roblox reflection metadata / every property editor
- Real WebGL Roblox-like 3D rendering and exact transform draggers
- Terrain editing
- Solid modeling / unions
- Animation editor
- UI visual designer
- Actual Roblox Studio plugin execution (requires Studio's Plugin runtime)
- Authenticated Creator Store model/package downloading
- Roblox Open Cloud publish
- Roblox engine playtest inside the web app

Those items are roadmap work, not silently faked.

## iPhone usage

The PWA needs to be hosted on HTTPS to install cleanly from Safari. Once hosted:
1. Open the site in Safari.
2. Share > Add to Home Screen.
3. Enable "Open as Web App" if shown.
4. Launch from the Home Screen.

`Save As` uses the Web Share API when iOS allows file sharing, with a download fallback.

## PC Studio bridge

Use:
- `File > Save As... > Roblox XML Place (.rbxlx)`
- transfer the `.rbxlx` file to your PC later
- open the file in official Roblox Studio

The goal is that official Studio remains the authority for final engine behavior.


## Added in v0.2

- Studio-style Window menu
- Explorer search
- Dockable Output panel with editor diagnostics
- Command Bar shell for editor commands (not fake Luau runtime execution)
- Asset Manager listing Content/ContentId references
- Configurable Auto-Recovery interval and toggle
- Toolbar-label setting
- Keyboard shortcuts 1/2/3/4 for Select/Move/Scale/Rotate
- Ctrl/Cmd+S for Save
- Ctrl/Cmd+Shift+X for Explorer search
- More diagnostic output and compatibility visibility
