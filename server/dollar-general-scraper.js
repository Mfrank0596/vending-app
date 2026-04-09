const cheerio = require('cheerio');

async function scrapeDollarGeneral(query, debug = false) {
    console.log(`\n☁️ Routing Dollar General request for "${query}" through Bright Data...`);
    const searchUrl = `https://www.dollargeneral.com/search-results.html?q=${encodeURIComponent(query)}`;

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
            console.error('❌ Bright Data API Error (Dollar General):', response.status);
            return [];
        }

        const html = await response.text();
        if (debug) return html;

        const $ = cheerio.load(html);
        const products = [];

        // Dollar General Search Result Item Logic
        // Searching for potential product-item containers in DG's HTML structure
        const items = $('.dg-product-card, [data-testid="product-card"]');
        
        items.slice(0, 3).each((i, el) => {
            const item = $(el);
            const title = item.find('.dg-product-card-title, [data-testid="product-title"]').text().trim() || 'Unknown DG Product';
            const priceText = item.find('.dg-product-card-price, .price, [data-testid="product-price"]').text().trim();
            const link = item.find('a').attr('href');

            if (priceText) {
                products.push({
                    title,
                    price: priceText,
                    link: link ? (link.startsWith('http') ? link : 'https://www.dollargeneral.com' + link) : ''
                });
            }
        });

        return products;
    } catch (error) {
        console.error('❌ Dollar General Scraping failed:', error.message);
        return [];
    }
}

module.exports = { scrapeDollarGeneral };
