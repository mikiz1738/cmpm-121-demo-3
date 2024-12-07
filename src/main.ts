//D3.c complete
// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";

// Style sheets
import "leaflet/dist/leaflet.css";
import "./style.css";

// Fix missing marker images
import "./leafletWorkaround.ts";

// Deterministic random number generator
import luck from "./luck.ts";

// Constants
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const INITIAL_PLAYER_COINS = 0;
const GAMEPLAY_ZOOM_LEVEL = 19;

// Oakes Classroom location in grid coordinates
const OAKES_GRID = { i: 369894, j: -1220627 };

// Player state
let playerCoins = INITIAL_PLAYER_COINS;
const playerPosition = { ...OAKES_GRID };
let playerMarker: leaflet.Marker;

// Cache state
const caches: Map<string, { coins: { id: string }[] }> = new Map();
const knownTiles = new Map<string, boolean>(); // Tracks which tiles are generated
const cacheMementos = new Map<string, { coins: { id: string }[] }>(); // Memento pattern

// Flyweight to cache grid-to-LatLng conversion
const cellLatLngCache = new Map<string, leaflet.LatLngBounds>();

// Initialize the map
function initializeMap() {
  const map = leaflet.map(document.getElementById("map")!, {
    center: gridToLatLng(playerPosition),
    zoom: GAMEPLAY_ZOOM_LEVEL,
    minZoom: GAMEPLAY_ZOOM_LEVEL,
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
    zoomControl: false,
    scrollWheelZoom: false,
  });

  leaflet
    .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    })
    .addTo(map);

  addPlayerMarker(map);
  spawnCaches(map);

  initializeMovementButtons(map);

  return map;
}

// Add player marker
function addPlayerMarker(map: leaflet.Map) {
  playerMarker = leaflet.marker(gridToLatLng(playerPosition)); // Initialize the marker
  playerMarker.bindTooltip("That's you!");
  playerMarker.addTo(map);
  playerMarker.setZIndexOffset(1000); // Ensure player marker is above other elements
}

// Convert grid coordinates to LatLng
function gridToLatLng({ i, j }: { i: number; j: number }): leaflet.LatLng {
  const origin = leaflet.latLng(0, 0); // Null Island
  return leaflet.latLng(
    origin.lat + i * TILE_DEGREES,
    origin.lng + j * TILE_DEGREES,
  );
}

// Calculate grid cell bounds using Flyweight
function calculateCacheBounds(i: number, j: number) {
  const cacheKey = `${i},${j}`;
  if (!cellLatLngCache.has(cacheKey)) {
    const bounds = leaflet.latLngBounds([
      gridToLatLng({ i, j }),
      gridToLatLng({ i: i + 1, j: j + 1 }),
    ]);
    cellLatLngCache.set(cacheKey, bounds);
  }
  return cellLatLngCache.get(cacheKey)!;
}

// Spawn a single cache with unique coin identities
function spawnCache(map: leaflet.Map, i: number, j: number) {
  const bounds = calculateCacheBounds(i, j);
  const cacheKey = `${i},${j}`;

  if (cacheMementos.has(cacheKey)) {
    caches.set(cacheKey, cacheMementos.get(cacheKey)!);
  } else {
    const coinCount = Math.max(
      1,
      Math.floor(luck([i, j, "coins"].toString()) * 10),
    );

    const cacheCoins = Array.from({ length: coinCount }, (_, serial) => ({
      id: `${cacheKey}#${serial}`,
    }));

    caches.set(cacheKey, { coins: cacheCoins });
    cacheMementos.set(cacheKey, { coins: cacheCoins });
  }

  const rect = leaflet.rectangle(bounds).addTo(map);
  rect.bindPopup(() => createCachePopup(cacheKey));
}

// Create popup content with coin identity
function createCachePopup(cacheKey: string) {
  const popupDiv = document.createElement("div");

  const cache = caches.get(cacheKey);
  const coinListHtml = cache?.coins
    .map((coin) => `<li>${coin.id}</li>`)
    .join("") || "No coins left";

  popupDiv.innerHTML = `
    <div>Cache at ${cacheKey} contains:
      <ul id="coinList">
        ${coinListHtml}
      </ul>
    </div>
    <button id="collect">Collect</button>
    <button id="deposit">Deposit</button>`;

  popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener(
    "click",
    () => {
      handleCollect(cacheKey);
      updatePopupUI(cacheKey, popupDiv);
    },
  );

  popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener(
    "click",
    () => {
      handleDeposit(cacheKey);
      updatePopupUI(cacheKey, popupDiv);
    },
  );

  return popupDiv;
}

// Handle collect action
function handleCollect(cacheKey: string) {
  const cache = caches.get(cacheKey);
  if (cache && cache.coins.length > 0) {
    cache.coins.pop(); // Remove a coin from the cache
    playerCoins++;
    updateStatusPanel();
  }
}

// Handle deposit action
function handleDeposit(cacheKey: string) {
  const cache = caches.get(cacheKey);
  if (cache && playerCoins > 0) {
    const newCoin = { id: `${cacheKey}#${cache.coins.length}` };
    cache.coins.push(newCoin); // Add a new coin to the cache
    playerCoins--;
    updateStatusPanel();
  }
}

// Update popup UI
function updatePopupUI(cacheKey: string, popupDiv: HTMLDivElement) {
  const cache = caches.get(cacheKey);
  const coinListHtml = cache?.coins
    .map((coin) => `<li>${coin.id}</li>`)
    .join("") || "No coins left";
  popupDiv.querySelector<HTMLUListElement>("#coinList")!.innerHTML =
    coinListHtml;
}

// Update the status panel
function updateStatusPanel() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `Coins in pocket: ${playerCoins}`;
}

// Spawn caches in the neighborhood
function spawnCaches(map: leaflet.Map) {
  for (
    let i = playerPosition.i - NEIGHBORHOOD_SIZE;
    i < playerPosition.i + NEIGHBORHOOD_SIZE;
    i++
  ) {
    for (
      let j = playerPosition.j - NEIGHBORHOOD_SIZE;
      j < playerPosition.j + NEIGHBORHOOD_SIZE;
      j++
    ) {
      const cacheKey = `${i},${j}`;
      if (
        !knownTiles.has(cacheKey) &&
        luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY
      ) {
        spawnCache(map, i, j);
        knownTiles.set(cacheKey, true);
      }
    }
  }
}

// Initialize the movement buttons
function initializeMovementButtons(map: leaflet.Map) {
  const controls = document.createElement("div");
  controls.id = "controls";
  controls.innerHTML = `
    <button id="moveUp">⬆️</button>
    <button id="moveLeft">⬅️</button>
    <button id="moveRight">➡️</button>
    <button id="moveDown">⬇️</button>
  `;
  document.body.appendChild(controls);

  document.querySelector("#moveUp")!.addEventListener(
    "click",
    () => movePlayer(map, 1, 0),
  );
  document.querySelector("#moveDown")!.addEventListener(
    "click",
    () => movePlayer(map, -1, 0),
  );
  document.querySelector("#moveLeft")!.addEventListener(
    "click",
    () => movePlayer(map, 0, -1),
  );
  document.querySelector("#moveRight")!.addEventListener(
    "click",
    () => movePlayer(map, 0, 1),
  );
}

// Move the player and regenerate caches
function movePlayer(map: leaflet.Map, di: number, dj: number) {
  // Update player's position
  playerPosition.i += di;
  playerPosition.j += dj;

  // Update the map's center and the player's marker
  const newLatLng = gridToLatLng(playerPosition);
  map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);
  playerMarker.setLatLng(newLatLng); // Update marker position

  // Regenerate caches for the new position
  spawnCaches(map);
}

// Initialize the status panel
function initializeStatusPanel() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `Coins in pocket: ${playerCoins}`;
}

// Main entry point
function main() {
  initializeStatusPanel();
  initializeMap();
}

main();
