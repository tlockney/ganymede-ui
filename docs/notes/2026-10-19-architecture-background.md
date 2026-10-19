## 2026-10-19, what the architecture page assumes (#73)

The architecture page named JupyterLite, Lumino and the JupyterLab
packages as if the reader knew them. It now opens with what the app is
built from and why: JupyterLab's packages used as libraries, the
`ServiceManager` as the one way to notebooks and kernels, and JupyterLite's
services as a server that runs in the page, which is what lets kernels run
with no server while the rest of the app stays unaware. Library names that
appear later (`mock-socket`, `localforage`, Workbox, XcodeGen) get a few
words each where they first appear.
