## 2026-11-05, Mac app icon (#281)

- The icon's asset catalog was added for TestFlight (#188) to the
  `Ganymede-iOS` target only, so the Mac app showed the generic icon. The
  macOS target now has its own catalog, `apple/Resources/macOS`, and sets
  `ASSETCATALOG_COMPILER_APPICON_NAME`.
- iOS masks a full-bleed square itself; macOS shows the PNG as drawn.
  `apple/scripts/mac-icon.py` puts the iOS artwork in Apple's macOS grid:
  an 824 pt rounded square inset 100 pt in a 1024 pt canvas, with a soft
  shadow. It writes all ten sizes (16 to 512 pt at 1x and 2x), because
  macOS asset catalogs don't take the single-size form iOS uses.
- The PNGs are committed, so a build doesn't need Pillow. Run the script
  again after changing the iOS icon.
- The Dock may keep showing the old icon until its icon cache refreshes
  (`killall Dock`, or log out and in).
