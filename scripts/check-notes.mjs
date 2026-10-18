// Checks the development log: every entry in docs/notes/ is named
// YYYY-MM-DD-<topic>.md and starts with "## YYYY-MM-DD, <topic> (#N)"
// for the same date. archive.md holds the entries from before this rule.
import { readdirSync, readFileSync } from 'node:fs';

const dir = new URL('../docs/notes/', import.meta.url);
const name = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const problems = [];

for (const file of readdirSync(dir).sort()) {
  if (file === 'archive.md') continue;
  const match = name.exec(file);
  if (!match) {
    problems.push(`${file}: name entries YYYY-MM-DD-<topic>.md`);
    continue;
  }
  const first = readFileSync(new URL(file, dir), 'utf8').split('\n', 1)[0];
  const heading = new RegExp(`^## ${match[1]}, .+ \\([\\w./-]*#\\d+\\)$`);
  if (!heading.test(first)) {
    problems.push(`${file}: start with "## ${match[1]}, <topic> (#<issue>)"`);
  }
}

if (problems.length > 0) {
  console.error(`docs/notes/:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
