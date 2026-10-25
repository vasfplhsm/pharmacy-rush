# Validation record — 2026-10-25

Executed in the cloud workspace on Linux with Node.js 24.19.0, npm 11.9.0 and system Chromium 154.0.8037.57. These results describe this implementation and machine; they do not claim testing on a physical Mac or phone.

| Check | Result |
| --- | --- |
| `npm install` | Passed; exact dependency versions recorded in package-lock.json |
| `npm ci` | Passed from the final lockfile (177 packages) |
| `npm run build` | Passed, including TypeScript checking, bundled Node server and Vite frontend |
| `npm run test` | 22 passed: 15 simulation/validation tests and 7 actual Colyseus SDK network tests; no skipped tests |
| `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` | 2 passed in about 1.7 minutes; no skipped tests |
| `npm run dev` | Both services launched; local HTML and server health requests succeeded |
| Built server via `PORT=2681 npm start` | Health, schema handshake, room creation, ready/start, and normal 300-second initial clock passed |
| Unshortened browser shift | Passed in a real Chromium browser against the normal development server: initial 300 seconds, results at elapsed 300, remaining 0, wall time 300 seconds |

The four-client browser test used four independent browser contexts, joined by public room code. It verified visibility of all players, readiness/start, keyboard movement synchronization, a complete real station workflow, exclusive tray pickup contention, a teammate handoff/check, a shared score of 125, and results on all four clients. It used a 90-second server-only test override; it never modified positions, items or score directly.

The second browser test used landscape 844×390 with touch emulation. It verified Help, solo startup, visible touch controls, joystick-driven authoritative movement, browser-refresh reconnection with the same session and no duplicate player, settings/resume, and movement after closing settings.

The network tests additionally verified capacity, code-less admission rejection, distinct room IDs/codes and avatars, host authorization and reassignment, explicit reconnection tokens, late admission refusal, malformed movement, collision boundaries, stale input stopping, and rejection of score forgery. Simulation tests cover single/double-product quantities, wrong packages, incomplete deliveries, penalties and score clamping, duplicate completion prevention, object release on disconnect, timer endings/replay, rate limiting, and seeded events.

Issues found during development were corrected and affected checks rerun: schema class initialization was replaced with current Colyseus schema 5 builders; input sending was separated from rendering; static map art was cached; modal input sequence handling and create-room options were corrected. Browser test navigation now leaves clearance at counter corners and uses the visible landscape menu control.

Not yet verified: physical mobile devices, Safari, execution on an actual Apple Silicon Mac, Internet latency/packet loss, and public hosting. Rooms are in memory and do not survive a server restart. Production hosting/TLS is a separate deployment task.

Screenshots from the latest browser suite are generated under the ignored `test-results/` directory. See [TESTING.md](TESTING.md) for repeatable commands and remaining manual checks.
