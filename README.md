# 📱 YouTube Shorts Player (Pure JS)

A clean, modern, high-performance vertical YouTube Shorts player built with **pure vanilla JavaScript, HTML5, and CSS3**. Designed to run directly on **GitHub Pages** with zero backend servers, zero dependencies, and zero build steps.

All videos are configured through a single [`video.json`](video.json) file in your repository:

```json
[
  "https://www.youtube.com/shorts/kJQP7kiw5Fk",
  "https://www.youtube.com/shorts/9bZkp7q19f0",
  "https://www.youtube.com/shorts/M7lc1UVf-VE",
  "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube.com/shorts/L_LUpnjgPso"
]
```

---

## ✨ Features

- **Pure JavaScript & Zero Dependencies**: 100% Vanilla JS, HTML5, and CSS3. No React, no Vue, no `node_modules`.
- **Pure Video View (Zero Overlays)**: Fullscreen video with no top bars, playlist controls, or next buttons.
- **Progressive Web App (PWA)**: Installable as a standalone, native-feeling fullscreen app on iOS, Android, and Desktop.
- **JSON-Driven Video Feed**: All video links live cleanly in `video.json`.
- **Strictly Vertical (9:16) & No Auto-Rotate**:
  - Locked 9:16 portrait aspect ratio.
  - Maintains strict vertical orientation even if a phone is turned sideways—never stretches or switches to horizontal widescreen.
  - Desktop view features a mobile shell with ambient blurred lighting.
- **Swipe Up / Down Gestures**:
  - **Mobile**: Native-feeling vertical touch swipes.
  - **Desktop**: Mouse drag gestures, mouse wheel / trackpad scrolling, and floating navigation arrows.
- **Click to Play & Pause**:
  - Tap or click anywhere on the video to instantly toggle Play/Pause.
  - Displays animated center pop ripples (`▶` / `⏸`) just like YouTube Shorts & TikTok.
  - Transparent gesture overlay ensures clicks and swipes are never trapped by cross-origin iframes.
- **Audio Autoplay Policy Compliance**:
  - Starts safely muted for guaranteed browser autoplay.
  - Features an intuitive **"Tap anywhere to unmute"** banner and a dedicated sound toggle button.
- **Smart Resource Management**:
  - Dynamically initializes players as needed and preloads adjacent shorts.
  - Destroys distant iframes to ensure smooth 60fps performance and zero audio crosstalk.
- **Interactive Controls**:
  - Like button with burst animation and counter.
  - Share button with 1-click clipboard copy.
  - Live progress bar indicator at the bottom.
  - External link to open the original short on YouTube.

---

## 🚀 How to Deploy on GitHub Pages (Free Hosting)

1. **Push this repository to GitHub**:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: YouTube Shorts Player"
   git branch -M main
   git remote add origin https://github.com/<YOUR-USERNAME>/<YOUR-REPO-NAME>.git
   git push -u origin main
   ```

2. **Enable GitHub Pages**:
   - Go to your repository on GitHub.
   - Click **Settings** ➔ **Pages** (under Code and automation).
   - Under **Build and deployment** ➔ **Source**, select **Deploy from a branch**.
   - Under **Branch**, choose `main` / `root` and click **Save**.
   - In 1–2 minutes, your live URL will be active at:
     `https://<YOUR-USERNAME>.github.io/<YOUR-REPO-NAME>/`

---

## 🎬 How to Add or Change Videos

To change the shorts shown in the player, open [`videos.json`](videos.json) directly in your repository or on GitHub and add your favorite video links.

### Flexible JSON Format

You can paste full YouTube Shorts URLs, standard watch URLs, short `youtu.be` links, or raw 11-character video IDs:

```json
[
  {
    "url": "https://www.youtube.com/shorts/kJQP7kiw5Fk",
    "title": "Incredible Duo Trickshots 🎯",
    "channel": "TrickShots",
    "description": "Never give up on the first try! #shorts #viral #trickshot"
  },
  {
    "url": "https://youtu.be/9bZkp7q19f0",
    "title": "Smooth Dance Moves 🔥",
    "channel": "DanceDaily",
    "description": "Rate this performance from 1 to 10! #shorts #dance"
  },
  {
    "id": "dQw4w9WgXcQ",
    "title": "Classic Jam 🎶",
    "channel": "MusicLover"
  }
]
```

Or simply an array of links:

```json
[
  "https://www.youtube.com/shorts/kJQP7kiw5Fk",
  "https://www.youtube.com/shorts/9bZkp7q19f0",
  "https://www.youtube.com/shorts/M7lc1UVf-VE"
]
```

The app's extractor automatically parses any of these formats.

---

## ⌨️ Desktop Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `↓` / `Page Down` / `J` | Next Short (Swipe Up) |
| `↑` / `Page Up` / `K` | Previous Short (Swipe Down) |
| `Space` | Play / Pause |
| `M` | Mute / Unmute audio |
| `F` | Toggle Fullscreen |

---

## 📱 How to Install as a Fullscreen PWA App

### On Android (Chrome / Brave / Edge):
1. Open the URL in Chrome on your phone.
2. Tap the **three dots menu** (top right) ➔ **"Install app"** or **"Add to Home screen"**.
3. Tap **Install**. The app will launch in true edge-to-edge fullscreen without any browser address bar!

### On iOS (iPhone / iPad - Safari):
1. Open the URL in Safari.
2. Tap the **Share** button (box with an arrow pointing up).
3. Scroll down and tap **"Add to Home Screen"**.
4. Tap **Add**. The app opens as a native fullscreen app without Safari tabs or address bars.

### On Desktop (Chrome / Edge / Windows / Mac):
1. Click the **Install** icon in the address bar (or Menu ➔ **Install Shorts Player**).
2. It opens in its own borderless window. Press `F` to toggle full-screen at any time.

---

## 💻 Testing Locally

To test locally on your computer with a web server:

```bash
# Using Python 3 (built-in on Linux & macOS)
python3 -m http.server 8080

# Or using Node.js npx
npx serve .
```

Then open `http://localhost:8080` in your browser.

*(Note: If you double-click `index.html` to open it via `file://`, the player automatically uses built-in fallback videos to bypass local browser CORS restrictions).*
