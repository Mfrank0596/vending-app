const SupplierService = require('./SupplierService');

async function test() {
  console.log("Fetching local Walmart prices with your SerpApi key...");
  
  // Let's test checking the price of a generic item like Coca-Cola
  const data = await SupplierService.getWalmartPrice('Diet Coke 12 Pack');
  
  console.log("-------------------");
  console.log("Result:");
  console.log(JSON.stringify(data, null, 2));
  console.log("-------------------");
}

test();
