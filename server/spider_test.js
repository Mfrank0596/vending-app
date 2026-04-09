const fs = require('fs');

async function testWebUnlocker(name, url) {
    console.log(`\n☁️ Fetching ${name} via Bright Data Web Unlocker...`);
    try {
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 6ea1b547-8ea3-4829-8af7-d986da500c31'
            },
            body: JSON.stringify({
                zone: 'web_unlocker1',
                url: url,
                format: 'raw'
            })
        });

        if (!response.ok) {
            console.error(`❌ Bright Data API Error for ${name}:`, response.status, response.statusText);
            const errBody = await response.text();
            console.error(errBody);
            return;
        }

        const html = await response.text();
        fs.writeFileSync(`${name.toLowerCase().replace(/[^a-z]/g, '')}_test.html`, html);
        console.log(`✅ Successfully saved ${name} HTML (${html.length} bytes) to disk!`);
    } catch (e) {
        console.error(`❌ Fetch failed for ${name}:`, e.message);
    }
}

async function run() {
    await testWebUnlocker("Sams Club", "https://www.samsclub.com/s/snickers");
    await testWebUnlocker("Costco", "https://www.costco.com/CatalogSearch?keyword=snickers");
    await testWebUnlocker("Dollar General", "https://www.dollargeneral.com/search-results.html?q=snickers");
    // await testWebUnlocker("Martins", "https://martinsfoods.com/product-search/snickers"); // Leaving out to save time if needed, but let's test all
}

run();
