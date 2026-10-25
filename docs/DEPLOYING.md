# Put Pharmacy Rush online with Render

Recommended for this prototype: **one free Render Web Service**, in **Singapore**. It serves the built browser game and the persistent Colyseus multiplayer server at one HTTPS address. No database, Docker image, secret keys, custom domain, or second hosting provider is needed.

[Deploy Pharmacy Rush to Render](https://render.com/deploy?repo=https://github.com/vasfplhsm/pharmacy-rush)

## First deployment

1. Open the deployment link above. Sign in to Render, or create a free account.
2. If Render asks to connect GitHub, authorize access to `vasfplhsm/pharmacy-rush`. Keep passwords and access tokens in the providers' own login screens.
3. Render should read `render.yaml` from the repository's `main` branch. It may call this a **Blueprint**. Give the Blueprint any name, for example `pharmacy-rush`.
4. Review the service before creating it: **Web Service**, **Node**, **Singapore**, **Free**, one instance. Keep the repository root as the working directory. The Blueprint selects the Free plan; review Render's current free-plan terms in its dashboard before creating the service.
5. Choose the displayed deploy/create action and wait for the build and service to become live. The build runs `npm ci --include=dev && npm run build`; the start command is `npm start`.
6. Open the HTTPS service URL Render assigns in its dashboard. That is the game link to share with friends. Use the actual assigned URL; service names are not guaranteed to produce a particular hostname.
7. Choose **Create Room**, copy the room code, and have friends open the same HTTPS link and choose **Join Room**. Test the first order together.

Do not set `VITE_SERVER_URL` for this deployment. The production game automatically uses its own secure host and port for multiplayer. Render supplies `PORT`; the server listens on `0.0.0.0`. The provided health endpoint is `/health`.

## If the Blueprint flow is unavailable

Create a **Web Service**, connect the repository, and use these settings:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Runtime | Node |
| Region | Singapore |
| Instance plan | Free |
| Root directory | Leave blank (the repository root) |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check | `/health` |
| Environment variable | `NODE_VERSION=24` |
| Environment variable | `NODE_ENV=production` |

Keep one server instance: rooms and room codes are held in its memory. Multi-instance scaling needs a shared Colyseus driver/presence configuration and is outside this prototype.

## What free demo hosting means

Free services can sleep after idle periods, and the first visitor may wait while the service starts again. Confirm current idle behavior, usage limits, and regional availability in its dashboard. Exact quotas and prices have not been verified in this workspace. An active WebSocket does not mean that this demo has an uptime guarantee.

A restart, redeploy, or service sleep loses in-memory rooms. If a room has ended, create a fresh one. Deploy updates between shifts, because updates can disconnect active players. Review auto-deploy settings if you prefer to deploy manually. The free plan is suitable for sharing and small playtests; choose an always-on plan later only if you want its cost and service guarantees.

## Verify the published service

- Open its assigned HTTPS URL and confirm the menu appears.
- Open `https://<your-assigned-host>/health` and expect `ok: true`.
- Create a room on one browser/device and join its code from another.
- Ready both players, start, and verify movement appears on both screens.
- Complete screening, filling, labeling, teammate checking, and dispensing; both clients should show the same score.
- Refresh one client and confirm it reconnects within the grace period.

The built single-service architecture is tested locally with:

```sh
npm ci --include=dev
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:production
```

On a Mac, install Chromium once with `npx playwright install chromium`, then run `npm run test:production` without the Linux executable override. This launches the compiled server serving the compiled frontend, and exercises the existing multiplayer and touch/refresh scenarios on one port. It does not claim that a Render account has been connected or that a remote deployment is live.

## Troubleshooting

**Build cannot find TypeScript or Vite:** use the complete build command with `--include=dev`; the compiler and bundler are development dependencies needed during the build.

**Menu appears but room creation fails:** remove any old `VITE_SERVER_URL` value in Render and rebuild. The default hosted connection uses the same origin. Both the page and WebSocket should use HTTPS/WSS.

**Only backend JSON or a missing page appears:** use the repository-root build command, which builds both workspaces. The server serves `apps/client/dist`.

**Build cannot read the repository:** use Render's GitHub connection screen to grant access to this repository. No GitHub token needs to be put into the game.

**The first load is slow:** allow the free instance to wake up, then retry. Consult Render's logs if it remains unavailable.

**Room disappears after an update:** this version stores rooms in memory. Return to the menu and create a new room.

Official references: [Render Web Services](https://render.com/docs/web-services), [WebSockets](https://render.com/docs/websocket), [Free services](https://render.com/docs/free), and [Blueprints](https://render.com/docs/infrastructure-as-code). Dashboard wording and plan availability can change.
