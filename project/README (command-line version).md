# Saxophone Hero!

A rhythm game for saxophone quartet, electronics, and mobile devices.

These instructions assume:
- You are on macOS
- You do not have Node.js installed
- You do have Max installed (free to operate existing files, paid to save/modify)

Follow the steps in order.

---

## 1. Install Node.js

1. Go to https://nodejs.org
2. Download the **LTS** version for macOS
3. Open the downloaded `.pkg` file and follow the default installation options

---

## 2. Open the project folder in Terminal

Open Terminal, then navigate to the project folder:

    cd path/to/sax-hero

Tip: you can type `cd ` and then drag the project folder directly into the Terminal window, followed by Return.

---

## 3. Install dependencies (one-time setup)

### a. Node dependencies

Run:

    npm install

Wait for it to finish. Then run:

    npm install open qrcode osc

These three additional packages enable the game to:
- Automatically open browser windows for each QR code on startup (`open`, `qrcode`)
- Send level-advancement signals to the Max patch via OSC (`osc`)

All `npm install` commands are one-time steps. You do not need to repeat them unless you are setting up the game on a new system.

### b. Max library dependencies

Open Max (this README was last verified with Max 9.1.4 on Apple silicon).

    Go to File → Show Package Manager
    Search for and install each of the following packages:
        1. abclib
        2. ABL Effect Modules
        3. CNMAT Externals

> **Note:** If internet access is limited during setup, these packages are also included in the game files at `../sax-hero-max/External Packages/`. Install them into your local Max instance before opening the patch.

---

## 4. Configure the ensemble layout (one-time setup)

Open the file `config.json` in the project root folder. It looks like this:

```json
{
  "voiceOrder": ["baritone", "tenor", "alto", "soprano"],
  "voiceNames": {
    "soprano": "Soprano",
    "alto": "Alto",
    "tenor": "Tenor",
    "baritone": "Baritone"
  },
  "voiceColors": {
    "soprano": "#a855f7",
    "alto":    "#f7b731",
    "tenor":   "#3b82f6",
    "baritone":"#22c55e"
  }
}
```

**`voiceOrder`** controls the left-to-right column order on the Projection Page, as seen from the audience. Modify it to match your ensemble's physical positioning on stage.

The default is configured for **Project Fusion Saxophone Quartet** (Baritone / Tenor / Alto / Soprano from left to right). For a different arrangement, simply reorder the values — for example:

    "voiceOrder": ["soprano", "alto", "tenor", "baritone"]

**`voiceNames`** and **`voiceColors`** can be customized if your ensemble uses different voice names or preferred colors.

Changes to `config.json` take effect immediately on the next browser reload — no rebuild or server restart needed.

---

## 5. Build the site (one-time setup, and after any code changes)

    npm run build

This compiles the frontend into the `dist/` folder that the server delivers to browsers. You only need to repeat this step if you modify any frontend source files (`.jsx`, `.js`, `.css` in the `src/` folder).

If you encounter a permissions error during build, run:

    sudo chown -R $(whoami) dist

Then try `npm run build` again.

---

## 6. Network setup

All devices — the host laptop, performers' tablets, and audience phones — must be on the **same WiFi network**. The game will not work if devices are on different networks.

### The challenge with venue networks

Most performance venue networks are not suitable for this game. Shared or public WiFi typically uses client isolation (preventing devices from communicating with each other), has firewalls that block local traffic, or is simply too congested for reliable real-time communication across many phones simultaneously.

### Recommended setup: dedicated wireless router

The most reliable approach is to bring your own wireless router and create a private network for the performance. This gives you full control over the network environment and eliminates venue WiFi variables.

A dedicated router also provides an important security benefit: you can configure it so that audience devices connect to your private network without having access to the broader internet, while the server laptop retains internet access for NTP time synchronization.

### Getting the server laptop online via a personal router

The challenge with a personal router is that it typically connects to the internet via a wired Ethernet connection — which is not usually available at a performance venue. The following solution uses iPhone USB tethering to get the laptop online while still routing all device traffic through your private router.

**What you need:**
- iPhone with a cellular data plan
- USB-C to Ethernet adapter for the MacBook
- Ethernet cable
- Wireless router with a WAN (internet) port

**Steps:**

1. Connect the iPhone to the MacBook via USB cable
2. On the iPhone, enable **Personal Hotspot** (Settings → Personal Hotspot)
3. Connect the MacBook to the router's **WAN port** via Ethernet cable (using the USB-C to Ethernet adapter)
4. On the MacBook, go to **System Settings → General → Sharing → Internet Sharing**
   - Share connection from: **iPhone USB** (or whichever source shows your iPhone's connection)
   - To devices using: **USB 10/100/1000 LAN**
5. Enable Internet Sharing

The MacBook now shares its iPhone cellular connection outward through the Ethernet port to the router's WAN, giving the router — and therefore all devices on its network — internet access. You can then restrict audience device internet access at the router level if desired, while the server retains NTP connectivity.

> **Note for Android users:** Android phones allow sharing mobile hotspot data via USB tethering directly, without the Internet Sharing step above. The iPhone approach is more involved because iOS restricts hotspot sharing to WiFi only — the workaround above routes through macOS Internet Sharing to bridge the gap.

---

## 7. Start the game server

    npm start

Leave this Terminal window open for the duration of the performance.

When `npm start` runs, it automatically:

1. **Generates a fresh score** — runs `generate_score.py` repeatedly until a peak spread of exactly 4 levels is achieved, ensuring the right balance of complexity and synchrony across all voices
2. **Starts the server** — listens on port 8080 and calibrates the network clock
3. **Opens three browser windows:**
   - The **game home page** — where the host starts and stops the game
   - A **Performer Page QR code** — for getting performers' tablets set up quickly without typing IP addresses
   - The **Projection Page** — designed to be projected above and behind the ensemble; shows all four voice game lanes, the live scoreboard, and (before the game starts) a QR code for the audience to join
4. **Starts the OSC bridge** — sends level-advancement signals to the Max patch automatically

The Terminal will show output similar to:

```
Score generation attempt 1: peak spread = 3 — regenerating…
Score generation attempt 2: peak spread = 4
✓ Target spread of 4 achieved after 2 attempts
NTP sync: offset=12.45 ms (slewing from 0.00 ms, delta=12.45 ms)
Server listening on port 8080
→ http://192.168.1.100:8080
OSC ready → sending to 127.0.0.1:9000
Opening browser windows…
```

The IP address shown (e.g. `192.168.1.100:8080`) is the address players can type manually if QR scanning is unavailable.

---

## 8. Open the Max patch

The patch is named `sax-hero.maxpat`, located in the `/sax-hero-max` folder.

**Important:** open Max *after* `npm start` is running, not before. The Max patch connects to the game server on startup — if the server is not yet running, the connection will fail silently.

---

## 9. Set up performers

Send performers the **Performer Page QR code** (shown in the dedicated browser window that opens automatically). They should:

1. Scan the QR code on their tablet
2. Select their voice (Soprano / Alto / Tenor / Baritone)
3. Tap **Join Game** and wait in the lobby

> **If a performer loses connection or accidentally navigates away:** they can simply reload the page. The game will automatically detect that a performance is in progress and reconnect them without needing to rejoin manually.

---

## 10. Set up audience players

The **Projection Page** displays a QR code before the game starts. Audience members scan it with their phones to join as players.

Players:
1. Scan the QR code
2. Enter a name and select a voice
3. Complete the in-app tutorial
4. Wait in the lobby for the game to start

---

## 11. Start the performance

When performers and players are ready:

1. Click **Start Game** on the home page (the browser window that opened automatically)
2. The countdown will begin and all connected devices will synchronize
3. To stop the game at any point, click **Stop Game** on the same page

---

## If something goes wrong

**Server errors or unexpected behavior:**

1. In Terminal, stop the server:

        Ctrl + C

2. Rebuild and restart:

        npm run build
        npm start

**Build permission errors:**

    sudo chown -R $(whoami) dist
    npm run build

**Max patch not receiving level signals:**
- Confirm `npm start` is running before Max is opened
- Check that Max's OSC receive port matches the game's send port (default: 9000)

**Devices can't connect to the server:**
- Confirm all devices are on the same WiFi network
- Check that no firewall is blocking port 8080
- The server's IP address is printed in the Terminal — try typing it manually into the browser

---

## To restart the game for a second performance

1. In Terminal:

        Ctrl + C

2. Close the old browser windows

3. Restart:

        npm start

A fresh score will be generated automatically.
