# iPhone-only testing for Studio Bridge Mobile v0.2

## Fastest reliable path: GitHub Pages + Safari

1. Download `Studio_Bridge_Mobile_v0.2.zip` to the iPhone Files app.
2. Unzip it in Files.
3. In Safari, sign in to GitHub and create a new public repository (GitHub Pages is available for public repositories on GitHub Free).
4. Upload the contents of the `studio_bridge_mobile_v0_2` folder to the repository root. `index.html` must be at the root.
5. Open repository Settings > Pages.
6. Set Source to `Deploy from a branch`, choose the default branch, and choose `/(root)`.
7. Open the Pages URL in Safari after GitHub reports the site is live.
8. Safari > Share > Add to Home Screen > turn on `Open as Web App` > Add.
9. Launch Studio Bridge from the new Home Screen icon.

## Test checklist

- File > New Project
- Insert > Part
- Select the Part in Explorer
- Edit Name / Anchored / Size / CFrame values in Properties
- Test Move, Scale, Rotate; change stud and degree snap fields
- Window > Output and check diagnostics
- Window > Command Bar and run `validate`
- File > Save As > `.rbxlx`
- Save the file into the iPhone Files app
- File > Open File and reopen the saved `.rbxlx`
- Confirm Explorer, properties, hierarchy, and script source survive the round trip
- File > Open Recovery and verify a recovery snapshot exists after edits

## Compatibility note

This verifies iPhone-side RBXLX round-tripping. Final proof that every serialized property opens identically in official Roblox Studio still requires opening the exported `.rbxlx` in official Studio. The app is intentionally using Roblox XML as its interchange format so that test can be performed whenever PC Studio is available.
