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

// Player movement
let movementHistory: leaflet.Polyline | null = null;

// Cache state
const caches: Map<string, { coins: { id: string }[] }> = new Map();
const knownTiles = new Map<string, boolean>(); // Tracks which tiles are generated
const cacheMementos = new Map<string, { coins: { id: string }[] }>(); // Memento pattern
// Cache layer group to manage all cache overlays on the map
const cacheLayerGroup = leaflet.layerGroup();

// Flyweight to cache grid-to-LatLng conversion
const cellLatLngCache = new Map<string, leaflet.LatLngBounds>();

// Persistent Storage
function saveGameState() {
  const movementHistoryLatLngs = movementHistory
    ? (movementHistory.getLatLngs() as leaflet.LatLng[]).map((latLng) => ({
      lat: latLng.lat,
      lng: latLng.lng,
    }))
    : [];

  const gameState = {
    playerPosition,
    playerCoins,
    caches: Array.from(caches.entries()), // Save current state of caches
    movementHistory: movementHistoryLatLngs,
  };

  localStorage.setItem("gameState", JSON.stringify(gameState));
}

function loadGameState() {
  const savedState = localStorage.getItem("gameState");
  if (savedState) {
    const {
      playerPosition: savedPos,
      playerCoins: coins,
      caches: savedCaches,
      movementHistory: savedHistory,
    }: {
      playerPosition: typeof playerPosition;
      playerCoins: number;
      caches: [string, { coins: { id: string }[] }][];
      movementHistory: { lat: number; lng: number }[];
    } = JSON.parse(savedState);

    // Restore player state
    Object.assign(playerPosition, savedPos);
    playerCoins = coins;

    // Restore caches
    caches.clear();
    savedCaches.forEach(([key, value]) => {
      caches.set(key, value); // Repopulate the caches map
    });

    // Restore movement history
    if (Array.isArray(savedHistory)) {
      movementHistory = leaflet.polyline(
        savedHistory.map(({ lat, lng }) => leaflet.latLng(lat, lng)),
        { color: "blue" },
      );
    }
  }
}

globalThis.addEventListener("beforeunload", saveGameState);

function initializeMovementHistory(map: leaflet.Map) {
  if (movementHistory) {
    // If movement history is already restored, add it to the map
    movementHistory.addTo(map);
  } else {
    // Otherwise, initialize a new movement history polyline
    movementHistory = leaflet.polyline([], { color: "blue" }).addTo(map);
  }
}

function initializeAutoLocationButton(map: leaflet.Map) {
  const button = document.createElement("button");
  button.textContent = "🌐";
  button.style.margin = "10px";
  document.body.appendChild(button);

  let watchId: number | null = null;
  button.addEventListener("click", () => {
    if (watchId === null) {
      // Start watching the user's geolocation
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const gridCoords = latLngToGrid(
            leaflet.latLng(pos.coords.latitude, pos.coords.longitude),
          );
          playerPosition.i = gridCoords.i;
          playerPosition.j = gridCoords.j;

          // Update player position on the map
          movePlayer(map, 0, 0);
        },
        (error) => {
          alert("Geolocation error: " + error.message);
        },
      );
      button.style.backgroundColor = "lightgreen";
    } else {
      // Stop watching geolocation
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
      button.style.backgroundColor = "";
    }
  });
}

function initializeResetButton(map: leaflet.Map) {
  const button = document.createElement("button");
  button.textContent = "🚮";
  button.style.margin = "10px";
  document.body.appendChild(button);

  button.addEventListener("click", () => {
    // Step 1: Reset player state
    playerCoins = INITIAL_PLAYER_COINS; // Reset coins to initial value
    playerPosition.i = OAKES_GRID.i; // Reset i coordinate
    playerPosition.j = OAKES_GRID.j; // Reset j coordinate

    // Step 2: Clear and restore caches
    caches.clear(); // Clear the current cache state
    cacheLayerGroup.clearLayers(); // Remove all cache layers from the map
    knownTiles.clear(); // Clear the known tiles

    for (const [key, value] of cacheMementos.entries()) {
      caches.set(key, JSON.parse(JSON.stringify(value))); // Restore original caches
    }

    // Step 3: Clear and reset movement history
    if (movementHistory) {
      map.removeLayer(movementHistory); // Remove movement history polyline
      movementHistory = null; // Reset movement history
    }

    // Step 4: Reset map view and player marker to Oakes
    const oakesLatLng = gridToLatLng(OAKES_GRID);
    map.setView(oakesLatLng, GAMEPLAY_ZOOM_LEVEL);
    playerMarker.setLatLng(oakesLatLng);

    // Step 5: Update the status panel
    updateStatusPanel();

    // Step 6: Regenerate visible caches
    spawnCaches(map);

    alert(
      "Game has been reset. You are back at Oakes, and caches have been restored.",
    );
  });
}

// Convert LatLng to grid coordinates
function latLngToGrid(latLng: leaflet.LatLng) {
  const origin = leaflet.latLng(0, 0); // Null Island
  return {
    i: Math.round((latLng.lat - origin.lat) / TILE_DEGREES),
    j: Math.round((latLng.lng - origin.lng) / TILE_DEGREES),
  };
}

function createMap(
  containerId: string,
  initialPosition: { i: number; j: number },
) {
  const map = leaflet.map(containerId, {
    center: gridToLatLng(initialPosition),
    zoom: GAMEPLAY_ZOOM_LEVEL,
    minZoom: GAMEPLAY_ZOOM_LEVEL,
    maxZoom: GAMEPLAY_ZOOM_LEVEL,
  });
  leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

function addMarkerToMap(map: leaflet.Map, position: { i: number; j: number }) {
  const marker = leaflet.marker(gridToLatLng(position));
  marker.addTo(map);
  return marker;
}

// Initialize the map
function initializeMap() {
  const map = createMap("map", playerPosition);
  playerMarker = addMarkerToMap(map, playerPosition);
  initializeMovementHistory(map);
  initializeAutoLocationButton(map);
  spawnCaches(map);
  initializeMovementButtons(map);
  initializeResetButton(map);

  return map;
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

  if (!cacheMementos.has(cacheKey)) {
    // Only generate a new cache if it doesn't already exist in cacheMementos
    const coinCount = Math.max(
      1,
      Math.floor(luck([i, j, "coins"].toString()) * 10),
    );

    const cacheCoins = Array.from({ length: coinCount }, (_, serial) => ({
      id: `${cacheKey}#${serial}`,
    }));

    // Save original cache state to cacheMementos
    cacheMementos.set(cacheKey, { coins: cacheCoins });
  }

  // Restore cache state from cacheMementos
  caches.set(cacheKey, JSON.parse(JSON.stringify(cacheMementos.get(cacheKey))));

  const rect = leaflet.rectangle(bounds);
  rect.bindPopup(() => createCachePopup(cacheKey));
  rect.addTo(cacheLayerGroup); // Add to cache layer group
  cacheLayerGroup.addTo(map);
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

// Function to initialize or update movement history
function updateMovementHistory(map: leaflet.Map, newPosition: leaflet.LatLng) {
  if (!movementHistory) {
    // First time: create the polyline and add it to the map
    movementHistory = leaflet.polyline([newPosition], { color: "blue" }).addTo(
      map,
    );
  } else {
    // Append new position to existing polyline
    const latLngs = movementHistory.getLatLngs() as leaflet.LatLng[];
    latLngs.push(newPosition);
    movementHistory.setLatLngs(latLngs);
  }
}

function updatePlayerPositionAndMarker(
  map: leaflet.Map,
  di: number,
  dj: number,
): leaflet.LatLng {
  // Update player's grid position
  playerPosition.i += di;
  playerPosition.j += dj;

  // Update map view and player marker
  const newLatLng = gridToLatLng(playerPosition);
  map.setView(newLatLng, GAMEPLAY_ZOOM_LEVEL);
  playerMarker.setLatLng(newLatLng);

  return newLatLng; // Return new position for further use
}

// Move the player and regenerate caches
function movePlayer(map: leaflet.Map, di: number, dj: number) {
  const newLatLng = updatePlayerPositionAndMarker(map, di, dj); // Step 1
  updateMovementHistory(map, newLatLng); // Step 2
  regenerateVisibleCaches(map); // Step 3
}

function regenerateVisibleCaches(map: leaflet.Map) {
  spawnCaches(map);
}

// Initialize the status panel
function initializeStatusPanel() {
  const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
  statusPanel.innerHTML = `Coins in pocket: ${playerCoins}`;
}

// Main entry point
function main() {
  loadGameState(); // Load saved game state
  initializeStatusPanel();

  const map = initializeMap();

  if (movementHistory) {
    movementHistory.addTo(map); // Add restored movement history to the map
  }
}

main();
