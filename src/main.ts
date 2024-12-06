// Deterministic random number generator
import luck from "./luck.ts";

// Gameplay parameters
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;
const INITIAL_PLAYER_COINS = 0;

// Player state
let playerCoins = INITIAL_PLAYER_COINS;

// Cache state
const caches: Map<string, { coins: number }> = new Map();

// Add a cache to the game
function addCache(i: number, j: number) {
  const cacheKey = `${i},${j}`;
  const coinCount = Math.max(
    1,
    Math.floor(luck([i, j, "coins"].toString()) * 10),
  );
  caches.set(cacheKey, { coins: coinCount });
}

// Determine whether a cache should spawn at a given location
function shouldSpawnCache(i: number, j: number): boolean {
  return luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY;
}

// Place caches deterministically
function populateCaches() {
  for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
    for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
      if (shouldSpawnCache(i, j)) {
        addCache(i, j);
      }
    }
  }
}

// Collect coins from a cache
function collectCoins(cacheKey: string) {
  const cache = caches.get(cacheKey);
  if (!cache) return;

  if (cache.coins > 0) {
    cache.coins--;
    playerCoins++;
    console.log(
      `Collected 1 coin from ${cacheKey}. You now have ${playerCoins} coins.`,
    );
  } else {
    console.log(`Cache at ${cacheKey} is empty.`);
  }
}

// Deposit coins into a cache
function depositCoins(cacheKey: string) {
  const cache = caches.get(cacheKey);
  if (!cache) return;

  if (playerCoins > 0) {
    cache.coins++;
    playerCoins--;
    console.log(
      `Deposited 1 coin into ${cacheKey}. You now have ${playerCoins} coins.`,
    );
  } else {
    console.log(`You have no coins to deposit.`);
  }
}

// Debug: Show the state of all caches
function showCaches() {
  console.log("Caches:", Array.from(caches.entries()));
}

// Main logic
function main() {
  console.log("Initializing caches...");
  populateCaches();
  showCaches();

  // Example interactions
  const exampleCacheKey = "0,0";
  console.log(`Interacting with cache at ${exampleCacheKey}`);
  collectCoins(exampleCacheKey); // Collect a coin
  depositCoins(exampleCacheKey); // Deposit a coin
  showCaches();
}

main();
