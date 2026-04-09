const mockMachines = [
  { id: 1, name: "Breakroom Snack Machine", location: "1st Floor Building A", status: "Online" },
  { id: 2, name: "Lobby Drink Machine", location: "Lobby", status: "Online" },
  { id: 3, name: "Outdoor Machine", location: "Patio", status: "Offline" }
];

const mockInventory = {
  1: [
    { item: "Snickers Bar", price: 1.50, capacity: 20, currentStock: 2, category: "Candy", caseSize: 48 },
    { item: "Reese's Peanut Butter Cups", price: 1.50, capacity: 20, currentStock: 4, category: "Candy", caseSize: 36 },
    { item: "Doritos Nacho Cheese", price: 1.00, capacity: 15, currentStock: 1, category: "Chips", caseSize: 50 },
    { item: "Lay's Classic Potato Chips", price: 1.00, capacity: 15, currentStock: 0, category: "Chips", caseSize: 50 },
    { item: "Cheetos Crunchy", price: 1.00, capacity: 15, currentStock: 3, category: "Chips", caseSize: 50 }
  ],
  2: [
    { item: "Coca-Cola Classic", price: 2.00, capacity: 30, currentStock: 5, category: "Drink", caseSize: 24 },
    { item: "Diet Coke", price: 2.00, capacity: 30, currentStock: 3, category: "Drink", caseSize: 24 },
    { item: "Mountain Dew", price: 2.00, capacity: 30, currentStock: 2, category: "Drink", caseSize: 24 },
    { item: "Monster Energy Drink", price: 3.50, capacity: 20, currentStock: 4, category: "Drink", caseSize: 24 },
    { item: "Gatorade Fruit Punch", price: 2.50, capacity: 20, currentStock: 1, category: "Drink", caseSize: 24 }
  ]
};

// NEW: Multi-Location Warehouse Inventory Tracker
const mockWarehouses = {
  "Mike's House": {
    "Coca-Cola Classic": 10,
    "Diet Coke": 0
  },
  "Corey's House": {
    "Honey Buns": 9, // Example item
    "Snickers Bar": 0
  },
  "Moes": {
    "Snickers Bar": 3
  }
};

module.exports = { mockMachines, mockInventory, mockWarehouses };
