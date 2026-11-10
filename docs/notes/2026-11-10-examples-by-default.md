## 2026-11-10, example notebooks in the app's folder by default (#463)

On iPhone and iPad the examples showed only after Open Example Notebooks.
Thomas asked for them in the sidebar from the start.

The iOS app's default notebook folder is its own Documents folder (On My
iPhone › Ganymede). Once the page is ready with that folder open, the
sidebar asks the page's new `add-examples` call to copy the examples into
`Examples` there. The call copies nothing when an `Examples` folder is
already there, and answers the folder's path or null. An `examplesAdded`
default records that it ran, so a deleted folder is not brought back; a
failed call is tried again on the next launch. A folder the person picked
gets nothing, and two iPad windows getting ready together make one copy.

A sidebar listing more than one folder (the app's folder beside a picked
one) needs the iOS server to serve more than one root, since it is rooted
at the open folder. That is left for its own issue.
