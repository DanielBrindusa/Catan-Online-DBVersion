# Cata Island Traders

A browser-based local hot-seat board game inspired by the classic island trading/settlement format.

## Files
- `index.html` – app shell
- `styles.css` – layout and board styling
- `app.js` – game logic

## How to run locally
Open `index.html` in a browser.

## How to publish on GitHub Pages
1. Create a GitHub repository.
2. Upload all files from this folder to the repository root.
3. In GitHub, go to **Settings > Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select the `main` branch and the `/ (root)` folder.
6. Save.
7. GitHub will publish the site and give you a URL.

## Included gameplay
- Randomized 19-hex base board
- 3 or 4 players
- Setup phase with reverse second placement
- Resource production
- Robber, discard on 7, and stealing
- Roads, settlements, cities
- Bank and port trade
- Player-to-player trade on one device
- Development cards
- Largest Army and Longest Road
- Victory at 10 points

## Important note
This project is a fan-made, unlicensed implementation for learning/personal use. It is not affiliated with or endorsed by CATAN GmbH, Catan Studio, or Asmodee.


## Custom hex tile art

This build supports image-based terrain tiles from `assets/hexes/`.
Included files:
- `wood.png`
- `brick.png`
- `sheep.png`
- `wheat.png`
- `ore.png`
- `desert.png`
- `robber.png`

The terrains and robber are loaded from the `assets/` folder. Roads, settlements, and cities are now rendered as more realistic in-game SVG image pieces with player-color styling, so no separate road/settlement asset files are required.
