require('dotenv').config();
const { mockMachines, mockInventory, mockWarehouses } = require('./mockNayaxData');

/**
 * Service to bridge our dashboard with the real Nayax Lynx API
 */
class NayaxService {
  constructor() {
    this.apiKey = process.env.NAYAX_API_KEY;
    this.tokenId = '46c552f7-e496-4873-a39e-c537d4f760d5'; // From your screenshot
    // UPDATED: This is the specific sub-path for Lynch/Token-based operational data
    this.baseUrl = 'https://lynx.nayax.com/operational/api/v1'; 
  }

  async getMachinesAndInventory() {
    try {
      console.log("\n📡 Using Official Offline PDF Bridge...");
      
      const fs = require('fs');
      const path = require('path');
      
      const offlinePath = path.join(__dirname, 'nayax_offline_data.json');
      
      if (!fs.existsSync(offlinePath)) {
          console.warn("⚠️ PDF Vault not found, falling back to Demo Mode.");
          return { machines: mockMachines, inventory: mockInventory, warehouses: mockWarehouses, error: "Please upload PickList PDF" };
      }

      const offlineData = JSON.parse(fs.readFileSync(offlinePath, 'utf8'));

      console.log(`🔍 Successfully loaded ${offlineData.machines.length} Master Locations from PDF!`);
      
      // We will use the exact data extracted from your PDF
      return { 
        machines: offlineData.machines, 
        inventory: offlineData.inventory, 
        warehouses: mockWarehouses, // Keep manual warehouse stashes for now
        error: null 
      };

    } catch (error) {
      console.error("\n❌ Global Nayax Connection Error:", error.message);
      return { machines: mockMachines, inventory: mockInventory, warehouses: mockWarehouses, error: "Error reading PDF Vault" };
    }
  }
}

module.exports = new NayaxService();
