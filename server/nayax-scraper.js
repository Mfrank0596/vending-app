const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

require('dotenv').config();

async function scrapeNayaxInventory(mfaCode = null) {
    console.log("🥷 Ninja is putting on Stealth Goggles... 🌫️");
    
    // Use a persistent context to "remember" the trusted device
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    });
    
    const page = await context.newPage();

    try {
        console.log("🏰 Walking calmly to the front gate (Human Simulation)...");
        await page.goto('https://my.nayax.com/core/LoginPage.aspx', { waitUntil: 'networkidle', timeout: 60000 });

        // Human-like pause
        await page.waitForTimeout(2000 + Math.random() * 3000);

        console.log("🔑 Hand-signing the ledger...");
        await page.waitForSelector('#txtUser', { timeout: 20000 });
        
        // Type like a human
        await page.type('#txtUser', process.env.NAYAX_USER, { delay: 100 + Math.random() * 100 });
        await page.waitForTimeout(500 + Math.random() * 1000);
        await page.type('#txtPassword', process.env.NAYAX_PASS, { delay: 100 + Math.random() * 100 });
        
        await page.waitForTimeout(1000);
        await page.click('#signin');

        // Check if we hit the MFA screen
        console.log("🕵️ Checking if the Guard needs a password...");
        await page.waitForTimeout(5000);

        if (await page.isVisible('#second_factor_option_totp_input')) {
            if (!mfaCode) {
                console.log("🛑 Guard stopped us for a 2FA code! Waiting for your signal...");
                await page.screenshot({ path: 'nayax_waiting_mfa.png' });
                await browser.close();
                return { status: "MFA_REQUIRED", message: "Code needed from your phone." };
            }
            
            console.log(`🔐 Using the Secret Passcode: ${mfaCode}`);
            await page.fill('#second_factor_option_totp_input', mfaCode);
            await page.waitForTimeout(1000);
            await page.click('#signin');
            await page.waitForTimeout(5000);
        }

        // Handle "Trust this device"
        if (await page.isVisible('#trustDeviceYes')) {
           console.log("🤝 Confirming our identity as a 'Trusted Friend'...");
           await page.click('#trustDeviceYes');
           await page.waitForTimeout(5000);
        }

        // Navigation Route provided by user - EXPORT HEIST
        console.log("🗺️ Ninja is following the Official Heist Plan to the Export button...");
        
        // 1. Click Operations
        await page.click('text=OPERATIONS');
        await page.waitForTimeout(2000);

        // 2. Select Inventory Dashboard
        await page.click('text=Inventory Dashboard');
        await page.waitForTimeout(8000);

        // 3. Select Area: MCMT Vending
        console.log("📍 Selecting Area: MCMT Vending...");
        await page.waitForSelector('.select2-container', { timeout: 20000 });
        await page.click('.select2-container');
        await page.waitForSelector('.select2-results__option', { timeout: 10000 });
        await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('.select2-results__option'));
            const match = options.find(o => o.innerText.includes('MCMT Vending'));
            if (match) match.click();
        });
        await page.waitForTimeout(2000);

        // 4. Click View Report
        console.log("📈 Clicking View Report...");
        await page.click('button:has-text("View Report"), #btnViewReport, .btn-primary');
        await page.waitForTimeout(10000);

        // 5. Select All Machines (Checkbox left of Machine Type Box)
        console.log("✅ Selecting All Machines...");
        await page.waitForSelector('input[type="checkbox"]', { timeout: 20000 });
        // Click the master checkbox in the header
        await page.click('th input[type="checkbox"], #checkAll, .master-checkbox');
        await page.waitForTimeout(2000);

        // 6. Export - Download Pick List
        console.log("📥 Triggering the Master Export...");
        await page.click('button:has-text("Export"), #btnExport');
        await page.waitForTimeout(2000);
        
        // Start waiting for download before clicking the specific link
        const downloadPromise = page.waitForEvent('download');
        await page.click('text=Download Pick List');
        const download = await downloadPromise;
        
        // Save the loot to our downloads folder
        const downloadPath = './downloads/nayax_picklist.xlsx';
        await download.saveAs(downloadPath);

        console.log(`🛍️ HEIST SUCCESSFUL! Master Pick List saved to: ${downloadPath}`);
        await browser.close();
        return { status: "Success", filePath: downloadPath };

    } catch (error) {
        console.error("❌ Ninja's mask slipped:", error.message);
        await page.screenshot({ path: 'nayax_ghost_fail.png' });
        await browser.close();
        return null;
    }
}

module.exports = { scrapeNayaxInventory };

