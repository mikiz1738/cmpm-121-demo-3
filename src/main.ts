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

// Cache state
const caches: Map<string, { coins: number }> = new Map();

// Flyweight to cache grid-to-LatLng conversion
const cellLatLngCache = new Map<string, leaflet.LatLngBounds>();

// Initialize the map
function initializeMap() {
  const map = leaflet.map(document.getElementById("map")!, {
    center: gridToLatLng(OAKES_GRID),
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

  return map;
}

// Add player marker
function addPlayerMarker(map: leaflet.Map) {
  const playerMarker = leaflet.marker(gridToLatLng(OAKES_GRID));
  playerMarker.bindTooltip("That's you!");
  playerMarker.addTo(map);
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
  const coinCount = Math.max(
    1,
    Math.floor(luck([i, j, "coins"].toString()) * 10),
  );

  // Generate unique coin identities
  const cacheCoins = Array.from({ length: coinCount }, (_, serial) => ({
    id: `${cacheKey}#${serial}`,
  }));

  caches.set(cacheKey, { coins: cacheCoins.length });

  const rect = leaflet.rectangle(bounds).addTo(map);
  rect.bindPopup(() => createCachePopup(cacheKey, cacheCoins));
}

// Create popup content with coin identity
function createCachePopup(cacheKey: string, cacheCoins: { id: string }[]) {
  const popupDiv = document.createElement("div");

  popupDiv.innerHTML = `
    <div>Cache at ${cacheKey} contains:
      <ul id="coinList">
        ${cacheCoins.map((coin) => `<li>${coin.id}</li>`).join("")}
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
  const cache = caches.get(cacheKey)!;
  if (cache.coins > 0) {
    cache.coins--;
    playerCoins++;
    updateStatusPanel();
  }
}

// Handle deposit action
function handleDeposit(cacheKey: string) {
  const cache = caches.get(cacheKey)!;
  if (playerCoins > 0) {
    cache.coins++;
    playerCoins--;
    updateStatusPanel();
  }
}

// Update popup UI
function updatePopupUI(cacheKey: string, popupDiv: HTMLDivElement) {
  popupDiv.querySelector<HTMLSpanElement>("#cacheCoins")!.innerText = caches
    .get(cacheKey)!.coins.toString();
}

// Update the status panel
function updateStatusPanel() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `Coins in pocket: ${playerCoins}`;
}

// Spawn caches in the neighborhood
function spawnCaches(map: leaflet.Map) {
  for (
    let i = OAKES_GRID.i - NEIGHBORHOOD_SIZE;
    i < OAKES_GRID.i + NEIGHBORHOOD_SIZE;
    i++
  ) {
    for (
      let j = OAKES_GRID.j - NEIGHBORHOOD_SIZE;
      j < OAKES_GRID.j + NEIGHBORHOOD_SIZE;
      j++
    ) {
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(map, i, j);
      }
    }
  }
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
