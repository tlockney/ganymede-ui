## 2026-11-11, TestFlight notes go in `whatsNew` (#498)

The v0.7.0 release uploaded its TestFlight build, but setting the notes
failed with a 409: `'whatToTest' is not an attribute on the resource
'betaBuildLocalizations'`. TestFlight shows the field as "What to Test",
but App Store Connect's API names it `whatsNew`, both when writing a
localization and when reading it through `include=betaBuildLocalizations`.
The script now sends and reads `whatsNew`, so the "Built from <sha>."
lookup in the previous build's notes reads the right field too.

The unit tests had only checked the request the script built, so they
agreed with the wrong name. A small fake of the betaBuildLocalizations
calls now answers an unknown attribute with the 409 the release got and
returns what was written through `include`, and the write checks that the
answer carries the notes it sent. Build 0.7.0 stays without notes: rerunning
the job would reuse its build number. The next `testflight_only` run
confirms the fix against the real API.
