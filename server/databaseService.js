const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const fs = require('fs');

const path = require('path');

async function getDb() {
  return open({
    filename: path.join(__dirname, 'vending_history.db'),
    driver: sqlite3.Database
  });
}

// Scaffold the initial historic database tables
async function initDb() {
  const db = await getDb();
  await db.exec(`
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
  console.log("SQLite Database initialized seamlessly.");
}

async function saveSnapshot(inventoryData) {
  const db = await getDb();
  const timestamp = new Date().toISOString();
  
  // We use a transaction for safety when blasting hundreds of rows
  await db.exec('BEGIN TRANSACTION');
  try {
      for (const [machineName, items] of Object.entries(inventoryData)) {
        for (const i of items) {
           await db.run(
             `INSERT INTO inventory_snapshots (machine_name, sync_timestamp, item, price, capacity, current_stock, deficit, bin)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
             [machineName, timestamp, i.item, i.price, i.capacity, i.currentStock, i.deficit, i.bin]
           );
        }
      }
      await db.exec('COMMIT');
      console.log(`Successfully logged historic sync snapshot to SQLite at ${timestamp}`);
  } catch (error) {
      await db.exec('ROLLBACK');
      console.error("Failed to inject historic snippet into SQLite:", error);
  }
}

// Utility for fetching data required for charting
async function getHistoryForMachine(machineName) {
  const db = await getDb();
  return await db.all(
    `SELECT * FROM inventory_snapshots WHERE machine_name = ? ORDER BY sync_timestamp DESC`,
    [machineName]
  );
}

module.exports = { initDb, saveSnapshot, getHistoryForMachine };
