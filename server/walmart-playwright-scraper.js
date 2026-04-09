const cheerio = require('cheerio');

async function scrapeWalmart(query) {
    console.log(`\n☁️ Routing request for "${query}" through Bright Data Web Unlocker...`);
    const searchUrl = `https://www.walmart.com/search?q=${encodeURIComponent(query)}`;

    try {
        // We use Bright Data's Web Unlocker API instead of Playwright!
        // This relies on Bright Data's own server-side rendering to completely bypass CAPTCHAs.
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 6ea1b547-8ea3-4829-8af7-d986da500c31'
            },
            body: JSON.stringify({
                zone: 'web_unlocker1',
                url: searchUrl,
                format: 'raw' // Return the raw HTML string
            })
        });

        if (!response.ok) {
            console.error('❌ Bright Data API Error:', response.status, response.statusText);
            return [];
        }

        console.log('✅ Bright Data successfully unlocked Walmart! Parsing HTML...');
        const html = await response.text();
        
        // Use Cheerio to parse the HTML string mathematically, much faster than a real browser!
        const $ = cheerio.load(html);

        const products = [];
        const items = $('[data-item-id]'); // Find all Walmart product cards
        
        // Extract the first 3 products
        items.slice(0, 3).each((i, el) => {
            const item = $(el);
            
            // Extract Title
            const titleElement = item.find('[data-automation-id="product-title"]');
            const title = titleElement.length ? titleElement.text().trim() : 'Unknown Product';
            
            // Extract Price
            let priceTextStr = 'Price Not Found';
            const priceElement = item.find('[data-automation-id="product-price"]');
            
            if (priceElement.length) {
                // Walmart often injects extra words for screen readers (e.g. "current price Now $14.99")
                const rawText = priceElement.text().replace(/\s+/g, '').replace(/currentpriceNow/gi, '').trim();
                const match = rawText.match(/\$[0-9,]+\.[0-9]{2}/);
                if (match) {
                    priceTextStr = match[0]; // e.g., "$14.99"
                } else {
                    priceTextStr = priceElement.text(); // Fallback
                }
            }

            // Extract URL link
            const linkElement = item.find('a').first();
            let link = linkElement.length ? linkElement.attr('href') : '';
            if (link && !link.startsWith('http')) {
                link = 'https://www.walmart.com' + link;
            }

            products.push({ title, price: priceTextStr, link });
        });

        if (products.length > 0) {
            console.log('\n✅ Successfully Extracted Data from Bright Data:');
            console.table(products);
            return products;
        } else {
            console.log('⚠️ Failed to find any products in the HTML returned by Bright Data.');
            console.log('Sample of what we got:', html.substring(0, 300) + '...');
            return [];
        }

    } catch (error) {
        console.error('❌ Web Unlocker Scraping failed:', error.message);
        return [];
    }
}

module.exports = { scrapeWalmart };
