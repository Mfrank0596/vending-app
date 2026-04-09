const { createClient } = require('@libsql/client');

let client;

try {
  if (!process.env.TURSO_DATABASE_URL) {
    console.warn("⚠️ WARNING: TURSO_DATABASE_URL is not set. Database operations will fail.");
  } else {
    client = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
} catch (e) {
  console.error("Failed to construct Turso client:", e.message);
}

// Scaffold the initial historic database tables in the cloud
async function initDb() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS inventory_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        machine_name TEXT,
        sync_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        item TEXT,
        price REAL,
        capacity INTEGER,
        current_stock INTEGER,
        deficit INTEGER,
        bin TEXT
      );
    `);
    console.log("☁️ Turso Cloud Database initialized successfully.");
  } catch (e) {
    console.error("Failed to initialize Turso DB:", e);
  }
}

async function saveSnapshot(inventoryData) {
  const timestamp = new Date().toISOString();
  console.log("Saving snapshot to Turso Cloud...");

  try {
    const batch = [];
    for (const [machineName, items] of Object.entries(inventoryData)) {
      for (const i of items) {
        batch.push({
          sql: `INSERT INTO inventory_snapshots (machine_name, sync_timestamp, item, price, capacity, current_stock, deficit, bin) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [machineName, timestamp, i.item, i.price, i.capacity, i.currentStock, i.deficit, i.bin]
        });
      }
    }
    
    // Turso handles high-speed batching for us!
    await client.batch(batch, "write");
    console.log(`Successfully logged historic sync snapshot to Turso at ${timestamp}`);
  } catch (error) {
    console.error("Failed to inject historic snippet into Turso Cloud:", error);
    throw error;
  }
}

async function getHistoryForMachine(machineName) {
  try {
    const result = await client.execute({
      sql: `SELECT * FROM inventory_snapshots WHERE machine_name = ? ORDER BY sync_timestamp DESC`,
      args: [machineName]
    });
    return result.rows;
  } catch (e) {
    console.error("Turso fetch error:", e);
    return [];
  }
}

module.exports = { initDb, saveSnapshot, getHistoryForMachine };
