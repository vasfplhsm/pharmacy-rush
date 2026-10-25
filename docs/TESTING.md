# Testing Pharmacy Rush

Run commands from the repository root. This checklist distinguishes automated checks from behavior that needs manual confirmation on actual devices.

```sh
npm ci
npm run typecheck
npm run build
npm run test
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed on Linux, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser` selects it. The browser suite starts its isolated test server with `SERVER_TEST_MODE=1` and a shortened round; this does not change the ordinary 300-second game.

Keep the full result of each command. Report failed, skipped, and unrun checks separately. Browser tests need browser binaries and operating-system libraries in addition to npm packages.

## Four-client cooperative check

Start `npm run dev` and open `http://localhost:5173` in four tabs or windows. Use a different name and available color in each one.

| Step | Expected result |
| --- | --- |
| Create in window A; join its code from B, C, and D | Every lobby shows four distinct players |
| Attempt a fifth join | A readable full-room rejection; existing players remain connected |
| Toggle ready in A, B, and C only | Host cannot start until D is ready |
| Ready D, then start from A | All clients enter the same Morning Shift |
| Move A and dash toward a wall or counter | Other clients see the movement; A stops at solid geometry |
| Attempt a new join during the shift | Rejected; no spectator/player appears |
| Screen an order and place its tray on Fill tray | Exactly one tray is created and visible to everyone |
| Collect required shelf packages one at a time and deposit them | Tray contents and order progression synchronize |
| Try a wrong item or incomplete tray | Feedback explains the failure; order cannot successfully complete. Return an unwanted package at any product shelf |
| Retrieve the filled tray and print its label | State progresses once, with no duplicate tray |
| Hand the tray to B for final check | B can check; filler cannot bypass the multiplayer check rule |
| Deliver the checked tray | Shared team score increases; completed order disappears |
| Attempt delivery again | No second score award |
| Wait until the five-minute shift ends | All clients show results with the same score, completed count, mistakes, and stars |
| Host chooses Play Again, then Return to Lobby after another round | Group transitions together; no duplicated input or timers |

Test a double-product order after the introductory minute. Supply the exact product types and quantities; verify it follows the same label, check, and dispensing steps. During Printer Jam, the label station must explain the temporary block and recover after ten seconds. Rush Hour should add work without permanently blocking the queue.

## Ownership and station contention

Use two windows side by side where possible.

1. Leave a tray on the shared counter or floor. Have two players press Interact nearly simultaneously. Only one player may become its owner; there must still be one item ID in synchronized state.
2. Have two players interact with the filling station almost simultaneously. Confirm that neither duplicates a product, steals a carried item, or loses the tray.
3. Put down and retrieve items repeatedly. No player may hold two objects, and no object may appear in two hands.
4. Stand beyond station range and press Interact. No distant station may progress.
5. Carry an item and disconnect. Remaining players must be able to retrieve the released item.
6. Try delivering a screened, incomplete, or unlabeled tray. It must remain incomplete and must not earn completion points.
7. Try a solo game. Every station, including final checking, must be usable by one player.

## Connection and host checks

- Disconnect the host while other clients remain. Another connected player must become host without restarting the shift.
- Temporarily disable networking in browser developer tools, then restore it within the reconnection grace period. The player should regain their existing identity rather than creating a duplicate character.
- Refresh a playing tab. If reconnection succeeds within the grace period, confirm the same identity and current state return.
- Wait beyond the grace period before reconnecting. The UI should report the expired connection and provide a path back to the menu; it must not silently join as a new active-match participant.
- Close all clients. After the grace period, trying the old code should fail because the room has been removed.
- Stop and restart the server. Old in-memory rooms cannot be restored. Clients should show an understandable connection failure and be able to create a fresh room.
- Switch tabs while holding a movement key, then release it elsewhere. The inactive player must not keep walking forever.

A reconnection test that merely creates a fresh room does not verify reconnection. Compare the session/player identity and room before and after the interruption.

## Input and authority checks

Logic/server tests should exercise malformed movement, normalization, collision substeps, station range, host privileges, readiness, item exclusivity, workflow matching, duplicate delivery, score clamping, and end-of-round refusal of new actions. A client may request movement and interaction, but it must never be able to set position, clock, item ownership, or score directly.

For manual inspection, use a development browser's networking tools to observe state synchronization. Do not add a production client-side teleport or score-edit button to make tests easier. Any shortened round configuration must remain an explicit server-side test setting; the normal game lasts 300 seconds.

## Mobile and accessibility checks

Use a physical phone or tablet on the same Wi-Fi as the development machine, plus browser device emulation for layout coverage.

- Open the Mac's LAN IP on port 5173 and join a desktop-created room.
- Rotate between portrait and landscape. Return to landscape and confirm controls remain reachable and the canvas has the correct scale.
- Move with the left joystick while tapping Interact, Drop, and Dash on the right. The page must not scroll or zoom unexpectedly.
- Confirm text does not obscure the core play area or important buttons on a small landscape display.
- Open Help and Settings; close them using their visible controls.
- Enable reduced motion. Check that essential status remains understandable with reduced effects.
- Mute, refresh, and confirm the preference persists.
- Enter a name containing HTML-like text. It should appear as plain text and never execute markup.
- Check visible contrast, keyboard focus, and whether color plus symbols distinguish all products.

## Validation record

Record the date, Node/npm versions, browser, commands executed, test counts, and failures with their diagnosis. Automated coverage of a rule does not establish physical touch usability or behavior on a public Internet connection. The final implementation report should state exactly which of these checks were run.
