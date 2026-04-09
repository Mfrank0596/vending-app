require('dotenv').config();
const { scrapeWalmart } = require('./walmart-playwright-scraper');
const { scrapeSamsClub } = require('./sams-club-scraper');
const { scrapeDollarGeneral } = require('./dollar-general-scraper');
const { scrapeMartins } = require('./martins-scraper');
const { scrapeCostco } = require('./costco-scraper');

/**
 * Service to fetch local pricing from Multi-Vendors
 */
class SupplierService {
  constructor() {
    this.brightDataToken = '6ea1b547-8ea3-4829-8af7-d986da500c31';
  }

  /**
   * Fetches the local price for a specific product at Walmart
   */
  async getWalmartPrice(query) {
    try {
      const results = await scrapeWalmart(query);
      if (results && results.length > 0) {
        const topResult = results[0];
        const parsedPrice = parseFloat(topResult.price.replace(/[^0-9.]/g, ''));
        return {
          supplier: 'Walmart',
          productName: topResult.title,
          price: isNaN(parsedPrice) ? null : parsedPrice,
          inStock: true,
          url: topResult.link,
          source: 'Bright Data'
        };
      }
      return { supplier: 'Walmart', price: null, inStock: false, error: 'No results found' };
    } catch (err) {
      return { supplier: 'Walmart', price: null, inStock: false, error: err.message };
    }
  }

  /**
   * Fetches the local bulk price for a specific product at Sam's Club
   */
  async getSamsClubPrice(query) {
    try {
      const results = await scrapeSamsClub(query);
      if (results && results.length > 0) {
        const topResult = results[0];
        const parsedPrice = parseFloat(topResult.price.replace(/[^0-9.]/g, ''));
        return {
          supplier: "Sam's Club",
          productName: topResult.title,
          price: isNaN(parsedPrice) ? null : parsedPrice,
          inStock: true,
          url: topResult.link,
          source: 'Bright Data'
        };
      }
      return { supplier: "Sam's Club", price: null, inStock: false, error: 'No results found' };
    } catch (err) {
      return { supplier: "Sam's Club", price: null, inStock: false, error: err.message };
    }
  }

  /**
   * Fetches product price at Dollar General
   */
  async getDollarGeneralPrice(query) {
    try {
      const results = await scrapeDollarGeneral(query);
      if (results && results.length > 0) {
        const topResult = results[0];
        const parsedPrice = parseFloat(topResult.price.replace(/[^0-9.]/g, ''));
        return {
          supplier: 'Dollar General',
          productName: topResult.title,
          price: isNaN(parsedPrice) ? null : parsedPrice,
          inStock: true,
          url: topResult.link,
          source: 'Bright Data'
        };
      }
      return { supplier: 'Dollar General', price: null, inStock: false, error: 'No results found' };
    } catch (err) {
      return { supplier: 'Dollar General', price: null, inStock: false, error: err.message };
    }
  }

  /**
   * Fetches product price at Martin's Grocery
   */
  async getMartinsPrice(query, zip) {
    try {
      const results = await scrapeMartins(query, zip);
      if (results && results.length > 0) {
        const topResult = results[0];
        const parsedPrice = parseFloat(topResult.price.replace(/[^0-9.]/g, ''));
        return {
          supplier: "Martin's Grocery",
          productName: topResult.title,
          price: isNaN(parsedPrice) ? null : parsedPrice,
          inStock: true,
          url: topResult.link,
          source: 'Bright Data'
        };
      }
      return { supplier: "Martin's Grocery", price: null, inStock: false, error: 'No results found' };
    } catch (err) {
      return { supplier: "Martin's Grocery", price: null, inStock: false, error: err.message };
    }
  }

  /**
   * Fetches product price at Costco
   */
  async getCostcoPrice(query) {
    try {
      const results = await scrapeCostco(query);
      if (results && results.length > 0) {
        const topResult = results[0];
        const parsedPrice = parseFloat(topResult.price.replace(/[^0-9.]/g, ''));
        return {
          supplier: 'Costco',
          productName: topResult.title,
          price: isNaN(parsedPrice) ? null : parsedPrice,
          inStock: !topResult.price.includes('Wait'),
          url: topResult.link,
          source: 'Bright Data'
        };
      }
      return { supplier: 'Costco', price: null, inStock: false, error: 'No results found' };
    } catch (err) {
      return { supplier: 'Costco', price: null, inStock: false, error: err.message };
    }
  }

  /**
   * Compares prices from selected suppliers simultaneously
   */
  async getBestPrice(query, targetSuppliers, zip) {
    const suppliersToSearch = targetSuppliers && targetSuppliers.length > 0 
        ? targetSuppliers 
        : ['Walmart', "Sam's Club", 'Costco', "Martin's Grocery", 'Dollar General'];

    const promises = suppliersToSearch.map(supplier => {
        if (supplier === 'Walmart') return this.getWalmartPrice(query);
        if (supplier === "Sam's Club") return this.getSamsClubPrice(query);
        if (supplier === 'Dollar General') return this.getDollarGeneralPrice(query);
        if (supplier === "Martin's Grocery") return this.getMartinsPrice(query, zip);
        if (supplier === 'Costco') return this.getCostcoPrice(query);
        
        return {
          supplier: supplier,
          productName: `${query} (Unknown)`,
          price: null,
          inStock: false,
          error: 'Supplier logic not implemented'
        };
    });

    const results = await Promise.all(promises);

    return {
      query,
      timestamp: new Date().toISOString(),
      results
    };
  }
}

module.exports = new SupplierService();
