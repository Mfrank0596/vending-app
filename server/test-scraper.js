const SupplierService = require('./SupplierService');

async function test() {
  console.log("Fetching Walmart prices with your SerpApi key...");
  const data = await SupplierService.getWalmartPrice('Diet Coke 12 Pack');
  console.log(JSON.stringify(data, null, 2));
}

test();
