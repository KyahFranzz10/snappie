# Snappie

A real browser photobooth built with React, TypeScript, Vite, Tailwind, React Router, Zustand, Dexie, Canvas, Supabase, and WebRTC. Solo and kiosk mode require no account or backend. Online Together uses a separately configured Supabase project; it is disabled with an explanation until configured.

## Run locally

Requirements: Node **22.12+** (tested with 24.16), npm 11, and a browser supporting MediaDevices, Canvas, IndexedDB, and WebRTC. Exact dependency versions are pinned in `package-lock.json`; use `npm ci` for reproducible installations. React 19, Vite 7, TypeScript 5.9, Tailwind 4, Router 7, Zustand 5, Dexie 4, and Supabase JS 2 are used.

```powershell
# This project is already initialized; no scaffold command is needed.
cd 'C:\Users\JHON FRANCIS GARAPAN\Documents\SnapBooth'
npm ci
npm run dev
```

Open the URL Vite prints, normally http://127.0.0.1:5173. The app asks for your camera only when you press **Enable camera**. Microphone access is a separate action in online rooms. A phone connecting over a LAN requires HTTPS; plain HTTP on a LAN address is not a secure camera context. Use HTTPS hosting to test two separate devices.

## Local booth

Choose 2, 3, 4, or 6 photos, a 3/5/10-second countdown, and a classic strip or postcard. Enable the camera, choose a device if more than one exists, and start the sequence. Each shot can be retaken. Stop and resume a sequence or start fresh. Camera tracks stop when leaving the screen.

The editor supports frame colors (including transparent PNG), six filters, brightness/contrast/saturation, captions, movable text overlays with position controls, stickers, dates, and drag or keyboard photo arrangement. Its live preview is the actual export canvas. PNG/JPG downloads contain the composed image, not the interface. Optional drafts are stored in IndexedDB on this device. There is one replaceable draft slot; delete it from the editor. Photos are held in memory unless you explicitly save a draft or download.

### Webcam clarity

Snappie requests a camera feed up to 3840 × 2160 pixels at up to 30 fps, preferring native frames where the browser supports `resizeMode`. The device/browser may supply a lower resolution. The capture screen reports the actual decoded frame dimensions and matches its preview aspect ratio. Local and kiosk captures preserve those dimensions as lossless PNG rather than first resizing to a fixed 1600 × 1200 JPEG. Cropping and scaling happen when composing the chosen final template, whose export dimensions remain listed below. For online photo transfer, frames are bounded to a 1920-pixel longest edge and encoded as high-quality JPEG to keep the existing verified transport reliable. High-resolution PNG drafts require more local storage.

This preserves detail the webcam delivers; it does not recover missing focus or remove sensor noise. Face a soft light, avoid relying on a dim room or monitor glow, clean the lens, and check focus in the camera’s own software if available. Original filter and 100% brightness/contrast/saturation give the least stylized result. Supported resolutions depend on the [camera constraints](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints) and the actual [video frame dimensions](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/videoWidth).

Print dimensions:

| Template      | Canvas         | Paper at 300 pixels/inch |
| ------------- | -------------- | ------------------------ |
| Classic strip | 600 × 1800 px  | 2 × 6 in                 |
| Postcard      | 1800 × 1200 px | 6 × 4 in                 |

Browser image exports may label metadata as 96 DPI; the pixel count is the source of print resolution. The print stylesheet specifies physical paper size. Select actual size / 100% scale, matching media and orientation, and disable browser headers/footers. Physical margins depend on the printer. Printing opens the OS/browser dialog; silent printing requires a future dedicated printer bridge. `printCanvas` in `src/features/photostrip/compose.ts` is the integration boundary.

## Offline / installed app

```powershell
npm run build
npm run preview
```

Offline caching is enabled only in production builds. Visit the preview or deployed HTTPS site and wait for **Ready for offline memories** in the footer before disconnecting. Reload while offline and use Solo or Event mode normally. Install from Chrome/Edge’s install control or iOS Safari’s Share → Add to Home Screen. Browser install eligibility varies. PNG app icons and all sample photos are bundled locally; no remote fonts or runtime image requests are required.

`scripts/offline-plugin.ts` generates a versioned service worker from built asset hashes. It precaches only the app shell and bundled assets. Navigations return the cached shell without storing the visited URL. API calls, Supabase traffic, invitation credentials, and user photos are never put in Cache Storage. Photos saved as drafts use Dexie separately. Updates wait for the user to finish and press **Update app**. Browser storage can be evicted; download important memories.

## Countdown videos (optional live-photo experience)

On the local capture screen, turn on **Live photo · save countdown videos** before starting. Each countdown records a short, mirrored, silent camera clip, then the still image is captured when the countdown reaches zero. Recording is off by default and is not saved as a preference. A clear recording indicator appears only while a clip is being recorded. No microphone permission is requested, and no video is uploaded.

On the result screen, choose **Create framed video** to combine the moving clips inside the same layout, frame color, filters, caption, text, stickers, date, and logo as your still keepsake. The clips play together and the video finishes with one second of the completed still composition. Missing clips use their corresponding still photos. Video export uses the selected template’s exact pixel dimensions, including 1080 × 1920 for Stories. Transparent photo frames use cream for video because the browser video formats do not reliably preserve alpha. Changing the layout or decorations invalidates the generated video so you can create an updated version. Creation takes approximately the video’s playback time; keep the tab visible. Cancel and leaving the result screen release the temporary recording resources. Video creation/playback extends the kiosk result timer when started.

Original camera clips remain available under **Individual camera clips (without frame)**. These are separate MP4 or WebM files based on the browser’s supported MediaRecorder encoder, not native Apple Live Photo files. Original clips are capped at a 1280-pixel longest edge and held in memory only, with per-clip size/time limits; still photos retain their independent capture quality. Stopping a sequence discards the current unfinished clip. A successful retake replaces that moment’s still and clip together. Download before closing/reloading the tab, starting fresh, or kiosk reset; optional IndexedDB drafts contain still photos only. Unsupported browsers keep the still-only experience available. This feature applies to local and kiosk capture; online rooms continue using synchronized still photos. All video rendering stays on-device and also works offline after caching.

## Facebook and Instagram stories

Choose **Facebook / Instagram Story** in the editor’s Layout menu or the result screen’s Output size menu. Snappie recomposes the original captures on a **1080 × 1920 px (9:16)** canvas with extra space above and below the photos. PNG and JPG downloads use those actual dimensions. Download the image, open Facebook or Instagram, choose Create story, and select the saved image. The apps may add interface overlays or apply compression.

**Share image** opens the device share sheet when the browser supports sharing image files and the device offers compatible apps. It does not guarantee a Facebook/Instagram target or a direct Stories destination, and never posts automatically. If file sharing is unavailable, the app explains how to download and post manually. A file is prepared before the tap so supported browsers retain the user gesture required by the [Web Share API](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). Story output is for screens; choose a strip or postcard for printing.

## Event kiosk

Open `/kiosk/settings`, set a device-local 4–8 digit admin PIN, then configure the event name/date, logo, photo count, countdown, print template, and automatic result reset. Open `/kiosk` and use the fullscreen control. The large start control begins the same real camera workflow. Results automatically clear and return to the welcome screen after the configured timeout; guests can request more time. Welcome idle state refreshes after two minutes. Abandoned capture and editor screens return to welcome after two minutes without touch or keyboard input and release the camera.

The PIN hash and preferences live in localStorage. It deters casual guest access; someone with DevTools or access to browser storage can reset it. For a public unattended installation use the operating system’s managed kiosk profile. Preferences are intentionally shared between Solo and Kiosk. Event logos are local only. Completed guest photos are not saved automatically.

## Configure Online Together

1. Create a Supabase project. Enable **Authentication → Providers → Anonymous Sign-Ins**. For public deployment, enable supported CAPTCHA / abuse controls and rate limits for anonymous signup. The create-room RPC limits each identity to three active rooms but does not prevent identity farming or passcode guessing by itself; add gateway rate limiting before high-traffic public launch.
2. Apply `supabase/migrations/001_private_rooms.sql` with the Supabase SQL editor, or initialize/link the Supabase CLI project and run `supabase db push`. Apply this migration once to a fresh schema. The SQL uses `pgcrypto` in `extensions` and private Realtime authorization policies on `realtime.messages`.
3. Keep **public Realtime channel access disabled** for this project. The app subscribes with `private: true`; only authenticated live room members can access `room:<uuid>`. No table replication or Storage bucket is needed.
4. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` using the public project URL and publishable/anon key. **Never** put a service-role key in a `VITE_` variable. Restart Vite. For deployment, set these build-time variables in your hosting provider and rebuild.
5. Configure `VITE_ICE_SERVERS` as a JSON array. STUN-only works on some networks; a production service needs TURN for restrictive NATs/firewalls. Example (replace with your provider):

```dotenv
VITE_ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turns:turn.example.com:5349","username":"short-lived-user","credential":"short-lived-credential"}]
```

All Vite variables are visible to browsers. For production TURN, replace the static configuration boundary in `src/services/webrtc/peer.ts` with an authenticated endpoint that returns expiring credentials; keep the long-lived TURN issuer secret on that server. Static credentials in an example are not a production secret-management solution.

### Two-device walkthrough

Host: open Online Together, enter a nickname, room name, and optional passcode. Copy the invitation. Guest: open it in a separate browser/device, enter a nickname and passcode if set. Each participant enables a camera and presses **Connect with your person**. Wait for both live feeds, then each presses **I’m ready**. The host starts the shared sequence. Both can optionally enable a microphone separately or toggle their camera. Both wait for all paired images, then open the editor and download their own copy. Leaving for the editor ends that participant’s live connection. The host may close the room explicitly before leaving.

Use **Reconnect** on both devices after a disconnection or transfer failure, mark both ready, and retry the sequence. The MVP reserves its two membership slots until expiry; refreshing the same tab preserves anonymous identity in sessionStorage. A new browser profile or tab may create a new identity and cannot evict an existing participant. Close/create a fresh room if a different person needs the slot.

### Privacy and authorization

- Room IDs are random UUIDs plus a random 256-bit invitation key carried in the URL fragment. The fragment is not sent in HTTP navigation requests. Share links only with the intended person. Passcodes are separately bcrypt hashed; invite keys are SHA-256 hashed in the database.
- Guests must present the invitation and optional passcode to an atomic join RPC. A row lock enforces the two-participant limit. Direct room/table access is revoked. Security-definer functions use an empty search path and qualified object names. Room status returns no password or invitation hashes. Only the host can close a room.
- Anonymous auth sessions use **sessionStorage**, not the offline cache. Supabase stores identities, room name, nicknames, timestamps, and membership; photos are not uploaded to Supabase.
- Audio/video and captured photos use encrypted WebRTC. A TURN relay may carry encrypted media/data. Your partner receives your photos and can save them. No cloud photo saving is implemented, so no automatic cloud upload or storage consent is implied.
- A 12 KB, ordered DataChannel protocol uses transfer IDs, indexed chunks, bounded size, backpressure, SHA-256 verification, positive acknowledgement, and a 45-second timeout. A failed transfer is surfaced and the session can be restarted. There is no indefinite buffering or permanent cloud dependency.
- Countdown messages carry future host timestamps. Ping/pong samples estimate peer clock offset and latency. Each participant captures its own mirrored camera; both images must arrive before a paired image is composed. This approximates synchronization; internet latency and browser scheduling prevent pixel-perfect simultaneous frames.
- Rooms expire 30 minutes after their last active heartbeat. RPCs and channel admission reject expired/closed rooms immediately; open clients check status every 30 seconds. Optional `pg_cron` cleanup SQL is included in the migration for deleting expired rows after one day. Supabase auth-user retention should be configured separately. Channel authorization is evaluated when subscribing; closing also signals the peer and stops the live client connection, with heartbeat as fallback.
- Capacity is centralized in the join RPC. The peer service and composition helper are isolated, but adding 3–4 people requires a peer mesh/SFU, participant-specific transfer IDs, UI changes, and a new capacity rule; do not simply increase the SQL count.

## Tests

```powershell
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

Vitest/Testing Library cover settings, print dimensions/filter composition, verified chunk transport, corruption rejection, size/order validation, and timeouts. Playwright serves `dist` and uses Chromium’s **synthetic test camera** via launch flags; it does not use your physical camera. It covers four captures, an individual retake, editing, draft save, actual PNG signature/dimensions, offline reload/capture/download, kiosk PIN/print output, camera denial recovery, missing Supabase setup, and mobile overflow. Browser screenshots are written under `test-results`. Playwright starts and stops its own preview server.

For opt-in authorization checks against a staging project, run `npm run test:rooms`. This creates three temporary anonymous identities and an expiring room, checks invitation/passcode rejection (including null inputs), concurrent room capacity, and host-only closure, then closes the room. This requires configured credentials and is not run by the default suite. Anonymous test identities follow your Supabase retention policy.

The automated suite does not prove real-device camera compatibility, physical printer behavior, or two-device Supabase/TURN connectivity. Run the two-device walkthrough above against your configured project and networks before production launch. The included migration should be exercised in a staging Supabase project and reviewed alongside your existing policies. Do not treat the integration code as an already-provisioned backend.

## Build and deploy

```powershell
npm ci
npm test
npm run build
```

Deploy `dist` over HTTPS. `vercel.json` contains the build settings and SPA rewrites for Vercel. `netlify.toml`, `public/_redirects`, and `public/_headers` support Netlify. On either provider, import the source repository, select Node 24, set the optional Supabase/TURN build variables, and deploy. Routes such as `/join/:id` must fall back to `index.html`; static assets and `/sw.js` must remain real files. Serve the service worker without long-lived caching. Security headers allow this origin’s cameras and microphones and suppress referrers. Keep invitations private even though the room ID and fragment are difficult to guess.

The `.openai/hosting.json` manifest also supports a private Sites preview publication. That preview does not provision Supabase. The recommended general public deployment path remains Vercel/Netlify plus your configured Supabase project. Public access is a separate deliberate hosting decision.

## Source map

`src/pages` holds routed experiences; `features/camera` owns MediaDevices lifecycle; `features/photostrip` handles high-resolution composition/export/printing; `services/webrtc` handles signaling, media and verified image transport; `services/supabase` handles anonymous identity and RPC calls; `services/storage` owns opt-in drafts; `stores/booth.ts` separates in-memory photos from persisted preferences. `scripts/offline-plugin.ts` generates the minimal asset cache. No backend credentials are necessary for Solo and Kiosk.

Sample imagery: locally bundled photos from [Unsplash portrait](https://images.unsplash.com/photo-1524504388940-b1c1722653e1), [Unsplash friends](https://images.unsplash.com/photo-1529156069898-49953e39b3ac), and [Unsplash smile](https://images.unsplash.com/photo-1517841905240-472988babdf9). These are decorative inspiration only, never substituted for a user camera feed.
