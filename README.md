# ♟ Chess Online — Setup Guide

## Project Structure
```
chess-online/
├── index.html          ← The HTML entry point
├── package.json        ← Dependencies
├── vite.config.js      ← Build config
└── src/
    ├── main.jsx        ← React entry point (mounts App into index.html)
    ├── App.jsx         ← The entire chess game
    ├── firebase.js     ← Firebase config (YOU NEED TO FILL THIS IN)
    └── index.css       ← Global reset styles
```

## Step 1 — Set up Firebase (free, 2 minutes)

1. Go to https://console.firebase.google.com
2. Click **"Add project"** → name it anything → Create
3. In the left sidebar click **"Realtime Database"**
4. Click **"Create Database"** → pick any location → **"Start in test mode"** → Enable
5. Click the ⚙ gear icon (top left) → **"Project settings"**
6. Scroll down to **"Your apps"** → click **</>** (Web icon) → register with any name
7. Copy the `firebaseConfig` object shown
8. Open `src/firebase.js` and paste your values in

## Step 2 — Install & Run

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Step 3 — Play Online

- **Player 1** clicks "Create New Game" → gets a room code
- **Player 1** shares that code with their friend
- **Player 2** opens the same URL, enters the code, clicks "Join Game"
- The game starts — moves sync in real time via Firebase!

## Build for production

```bash
npm run build
```

Then deploy the `dist/` folder to Netlify, Vercel, or any static host.
