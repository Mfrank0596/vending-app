const cheerio = require('cheerio');

async function scrapeCostco(query) {
    console.log(`\n☁️ Routing Costco request for "${query}" through Bright Data...`);
    const searchUrl = `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(query)}`;

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

        const html = await response.text();
        
        // Check if we are still getting the "Premium Domain" error
        if (html.includes('requires Premium permissions')) {
            console.error('❌ Costco gating persists: Premium toggle not yet propagated.');
            return [{ title: 'Switching on Premium...', price: 'Wait 3m', link: 'https://brightdata.com' }];
        }

        const $ = cheerio.load(html);
        const products = [];

        // Costco Product Tile Selectors
        const items = $('.product-tile, .product, [data-testid="product-card"]');
        
        items.slice(0, 3).each((i, el) => {
            const item = $(el);
            const title = item.find('.description, [data-testid="product-description"]').text().trim() || 'Unknown Costco Product';
            const priceText = item.find('.price, [data-testid="product-price"]').text().trim();
            const link = item.find('a').attr('href');

            if (priceText) {
                products.push({
                    title,
                    price: priceText,
                    link: link ? (link.startsWith('http') ? link : 'https://www.costco.com' + link) : ''
                });
            }
        });

        return products;
    } catch (error) {
        console.error('❌ Costco Scraping failed:', error.message);
        return [];
    }
}

module.exports = { scrapeCostco };
