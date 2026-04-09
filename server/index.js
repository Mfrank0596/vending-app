const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();
const nayaxService = require('./NayaxService');
const multer = require('multer');
const fs = require('fs');
const { exec } = require('child_process');

const app = express();
const supplierService = require('./SupplierService');
app.use(cors());
app.use(express.json());

// Import and Init Database Service
const databaseService = require('./databaseService');
databaseService.initDb();

const PORT = process.env.PORT || 3001;

const storage = multer.diskStorage({
  destination: function (req, file, cb) { cb(null, __dirname); },
  filename: function (req, file, cb) { cb(null, `Temp_PickList_${Date.now()}.pdf`); }
});
const upload = multer({ storage: storage });

app.post('/api/upload-picklist', upload.single('picklist'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    console.log(`PickList PDF received (${req.file.filename}). Starting Docling AI extraction...`);
    
    // Pass the absolute file path directly to the robust python parser
    const filePath = req.file.path;
    exec(`python parse_pdf.py "${filePath}"`, { maxBuffer: 1024 * 1024 * 50 }, async (error, stdout, stderr) => {
        // Automatically cleanup the temp file so we don't leak memory
        fs.unlink(filePath, () => {});
        
        if (error) {
            console.error(`Docling exec error: ${error}`);
            console.error(`Docling stderr: ${stderr}`);
            // Expose the raw script stderr so we can track down the exact Python break point!
            return res.status(500).json({ error: `Python Crash Log:\n${stderr || error.message}` });
        }
        console.log('Docling processing complete:', stdout);
        
        // 🚀 DATABASE ARCHIVAL: Read the generated JSON and persist it into SQLite for heavy analytics
        try {
            const rawData = fs.readFileSync('nayax_offline_data.json', 'utf-8');
            const parsedData = JSON.parse(rawData);
            await databaseService.saveSnapshot(parsedData.inventory);
        } catch (e) {
            console.error('Failed to log historical snapshot to SQLite database:', e);
            // Non-fatal, we continue loading UI
        }

        res.json({ success: true, message: 'PickList processed securely and Archived into Database!' });
    });
});

app.get('/api/machines', async (req, res) => {
  const { machines } = await nayaxService.getMachinesAndInventory();
  res.json(machines);
});

const ExcelJS = require('exceljs');

// Creates a beautiful formatted Excel file based on the selected procurement items!
app.post('/api/export-shopping-list', async (req, res) => {
    try {
        const payload = req.body; // Expected format: Array of { category: "Snacks", items: [{ name, qty_needed }] }
        
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Procurement List');
        
        // Define clean columns
        sheet.columns = [
            { header: 'Category', key: 'category', width: 25 },
            { header: 'Item Name', key: 'name', width: 45 },
            { header: 'Total Boxes Needed', key: 'qty', width: 25 }
        ];
        
        // Enhance styling
        sheet.getRow(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
        sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' }}; // Dark Sidebar Slate
        
        payload.forEach(group => {
            group.items.forEach(item => {
                sheet.addRow({
                    category: group.category,
                    name: item.name,
                    qty: item.qty_needed
                });
            });
        });
        
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename="Nayax_Shopping_List.xlsx"');
        
        await workbook.xlsx.write(res);
        res.end();
    } catch (e) {
        console.error("Failed Excel Export:", e);
        res.status(500).json({ error: "Failed to build the Excel document."});
    }
});

// A route to generate prioritized driving routes based on sub-50% fill threshold
app.get('/api/route-plan', async (req, res) => {
    try {
        const { machines, inventory } = await nayaxService.getMachinesAndInventory();
        let routes = [];
        
        for (const machine of machines) {
            const mId = machine.id;
            const items = inventory[mId] || [];
            if (items.length === 0) continue;
            
            let totalCap = items.reduce((sum, i) => sum + i.capacity, 0);
            let totalStock = items.reduce((sum, i) => sum + i.currentStock, 0);
            
            if (totalCap === 0) continue;
            
            let fillPct = (totalStock / totalCap) * 100;
            
            // If the machine is critical (< 55% filled), add it to the routing priority
            if (fillPct < 55) {
                // Find top 3 missing items for the driver to load at the top of the truck
                const highestMissing = [...items]
                    .sort((a,b) => b.deficit - a.deficit)
                    .slice(0, 3)
                    .map(i => `${i.item} (${i.deficit})`);
                    
                routes.push({
                    machineName: machine.MachineName,
                    fillPercentage: fillPct.toFixed(1),
                    criticalItems: highestMissing
                });
            }
        }
        
        // Sort lowest filled first
        routes.sort((a,b) => parseFloat(a.fillPercentage) - parseFloat(b.fillPercentage));
        res.json(routes);
    } catch (e) {
        res.status(500).json({ error: "Failed to calculate route metrics."});
    }
});

app.get('/api/supplier/price', async (req, res) => {
  const { query, suppliers, zip } = req.query;
  if (!query) return res.status(400).json({ error: 'Query required' });
  const targetSuppliers = suppliers ? suppliers.split(',') : undefined;
  const result = await supplierService.getBestPrice(query, targetSuppliers, zip);
  res.json(result);
});

// NEW: Batch price check endpoint
app.post('/api/supplier/prices', async (req, res) => {
  const { queries, suppliers, zip } = req.body;
  if (!queries || !Array.isArray(queries)) return res.status(400).json({ error: 'Queries array required' });
  
  const results = {};
  const promises = queries.map(async (query) => {
    results[query] = await supplierService.getBestPrice(query, suppliers, zip);
  });
  await Promise.all(promises);
  
  res.json(results);
});

// API Endpoint for the "Shopping List / Restock Report"
app.get('/api/reports/restock', async (req, res) => {
  // Grab the error flag from the Nayax service
  const { machines, inventory, error } = await nayaxService.getMachinesAndInventory();
  
  const restockList = [];
  
  for (const [machineId, machineInventory] of Object.entries(inventory)) {
    const machine = machines.find(m => m.id == machineId);
    if (!machine) continue;

    machineInventory.forEach(item => {
      // If stock is below 30% of capacity, it needs a restock
      if (item.currentStock <= item.capacity * 0.3) { 
        restockList.push({
          machineId: machine.id,
          machineName: machine.name,
          location: machine.location,
          item: item.item,
          needed: item.capacity - item.currentStock,
          currentStock: item.currentStock,
          capacity: item.capacity
        });
      }
    });
  }
  
  res.json({
    generatedAt: new Date().toISOString(),
    connectionError: error, // Pass the error flag back to the frontend!
    restockList: restockList.sort((a,b) => b.needed - a.needed)
  });
});

// NEW: Aggregated "Shopping List" Endpoint with Multi-Warehouse Logic
app.get('/api/reports/shopping-list', async (req, res) => {
  const { machines, inventory, warehouses, error } = await nayaxService.getMachinesAndInventory();
  
  // 1. Group deficits by product
  const needsMap = {};
  
  for (const [machineId, machineInventory] of Object.entries(inventory)) {
    machineInventory.forEach(item => {
      if (item.currentStock <= item.capacity * 0.5) { 
        const deficit = item.capacity - item.currentStock;
        if (!needsMap[item.item]) {
          needsMap[item.item] = {
            item: item.item,
            machineDeficit: 0, // Total needed inside the machines
            warehouseStock: 0, // What we currently have sitting in garages
            caseSize: item.caseSize || 24 
          };
          
          // Tally up what we already own across ALL warehouses
          for (const [whName, whInventory] of Object.entries(warehouses)) {
             if (whInventory[item.item]) {
               needsMap[item.item].warehouseStock += whInventory[item.item];
             }
          }
        }
        needsMap[item.item].machineDeficit += deficit;
      }
    });
  }

  // 2. Determine Cases needed & parallel fetch Supplier prices
  const shoppingList = [];
  const promises = Object.values(needsMap).map(async (productObj) => {
    
    // How much do we actually need to BUY after using our warehouse stashes?
    const netNeededToBuy = Math.max(0, productObj.machineDeficit - productObj.warehouseStock);
    
    // Round up the fraction: if we need 30 items, and case is 24, we need 2 cases.
    const casesToBuy = Math.ceil(netNeededToBuy / productObj.caseSize);
    
    // Leftover yield (stuff that goes back to the warehouse after we restock machines)
    const leftoverYield = (casesToBuy * productObj.caseSize) - netNeededToBuy;
    
    // Fetch live pricing if we actually need to buy something
    // Prices will now be fetched manually by the user via the dashboard buttons!
    let supplierData = { results: [] };
    
    // Fuzzy match for categories (so "136 M&Ms" matches "M&M")
    let itemCategory = 'Uncategorized';
    for (const c of GLOBAL_CATALOG) {
      if (productObj.item.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(productObj.item.toLowerCase())) {
        itemCategory = c.category;
        break;
      }
    }
    
    shoppingList.push({
      item: productObj.item,
      category: itemCategory,
      machineDeficit: productObj.machineDeficit,
      warehouseStock: productObj.warehouseStock,
      netNeededToBuy: netNeededToBuy,
      caseSize: productObj.caseSize,
      casesToBuy: casesToBuy,
      leftoverYield: leftoverYield,
      pricingData: supplierData.results
    });
  });

  await Promise.all(promises);

  res.json({
    generatedAt: new Date().toISOString(),
    connectionError: error,
    warehouses: warehouses,
    shoppingList
  });
});

// ==========================================
// NEW: STATEFUL INVENTORY MANAGEMENT SYSTEM
// ==========================================

// Master Product Catalog with Categories
let GLOBAL_CATALOG = [
  // Beverages 
  { name: "Coke", category: "Beverage" }, { name: "Diet Coke", category: "Beverage" },
  { name: "Sprite", category: "Beverage" }, { name: "Mountain Dew", category: "Beverage" },
  { name: "Dr. Pepper", category: "Beverage" }, { name: "Pepsi", category: "Beverage" },
  { name: "Gatorade Zero", category: "Beverage" }, { name: "Diet Pepsi", category: "Beverage" },
  { name: "Bubly Lime", category: "Beverage" }, { name: "Canada Dry", category: "Beverage" },
  { name: "Minute Maid", category: "Beverage" }, { name: "Empty Drinks", category: "Beverage" },

  // Candies 
  { name: "Snickers", category: "Candy" }, { name: "M&M", category: "Candy" },
  { name: "Reese's", category: "Candy" }, { name: "Hershey", category: "Candy" }, 
  { name: "Kit Kat", category: "Candy" }, { name: "Twix", category: "Candy" }, 
  { name: "Milky Way", category: "Candy" }, { name: "Skittles", category: "Candy" }, 
  { name: "Empty Candy", category: "Candy" },

  // Snacks & Chips 
  { name: "Cap Cod", category: "Snack" }, { name: "Dots", category: "Snack" },
  { name: "DOTS- Pretzels", category: "Snack" }, { name: "Pirate Booty", category: "Snack" },
  { name: "Drizzilicious", category: "Snack" }, { name: "Cheez It", category: "Snack" },
  { name: "Lance", category: "Snack" }, { name: "Combos", category: "Snack" },
  { name: "Empty Snacks", category: "Snack" },

  // Pastries & Cookies
  { name: "Honey Buns", category: "Pastry" }, { name: "Pop Tarts", category: "Pastry" },
  { name: "Zebra Cakes", category: "Pastry" }, { name: "Little Bites", category: "Pastry" },
  { name: "Mini Chocolate Chip Cookies", category: "Pastry" }, { name: "Keebler", category: "Pastry" },
  { name: "Chips Ahoy", category: "Pastry" }, { name: "Oreos", category: "Pastry" },
  { name: "Nutty Buddy", category: "Pastry" }, { name: "Cosmic Brownie", category: "Pastry" },
  { name: "Big Texas Cinnamon Roll", category: "Pastry" }, { name: "Otis Spunkmeyer", category: "Pastry" }
];

// Fetch current inventory state
app.get('/api/inventory', async (req, res) => {
  const { machines, inventory, warehouses } = await nayaxService.getMachinesAndInventory();
  res.json({
    locations: Object.keys(warehouses),
    warehouses: warehouses,
    machines: machines,
    inventory: inventory,
    catalog: GLOBAL_CATALOG
  });
});

// Add a new warehouse/location
app.post('/api/inventory/locations', async (req, res) => {
  const { locationName } = req.body;
  const { warehouses } = await nayaxService.getMachinesAndInventory();
  
  if (locationName && !warehouses[locationName]) {
    warehouses[locationName] = {};
    return res.json({ success: true, message: "Location added", warehouses });
  }
  res.status(400).json({ error: "Location missing or already exists" });
});

// Edit/Rename a location
app.put('/api/inventory/locations', async (req, res) => {
  const { oldName, newName } = req.body;
  const { warehouses } = await nayaxService.getMachinesAndInventory();
  
  if (warehouses[oldName] && newName && !warehouses[newName]) {
    warehouses[newName] = warehouses[oldName];
    delete warehouses[oldName];
    return res.json({ success: true, warehouses });
  }
  res.status(400).json({ error: "Invalid rename parameters or location already exists." });
});

// Delete a location
app.delete('/api/inventory/locations/:name', async (req, res) => {
  const locName = decodeURIComponent(req.params.name);
  const { warehouses } = await nayaxService.getMachinesAndInventory();
  
  if (warehouses[locName]) {
    delete warehouses[locName];
    return res.json({ success: true, warehouses });
  }
  res.status(404).json({ error: "Location not found." });
});

// Add a new product to the Master Catalog
app.post('/api/inventory/products', (req, res) => {
  const { productName, category } = req.body;
  if (!productName || !category) {
    return res.status(400).json({ error: "Product name and category required" });
  }
  
  const exists = GLOBAL_CATALOG.find(p => p.name.toLowerCase() === productName.toLowerCase());
  if (!exists) {
    GLOBAL_CATALOG.push({ name: productName, category: category });
  }
  res.json({ success: true, catalog: GLOBAL_CATALOG });
});

// Log new product inventory (Manual Restock/Purchase entry)
app.post('/api/inventory/add', async (req, res) => {
  const { 
    locationName, 
    productName, 
    quantity, 
    // 10 Advanced Vending Operator Features
    expirationDate, 
    lastPurchased, 
    unitCost, 
    retailPrice,
    supplier, 
    binLocation,
    parLevel,
    upcBarcode,
    taxable,
    reorderThreshold
  } = req.body;
  
  const { warehouses } = await nayaxService.getMachinesAndInventory();
  
  if (!locationName || !productName || quantity === undefined) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  if (!warehouses[locationName]) {
    return res.status(404).json({ error: "Location does not exist" });
  }

  // Upgrade the structure: if it's currently a flat number (from our old mock data), convert it to an object.
  if (typeof warehouses[locationName][productName] === 'number') {
    const oldQty = warehouses[locationName][productName];
    warehouses[locationName][productName] = {
      quantity: oldQty,
      expirationDate: null,
      lastPurchased: null,
      unitCost: null,
      retailPrice: null,
      supplier: null,
      binLocation: null,
      parLevel: null,
      upcBarcode: null,
      taxable: false,
      reorderThreshold: null
    };
  }

  // Initialize product count at location if it doesn't exist
  if (!warehouses[locationName][productName]) {
    warehouses[locationName][productName] = {
      quantity: 0,
      expirationDate: expirationDate || null,
      lastPurchased: lastPurchased || new Date().toISOString().split('T')[0],
      unitCost: unitCost || null,
      retailPrice: retailPrice || null,
      supplier: supplier || null,
      binLocation: binLocation || null,
      parLevel: parLevel || null,
      upcBarcode: upcBarcode || null,
      taxable: taxable || false,
      reorderThreshold: reorderThreshold || null
    };
  }

  // Add (or subtract) the inventory
  warehouses[locationName][productName].quantity += parseInt(quantity, 10);
  
  // Update the metadata fields
  if (expirationDate) warehouses[locationName][productName].expirationDate = expirationDate;
  if (lastPurchased) warehouses[locationName][productName].lastPurchased = lastPurchased;
  if (unitCost) warehouses[locationName][productName].unitCost = parseFloat(unitCost);
  if (retailPrice) warehouses[locationName][productName].retailPrice = parseFloat(retailPrice);
  if (supplier) warehouses[locationName][productName].supplier = supplier;
  if (binLocation) warehouses[locationName][productName].binLocation = binLocation;
  if (parLevel) warehouses[locationName][productName].parLevel = parseInt(parLevel, 10);
  if (upcBarcode) warehouses[locationName][productName].upcBarcode = upcBarcode;
  if (taxable !== undefined) warehouses[locationName][productName].taxable = taxable;
  if (reorderThreshold) warehouses[locationName][productName].reorderThreshold = parseInt(reorderThreshold, 10);
  
  res.json({ success: true, warehouses });
});

// NEW: Fetch machine inventory history for trend charting
app.get('/api/history/:machineName', async (req, res) => {
  try {
    const machineName = req.params.machineName;
    const history = await databaseService.getHistoryForMachine(machineName);
    
    // Group items by timestamp for the frontend charts
    // Structure: [{ timestamp: '...', totalStock: 100, fillPercent: 80, items: [...] }]
    const grouped = history.reduce((acc, row) => {
      if (!acc[row.sync_timestamp]) {
        acc[row.sync_timestamp] = {
          timestamp: row.sync_timestamp,
          totalStock: 0,
          totalCapacity: 0,
          items: []
        };
      }
      acc[row.sync_timestamp].totalStock += row.current_stock;
      acc[row.sync_timestamp].totalCapacity += row.capacity;
      acc[row.sync_timestamp].items.push(row);
      return acc;
    }, {});

    const chartData = Object.values(grouped).map(g => ({
      ...g,
      fillPercent: g.totalCapacity > 0 ? Math.round((g.totalStock / g.totalCapacity) * 100) : 0
    })).sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

    res.json(chartData);
  } catch (e) {
    console.error("History fetch error:", e);
    res.status(500).json({ error: "Failed to fetch machine history." });
  }
});

// SERVE FRONTEND (Production Only)
// In development, we use the Vite dev server. In production (Render), we serve from /client/dist
const buildPath = path.join(__dirname, '../client/dist');
app.use(express.static(buildPath));

app.get('*', (req, res) => {
  if (!req.url.startsWith('/api/')) {
    res.sendFile(path.join(buildPath, 'index.html'));
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Vending Backend Server running on port ${PORT}`);
});
