# Saxophone Hero!
A rhythm game for saxophone quartet, electronics, and mobile devices

music composed by Sky Macklay
game design by Max Ardito and Doug O'Connor (with the help of Claude Sonnet 4.6)

special thanks to:
   The Koussevitzky Commission of the Library of Congress, for generous funding
   The DC Commission on the Arts and Humanitites, for generous funding
   Project Fusion Saxophone Quartet (www.projectfusionsq.org), who initiated this effort and helped fund it
   Jason Charney, for the game's proof of concept

---

## Hardware Requirements

- Digital Audio Interface
- Computer / Laptop
- PA or other amplified playback system (plus the needed cables and interconnects to your interface outs)
- 4 cardioid pattern microphones (plus stands/clips and cables)
- In-ear monitoring solution, for click track (this transmitter needs interconnects either to the computer's headphone jack or to a separate interface audio channel out)
- Projector & screen
- Four tablets for performers' reading music and tracking level progression

## System Requirements

- **macOS 10.13 or later**
- **Python 3** — Download from [python.org/downloads](https://www.python.org/downloads/)
- **Node.js** — Download the LTS version from [nodejs.org](https://nodejs.org/)
- **Max** (version 9.1.4 or later) — Free to run existing patches; purchase required to modify

---

## Quick Start

1. Unzip the `Saxophone Hero` folder
2. Double-click **Saxophone Hero Game Launcher.app**
3. Browser windows open automatically
4. Open the Max patch (`sax-hero-max/sax-hero.maxpat`)
5. Connect performers and audience via QR codes
6. Click **Start Game** when ready

---

## First-Time Setup

### macOS Security Warning

The first time you open the app, macOS may show a security warning because the app is not from the App Store.

**To bypass:**

1. Right-click (or Control-click) **Saxophone Hero Game Launcher.app**
2. Select **Open**
3. Click **Open** in the dialog

**Or:**

1. Try to open the app normally (it will be blocked)
2. Go to **System Preferences → Security & Privacy**
3. Click **Open Anyway**

You only need to do this once.

---

## Installation Steps

### 1. Install Python 3

Download and install from [python.org/downloads](https://www.python.org/downloads/).

Choose the macOS installer and follow the default options.

To verify installation, open Terminal and run:

```bash
python3 --version
```

You should see something like `Python 3.x.x`.

### 2. Install Node.js

Download and install the LTS version from [nodejs.org](https://nodejs.org/).

Open the downloaded `.pkg` file and follow the default installation options.

To verify installation, open Terminal and run:

```bash
node --version
```

You should see something like `v20.x.x`.

### 3. Install Node Dependencies

Open Terminal, navigate to the `project` folder inside `Saxophone Hero`:

```bash
cd path/to/Saxophone-Hero/project
```

> **Tip:** Type `cd ` (with a space), then drag the `project` folder into the Terminal window, then press Return.

Run:

```bash
npm install
```

Wait for it to finish. Then run:

```bash
npm install open qrcode osc
```

These additional packages enable:

- **`open`**, **`qrcode`** — Automatically open browser windows with QR codes
- **`osc`** — Send level signals to the Max patch

You only need to do this once (unless setting up on a new computer).

### 4. Install Max Libraries

Open Max (version 9.1.4 or later).

Go to **File → Show Package Manager** and install these three packages:

1. `abclib`
2. `ABL Effect Modules`
3. `CNMAT Externals`

> **Note:** If internet access is limited, these packages are also included at `sax-hero-max/External Packages/`. Install them manually into your Max installation before opening the patch.

### 5. Build the Frontend (one-time setup)

In Terminal, from the `project` folder:

```bash
npm run build
```

This compiles the web interface. You only need to repeat this if you modify frontend code.

If you get a permissions error:

```bash
sudo chown -R $(whoami) dist
npm run build
```

### 6. Configure Ensemble Layout (optional)

If your quartet sits in a different arrangement on stage, edit `project/config.json`:

```json
{
  "voiceOrder": ["baritone", "tenor", "alto", "soprano"],
  "voiceNames": {
    "soprano":  "Soprano",
    "alto":     "Alto",
    "tenor":    "Tenor",
    "baritone": "Baritone"
  },
  "voiceColors": {
    "soprano":  "#a855f7",
    "alto":     "#f7b731",
    "tenor":    "#3b82f6",
    "baritone": "#22c55e"
  }
}
```

**`voiceOrder`** controls the left-to-right column order on the Projection Page (as seen from the audience).

The default is: **Baritone / Tenor / Alto / Soprano** (left to right).

Changes take effect immediately on browser reload — no rebuild needed.

---

## Network Setup

All devices — host laptop, performers' tablets, audience phones — must be on the **same WiFi network**. In addition, for the game time synchronization to be at its best, the server needs to be able to "see" the NTP server online.

### ⚠️ Venue WiFi Often Doesn't Work

Most venue networks use client isolation (devices can't see each other) or have firewalls that block local traffic.

### ✅ Recommended: Bring Your Own Router

Use a dedicated wireless router to create a private network for the performance. This gives you full control and eliminates venue WiFi issues.

> **Bonus:** Configure your router so audience devices can connect without internet access, while the host laptop retains internet for NTP time sync.

Most routers, however, cannot connect to the Wide Area Network (WAN) wirelessly: they need an wired ethernet connection. If your venue has an Ethernet hookup (rare), then you're all set. Otherwise, the method below will work in most scenarios:

**iPhone:**

1. Enable **Personal Hotspot** on your iPhone
2. Connect your Mac to the iPhone hotspot via WiFi
3. Connect the computer to the WiFi router's WAN port (most MBPs require an Ethernet-to-USB-C dongle)
3. On Mac: **System Preferences → Sharing → Internet Sharing**
4. Share connection from: **WiFi**
5. To computers using: **USB 10/100/1000 LAN**
7. Enable Internet Sharing
8. All devices connect to the WiFi router's network (we title ours "Saxophone Hero" for clarity)

In this above scenario:
- The computer will "see" the internet via the iPhone hotspot
- The router will "see" the game server on the computer and distribute its signaling
- The game client / audience member will be able to access the game when logged onto the WiFi network, but not the internet (this is good)

**Android:**

Android allows USB tethering with hotspot sharing directly (simpler than iPhone).

---

## Running the Game

### 1. Launch the App

Double-click **Saxophone Hero Game Launcher.app**.

The app will:

- ✅ Generate a fresh score (balanced across all voices)
- ✅ Start the game server on port 8080
- ✅ Open three browser windows:
  - **Home page** — Start/stop the game
  - **Performer QR code** — For tablets
  - **Projection page** — Display above/behind the ensemble
- ✅ Start the OSC bridge (sends level signals to Max)

Leave the app running for the duration of the performance.

### 2. Open the Max Patch

> **Important:** Open the Max patch *after* the app is running (not before).

Open: `sax-hero-max/sax-hero.maxpat`

The patch connects to the game server on startup. If the server isn't running yet, the connection will fail.

The Max patch will track the level progression from the game and automatically turn on/off the different levels' respective DSP. With proper routing, the only button you need to touch is the Master Out button, once you are ready. 

Once in the Max patch, you will want to:
1. Route your audio: 
- Go to Options --> Audio Status (or find the same area under Preferences), and select the interface through which you are routing audio in and/or out. 
- Then, route the channels by clicking the Audio I/O Mappings button near the bottom left of the window, which should be just to the left of the loudspeaker icon.
- Make sure that the four spot mics from the saxophones are properly routed to channels 1, 2, 3, and 4, regardless of your stage configuration. By default, these channels map to Soprano, Alto, Tenor, and Bari, respectively.
- Route outputs 1 and 2 as L and R to your playback system.
- Route the computer's audio to a place that you can attach your monitoring system to: the web browser is what will generate a click that should be sent to the performers' ears.

2. Pan the channels according to your stage setup (optional): for a realistic presentation stereo image, use the panning knobs to simulate where your performers are physically located in the L-R field.

3. Turn on the DSP processing: make sure the Master Out button in the Max patch is lit and that the channels are receiving signal.

### 3. Set Up Performers

Send performers the **Performer Page QR code** (displayed in the browser window that opened automatically).

Performers should:

1. Scan the QR code on their tablet
2. Select their voice (Soprano / Alto / Tenor / Baritone)
3. Tap **Join Game** and wait in the lobby

> **If a performer loses connection:** They can simply reload the page — the game will automatically reconnect them without needing to rejoin.

### 4. Set Up Audience

The **Projection Page** displays a QR code before the game starts.

Audience members:

1. Scan the QR code with their phones
2. Enter a name and select a voice
3. Complete the in-app tutorial
4. Wait in the lobby

### 5. Start the Performance

When everyone is ready:

1. Click **Start Game** on the home page (the first browser window that opened)
2. A countdown begins
3. All devices synchronize
4. The game starts

To stop early: Click **Stop Game** on the home page.

---

## Troubleshooting

### App Doesn't Start

Check `project/launch.log` for error details.

Common issues:

- **Python 3 not installed** → Install from [python.org](https://www.python.org/downloads/)
- **Node.js not installed** → Install from [nodejs.org](https://nodejs.org/)
- **`npm install` not run** → See step 3 above

### Max Patch Not Receiving Level Signals

- ✅ Confirm the app is running before opening Max
- ✅ Check Max's OSC receive port = 9000 (default)

### Devices Can't Connect

- ✅ All devices on the same WiFi network?
- ✅ Firewall blocking port 8080?
- ✅ Try typing the IP address manually (shown in browser)

### Score Generation Fails

If score generation fails repeatedly:

- Check that Python can find `generate_score.py`
- Ensure `project/public/tap_sequences/base/` contains the base JSON files

---

## Restarting for a Second Performance

### Option 1: Quick Restart (App)

1. Quit **Saxophone Hero Game Launcher.app** (Cmd+Q or right-click → Quit)
2. Close all browser windows
3. Double-click **Saxophone Hero Game Launcher.app** again

A fresh score generates automatically.

### Option 2: Manual Restart (Terminal)

If you launched via Terminal (`npm start`):

1. Press **Ctrl+C** in Terminal
2. Close browser windows
3. Run `npm start` again

---

## What's Included

```
Saxophone-Hero/
├── Saxophone Hero Game Launcher.app           (macOS launcher)
├── project/                     (game server & frontend)
│   ├── index.mjs                (server code)
│   ├── generate_score.py        (score generator)
│   ├── package.json             (Node dependencies)
│   ├── dist/                    (compiled frontend)
│   ├── public/                  (JSON scores, assets)
│   └── …
└── sax-hero-max/                (Max patch & audio processing)
    ├── sax-hero.maxpat          (main patch)
    ├── saxDSP.maxpat            (audio processing)
    ├── External Packages/       (Max libraries — offline install)
    └── …
```

---

## Support

For questions or issues, contact: *music@projectfusionsq.org* or sky.macklay@gmail.com

Enjoy the performance! 🎷🎮
