const cheerio = require('cheerio');

async function scrapeSamsClub(query) {
    console.log(`\n☁️ Routing Sam's Club request for "${query}" through Bright Data...`);
    const searchUrl = `https://www.samsclub.com/s/${encodeURIComponent(query)}`;

    try {
        const response = await fetch('https://api.brightdata.com/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer 6ea1b547-8ea3-4829-8af7-d986da500c31'
            },
            body: JSON.stringify({
                zone: 'web_unlocker1',
                url: searchUrl,
                format: 'raw'
            })
        });

        if (!response.ok) {
            console.error('❌ Bright Data API Error (Sam\'s):', response.status);
            return [];
        }

        const html = await response.text();
        const $ = cheerio.load(html);
        const products = [];

        // Sam's Club Product Card logic based on our test HTML
        // Looking at the HTML we saw [data-item-id] and [data-automation-id="product-price"]
        const items = $('[data-item-id]');
        
        items.slice(0, 3).each((i, el) => {
            const item = $(el);
            
            // Extract Title
            const titleElement = item.find('[data-automation-id="product-title"]');
            const title = titleElement.length ? titleElement.text().trim() : 'Unknown Product';
            
            // Extract Price
            let priceTextStr = 'Price Not Found';
            const priceElement = item.find('[data-automation-id="product-price"]');
            
            if (priceElement.length) {
                // Sam's might have "current price $..."
                const rawText = priceElement.text().replace(/\s+/g, '').replace(/currentprice/gi, '').trim();
                const match = rawText.match(/\$[0-9,]+\.[0-9]{2}/);
                if (match) {
                    priceTextStr = match[0];
                } else {
                    // Fallback to searching the whole string for a price pattern
                    const fallbackMatch = priceElement.text().match(/\$[0-9,]+\.[0-9]{2}/);
                    priceTextStr = fallbackMatch ? fallbackMatch[0] : priceElement.text().trim();
                }
            }

            // Extract URL
            const linkElement = item.find('a').first();
            let link = linkElement.length ? linkElement.attr('href') : '';
            if (link && !link.startsWith('http')) {
                link = 'https://www.samsclub.com' + link;
            }

            products.push({ title, price: priceTextStr, link });
        });

        return products;
    } catch (error) {
        console.error('❌ Sam\'s Club Scraping failed:', error.message);
        return [];
    }
}

module.exports = { scrapeSamsClub };
