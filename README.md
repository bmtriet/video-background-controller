# Event Video Player

A local two-display playback application for conferences and live events. One Node.js process owns playback state, SQLite configuration, media scanning and real-time synchronization. The React Controller and audience Player run in Chrome. No internet service, account, Electron, Docker or external database is required.

## Requirements

- Node.js **22.12 or newer** (Node 24 LTS recommended), npm and current Google Chrome.
- Windows 10/11 or macOS; a second display configured as an **extended desktop** for audience output.
- MP4 with H.264/AAC is the most practical video format. WEBM and MOV are listed, but playback depends on Chrome supporting the actual codecs inside the file. The app does not transcode video.
- `better-sqlite3` uses a native binding. npm normally downloads a matching prebuilt binding. If unavailable for your Node/OS version, use a supported Node LTS release, or install the platform's C++ build tools. No native toolchain is needed when a prebuilt binding is available.

## Installation and startup

Open a terminal in this project folder:

```sh
npm install
npm run build
npm start
```

Open:

- Controller: <http://localhost:3000/controller>
- Player: <http://localhost:3000/player>

Keep the terminal running during the event. To stop the server, press Ctrl+C. Configuration is saved as you edit. On every server startup, playback starts **STOPPED** and the audience output stays black; the selected item and playlist are remembered.

On macOS, Linux, or Windows with Git Bash, you can also run `./start.sh`. It installs dependencies when needed, builds the current source, starts the server, waits for readiness, and opens only the Controller in Chrome. Click **Open Player** when you want to open the audience window, move it to the audience display, and enter fullscreen manually. Ctrl+C stops the server. If Chrome cannot be found, the script prints the Controller URL for manual opening.

The server binds to `127.0.0.1`, so this is a local-computer application. Set `PORT` to use a different port if needed. Run all commands from the project root. `EVENT_PLAYER_ROOT` can point the server to a different application root containing its `data`, `media`, and `dist/frontend` directories.

### Development

```sh
npm run dev
```

Open <http://localhost:5173/controller> and <http://localhost:5173/player>. Vite provides frontend hot reload and proxies REST, media and Socket.IO to the backend on port 3000. Use port **5173** for frontend development; use port **3000** after a production build.

```sh
npm test
npm run build
```

The integration test uses a temporary directory and an ephemeral port. It checks initial setup, REST CRUD, logo upload, file watcher updates, missing/restored files, Socket.IO synchronization, playback/pause/seek/stop, stale end-message rejection, auto-advance, event duplication, reorder validation and SQLite persistence after restart. Its MP4 fixture only tests scanning and references, not browser decoding. Actual Chrome playback was separately smoke-tested with a temporary playable MP4.

## macOS presentation playlist

Add **Thêm thuyết trình**, select PPTX, speaker PNG and optional muted looping background. A presentation stays live until **Kết thúc & tiếp tục** or manual transport. PowerPoint Reading View uses the left ¾ and can expand/restore while preserving the slide. Keep Chrome in a normal window at 100% zoom on the same Desktop as PowerPoint. Build, restart the server, and reload Controller/Player to enable this feature. See [the integrated guide](docs/presentation.md).

## macOS presentation prototype

Run `npm run build` then `npm run presentation:test` and open
<http://localhost:3001/presentation-test>. This independent prototype places
PowerPoint Reading View in front of a Chrome stage, with a muted looping video
and speaker PNG. It requires installed PowerPoint and the macOS command-line
Swift compiler. It does not change the event playlist. See
[the trial guide](docs/presentation-test.md) for setup, permissions and limits.

## Folder structure

```text
server/
  index.ts       Express, REST routes, Socket.IO and startup
  store.ts       SQLite schema, validation and configuration storage
  scanner.ts     Recursive startup scan and chokidar watcher
  runtime.ts     Authoritative playback clock and command handling
frontend/
  src/
    Controller.tsx   Library, playlist, visual editor and transport
    Player.tsx       Audience page and automatic playback
    Renderer.tsx     Shared video/image/ad composition engine
    services.ts      REST and Socket.IO abstraction
    style.css
shared/types.ts
tests/application.test.ts
media/
  videos/
  ads/
  images/
  logos/
  backgrounds/
data/event-player.db
dist/            Created by npm run build
```

Folders, database tables and a default **My Event** are created automatically. Three disabled sample entries demonstrate Opening Video, Diamond Sponsor and Gold Sponsor; assign your own media before enabling them. No large sample videos are bundled.

## Add videos and images

Copy files directly into `media/videos/`, `media/ads/`, `media/images/`, `media/logos/` or `media/backgrounds/`. Subfolders are supported. The watcher waits for copying to settle and then updates the Controller automatically. Use the refresh icon beside Media library to rescan manually.

Supported extensions: `.mp4`, `.webm`, `.mov`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.svg`. The Library shows filenames, relative paths, types and missing-file warnings. Search and All / Videos / Images / Logos tabs filter the list. Images includes all images, and Logos filters the logos folder.

Click **+** next to a video to add a fullscreen video; next to an image to create an ad entry with that main image. Select a playlist entry to set its name, duration, playback rate, enabled state, volume and mute setting. Text and numeric edits save when the field loses focus; select menus and checkboxes save immediately. There is no global Save button.

When a file disappears, its stable database reference and playlist configuration are kept. Restoring a file at the same relative path restores that reference. Required missing media prevents sending an item live. If the next enabled entry is missing media, playback stops to black and reports an error rather than skipping unpredictably.

Missing files have a trash button in Media Library. Confirm **Xóa khỏi danh sách** to remove the missing entry from the active event's library view; this choice saves automatically. Playlist references remain available for replacement. If the physical file is restored at the same path, it appears in the library again.

PowerPoint is not rendered directly. Export slides as PNG/JPG and place them in the images folder.

## Configure sponsor advertisements

1. Click **Add advertisement** to open the full-screen setup dialog. For an existing ad, use its pencil icon in the playlist or **Setup quảng cáo** in Item properties.
2. Enter the sponsor name and tier. Selecting a tier sets its default duration: Diamond 60s, Gold 45s, Silver/Bronze 30s, Co-sponsor 15s. You may override it.
3. Choose **Video | Logos** (75% video, 25% logos), **Ảnh ⅔ | Logos ⅓**, **2 ảnh ⅔ | Logos ⅓**, or **3 ảnh ⅔ | Logos ⅓**. Image layouts place one, two or three equal-width image columns inside the left two-thirds, with a logo panel on the right third. Each supports logo upload, scale and company captions. The redundant standalone one-image option is removed from the dialog. Existing **Dual Media + Logo** ads remain editable.
4. Click **Tải file** on a source slot to upload directly from your computer, or choose its file from the visual library on the right. The picker also has an upload button for the selected slot. Uploaded files are assigned immediately to that slot and appear in Preview and the library. Video slots accept clips; image and logo slots accept images. Use **Thêm logo** to add up to 12 logos to the right column. Logos stack vertically, using two columns within the logo panel for more than four logos. Each image column has its own image selector. Images preserve their proportions.
5. Configure playback rate, item audio and background. Under **BACKGROUND → Nguồn nền**, choose a solid color, image or **Video nền**, then assign the file from the picker. Background videos default to muted and looping; **Tắt tiếng video nền** and **Lặp video nền** control them independently of the main video. Background clips fill the composition using `object-fit: cover`, play at normal speed, follow pause/seek, and never send video-end notifications that advance the playlist. When looping is disabled, a short background video holds its last frame. Transparent artwork and unused space reveal the video behind the foreground media.
6. The dialog previews the composition privately with muted audio. Click **Thêm vào playlist** or **Lưu quảng cáo** to apply it; closing the dialog discards unsaved changes. The save button requires all composition slots to have available files. Image layouts advance by their configured duration, including in Video End mode.
7. Drag the grip at the left of a playlist entry to reorder it. The order saves immediately.
8. Click **Go live**, or double-click the playlist entry, to send it to the audience.

The logo picker accepts existing images from any media folder. Direct dialog uploads accept PNG, JPG/JPEG, WEBP and static SVG up to 20 MB, or MP4, WEBM and MOV up to 1 GB. Safe unique filenames prevent overwriting existing files. Video uploads stream to disk and become visible only after the entire upload is validated. Upload progress appears in the dialog. Active SVG content is rejected. For locally copied SVG files, use static artwork from trusted sources. The legacy `/api/logos/upload` endpoint still accepts images up to 5 MB.

Main and secondary media uploads are saved in `media/ads/`, logos in `media/logos/`, and background images/videos in `media/backgrounds/`. You can also copy files into these folders; the watcher adds them to the picker automatically. Uploading adds a reusable library file; the playlist composition is committed with **Lưu quảng cáo** / **Thêm vào playlist**. Closing a draft leaves uploaded files in the library. The library's add button for an image opens an image/logo draft with that image already assigned; choose a logo before saving.

Image thumbnails, foreground images, logos, videos and backgrounds use neutral `/content/<media-id>` URLs instead of exposing folder names such as `/ads/`, which browser ad filters can block. Physical media filenames/folders remain unchanged. The endpoint preserves image MIME types and video range requests and applies the same media-root checks as the legacy `/media/` route. Failed thumbnails show a load-error icon, and failed preview images report the filename in the dialog footer. Restart the server and reload the Controller/Player to enable neutral content URLs; older servers still use the compatible legacy path.

Previously saved standalone image layouts continue playing as configured. Opening their setup dialog prepares the corresponding image/logo layout, preserving the image selections; choose the logo files and save to apply the new layout. Editing a draft does not change the current audience output. Existing one-/two-/three-image-only configurations are not rewritten automatically.

Under **KHUNG ẢNH / VIDEO**, adjust **Bo góc** from 0 to 50px and **Khoảng cách các cạnh** from 0 to 100px. The default spacing is 20px around the composition and between foreground slots, keeping videos and images away from the edges. Fullscreen videos have these same sliders in Item properties. Zero radius disables the mask; older items with rounding enabled retain their 50px radius. The mask follows the actual visible media edges, including portrait or letterboxed files, while preserving aspect ratio. Cut-out corners and spacing reveal the background; logos and background media retain their original shape. These settings save per playlist item and apply in Preview and Player.

Each assigned logo has a **Scale logo** slider below its source slot, from 10% to 200%, defaulting to 100%. Scaling stays centered in that logo's panel, changes the preview immediately and saves with the advertisement. Values above 100% enlarge the logo within its panel and may crop its edges. Replacing a logo starts the new logo at 100%; removing a logo also removes its saved scale.

The ad setup dialog keeps a 16:9 Preview visible above an independently scrolling source/logo configuration area. Select a logo to open its controls, or use its arrow to collapse them. **Phóng to / Thu nhỏ** enlarges the same Preview without restarting playback or losing the configuration scroll position; Escape returns from the enlarged view. Save and Cancel stay at the bottom of the dialog.

For layouts with logos, click **Bật text · Tên công ty** under each logo to enter its company name. Use the multiline text box and press Enter to choose line breaks. The name sits directly below the logo, centered, preserves those line breaks, and wraps long names. Customize **Màu chữ**, **Màu stroke**, **Bold**, **Font size** (12–120px) and **Stroke** (0–6px; zero turns the outline off). Font and stroke sizes refer to a 1080p output and scale proportionally in Preview and other output sizes. Logo scale stays independent of text size, and the logo reserves space above its caption. Text defaults to off; the initial style is white, bold, 32px, with a black 2px outline.

**Set default** immediately saves the current typography as the app-wide default, shared across events and retained after restart. It stores no company name or enabled flag, and does not change existing captions. New captions start with this style; **Dùng default** applies it to an existing caption while retaining its name and toggle. Default-style saving is separate from saving the ad, so closing an unsaved draft retains an explicitly saved default. Use **Lưu quảng cáo** to commit company names and per-logo styles to the playlist. Removing/replacing a logo removes its prior caption; a new logo starts with text off and a blank name. Existing captions survive playlist/event duplication. Restart the app and reload Controller/Player after updating to enable caption/default saving on an older running server.

For any image layout, enable **Cuộn ảnh từ trên xuống (Ken Burns)** to reveal the top of each image first and its bottom at the end of the advertisement, with a gentle 4% zoom. Images fill their slots without distortion, with edges cropped as needed; tall posters pan through their full height. The effect spans the configured advertisement duration and follows the live playback clock, including pause/resume, seek and Player reload. Preview repeats the motion locally. Logos and background images stay stationary, and existing radius/gap settings still apply. The option defaults to off, which shows the complete image using `object-fit: contain`. One toggle controls every image column in the advertisement and saves with the item.

After installing this update, restart the application with `./start.sh` when convenient so the server can accept the image/logo column layouts, neutral media URLs, image scrolling, logo lists, video backgrounds and direct media uploads. Reload the Controller and Player to use the updated renderer. The dialog disables saving unsupported features while connected to an older server; existing image uploads continue to work with the legacy 5 MB limit. Existing playlist configurations are retained.

Videos, logos and stationary images use `object-fit: contain`; aspect ratio is preserved. Two videos use the same item playback rate and each receives the item/global volume settings. Mute the item when two audio sources should not mix. The **main slot** supplies video-end notifications; the secondary slot does not end the entire ad. In configured-duration mode, a shorter video holds its last frame until the item's time expires.

## Preview, live output and transport

- **Preview** is Controller-only and always muted. Videos loop for inspection. It does not change audience playback.
- Click **Thu gọn / Mở rộng** in the **Live output / Preview** header to reclaim playlist space. The Controller remembers this view preference after reload; selecting a monitor tab or an item’s Preview action expands it. Collapsing only hides the local monitor and leaves audience playback running.
- **Live output** and **Preview** on the Controller enforce mute and zero local volume for every video, including background and secondary videos. Play, switching items, and changing item/master volume keep these monitors silent. Audience audio remains controlled by the Player and its configured volume/mute settings.
- Player audio fades in over **0.5 seconds** when a video starts and fades out over its final **0.5 seconds**, including configured-duration cutoffs and looping videos. Switching entries keeps the outgoing video playing briefly while its audio fades out and the incoming video's audio fades in. Short clips use shorter ramps. Unmuted secondary/background videos also receive the fade; Controller monitors stay silent. Reload the Player after updating the build to load this behavior.
- **Play** starts the selected enabled item. After Pause, Play resumes the current item. **Go live** or double-click always starts the chosen item from the beginning.
- **Previous / Next** start the previous/next enabled entry; disabled entries are skipped.
- In **Event playlist**, choose **Start from → End here** and enable **Loop list** to repeat only that inclusive section. Next/automatic advance wraps from its last enabled row back to its first; Previous wraps in the opposite direction. Disabled rows inside the section are skipped. Play/Go live on a row outside the section starts its first enabled row. Enabling/changing the section during playback lets the current row finish before the next transition enters the new section. A section with no enabled rows stops instead of falling back to the full list. A one-row section repeats that row.
- The selected loop section is marked in the playlist, with **START FROM / END HERE** labels at its boundaries. Clear the boundaries using **Chọn toàn playlist** to loop the whole list. Turning Loop list off restores normal traversal and retains the chosen boundaries for later. These settings save per event. Dragging rows keeps the boundaries attached to their item IDs; if their order crosses, start/end swap to cover the section between them in the new order. Deleting a boundary shrinks the section to its remaining rows; deleting its sole row disables loop. Duplicated events receive the corresponding boundaries on their copied rows. Restart the app and reload the Controller to enable this feature on an older running server.
- **Stop** immediately clears the audience to black.
- Fullscreen-video rows have a **Repeat 1** icon. Toggle it to repeat that video's entire source indefinitely, ignoring configured duration and auto-advance. The icon turns green and the remaining-time display shows **∞**. Pause/resume still work; Previous, Next and Stop remain manual overrides. Turning loop off starts one normal pass from the beginning, then the event's regular advance mode applies. The setting saves automatically with the playlist item.
- The large timer shows configured seconds remaining; master volume multiplies the per-item volume.
- The top bar distinguishes Player disconnected from Server disconnected. Multiple connected Players receive the same state. The Player automatically displays current content when it connects or reloads, without buttons or overlays.

Single-video loop requires the updated backend and Player bundle. If the server is an older running version, the icon is disabled with a restart hint. Stop and restart the server with `./start.sh` when it is safe for the event, then reload any older Player windows. Updating the build alone does not restart an active server.
- Player alerts are shown as notifications and in the alert log at the lower right.

Click the gear icon for event management (create, rename, select, duplicate, delete), advance mode, playlist looping, seek and player resynchronization. Deleting an event does not remove any physical media files. Switching events stops playback; the UI asks for confirmation if playback is active. Playlist/event deletion also asks for confirmation.

### Advance modes

- **Whichever comes first** (default): configured wall-clock duration or main video end.
- **Configured duration**: use the configured wall-clock duration, even when the video ends early.
- **Video end**: main video end controls advance; image-only entries use configured duration.

Playback rate changes the speed of the actual video, not the configured wall-clock duration. The playlist stops to black at its end unless Loop list is enabled; with chosen boundaries, the server loops only that section. A video's Repeat 1 setting still holds that video until Previous/Next/Stop is used. The server's duration timer operates independently of the Controller. VIDEO_END needs a connected Player with successful video playback to report a main video end.

## Two monitors and fullscreen

1. In Windows/macOS display settings, use **Extend**, not Mirror/Duplicate.
2. Open Controller on the operator display.
3. Use **Open Player**. Move that Chrome tab into its own window and move the window onto the projector/LED display.
4. Open the Player from the Controller's **Open Player** button when ready. Use Chrome's fullscreen menu if you want fullscreen. The Player has no fullscreen button, key handler or fullscreen API calls. `./start.sh` opens only the Controller and does not request fullscreen.
5. Return to the Controller and operate the playlist. The Player stays on the same page, so item changes keep fullscreen active.

The audience page never shows buttons, instructions or a dimming overlay, even outside fullscreen. The mouse cursor is hidden. Before playback and after Stop, the entire audience output is black. Fullscreen is controlled manually through Chrome (View → Enter Full Screen on macOS, F11 on Windows/Linux).

Reloading the Player immediately restores the current server composition, status and video position. There is no initialization gate or fullscreen request. Any browser fullscreen mode you enabled manually remains controlled by Chrome. Reloading the Controller does not affect audience playback.

If Chrome blocks audio autoplay, the video automatically retries muted so the audience still sees the content. A warning appears only in the Controller. Click or press a key in the Player once to enable sound. `./start.sh` does not configure a separate Player profile or autoplay flags.

### Keyboard shortcuts

| Location | Key | Action |
| --- | --- | --- |
| Controller | Space | Play / pause |
| Controller | Right arrow | Next enabled item |
| Controller | Left arrow | Previous enabled item |
| Player | Esc | Browser exit fullscreen |

Controller shortcuts are ignored while editing input/select/text fields, using the drag grip, or while the settings dialog is open.

## Persistence and recovery

SQLite uses WAL mode and foreign keys. Events, per-event settings, playlist order and all item configuration are persisted. The schema stores typed media references with stable IDs; item configuration is stored as JSON per playlist row to keep the small local application easy to extend. API validation enforces media references, image/video types, volumes, layouts, rates and duration limits. Events are separate rows, so each event owns its own playlist and settings.

Keep `data/` and `media/` when updating the application. To back up, stop the server and copy both directories. Do not copy only the `.db` file while the server is writing: SQLite may also have `-wal` and `-shm` files. Deleting a playlist/event cannot be undone in the UI; use a backup to recover deleted configuration.

On a socket disconnect, the Player keeps its last composition and active video where possible. The server remains the source of truth. On reconnect, the complete event, media, playlist and current runtime state synchronize automatically. A server restart deliberately resets playback to STOPPED. Use **Resynchronize player** to rebuild media elements without reloading the audience page or exiting fullscreen.

## Troubleshooting

- **Player disconnected:** open `/player` using the same local server, check the terminal and confirm Chrome is still running. The Player displays current content automatically after connecting.
- **Server disconnected:** restart with `npm start`. The Controller reconnects automatically. Build first if `dist/server.js` is missing.
- **Black output:** check STOPPED state, enabled checkbox and missing media. Disabled sample entries will not play. No initialization button or click is required.
- **Autoplay audio blocked:** the video continues muted and reports the blocked audio only to the Controller. Click or press a key in the Player to enable sound; check site sound permissions and the configured mute/volume settings too.
- **Unable to load media:** check the path and extension, try a browser-compatible H.264/AAC MP4, and make sure the file finished copying. A MOV extension alone does not guarantee compatible codecs.
- **Upload failed:** use a supported image up to 20 MB or video up to 1 GB. SVG containing script, external links or active content is rejected. Video container signatures are checked; the codec must also be playable by Chrome. If video upload is disabled, restart the server with `./start.sh` to enable the updated upload route.
- **Video advances earlier than expected:** choose Configured duration, or account for the selected playback rate and actual video length.
- **Output is letterboxed:** contain mode preserves media aspect ratio. Export the source at your desired screen/slot aspect ratio if you want less empty space.
- **Port already in use:** stop the other local server or set `PORT` to another number. In development also adjust the Vite proxy if changing the backend port.
- **Native SQLite install error:** use Node 24 LTS, reinstall dependencies and verify npm allows dependency install scripts. The app needs the better-sqlite3 native binding.

For a live event, use the production build, rehearse with the exact media and projector, disable computer sleep, keep Chrome visible, and verify the audio output device. Physical two-monitor placement and projector/audio hardware must be checked on the actual event computer.

## API and real-time protocol

Persistent REST resources:

```text
GET/POST /api/events
PUT/DELETE /api/events/:id
POST /api/events/:id/duplicate
GET /api/media
POST /api/media/rescan
GET/POST /api/playlist
PUT/DELETE /api/playlist/:id
POST /api/playlist/reorder       { ids: [...] }
POST /api/logos/upload          multipart field: logo
POST /api/media/upload/:category multipart field: file; category: ads, logos, backgrounds
PUT /api/settings
GET /api/state
GET /api/health
```

Socket clients connect with `auth.role` set to `controller` or `player`. Controllers send `controller:play` (`{itemId}` optional), `pause`, `stop`, `next`, `previous`, `seek` (`{seconds}`), `select-item` (`{itemId}`), `set-volume` (`{volume}`), and `refresh-player`. Command acknowledgments return `{ok:true}` or `{error}`. The server broadcasts `sync`, `player:state`, `playlist:updated`, `media:updated`, `event:updated`, `player:connection`, `player:refresh`, and `operation:error`. Players report `player:ended` with item ID and generation; stale reports are ignored. Runtime ticks are sent four times per second and the UI interpolates elapsed time locally.
