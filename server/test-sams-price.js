const SupplierService = require('./SupplierService');

async function testSams() {
    console.log('Testing Sam\'s Club Scraper Integration...');
    const result = await SupplierService.getSamsClubPrice('snickers');
    console.log('Final Result:', JSON.stringify(result, null, 2));
}

testSams();
