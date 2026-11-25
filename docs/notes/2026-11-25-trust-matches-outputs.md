## 2026-11-25, Trust from the file matches the cell's outputs (#793)

From the architecture review of 2026-11-24. In a room, the pane reads
the file through the contents API to learn which cells the server
trusts (`trustFromFile`, #183), and trusted each marked cell by id. The
generation guard in `NotebookPane.tsx` drops a read that live outputs
change during, but the file can already be behind the room when the
read starts: a cell whose saved, signed output differed from what it now
shows had that trust promoted onto the new output.

- `trustFromFile` now keeps each trusted cell's outputs from the file
  and trusts a cell here only when its live outputs match them
  (`sameOutputs` in `src/lib/trust.ts`). Everything else keeps the
  untrusted rendering path. The next read after the server saves the
  new output trusts it, as before.
- The comparison is on content, not a hash: the outputs in the same
  order, each as canonical JSON (keys sorted, keys set to `undefined`
  left out), multi-line strings joined as the contents API serves them
  (`rejoinOutput`, split out of `rejoinLines`; JSON values never
  joined), and `transient` dropped, since nbformat never saves it. Any
  other difference (a value, output metadata, an execution count, the
  order or the number of outputs) leaves the cell untrusted.
- Tests: `src/lib/room.test.ts` covers a cell whose live output differs
  from the signed one (stays untrusted, renders untrusted, then trusted
  once the file holds it), and live output equal to the file's but
  stored with lines split and keys reordered (still trusted).
  `src/lib/trust.test.ts` covers `sameOutputs`' cases. Against the real
  server, `e2e/examples.spec.ts` ("signed on a server, so they stay
  trusted") reads the examples' saved outputs back through a room and
  still trusts them; it fails with `sameOutputs` forced false.
