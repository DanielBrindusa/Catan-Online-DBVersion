# Cata Island Traders

A browser-based board game inspired by the classic island settlement and trading genre, built as a personal learning project. Playable locally on a single device (hot-seat) or online across multiple devices using Firebase Realtime Database.

---

## Table of Contents

- [How to Run Locally](#how-to-run-locally)
- [How to Publish on GitHub Pages](#how-to-publish-on-github-pages)
- [Gameplay Features](#gameplay-features)
- [Project Structure](#project-structure)
- [Assets](#assets)
- [Online Multiplayer](#online-multiplayer)
- [Legal Disclaimer](#legal-disclaimer)
- [Credits](#credits)

---

## How to Run Locally

Open `index.html` in any modern browser. No build step or server required.

---

## How to Publish on GitHub Pages

1. Create a GitHub repository.
2. Upload all files and folders from this project to the repository root.
3. In GitHub, go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder.
6. Save. GitHub will publish the site and provide a public URL.

---

## Gameplay Features

- Randomized 19-hex base board with valid number placement (no adjacent 6/8 tokens)
- 3 or 4 players
- Full setup phase with reverse second-round placement
- Resource production based on dice rolls
- Robber mechanics: discard on 7, hex blocking, and stealing
- Roads, settlements, and cities
- Bank trade (4:1) and port trade (3:1 and 2:1)
- Player-to-player trade
- Development cards: Knight, Road Building, Year of Plenty, Monopoly, Victory Point
- Largest Army and Longest Road special awards
- Victory at 10 points
- Online multiplayer via Firebase (host creates room, players join by code)
- Background music with mute/unmute toggle
- Building costs reference card displayed on the board

---

## Project Structure

```
/
├── index.html          # App shell and layout
├── styles.css          # Layout and board styling
├── app.js              # All game logic and Firebase integration
└── assets/
    ├── hexes/          # Terrain tile images
    │   ├── wood.png
    │   ├── brick.png
    │   ├── sheep.png
    │   ├── wheat.png
    │   ├── ore.png
    │   ├── desert.png
    │   └── robber.png
    ├── brick.png       # Resource icon (player hand display)
    ├── grain.png
    ├── log.png
    ├── ore.png
    ├── wool.png
    ├── BuildingCard.png
    └── music/
        └── music.mp3
```

---

## Assets

All visual assets (terrain tiles, resource icons, building costs card, and robber image) were generated using AI image generation tools and are not reproductions of any commercially published artwork.

Background music is royalty-free, sourced from [Pixabay](https://pixabay.com/).

Roads, settlements, and cities are rendered as SVG graphics generated programmatically in code — no external image files are required for them.

---

## Online Multiplayer

Online play is powered by [Firebase Realtime Database](https://firebase.google.com/). The host creates a room and shares the room code with other players, who join from their own devices. The host then starts the match. The full game state is synchronized through Firebase after every action.

To use online play with your own Firebase project, replace the `firebaseConfig` object in `app.js` with your own project credentials.

---

## Legal Disclaimer

**Cata Island Traders** is an independent, fan-made project created solely for personal learning and software development practice. It is not a commercial product and has never been, nor will it ever be, intended to replace, compete with, or infringe upon the original CATAN® board game or any of its digital adaptations.

This project is **not affiliated with, endorsed by, sponsored by, or developed in collaboration with** CATAN GmbH, Catan Studio, Asmodee, or any of their subsidiaries or licensees. The name "CATAN" and all associated trademarks, logos, and intellectual property are the exclusive property of their respective owners.

This project does not reproduce any original artwork, game text, rulebooks, or other copyrighted or trademarked materials from the official CATAN game. The gameplay mechanics implemented here reflect general, widely known board game concepts and are not a verbatim reproduction of any proprietary ruleset.

The project is not monetized in any way. No fees are charged, no advertisements are displayed, and no revenue is generated from its use or distribution.

The official CATAN digital game can be found at [https://catanuniverse.com/](https://catanuniverse.com/).

---

## Credits

- **Game concept inspiration:** The CATAN® board game by Klaus Teuber, published by CATAN GmbH
- **Visual assets:** AI-generated imagery
- **Background music:** Royalty-free music from [Pixabay](https://pixabay.com/)
- **Online infrastructure:** [Firebase Realtime Database](https://firebase.google.com/) by Google
- **Development:** Built entirely with vanilla HTML, CSS, and JavaScript — no frameworks or bundlers
