# Pharmacy Rush: FPL HSM Edition

A cooperative browser game for one to four players. Run a cheerful, fictional outpatient pharmacy, assemble toy product orders, and keep the queue moving through a five-minute **Morning Shift**.

This is an original prototype inspired by cooperative time-management games. Its map, characters, packages, and visual effects are created for this project. It uses no real patient information, prescriptions, medication doses, or clinical advice. Mintora, Coralia, Sunberry, and Blueleaf are fictional game products. The setting is a fictionalized tribute to Farmasi Pesakit Luar, Hospital Seri Manjung, Perak, Malaysia; this project is not an official hospital application.

## Start on a Mac

An Apple Silicon MacBook with 16 GB RAM is sufficient. You need a current desktop browser, a terminal, and **Node.js 24 LTS** with npm. Node 22.12 or newer is the minimum supported version. No accounts, database, Docker, or paid services are needed.

1. Install the LTS macOS installer from [nodejs.org](https://nodejs.org/en/download). The Apple Silicon installer runs natively; Rosetta is unnecessary.
2. Open Terminal in this project folder. If you cloned with Git, enter `cd pharmacy-rush`.
3. Check the installation:

   ```sh
   node --version
   npm --version
   ```

4. Install and start:

   ```sh
   npm install
   npm run dev
   ```

5. Keep that terminal running. Open **http://localhost:5173** in your browser.

`npm run dev` starts the Vite client on port **5173** and the Colyseus server on port **2567**. Stop both with **Control+C**. You do not need an `.env` file for ordinary local or same-network play.

For an exact install from the committed lockfile, use `npm ci` instead of `npm install`.

## Play a shift

Choose a display name of up to 16 characters and an available avatar color. **Play** starts a solo shift. **Create Room** opens a lobby for friends; share its six-character code and have them choose **Join Room**. Each connected player marks themselves ready, then the host starts. The host can start alone.

Read the order cards at the top of the screen. Package colors and symbols identify the four products; quantities matter.

1. At **Screen orders**, interact with empty hands to pick up a tray for a queued order.
2. Carry the tray to **Fill tray** and interact to set it down.
3. With empty hands, collect one matching package from its product shelf. Bring it to the filling counter and interact to put it into the tray. Repeat for every required package.
4. Retrieve the completed tray with empty hands when its contents match the order.
5. Take the tray to **Print label** and interact.
6. Take the labeled tray to **Final check**. With multiple players, a different player performs the check. Set the tray on the shared counter or drop it nearby to hand it over. Solo players can perform their own check.
7. Carry the checked tray to **Dispense** and interact to earn team points.

Everyone can do any job. Each person carries one object at a time. Use the **Shared counter** for temporary storage and handoffs. Standing near a station shows the available action. If an action fails, read the feedback message before trying again.

The first minute gives the team time to learn. Later, a ten-second **Printer Jam**, a brief **Rush Hour**, and **Double Order** combinations introduce more work. Orders and deadlines adapt to the team size. A printer jam clears itself; you can keep filling trays while waiting.

### Controls

| Action | Keyboard | Mobile landscape |
| --- | --- | --- |
| Move | WASD or arrow keys | Left virtual joystick |
| Interact / collect / place / process | E | Interact button |
| Drop carried item | Q | Drop button |
| Short dash | Space | Dash button |
| Settings | Escape | Settings button |

Rotate mobile devices into landscape. Touch controls appear over the game. The game uses one shared server clock: opening settings does **not** pause the shift for other players. Sound can be muted, and reduced motion can be enabled in settings.

### Scoring

| Outcome | Team score |
| --- | --- |
| Correct order | +100 |
| Delivered before its deadline | Additional +25 |
| Incorrect delivery attempt | −75, clamped at zero |

Late correct deliveries receive the base score without the on-time bonus. Incorrect delivery attempts do not complete an order. Stars are awarded at **500**, **1,000**, and **1,500** points. After 300 seconds, the results show the shared score, completed orders, and mistakes. The host can start another shift or return the group to the lobby.

## Try four players on one computer

1. Run `npm run dev` once.
2. Open four tabs at `http://localhost:5173`.
3. In the first tab, enter a name and choose **Create Room**. Copy the room code.
4. In the remaining tabs, enter different names and use **Join Room** with that code. Choose different available colors.
5. Confirm that all four players appear in every lobby. Mark each ready.
6. Start from the host tab. Move in one tab, then switch to another and confirm that character's new position.
7. Work together by switching tabs: one player fills and labels a tray, and another retrieves and checks it. Deliver it and confirm the same team score in every tab.

Browsers may throttle background tabs. Use separate browser windows side by side for more visible movement, or test with friends on other devices. For a larger checklist, see [docs/TESTING.md](docs/TESTING.md).

## Connect another device on your Wi-Fi

Keep the game running on your Mac. Both devices must be on the same trusted local network.

1. Find the Mac's local IP in **System Settings → Wi-Fi → Details → TCP/IP**. It often resembles `192.168.1.20`.
2. On the other device, open `http://YOUR_MAC_IP:5173`.
3. Create or join using the same room code. The client automatically connects to port 2567 on the hostname used in the browser.
4. If macOS prompts about incoming Node connections, allow them on your trusted network. Both TCP ports **5173** and **2567** must be reachable.

Do not use `localhost` on the second device; that refers to that device itself. Guest Wi-Fi or access-point isolation can prevent devices from reaching one another. A VPN can also change routing.

If the frontend and game server live on different hosts, copy `.env.example` to `apps/client/.env.local` and set `VITE_SERVER_URL` to the game server's WebSocket address, for example `ws://192.168.1.20:2567`. Restart Vite after changing this file. Only public connection configuration belongs in a `VITE_` variable; it is included in the browser build.

HTTPS pages require a secure `wss://` connection. Public Internet hosting needs a TLS reverse proxy, appropriate networking, and deployment hardening. The development servers are intended for local development and trusted-network testing.

## Development commands

Run these from the repository root:

| Command | Purpose |
| --- | --- |
| `npm install` | Install all workspace dependencies |
| `npm ci` | Reproduce the committed dependency lockfile |
| `npm run dev` | Run the client and multiplayer server together |
| `npm run typecheck` | Check TypeScript without emitting files |
| `npm run build` | Compile the server and bundle the browser client |
| `npm run test` | Run the Vitest logic/server tests |
| `npm run test:browser` | Run the Playwright browser smoke tests |
| `npm start` | Run the compiled game server after building |

The frontend build is written to `apps/client/dist`; the compiled server is under `apps/server/dist`. `npm start` runs the server, so serve the frontend build separately when testing production hosting. A production build succeeding is not evidence that a deployment has been configured.

### Tests

The automated tests cover gameplay rules and multiplayer behavior, while [docs/TESTING.md](docs/TESTING.md) gives manual resilience and mobile checks. A failed command should be investigated; do not treat an empty or skipped test run as a pass.

Playwright needs Chromium. On a development machine, install its browser once:

```sh
npx playwright install chromium
npm run test:browser
```

The network suite is in `tests/network.test.ts`, gameplay checks are in `tests/server-logic.test.ts`, and browser coverage is in `tests/browser/game.spec.ts`. On Linux with a preinstalled Chromium, use `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`.

The cloud validation passed **22 Vitest checks and 2 Playwright scenarios**, along with clean installation, production builds, and a real 300-second browser round. See [docs/VALIDATION.md](docs/VALIDATION.md) for the executed checks and limits.

Browser tests use an explicitly shortened server-side test round on a separate test port. Normal development games remain 300 seconds. The repository's final validation report records the checks actually run in the development environment. Physical mobile-device behavior, real Internet latency, and public deployment still need testing in their intended environments.

## Project layout

```text
pharmacy-rush/
├── apps/
│   ├── client/
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── main.ts          Menu, lobby, HUD, and connection lifecycle
│   │       ├── scenes/          Phaser world rendering
│   │       ├── input/           Keyboard and touch input
│   │       ├── network/         Browser multiplayer integration
│   │       └── ui/              Interface helpers
│   └── server/
│       └── src/
│           ├── index.ts        HTTP / WebSocket entry point
│           ├── rooms/          Colyseus room lifecycle and messages
│           ├── state/          Synchronized schema state
│           ├── simulation/     Authoritative game rules
│           ├── validation/     Input and action checks
│           └── services/       Server utilities
├── packages/shared/src/         Shared map, products, constants, and types
├── tests/                       Logic, server, and browser tests
├── docs/TESTING.md
├── .env.example
├── package.json
├── package-lock.json
└── tsconfig.json
```

Some folders are reserved for future separation as the prototype grows; the actual source files are the source of truth.

## How multiplayer works

The server owns positions, collisions, item ownership, order progression, scoring, and the clock. Clients send movement and interaction **intent**, rather than coordinates or score claims. Shared map geometry keeps rendering and server collision boundaries aligned. The simulation runs at 20 Hz, with schema state patches sent regularly to clients. Phaser renders independently, predicts local movement for responsiveness, and smooths remote movement.

A room has an internal Colyseus ID and a separate public six-character code. The host is identified from server state. The server checks readiness, room capacity, station range, item ownership, and workflow order before changing state. Stable item IDs and atomic server actions prevent two players from carrying the same object or dispensing an order twice.

A short reconnection grace period lets an interrupted player recover their existing identity. Host rights transfer when the host disconnects. Carried items are released safely so the remaining team can continue. New players cannot join a running shift; reconnecting members can return. Rooms are temporary and are removed after everyone leaves and any reconnection grace expires. A server restart ends its in-memory rooms.

The stack is TypeScript, [Phaser 3](https://docs.phaser.io/), [Vite](https://vite.dev/guide/), [Colyseus 0.18](https://docs.colyseus.io/), [Vitest](https://vitest.dev/guide/), and [Playwright](https://playwright.dev/docs/intro). Exact resolved dependencies are stored in `package-lock.json`. Colyseus SDK, server, and schema versions must be upgraded together with their compatibility requirements checked; examples from older Colyseus versions may use different APIs.

## Troubleshooting

**`node` or `npm` is missing.** Install Node LTS and reopen Terminal. Check `node --version` before installing dependencies.

**Install or Vite reports an unsupported Node version.** Use Node 24 LTS, or at least 22.12. Changing Node versions may require running `npm ci` again.

**Port 5173 or 2567 is already in use.** Stop an earlier development terminal with Control+C. Check for another app listening on that port. If you change the server port with `PORT`, set the matching `VITE_SERVER_URL` in `apps/client/.env.local` and restart the development command.

**The menu loads, but creating or joining fails.** Confirm the server process is still running, inspect the terminal error, and check `http://localhost:2567/health`. For another device, replace `localhost` with the server's LAN IP. Check both ports and any stale `.env.local` override.

**Room code is rejected.** Codes use six uppercase characters without easily confused symbols. Check that the room still exists, has a free seat, and has not already started. A server restart clears rooms; create a new one.

**Start is unavailable.** Only the current host can start, and every connected player must be ready. Check the lobby indicators.

**A workstation does nothing.** Stand within interaction range, read the hint, and check what you are carrying. Place a tray before fetching products; empty hands are needed to retrieve it. The label printer may be temporarily jammed. In multiplayer, a different player must do the final check. If you picked up the wrong package, take it to any product shelf and interact to return it; an incorrect deposit leaves the tray unchanged and applies the mistake penalty.

**Clipboard copy is unavailable.** Browser clipboard permission can be restricted on an HTTP LAN origin. Select and type the visible room code instead.

**Audio is silent.** Browsers require a click or tap before starting audio. Check the game's mute setting and device volume.

**After refresh or a connection error.** Reconnection only works briefly and while the server still has the room. If that window expires, return to the menu and create or join a lobby. A new player cannot enter a match already in progress.

**Browser tests cannot launch Chromium.** Run `npx playwright install chromium`. On Linux, system libraries may also be required; Playwright's error names the missing packages. Keep browser tests distinct from the logic suite when reporting failures.

## Current scope and next milestone

This first milestone contains one map, a five-minute cooperative shift, four product types, and temporary rooms for one to four players. It does not include accounts, persistent progress, matchmaking, spectators, voice chat, or a hosted public service. Room codes provide convenient joining, not an account-based access-control system. A server restart loses active matches.

The next milestone is a playtest and balancing pass: measure solo and four-player throughput, tune arrival/deadline/score constants, refine mobile interactions and latency recovery, and add another original map after the core loop is stable. Public deployment should include TLS, operational monitoring, and abuse testing before inviting a large audience.
