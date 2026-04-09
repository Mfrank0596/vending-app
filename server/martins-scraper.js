const cheerio = require('cheerio');

async function scrapeMartins(query, zip = '17403', debug = false) {
    // Add "single bar" to query if it's a candy name to avoid fun sizes
    const optimizedQuery = query.toLowerCase().includes('size') ? query : `${query} single bar`;
    console.log(`\n☁️ Routing Martin's request for "${optimizedQuery}" (Zip context: ${zip}) through Bright Data...`);
    const searchUrl = `https://martinsfoods.com/product-search/${encodeURIComponent(optimizedQuery)}`;

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
            console.error('❌ Bright Data API Error (Martin\'s):', response.status);
            return [];
        }

        const html = await response.text();
        if (debug) return html;

        const $ = cheerio.load(html);
        const products = [];

        // Martin's modern grid structure
        const items = $('.product-grid-cell, .product-list-item_component, .product-cell, [data-testid="product-card"]');
        
        items.each((i, el) => {
            const item = $(el);
            const title = item.find('.product-grid-cell_name-text, .product-list_link, .product-name, [data-testid="product-name"]').first().text().trim();
            const priceText = item.find('.product-grid-cell_main-price, .product-price_component, .product-price, [data-testid="product-price"]').first().text().trim();
            const link = item.find('a').first().attr('href');

            // FILTER: Avoid "Fun Size", "Ice Cream", and "Minis" to ensure it's a normal vending bar
            const lowerTitle = title.toLowerCase();
            const isExcluded = lowerTitle.includes('fun size') || 
                               lowerTitle.includes('ice cream') || 
                               lowerTitle.includes('minis') ||
                               lowerTitle.includes('bite');

            if (title && priceText && !isExcluded && !priceText.includes('0.00')) {
                products.push({
                    title,
                    price: priceText,
                    link: link ? (link.startsWith('http') ? link : 'https://martinsfoods.com' + link) : ''
                });
            }
        });

        // Limit to top 3 valid results
        return products.slice(0, 3);
    } catch (error) {
        console.error('❌ Martin\'s Scraping failed:', error.message);
        return [];
    }
}

module.exports = { scrapeMartins };
