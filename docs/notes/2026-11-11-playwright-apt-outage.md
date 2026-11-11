## 2026-11-11, e2e survives an apt mirror outage (#499)

From about 14:10 UTC the runners couldn't resolve the Ubuntu mirrors,
so `e2e` failed in `npx playwright install --with-deps chromium` before
any test ran, on every re-run. Ganymede's Playwright jobs hit the same
(tlockney/ganymede#686).

GitHub's Ubuntu image ships Google Chrome, so the libraries Chromium
needs are already there; `--with-deps` mostly adds fonts. The job now
downloads the browser alone, then runs `playwright install-deps
chromium` as best effort: when apt fails it logs a warning and carries
on with the image's libraries. Retrying apt wouldn't have helped: the
outage lasted hours. apt's own DNS retries took about 10 minutes to give
up, so the step is capped at 5 minutes. `timeout` only stops `npx`, so a
failed step also stops the `sudo apt-get` it started (`sudo pkill -x
apt-get`); otherwise apt runs on beside the tests and, if the mirrors
come back, installs fonts and holds the dpkg lock mid-job.
