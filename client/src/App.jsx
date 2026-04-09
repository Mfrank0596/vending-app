import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner, Html5Qrcode } from 'html5-qrcode';
import './index.css';

function App() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add('dark-theme');
    } else {
      document.body.classList.remove('dark-theme');
    }
  }, [darkMode]);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div className="sidebar-logo">🛒 VendMan</div>
        <ul className="nav-menu">
          <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 Dashboard</li>
          <li className={`nav-item ${activeTab === 'inventory' ? 'active' : ''}`} onClick={() => setActiveTab('inventory')}>🍔 My Warehouse</li>
          <li className={`nav-item ${activeTab === 'procurement' ? 'active' : ''}`} onClick={() => setActiveTab('procurement')}>📋 Shopping List</li>
          <li className="nav-item">📈 Reports</li>
          <li className="nav-item">⚙️ Settings</li>
        </ul>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        <header className="topbar">
          <div className="page-title">{activeTab === 'procurement' ? 'Shopping List > Missing Items' : 'Warehouse > My Storage'}</div>
          <div className="user-profile">
            <button onClick={() => setDarkMode(!darkMode)} style={{background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer'}} title="Toggle Theme">
              {darkMode ? '☀️' : '🌙'}
            </button>
            Administrator
          </div>
        </header>

        <div className="dashboard-wrapper">
          {activeTab === 'dashboard' ? <DashboardTab /> : 
           activeTab === 'procurement' ? <ProcurementTab /> : <InventoryTab darkMode={darkMode} />}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// PROCUREMENT TAB (Existing)
// ==========================================
function ProcurementTab() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [selectedItems, setSelectedItems] = useState(new Set());
  const [fetchingPrices, setFetchingPrices] = useState(new Set());

  const ALL_SUPPLIERS = ['Walmart', "Sam's Club", 'Costco', "Martin's Grocery", 'Dollar General'];
  const [displaySuppliers, setDisplaySuppliers] = useState(['Walmart', "Sam's Club"]);
  
  const [filterCat, setFilterCat] = useState('All');
  const [filterSnack, setFilterSnack] = useState('All');
  const [zipCode, setZipCode] = useState(localStorage.getItem('vendingZip') || '17403');

  const handleZipChange = (e) => {
    const val = e.target.value;
    setZipCode(val);
    localStorage.setItem('vendingZip', val);
  };

  const toggleSupplier = (supp) => {
    setDisplaySuppliers(prev => {
        if (prev.includes(supp)) return prev.filter(s => s !== supp);
        return [...prev, supp];
    });
  };

  useEffect(() => {
    fetch('/api/reports/shopping-list')
      .then(res => { if (!res.ok) throw new Error("HTTP " + res.status); return res.json(); })
      .then(data => { setReport(data); setLoading(false); })
      .catch(err => { setFetchError(err.toString()); setLoading(false); });
  }, []);

  const toggleSelect = (idx) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(idx)) newSelected.delete(idx);
    else newSelected.add(idx);
    setSelectedItems(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === report?.shoppingList.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(report?.shoppingList.map((_, i) => i)));
    }
  };

  const checkLivePrice = async (item, idx) => {
    if (fetchingPrices.has(idx)) return;
    
    // Add to fetching state
    setFetchingPrices(prev => new Set([...prev, idx]));
    
    try {
      const queryStr = `${item.item} ${item.caseSize} pack`;
      const suppliersParam = displaySuppliers.join(',');
      const res = await fetch(`/api/supplier/price?query=${encodeURIComponent(queryStr)}&suppliers=${encodeURIComponent(suppliersParam)}&zip=${zipCode}`);
      const data = await res.json();
      
      // Update report state with new pricing
      setReport(prevReport => {
        const newList = [...prevReport.shoppingList];
        newList[idx] = {
          ...newList[idx],
          pricingData: data.results || []
        };
        return { ...prevReport, shoppingList: newList };
      });
    } catch (e) {
      console.error(e);
      alert('Failed to check price.');
    } finally {
      // Remove from fetching state
      setFetchingPrices(prev => {
        const next = new Set(prev);
        next.delete(idx);
        return next;
      });
    }
  };

  const checkSelectedPrices = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item.');
      return;
    }

    const itemsToCheck = Array.from(selectedItems).map(idx => ({
      idx,
      queryStr: `${report.shoppingList[idx].item} ${report.shoppingList[idx].caseSize} pack`
    }));

    setFetchingPrices(prev => new Set([...prev, ...itemsToCheck.map(i => i.idx)]));

    try {
      const queries = itemsToCheck.map(i => i.queryStr);
      const res = await fetch(`/api/supplier/prices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queries, suppliers: displaySuppliers, zip: zipCode })
      });
      const data = await res.json();

      setReport(prevReport => {
        const newList = [...prevReport.shoppingList];
        itemsToCheck.forEach(({ idx, queryStr }) => {
          newList[idx] = {
            ...newList[idx],
            pricingData: data[queryStr]?.results || []
          };
        });
        return { ...prevReport, shoppingList: newList };
      });
    } catch (e) {
      console.error(e);
      alert('Failed to execute batch price check.');
    } finally {
      setFetchingPrices(prev => {
        const next = new Set(prev);
        itemsToCheck.forEach(i => next.delete(i.idx));
        return next;
      });
    }
  };

  const handleExportList = async () => {
    if (selectedItems.size === 0) return alert('Select at least one item to export!');
    
    // Transform selected item rows into the hierarchical backend payload
    const exportBody = {};
    Array.from(selectedItems).forEach(idx => {
       const row = report.shoppingList[idx];
       if (!exportBody[row.category]) exportBody[row.category] = [];
       exportBody[row.category].push({ name: row.item, qty_needed: row.casesToBuy });
    });
    
    const payload = Object.keys(exportBody).map(k => ({ category: k, items: exportBody[k] }));
    
    try {
        const res = await fetch('/api/export-shopping-list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) throw new Error("Export failed on server.");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Nayax_Costco_Manifest_${new Date().toLocaleDateString().replace(/\//g, '-')}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch(e) {
        alert("⚠️ Failed to export the Shopping List!");
        console.error(e);
    }
  };

  if (fetchError) return <div className="error-banner"><strong>Error Loading Data:</strong> {fetchError}</div>;
  if (loading) return <div className="loading-container"><div className="loading-pulse">Aggregating shopping list...</div></div>;

  return (
    <section className="card">
      <div className="card-header" style={{ alignItems: 'flex-start' }}>
        <div>
          <h2 className="card-title">My Smart Shopping List</h2>
          <p className="card-subtitle">Last synchronized: {new Date(report?.generatedAt).toLocaleTimeString()}</p>
          <div style={{ marginTop: '15px', display: 'flex', gap: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <strong style={{ fontSize: '0.85rem' }}>Local Zip:</strong>
              <input 
                type="text" 
                value={zipCode} 
                onChange={handleZipChange} 
                style={{ width: '80px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '0.85rem' }} 
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.85rem' }}>Compare Vendors:</strong>
                {ALL_SUPPLIERS.map(supp => (
                <label key={supp} style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={displaySuppliers.includes(supp)} onChange={() => toggleSupplier(supp)} />
                    {supp}
                </label>
                ))}
            </div>
          </div>
          <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'center' }}>
              <select style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} value={filterCat} onChange={e => { setFilterCat(e.target.value); setFilterSnack('All'); }}>
                 <option value="All">All Categories</option>
                 <option value="Snack">Snack</option>
                 <option value="Beverage">Beverage</option>
                 <option value="Candy">Candy</option>
                 <option value="Pastry">Pastry</option>
                 <option value="Healthy">Healthy</option>
                 <option value="Other">Other</option>
                 <option value="Uncategorized">Uncategorized</option>
              </select>
              <select style={{ padding: '6px 8px', borderRadius: '4px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' }} value={filterSnack} onChange={e => setFilterSnack(e.target.value)}>
                 <option value="All">Select a specific snack...</option>
                 {report?.shoppingList
                    .filter(item => filterCat === 'All' || item.category === filterCat)
                    .map(item => <option key={item.item} value={item.item}>{item.item}</option>)
                 }
              </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button className="btn-secondary" onClick={checkSelectedPrices}>Check {selectedItems.size} Selected Prices</button>
            <button className="btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#059669' }} onClick={handleExportList}>⬇️ Export to Excel</button>
        </div>
      </div>
      {report?.shoppingList?.length === 0 ? (
        <div style={{padding: '40px', textAlign: 'center', color: 'var(--text-secondary)'}}>No items require procurement at this time. Par levels are stable.</div>
      ) : (
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{width: '40px'}}><input type="checkbox" checked={selectedItems.size === report?.shoppingList.length && report?.shoppingList.length > 0} onChange={toggleSelectAll} /></th>
                <th>Check Prices</th>
                <th>Snack / Item</th>
                <th>Missing from Machines</th>
                <th>In My Garage</th>
                <th>Amount to Buy</th>
                <th>Leftover for Storage</th>
                {displaySuppliers.map(supp => <th key={supp}>{supp}</th>)}
                <th>Estimated Cost</th>
                <th>Smart Advice</th>
              </tr>
            </thead>
            <tbody>
              {report?.shoppingList
                ?.filter(item => filterCat === 'All' || item.category === filterCat)
                ?.filter(item => filterSnack === 'All' || item.item === filterSnack)
                ?.map((item, idx) => {
                const isSelected = selectedItems.has(idx);
                const isFetching = fetchingPrices.has(idx);

                let minPrice = Infinity;
                let bestSupplier = null;
                
                const suppElements = displaySuppliers.map(suppName => {
                    const suppData = item.pricingData ? item.pricingData.find(d => d.supplier === suppName) : null;
                    const sPrice = suppData?.price || Infinity;
                    if (sPrice < minPrice) {
                        minPrice = sPrice;
                        bestSupplier = suppName;
                    }
                    return (
                        <td key={suppName}>
                          <div className="supplier-price">{suppData?.price ? <a href={suppData.url || '#'} target="_blank" rel="noreferrer">${suppData.price}</a> : '-'}</div>
                          <div className={`supplier-status ${!suppData?.inStock && suppData?.price ? 'out-of-stock' : ''}`}>
                             {suppData?.price ? (suppData.inStock ? 'In Stock' : 'Out of Stock') : (isFetching ? 'Fetching...' : 'Click Check Live')}
                          </div>
                          {suppData?.error ? <div style={{fontSize:'0.65rem', color:'var(--danger-color)', marginTop: '4px'}}>{suppData.error}</div> : null}
                        </td>
                    );
                });
                
                let recommendation = "Check Prices";
                let totalCost = 0;
                
                if (item.casesToBuy === 0) {
                   recommendation = "Fulfilled by Warehouse";
                } else if (bestSupplier && minPrice !== Infinity) {
                   recommendation = `Create PO for ${item.casesToBuy} Case(s) (${bestSupplier})`;
                   totalCost = minPrice * item.casesToBuy;
                }

                return (
                  <tr key={idx} style={isSelected ? {background: 'rgba(37, 99, 235, 0.05)'} : {}}>
                    <td><input type="checkbox" checked={isSelected} onChange={() => toggleSelect(idx)} /></td>
                    <td>
                      <button className="btn-primary" style={{padding: '6px 10px', fontSize: '0.75rem', opacity: isFetching ? 0.5 : 1}} onClick={() => checkLivePrice(item, idx)} disabled={isFetching}>
                        {isFetching ? 'Checking...' : 'Check Live'}
                      </button>
                    </td>
                    <td>
                      <div className="item-name">{item.item}</div>
                      <div className="machine-tag">Target: {item.machineDeficit} units ({item.caseSize}/cs)</div>
                    </td>
                    <td><span className="badge" style={{background: 'var(--border-color)', color: 'var(--text-secondary)'}}>{item.machineDeficit}</span></td>
                    <td><span className="badge badge-primary">{item.warehouseStock}</span></td>
                    <td><span className="badge badge-warning">{item.casesToBuy} Cases</span></td>
                    <td><span className="badge" style={{background: '#dcfce7', color: '#15803d'}}>+{item.leftoverYield} to Storage</span></td>
                    {suppElements}
                    <td><strong>${totalCost > 0 ? totalCost.toFixed(2) : '0.00'}</strong></td>
                    <td className="recommendation-cell">{recommendation}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ==========================================
// NEW: INVENTORY TAB
// ==========================================
function InventoryTab({ darkMode }) {
  const [invState, setInvState] = useState(null);
  const [advMode, setAdvMode] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [reportType, setReportType] = useState('standard');
  const [showExportConfig, setShowExportConfig] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showLocManager, setShowLocManager] = useState(false);
  const [editLocName, setEditLocName] = useState('');
  const [activeEditLoc, setActiveEditLoc] = useState('');
  const [exportFields, setExportFields] = useState({
    category: true, qty: true, exp: true, cost: true, 
    retail: true, supplier: true, bin: true, par: true, upc: true
  });
  const [catColors, setCatColors] = useState({
    Snack: '#eab308',
    Beverage: '#3b82f6',
    Pastry: '#d946ef',
    Candy: '#ec4899',
    Healthy: '#22c55e',
    Other: '#64748b'
  });
  // Forms
  const [newLocName, setNewLocName] = useState('');
  
  // Custom Product Form
  const [newProdName, setNewProdName] = useState('');
  const [newProdCat, setNewProdCat] = useState('Snack');
  
  // Receive Inventory Form
  const [formLoc, setFormLoc] = useState('');
  const [formProdFilter, setFormProdFilter] = useState('All');
  const [formProd, setFormProd] = useState('');
  const [formQty, setFormQty] = useState('');
  
  // Advanced Form Fields
  const [formExpDate, setFormExpDate] = useState('');
  const [formLastPurch, setFormLastPurch] = useState('');
  const [formUnitCost, setFormUnitCost] = useState('');
  const [formRetailPrice, setFormRetailPrice] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formBin, setFormBin] = useState('');
  const [formPar, setFormPar] = useState('');
  const [formUpc, setFormUpc] = useState('');
  const [formTax, setFormTax] = useState(false);
  const [formReorder, setFormReorder] = useState('');

  // Filters & Sorting
  const [filterLoc, setFilterLoc] = useState('All');
  const [filterProd, setFilterProd] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'location', direction: 'asc' });

  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/inventory');
      const data = await res.json();
      setInvState(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchInventory(); }, []);

  const handleAddLocation = async (e) => {
    e.preventDefault();
    if (!newLocName.trim()) return;
    await fetch('/api/inventory/locations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locationName: newLocName })
    });
    setNewLocName('');
    fetchInventory();
  };

  const handleUpdateLocation = async (oldName, newName) => {
    if (!newName.trim()) return;
    try {
      const res = await fetch('/api/inventory/locations', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldName, newName })
      });
      if (!res.ok) throw new Error("Backend missing the PUT route.");
    } catch (err) {
      alert("⚠️ Update failed! Your server is running outdated code. Please go to your terminal running 'node index.js', press Ctrl+C, and run 'node index.js' again to reboot the database.");
    }
    setActiveEditLoc('');
    fetchInventory();
  };

  const handleDeleteLocation = async (name) => {
    if(!window.confirm(`⚠️ Are you absolutely sure you want to permanently delete "${name}"? ALL inventory currently logged inside this location will be destroyed!`)) return;
    try {
      const res = await fetch(`/api/inventory/locations/${encodeURIComponent(name)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Backend missing the DELETE route.");
    } catch (err) {
      alert("⚠️ Deletion failed! Your server is running outdated code. Please restart your 'node index.js' terminal.");
    }
    fetchInventory();
  };
  
  const handleAddNewProductCatalog = async (e) => {
    e.preventDefault();
    if (!newProdName.trim() || !newProdCat) return;
    await fetch('/api/inventory/products', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: newProdName, category: newProdCat })
    });
    setNewProdName('');
    fetchInventory();
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    if (!formLoc || !formProd || !formQty) return alert("Fill required logic: Location, Product, Qty");
    
    // Assemble the advanced payload
    const payload = { 
      locationName: formLoc, productName: formProd, quantity: formQty,
      expirationDate: formExpDate, lastPurchased: formLastPurch, unitCost: formUnitCost,
      retailPrice: formRetailPrice, supplier: formSupplier, binLocation: formBin,
      parLevel: formPar, upcBarcode: formUpc, taxable: formTax, reorderThreshold: formReorder
    };

    await fetch('/api/inventory/add', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    // Reset core inputs
    setFormLoc(''); setFormProd(''); setFormQty('');
    fetchInventory();
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleToggleRow = (id) => {
    const newSet = new Set(selectedRows);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedRows(newSet);
  };

  const handleColorChange = (cat, newColor) => {
    setCatColors(prev => ({ ...prev, [cat]: newColor }));
  };

  const handleToggleField = (field) => {
    setExportFields(prev => ({ ...prev, [field]: !prev[field] }));
  };

  const handleDefaultFields = () => {
    setExportFields({ category: true, qty: true, exp: true, cost: true, retail: true, supplier: true, bin: true, par: true, upc: true });
  };

  const handleScanSuccess = (decodedText) => {
    setShowScanner(false);
    
    // Attempt to match the UPC string to an existing inventory item
    const found = flatInventory.find(item => item.upc === decodedText);
    
    setAdvMode(true);
    setFormUpc(decodedText);
    
    if (found) {
      setFormLoc(found.location);
      setFormProdFilter(found.category);
      setFormProd(found.product);
      // Auto-fill success, the user just needs to type the Quantity!
    } else {
      setFormLoc('');
      setFormProdFilter('All');
      setFormProd('');
      alert("⚠️ Unknown Barcode detected! Please select the matching Location and Product below to teach the system this new UPC.");
    }
  };

  const handleFileUpload = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const html5QrCode = new Html5Qrcode("hidden-scanner");
      html5QrCode.scanFile(file, true)
        .then(decodedText => {
          handleScanSuccess(decodedText);
        })
        .catch(err => {
          alert("Couldn't find a barcode in that image! Try a different screenshot or ensure the barcode is clearly visible.");
        });
    }
  };

  if (!invState) return <div className="loading-pulse">Loading Inventory...</div>;

  // Flatten the nested JSON structure so we can filter and sort in a single table list
  let flatInventory = [];
  for (const [location, products] of Object.entries(invState.warehouses)) {
    for (const [product, details] of Object.entries(products)) {
      const catObj = invState.catalog.find(c => c.name === product);
      const category = catObj ? catObj.category : 'Uncategorized';
      let actualQty = 0;
      let meta = {};
      if (typeof details === 'number') { actualQty = details; } else { actualQty = details.quantity; meta = details; }

      flatInventory.push({ 
        location, product, category, qty: actualQty,
        exp: meta.expirationDate || '-', lastPurch: meta.lastPurchased || '-',
        cost: meta.unitCost ? `$${meta.unitCost}` : '-', retail: meta.retailPrice ? `$${meta.retailPrice}` : '-',
        supplier: meta.supplier || '-', bin: meta.binLocation || '-',
        par: meta.parLevel || '-', upc: meta.upcBarcode || '-',
        tax: meta.taxable ? 'Yes' : 'No', reorder: meta.reorderThreshold || '-'
      });
    }
  }

  // Apply filters
  if (filterLoc !== 'All') flatInventory = flatInventory.filter(item => item.location === filterLoc);
  if (filterProd) flatInventory = flatInventory.filter(item => item.product.toLowerCase().includes(filterProd.toLowerCase()));

  // Apply Sort
  flatInventory.sort((a, b) => {
    let valA = a[sortConfig.key];
    let valB = b[sortConfig.key];
    if (typeof valA === 'string') valA = valA.toLowerCase();
    if (typeof valB === 'string') valB = valB.toLowerCase();
    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleToggleAll = (e) => {
    if (e.target.checked) {
      const newSet = new Set(selectedRows);
      flatInventory.forEach(item => newSet.add(`${item.location}-${item.product}`));
      setSelectedRows(newSet);
    } else {
      const newSet = new Set(selectedRows);
      flatInventory.forEach(item => newSet.delete(`${item.location}-${item.product}`));
      setSelectedRows(newSet);
    }
  };

  const generatePDF = () => {
    const dataToExport = flatInventory.filter(item => 
      selectedRows.size === 0 || selectedRows.has(`${item.location}-${item.product}`)
    );

    const now = new Date().toLocaleString();
    
    // Build programmatic columns dictionary based on user settings
    const cols = [];
    if (reportType !== 'byProduct') cols.push({ key: 'product', label: 'Product' });
    if (reportType !== 'byLocation') cols.push({ key: 'location', label: 'Location' });
    
    if (exportFields.category) cols.push({ key: 'category', label: 'Category' });
    if (exportFields.qty) cols.push({ key: 'qty', label: 'Qty' });
    if (exportFields.exp) cols.push({ key: 'exp', label: 'Exp Date' });
    if (exportFields.cost) cols.push({ key: 'cost', label: 'Unit Cost' });
    if (exportFields.retail) cols.push({ key: 'retail', label: 'Retail' });
    if (exportFields.supplier) cols.push({ key: 'supplier', label: 'Supplier' });
    if (exportFields.bin) cols.push({ key: 'bin', label: 'Bin' });
    if (exportFields.par) cols.push({ key: 'par', label: 'Par Lvl' });
    if (exportFields.upc) cols.push({ key: 'upc', label: 'UPC' });

    const renderTable = (items) => {
      let tHTML = `<table><thead><tr>`;
      cols.forEach(c => tHTML += `<th>${c.label}</th>`);
      tHTML += `</tr></thead><tbody>`;
      items.forEach(item => {
        tHTML += `<tr>`;
        cols.forEach(c => {
          let val = item[c.key];
          if (c.key === 'upc' && val) val = `<span style="font-size:10px; color:#64748b;">${val}</span>`;
          tHTML += `<td>${val}</td>`;
        });
        tHTML += `</tr>`;
      });
      tHTML += `</tbody></table>`;
      return tHTML;
    };

    let bodyHtml = '';

    if (reportType === 'byLocation') {
      const grouped = {};
      dataToExport.forEach(item => {
        if (!grouped[item.location]) grouped[item.location] = [];
        grouped[item.location].push(item);
      });
      for (const [loc, items] of Object.entries(grouped)) {
        bodyHtml += `<h3>📍 Location: ${loc}</h3>` + renderTable(items);
      }
    } else if (reportType === 'byProduct') {
      const grouped = {};
      dataToExport.forEach(item => {
        if (!grouped[item.product]) grouped[item.product] = [];
        grouped[item.product].push(item);
      });
      for (const [prod, items] of Object.entries(grouped)) {
        const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
        bodyHtml += `<h3>🍔 Product: ${prod} <span style="font-size: 14px; font-weight: normal; color: #64748b;">(Total Qty: ${totalQty})</span></h3>` + renderTable(items);
      }
    } else {
      bodyHtml = renderTable(dataToExport);
    }

    const html = `
      <html>
        <head>
          <title>Stock Report - ${now}</title>
          <style>
            body { font-family: 'Inter', Helvetica, Arial, sans-serif; color: #333; padding: 20px; }
            h1 { color: #1e293b; font-size: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 5px; }
            h3 { color: #0f172a; margin-top: 25px; margin-bottom: 10px; font-size: 18px; }
            table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
            th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: bold; }
            .header-info { font-size: 14px; color: #64748b; margin-bottom: 20px; }
            @media print {
              @page { margin: 1cm; size: landscape; }
              body { padding: 0; }
              table { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <h1>VendMan Master Stock Report</h1>
          <div class="header-info">Generated: ${now} &nbsp;|&nbsp; Records Exported: ${dataToExport.length} &nbsp;|&nbsp; Format: <strong>${reportType.toUpperCase()}</strong></div>
          ${bodyHtml}
          <script>
            window.onload = function() { window.setTimeout(function() { window.print(); }, 200); }
          </script>
        </body>
      </html>
    `;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const inputStyle = { padding: '8px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-surface)', color: 'var(--text-primary)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Barcode Scanner Modal */}
      {showScanner && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{background: 'var(--bg-surface)', padding: '20px', borderRadius: '8px', maxWidth: '400px', width: '90%'}}>
            <h3 style={{marginTop: 0, color: 'var(--text-primary)', textAlign: 'center'}}>Scan UPC Barcode</h3>
            <BarcodeScannerPlugin onScanSuccess={handleScanSuccess} />
            <button onClick={(e) => { e.preventDefault(); setShowScanner(false); }} className="btn-secondary" style={{width: '100%', marginTop: '15px', background: 'var(--bg-hover)', color: 'var(--text-primary)'}}>Cancel Scan</button>
          </div>
        </div>
      )}

      {/* Location Editor Modal */}
      {showLocManager && (
        <div style={{position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', zIndex: 9998, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'}}>
          <div style={{background: 'var(--bg-surface)', padding: '20px', borderRadius: '8px', maxWidth: '500px', width: '90%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 10px 25px rgba(0,0,0,0.5)'}}>
            <h3 style={{marginTop: 0, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px'}}>📍 Edit Location Info</h3>
            
            <div style={{display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '15px'}}>
              {invState.locations.length === 0 ? <p style={{color: 'gray'}}>No custom locations added yet.</p> : invState.locations.map(loc => (
                <div key={loc} style={{display: 'flex', gap: '8px', alignItems: 'center', background: 'var(--bg-hover)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-color)'}}>
                  {activeEditLoc === loc ? (
                    <>
                      <input autoFocus style={{...inputStyle, flex: 1, padding: '6px 8px'}} value={editLocName} onChange={e=>setEditLocName(e.target.value)} />
                      <button onClick={()=>handleUpdateLocation(loc, editLocName)} style={{background: 'var(--accent-green)', padding: '6px 12px', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Save</button>
                      <button onClick={()=>setActiveEditLoc('')} style={{background: 'transparent', padding: '6px', color: 'var(--text-primary)', border: 'none', cursor: 'pointer'}}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <div style={{flex: 1, fontWeight: 'bold', fontSize: '0.95rem'}}>{loc}</div>
                      <button onClick={()=>{setActiveEditLoc(loc); setEditLocName(loc);}} style={{background: 'var(--accent-blue)', padding: '6px 12px', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>✏️ Edit Info</button>
                      <button onClick={()=>handleDeleteLocation(loc)} style={{background: '#1f2937', padding: '6px 12px', color: '#ff4444', border: '1px solid #ff4444', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold'}}>Delete</button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => setShowLocManager(false)} className="btn-secondary" style={{width: '100%', marginTop: '20px', padding: '12px', background: 'var(--bg-header)', color: 'var(--text-primary)', fontWeight: 'bold'}}>Close Editor</button>
          </div>
        </div>
      )}

      {/* Top Action Forms */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
        
        <section className="card" style={{ padding: '20px' }}>
          
          <h3 style={{ fontSize: '1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>🤖 Auto-Fill via Barcode Scanner</h3>
          <p style={{marginBottom: '15px', color: 'var(--text-secondary)', fontSize: '0.85rem'}}>
            Save time by scanning a product's UPC barcode. If the system recognizes it, we'll automatically fill out the form for you.
          </p>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={(e) => { e.preventDefault(); setShowScanner(true); }} style={{ flex: 1, padding: '12px 10px', background: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.2)'}}>
              📸 Use Camera to Scan Barcode
            </button>
            <label style={{ flex: 1, padding: '12px 10px', background: 'var(--bg-header)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '1rem', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)'}}>
              📁 Upload Photo of Barcode
              <input type="file" accept="image/*" onChange={handleFileUpload} style={{display: 'none'}} />
            </label>
          </div>

          <div id="hidden-scanner" style={{display: 'none'}}></div>

          <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: '15px', borderTop: '1px solid var(--border-color)', paddingTop: '15px'}}>
             <h3 style={{ fontSize: '1rem' }}>📦 Or Add Manually</h3>
             <button onClick={(e) => { e.preventDefault(); setAdvMode(!advMode); }} style={{fontSize: '0.8rem', cursor: 'pointer', border: '1px solid #ccc', padding: '4px 8px', borderRadius: '4px', background:'transparent', color:'inherit'}}>
               {advMode ? "- Hide Details" : "+ Add Extra Details (Cost, Exp, etc.)"}
             </button>
          </div>
          <form onSubmit={handleAddProduct} style={{ display: 'flex', gap: '8px', flexDirection: 'column' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select style={{...inputStyle, flex: 1}} value={formLoc} onChange={e => setFormLoc(e.target.value)}>
                <option value="">Select Location...</option>
                {invState.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
              </select>
              <select style={{...inputStyle, flex: 1}} value={formProdFilter} onChange={e => { setFormProdFilter(e.target.value); setFormProd(''); }}>
                <option value="All">All Categories Filter</option>
                <option value="Snack">Snacks Only</option>
                <option value="Beverage">Beverages Only</option>
                <option value="Candy">Candy Only</option>
                <option value="Pastry">Pastries Only</option>
                <option value="Healthy">Healthy Only</option>
                <option value="Other">Other Items</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select style={{...inputStyle, flex: 2}} value={formProd} onChange={e => setFormProd(e.target.value)}>
                <option value="">{formProdFilter === 'All' ? `Choose Product (${invState.catalog.length})` : `Choose ${formProdFilter}...`}</option>
                {invState.catalog
                  .filter(prod => formProdFilter === 'All' || prod.category === formProdFilter)
                  .map(prod => <option key={prod.name} value={prod.name}>{prod.name}</option>)}
              </select>
              <input style={{...inputStyle, flex: 1}} type="number" value={formQty} onChange={e => setFormQty(e.target.value)} placeholder="Qty" />
            </div>

            {/* Advanced Input Fields */}
            {advMode && (
              <div style={{background: 'var(--bg-hover)', padding: '15px', borderRadius: '8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', border: '1px solid var(--border-color)'}}>
                <label style={{...inputStyle, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px'}}>
                  <span style={{color: 'var(--text-secondary)', fontSize: '0.85rem'}}>Exp Date:</span>
                  <input style={{border: 'none', background: 'transparent', color: 'inherit', flex: 1, outline: 'none'}} type="date" value={formExpDate} onChange={e=>setFormExpDate(e.target.value)} />
                </label>
                <input style={inputStyle} type="text" value={formSupplier} onChange={e=>setFormSupplier(e.target.value)} placeholder="Supplier (e.g. Costco)" />
                <input style={inputStyle} type="number" step="0.01" value={formUnitCost} onChange={e=>setFormUnitCost(e.target.value)} placeholder="Unit Cost ($)" />
                <input style={inputStyle} type="number" step="0.01" value={formRetailPrice} onChange={e=>setFormRetailPrice(e.target.value)} placeholder="Retail Price ($)" />
                <input style={inputStyle} type="text" value={formBin} onChange={e=>setFormBin(e.target.value)} placeholder="Bin/Shelf Loc" />
                <input style={inputStyle} type="text" value={formUpc} onChange={e=>setFormUpc(e.target.value)} placeholder="UPC Barcode" />
                <input style={inputStyle} type="number" value={formPar} onChange={e=>setFormPar(e.target.value)} placeholder="Par / Target Level" />
                <input style={inputStyle} type="number" value={formReorder} onChange={e=>setFormReorder(e.target.value)} placeholder="Reorder Threshold" />
                <label style={{display: 'flex', alignItems: 'center', fontSize: '0.8rem'}}><input type="checkbox" checked={formTax} onChange={e=>setFormTax(e.target.checked)} style={{marginRight: '5px'}}/> Taxable Item</label>
              </div>
            )}

            <button className="btn-primary" style={{marginTop: '10px'}} type="submit">Log Stock</button>
          </form>
        </section>

        <section className="card" style={{ padding: '20px', background: 'var(--bg-hover)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ fontSize: '1rem', margin: 0 }}>⚙️ Add Locations, Products, & Settings</h3>
            <button onClick={(e) => { e.preventDefault(); setShowLocManager(true); }} style={{fontSize: '0.8rem', cursor: 'pointer', border: '1px solid var(--border-color)', padding: '4px 8px', borderRadius: '4px', background:'var(--bg-surface)', color:'inherit', fontWeight: 'bold'}}>
               ✏️ Edit Location Info
            </button>
          </div>
          
          <form onSubmit={handleAddLocation} style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <input style={{...inputStyle, flex: 1}} value={newLocName} onChange={(e) => setNewLocName(e.target.value)} placeholder="New Location Name..." />
            <button className="btn-secondary" type="submit">+ Create</button>
          </form>

          <form onSubmit={handleAddNewProductCatalog} style={{ display: 'flex', gap: '8px' }}>
            <input style={{...inputStyle, flex: 2}} value={newProdName} onChange={(e) => setNewProdName(e.target.value)} placeholder="New Custom Product..." />
            <select style={{...inputStyle, flex: 1}} value={newProdCat} onChange={(e) => setNewProdCat(e.target.value)}>
              <option value="Snack">Snack</option>
              <option value="Beverage">Beverage</option>
              <option value="Pastry">Pastry</option>
              <option value="Candy">Candy</option>
              <option value="Healthy">Healthy</option>
              <option value="Other">Other</option>
            </select>
            <button className="btn-secondary" type="submit">Add Item</button>
          </form>

          <h4 style={{marginTop: '20px', marginBottom: '10px', fontSize: '0.9rem'}}>🎨 Category Highlights</h4>
          <div style={{display: 'flex', gap: '15px', flexWrap: 'wrap'}}>
             {Object.keys(catColors).map(cat => (
                <label key={cat} style={{display:'flex', alignItems:'center', gap:'5px', fontSize:'0.8rem', cursor: 'pointer'}}>
                   <input type="color" value={catColors[cat]} onChange={e => handleColorChange(cat, e.target.value)} style={{width: '24px', height:'24px', padding:'0', border:'none', borderRadius:'4px', cursor:'pointer'}}/>
                   {cat}
                </label>
             ))}
          </div>
        </section>
      </div>

      {/* Main Inventory Table with Filters */}
      <section className="card">
        <div className="card-header" style={{ display: 'flex', gap: '15px', background: 'var(--bg-header)' }}>
          <div style={{ flex: 1 }}>
            <h2 className="card-title">My Warehouse Inventory</h2>
            <p className="card-subtitle">Showing {flatInventory.length} item(s) in storage.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginRight: 'auto' }}>
            <button onClick={() => setShowExportConfig(!showExportConfig)} className="btn-secondary" style={{padding: '4px 8px', display: 'flex', alignItems: 'center'}}>
               ⚙️ Choose Details to Print
            </button>
            <select style={{...inputStyle, padding: '4px 8px'}} value={reportType} onChange={e => setReportType(e.target.value)}>
              <option value="standard">Standard List</option>
              <option value="byLocation">Sort by Location</option>
              <option value="byProduct">Sort by Snack / Product</option>
            </select>
            <button onClick={generatePDF} className="btn-primary" style={{background: 'var(--accent-green)'}}>
              🖨️ {selectedRows.size > 0 ? `Print Selected (${selectedRows.size})` : 'Print Entire Warehouse List'}
            </button>
          </div>
          <select style={inputStyle} value={filterLoc} onChange={e => setFilterLoc(e.target.value)}>
             <option value="All">Filter by Location: All</option>
             {invState.locations.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </select>
          <input style={inputStyle} value={filterProd} onChange={(e) => setFilterProd(e.target.value)} placeholder="Search product name..." />
        </div>
        
        {showExportConfig && (
          <div style={{ width: '100%', padding: '12px 20px', background: 'var(--bg-hover)', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.85rem' }}>
            <span style={{fontWeight: 'bold', marginRight: '10px'}}>Details to Show on Report:</span>
            {Object.keys(exportFields).map(f => (
               <label key={f} style={{display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', textTransform: 'capitalize', color: exportFields[f] ? 'inherit' : 'var(--text-secondary)'}}>
                 <input type="checkbox" checked={exportFields[f]} onChange={() => handleToggleField(f)} /> {f}
               </label>
            ))}
            <button onClick={handleDefaultFields} style={{marginLeft: 'auto', background: 'none', border: '1px solid var(--border-color)', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem', color: 'inherit'}}>Select All Details</button>
          </div>
        )}

        <div className="table-responsive" style={{overflowX: 'auto'}}>
          <table className="data-table" style={{whiteSpace: 'nowrap'}}>
            <thead>
              <tr>
                <th><input type="checkbox" onChange={handleToggleAll} checked={flatInventory.length > 0 && selectedRows.size === flatInventory.length} /></th>
                <th onClick={() => handleSort('location')} style={{cursor: 'pointer', userSelect: 'none'}}>Where is it? {sortConfig.key==='location'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('product')} style={{cursor: 'pointer', userSelect: 'none'}}>Snack / Item {sortConfig.key==='product'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('category')} style={{cursor: 'pointer', userSelect: 'none'}}>Type {sortConfig.key==='category'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('qty')} style={{cursor: 'pointer', userSelect: 'none'}}>Currently Have {sortConfig.key==='qty'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('exp')} style={{cursor: 'pointer', userSelect: 'none'}}>Expires On {sortConfig.key==='exp'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('cost')} style={{cursor: 'pointer', userSelect: 'none'}}>Cost per Item {sortConfig.key==='cost'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('retail')} style={{cursor: 'pointer', userSelect: 'none'}}>Selling Price {sortConfig.key==='retail'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('supplier')} style={{cursor: 'pointer', userSelect: 'none'}}>Where we buy it {sortConfig.key==='supplier'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('bin')} style={{cursor: 'pointer', userSelect: 'none'}}>Shelf / Box {sortConfig.key==='bin'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('par')} style={{cursor: 'pointer', userSelect: 'none'}}>Refill Target {sortConfig.key==='par'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
                <th onClick={() => handleSort('upc')} style={{cursor: 'pointer', userSelect: 'none'}}>Barcode {sortConfig.key==='upc'?(sortConfig.direction==='asc'?'▲':'▼'):''}</th>
              </tr>
            </thead>
            <tbody>
              {flatInventory.length === 0 ? (
                <tr><td colSpan="12" style={{ textAlign: 'center', padding: '30px', color: 'gray' }}>No inventory matches current criteria.</td></tr>
              ) : (
                flatInventory.map((item, idx) => {
                  const id = `${item.location}-${item.product}`;
                  return (
                    <tr key={idx}>
                      <td><input type="checkbox" checked={selectedRows.has(id)} onChange={() => handleToggleRow(id)} /></td>
                      <td><strong>{item.location}</strong></td>
                      <td className="item-name">{item.product}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <span style={{
                          backgroundColor: `${catColors[item.category] || catColors['Other']}25`,
                          color: darkMode ? catColors[item.category] || catColors['Other'] : '#040914',
                          border: `1px solid ${catColors[item.category] || catColors['Other']}`,
                          padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold'
                        }}>
                          {item.category}
                        </span>
                      </td>
                      <td><span className="badge badge-primary">{item.qty} units</span></td>
                      <td style={{color: item.exp !== '-' ? 'var(--accent-red)' : 'inherit'}}>{item.exp}</td>
                      <td>{item.cost}</td>
                      <td>{item.retail}</td>
                      <td>{item.supplier}</td>
                      <td>{item.bin}</td>
                      <td>{item.par}</td>
                      <td style={{fontSize:'0.8rem', color:'#94a3b8'}}>{item.upc}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

const BarcodeScannerPlugin = ({ onScanSuccess }) => {
  useEffect(() => {
    // Inject the camera library directly into the DOM container
    const scanner = new Html5QrcodeScanner(
      "qr-reader", 
      { fps: 10, qrbox: { width: 250, height: 150 }, disableFlip: false },
      false
    );

    scanner.render((decodedText) => {
      // Execute the business logic instantly upon recognizing a string of numbers
      scanner.clear().catch(err => console.error("Failed to halt scanner gracefully", err));
      onScanSuccess(decodedText);
    }, (error) => {
      // Silently ignore normal scan failures until a lock is acquired
    });

    // Cleanup unmounts
    return () => {
      scanner.clear().catch(err => console.log(err));
    };
  }, [onScanSuccess]);

  return <div id="qr-reader" style={{ width: '100%', maxWidth: '350px', margin: '0 auto', background: 'white', color: 'black' }} />;
};

export default App;

// ==========================================
// NEW: SMART ADDRESS AUTOCOMPLETE COMPONENT (OpenStreetMap Photon API)
// ==========================================
const AddressAutocomplete = ({ value, onChange, placeholder, styleObject }) => {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [geoCoords, setGeoCoords] = useState(null);

  // Silently request browser location to prioritize local business/street searches!
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setGeoCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        (err) => console.log('Location bias disabled', err)
      );
    }
  }, []);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const fetchSuggestions = async (searchText) => {
    if (!searchText || searchText.length < 3) {
      setSuggestions([]); return;
    }
    
    // Official Geoapify API Intercept!
    let url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(searchText)}&apiKey=d1c232fd7fc449aaa4a1b85c526e7768&format=json&filter=countrycode:us`;

    // Strong proximity anchor around WV/VA/MD/DC using live tracking
    if (geoCoords) {
        url += `&bias=proximity:${geoCoords.lon},${geoCoords.lat}`;
    } else {
        // Fallback robust anchor locked on Martinsburg WV Nexus
        url += `&bias=proximity:-77.9628,39.4587`; 
    }
    
    try {
      const res = await fetch(url);
      const data = await res.json();
      setSuggestions(data.results || []);
    } catch (e) { console.error('Geocoding error:', e); }
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val, null);
    setShowDropdown(true);
    fetchSuggestions(val);
  };

  const handleSelect = (feature) => {
    // Geoapify returns a perfectly pre-formatted display string!
    const fullAddress = feature.formatted;
    setQuery(fullAddress);
    // Parse the Lat/Lon coordinates directly
    onChange(fullAddress, [parseFloat(feature.lon), parseFloat(feature.lat)]);
    setShowDropdown(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input 
        type="text" 
        value={query}
        onChange={handleInputChange}
        onFocus={() => { if (query.length >= 3) setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 250)}
        placeholder={placeholder || 'Start typing a place or address...'}
        style={{ ...styleObject, width: '100%' }}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '4px', listStyle: 'none', padding: 0, margin: 0, zIndex: 9999, maxHeight: '200px', overflowY: 'auto' }}>
          {suggestions.map((feature, i) => {
            const mainText = feature.address_line1 || feature.name || feature.street || feature.formatted;
            const subtitle = feature.address_line2 || '';
            return (
              <li 
                key={i} 
                onClick={() => handleSelect(feature)}
                style={{ padding: '8px 10px', borderBottom: '1px solid var(--border-color)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{mainText}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{subtitle}</div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

// ==========================================
// NEW: DASHBOARD TAB
function RouteHistoryChart({ machineName }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/history/${encodeURIComponent(machineName)}`)
      .then(res => res.json())
      .then(data => { setHistory(data); setLoading(false); })
      .catch(e => { console.error(e); setLoading(false); });
  }, [machineName]);

  if (loading) return <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Loading historic trends...</div>;
  if (history.length < 2) return <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>Insufficient historic data for charting (Need 2+ syncs)</div>;

  const width = 600;
  const height = 150;
  const padding = 30;
  
  const maxPerc = 100;
  const minPerc = 0;
  
  const points = history.map((h, i) => {
    const x = padding + (i / (history.length - 1)) * (width - padding * 2);
    const y = (height - padding) - (h.fillPercent / maxPerc) * (height - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div style={{ marginTop: '20px', background: 'var(--bg-surface)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
      <h4 style={{ marginBottom: '15px', color: 'var(--text-primary)' }}>Stock Level Over Time (%)</h4>
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {/* Grid Lines */}
        <line x1={padding} y1={padding} x2={padding} y2={height-padding} stroke="var(--border-color)" />
        <line x1={padding} y1={height-padding} x2={width-padding} y2={height-padding} stroke="var(--border-color)" />
        
        {/* The Line */}
        <polyline
          fill="none"
          stroke="var(--accent-green)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
          style={{ filter: 'drop-shadow(0px 4px 4px rgba(34, 197, 94, 0.3))' }}
        />
        
        {/* Data Points */}
        {history.map((h, i) => {
          const x = padding + (i / (history.length - 1)) * (width - padding * 2);
          const y = (height - padding) - (h.fillPercent / maxPerc) * (height - padding * 2);
          return (
            <g key={i}>
               <circle cx={x} cy={y} r="4" fill="var(--bg-surface)" stroke="var(--accent-green)" strokeWidth="2" />
               <text x={x} y={y - 10} textAnchor="middle" style={{ fontSize: '10px', fill: 'var(--text-secondary)' }}>{h.fillPercent}%</text>
               <text x={x} y={height - 10} textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--text-secondary)' }}>{new Date(h.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function InteractiveRouteMap({ routePath, routeJobs, startCoords, isExpanded, onToggleExpand }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);

  // 1. Initial Source Load & Map Setup
  useEffect(() => {
    if (!window.L) {
      // Inject CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(link);
      
      // Inject JS
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.async = true;
      script.onload = () => { initPersistentMap(); };
      document.head.appendChild(script);
    } else {
      initPersistentMap();
    }

    function initPersistentMap() {
      const L = window.L;
      if (!L || !mapRef.current || !startCoords) return;

      if (!mapInstance.current) {
        console.log("Initializing Persistent Map Instance");
        mapInstance.current = L.map(mapRef.current, { zoomControl: true }).setView([startCoords[1], startCoords[0]], 12);
        
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap'
        }).addTo(mapInstance.current);
      }

      const map = mapInstance.current;
      
      // Clear old markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) map.removeLayer(layer);
      });

      const bounds = L.latLngBounds();
      bounds.extend([startCoords[1], startCoords[0]]);

      // Home Marker
      L.marker([startCoords[1], startCoords[0]], {
        icon: L.divIcon({
          html: `<div style="background:#ef4444; width:30px; height:30px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; color:white; font-size:16px; box-shadow: 0 4px 10px rgba(0,0,0,0.5)">🏠</div>`,
          className: '', iconSize: [30, 30]
        })
      }).addTo(map);

      // Job Markers
      routePath?.features?.[0]?.properties?.actions?.filter(a => a.type === 'job').forEach((job, idx) => {
        const coords = routeJobs[job.job_index]?.location;
        if (coords) {
          L.marker([coords[1], coords[0]], {
            icon: L.divIcon({
              html: `<div style="background:#8b5cf6; width:26px; height:26px; border-radius:50%; border:2px solid white; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:12px; box-shadow: 0 4px 10px rgba(0,0,0,0.5)">${idx + 1}</div>`,
              className: '', iconSize: [26, 26]
            })
          }).addTo(map).bindPopup(`Stop ${idx + 1}: ${routeJobs[job.job_index]?.id}`);
          bounds.extend([coords[1], coords[0]]);
        }
      });

      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    }
  }, [routePath, routeJobs, startCoords]);

  // 2. Handle Resize/Expansion Invalidation
  useEffect(() => {
    if (mapInstance.current) {
      setTimeout(() => {
        mapInstance.current.invalidateSize({ animate: true });
      }, 300);
    }
  }, [isExpanded]);

  return (
    <div 
      style={{ 
        marginTop: '15px', 
        border: '3px solid #7c3aed', 
        borderRadius: '8px', 
        overflow: 'hidden', 
        position: 'relative',
        width: '100%',
        height: isExpanded ? '750px' : '350px',
        background: '#111',
        transition: 'height 0.4s ease-in-out',
        zIndex: 1
      }}
    >
      <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 0, color: '#444' }}>
         🛰️ Syncing Route Blueprint...
      </div>
      <div ref={mapRef} style={{ width: '100%', height: '100%', position: 'relative', zIndex: 1 }} />
      <button 
        onClick={(e) => { e.stopPropagation(); onToggleExpand(); }}
        style={{ 
          position: 'absolute', 
          top: '15px', 
          right: '15px', 
          zIndex: 1000, 
          padding: '10px 18px', 
          background: isExpanded ? '#4b5563' : '#7c3aed', 
          border: 'none', 
          borderRadius: '5px', 
          cursor: 'pointer',
          fontWeight: 'bold',
          color: 'white',
          boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        }}
      >
        {isExpanded ? '➖ Small View' : '🔍 Large View'}
      </button>
    </div>
  );
}

// ==========================================
function DashboardTab() {
  const [invState, setInvState] = useState(null);
  const [selectedMachine, setSelectedMachine] = useState(null);
  const [hoveredMachine, setHoveredMachine] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showRoutePlanner, setShowRoutePlanner] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  
  // Persistent Route System initialization
  const [startAddress, setStartAddress] = useState(() => localStorage.getItem('vending_start_address') || '');
  const [startCoords, setStartCoords] = useState(() => {
    const saved = localStorage.getItem('vending_start_coords');
    return saved ? JSON.parse(saved) : null;
  });
  const [machineLocations, setMachineLocations] = useState(() => {
    const saved = localStorage.getItem('vending_machine_locations');
    const defaults = {
      "Mill Creek Intermediate": { address: "8785 Winchester Ave, Inwood, WV 25413", coords: [-78.0464487, 39.3469645] },
      "Mussleman Middle School": { address: "105 Pride Ave, Bunker Hill, WV 25413", coords: [-78.0492606, 39.3475676] },
      "BCS - Opequon Elementary": { address: "395 East Road, Martinsburg, WV 25404", coords: [-77.9453612, 39.4722423] },
      "BCS Special Education Dept": { address: "401 South Queen Street, Martinsburg, WV 25401", coords: [-77.965355, 39.4535251] },
      "Mussleman Middle School - (DRINK) Dixie Narco": { address: "105 Pride Avenue, Bunker Hill, WV 25413", coords: [-78.0493096, 39.3476361] },
      "Mussleman High School": { address: "126 Excellence Way, Inwood, WV 25428", coords: [-78.0415316, 39.3518232] }
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });
  const [customStops, setCustomStops] = useState(() => {
    const saved = localStorage.getItem('vending_custom_stops');
    return saved ? JSON.parse(saved) : [];
  });
  const [routePath, setRoutePath] = useState(null);
  const [routeJobs, setRouteJobs] = useState([]);
  
  // Sync to Storage
  useEffect(() => {
    localStorage.setItem('vending_start_address', startAddress);
    localStorage.setItem('vending_start_coords', JSON.stringify(startCoords));
    localStorage.setItem('vending_machine_locations', JSON.stringify(machineLocations));
    localStorage.setItem('vending_custom_stops', JSON.stringify(customStops));
  }, [startAddress, startCoords, machineLocations, customStops]);
  
  const fileInputRef = useRef(null);

  const calculateOptimizedRoute = async () => {
    let activeStartCoords = startCoords;
    
    // Explicit Validation Check: We must force an explicit dropdown click rather than silent browser pulling
    if (!activeStartCoords || activeStartCoords.length !== 2) { 
        alert("Please explicitly select a Driver Start Location from the dropdown menu first! (Click an option so the system registers the coordinates)."); 
        return; 
    }

    const jobs = [];
    
    // Scrape the DOM for which boxes are actually checked to build the job list
    const jobCheckboxes = document.querySelectorAll('.route-inclusion-check');
    const selectedMachines = Array.from(jobCheckboxes)
      .filter(cb => cb.checked)
      .map(cb => cb.dataset.machineName);

    selectedMachines.forEach(name => {
      const loc = machineLocations[name];
      if (loc && loc.coords) {
        jobs.push({ id: name, location: [loc.coords[0], loc.coords[1]], duration: 300 });
      }
    });

    customStops.forEach(s => {
       if (s.coords) jobs.push({ id: s.address || "Custom Location", location: s.coords, duration: 300 });
    });

    if (jobs.length === 0) { alert("No valid map coordinates detected in the table."); return; }

    const payload = {
       mode: "drive",
       agents: [{ start_location: [activeStartCoords[0], activeStartCoords[1]], end_location: [activeStartCoords[0], activeStartCoords[1]] }],
       jobs: jobs
    };

    try {
        setIsUploading(true);
        const res = await fetch(`https://api.geoapify.com/v1/routeplanner?apiKey=d1c232fd7fc449aaa4a1b85c526e7768`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        
        if (!res.ok) {
           alert(`Routing API Error: ${data.message || 'Check your coordinates'}`);
           return;
        }

        setRouteJobs(jobs); // Cache the jobs payload index arrays
        setRoutePath(data);
    } catch (e) {
        console.error("Routing error", e);
        alert("Failed to calculate route.");
    } finally {
        setIsUploading(false);
    }
  };

  const fetchInventory = () => {
    fetch('/api/inventory')
      .then(res => res.json())
      .then(data => setInvState(data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('picklist', file);

    fetch('/api/upload-picklist', {
      method: 'POST',
      body: formData
    })
    .then(async (res) => {
       if (!res.ok) {
          const text = await res.text();
          throw new Error('Server error (' + res.status + '): ' + text);
       }
       return res.json();
    })
    .then(data => {
       if (data.error) alert('Error: ' + data.error);
       else {
         alert('Success! ' + data.message);
         fetchInventory(); 
       }
    })
    .catch(err => {
       console.error(err);
       alert('Upload Failed! Details: ' + err.message);
    })
    .finally(() => setIsUploading(false));
  };

  if (!invState) return <div className="loading-pulse">Calculating Live Fill Percentages...</div>;

  const getMachineStats = () => {
    if (!invState.machines || !invState.inventory) return [];
    
    return invState.machines.map(machine => {
      const items = invState.inventory[machine.MachineID] || [];
      let totalCapacity = 0;
      let totalStock = 0;
      
      items.forEach(item => {
        totalCapacity += parseInt(item.capacity) || 0;
        totalStock += parseInt(item.currentStock) || 0;
      });
      
      const fillPercent = totalCapacity > 0 ? Math.round((totalStock / totalCapacity) * 100) : 0;
      
      const missingItems = [...items]
        .filter(i => parseInt(i.deficit) > 0)
        .sort((a,b) => parseInt(b.deficit) - parseInt(a.deficit));
        
      const topMissingStr = missingItems.slice(0, 4).map(i => `${i.item}(${i.deficit})`).join(', ') + (missingItems.length > 4 ? '...' : '');
      
      return {
        ...machine,
        fullItems: items,
        topMissingStr,
        totalCapacity,
        totalStock,
        fillPercent
      };
    }).filter(m => m.totalCapacity > 0);
  };

  const machines = getMachineStats();

  if (selectedMachine) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
         <button className="btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setSelectedMachine(null)}>
            &larr; Back to Dashboard
         </button>
         <section className="card" style={{ padding: '20px' }}>
            <h2 className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{selectedMachine.MachineName} Inventory</span>
                <span style={{ color: selectedMachine.fillPercent < 50 ? 'var(--accent-red)' : selectedMachine.fillPercent < 80 ? '#eab308' : 'var(--accent-green)' }}>{selectedMachine.fillPercent}% Filled</span>
            </h2>
            
            <RouteHistoryChart machineName={selectedMachine.MachineName} />

            <div className="table-responsive" style={{ marginTop: '20px' }}>
                <table className="data-table">
                  <thead>
                    <tr><th>Bin</th><th>Product</th><th>Missing</th><th>Current Stock</th><th>Capacity (Par)</th></tr>
                  </thead>
                  <tbody>
                    {selectedMachine.fullItems.map((item, idx) => (
                       <tr key={idx}>
                         <td><span className="badge" style={{background: 'var(--border-color)', color: 'var(--text-secondary)'}}>{item.bin || '-'}</span></td>
                         <td><strong style={{color: 'var(--text-primary)'}}>{item.item}</strong></td>
                         <td><span className="badge" style={{background: parseInt(item.deficit) > 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)', color: parseInt(item.deficit) > 0 ? 'var(--danger-color)' : 'var(--accent-green)'}}>{item.deficit}</span></td>
                         <td><strong>{item.currentStock}</strong></td>
                         <td>{item.capacity}</td>
                       </tr>
                    ))}
                  </tbody>
                </table>
            </div>
         </section>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <section className="card" style={{ padding: '20px' }}>
         <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '15px' }}>
            <div>
                <h2 className="card-title">Live Vending Fleet Dashboard</h2>
                <p className="card-subtitle">Showing real-time fill level percentages across your active machines based on the latest PickList sync.</p>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <button 
                   className="btn-secondary" 
                   onClick={() => setShowRoutePlanner(true)}
                >
                   🗺️ Route Planner
                </button>
                <input 
                   type="file" 
                   accept="application/pdf" 
                   ref={fileInputRef} 
                   style={{ display: 'none' }} 
                   onChange={handleFileUpload} 
                />
                <button 
                   className="btn-primary" 
                   onClick={() => fileInputRef.current && fileInputRef.current.click()}
                   disabled={isUploading}
                   style={{ opacity: isUploading ? 0.7 : 1 }}
                >
                   {isUploading ? 'Extracting via AI...' : 'Upload AI PickList'}
                </button>
            </div>
         </div>
         
         {showRoutePlanner && (
            <div 
               onClick={() => { setShowRoutePlanner(false); setRoutePath(null); }}
               style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
               <div 
                  className="card" 
                  onClick={(e) => e.stopPropagation()}
                  style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', overflowY: 'auto', padding: '30px' }}
               >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                     <h2>Trip Optimizer & Routing engine</h2>
                     <button className="btn-secondary" onClick={() => setShowRoutePlanner(false)}>Close</button>
                  </div>
                  
                  <div style={{ background: 'var(--bg-hover)', padding: '20px', borderRadius: '8px', marginBottom: '20px' }}>
                     <label style={{ display: 'block', marginBottom: '10px', fontWeight: 'bold' }}>📍 Driver Start / End Location</label>
                     <AddressAutocomplete 
                         value={startAddress}
                         onChange={(text, coords) => { setStartAddress(text); if (coords) setStartCoords(coords); }}
                         placeholder="e.g. Nayax Warehouse, Atlanta GA"
                         styleObject={{ padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                     />
                  </div>
                  
                  <h3>Route Itinerary Selection</h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Select which machines you want to visit today. Critical machines (&lt; 55%) are auto-selected.</p>
                  
                  <div className="table-responsive" style={{ marginTop: '15px', maxHeight: '300px', overflowY: 'auto' }}>
                     <table className="data-table">
                        <thead>
                           <tr>
                              <th style={{ width: '10%' }}>Include</th>
                              <th style={{ width: '40%' }}>Location / Machine</th>
                              <th style={{ width: '15%' }}>Fill %</th>
                              <th style={{ width: '35%', minWidth: '280px' }}>Target Address</th>
                           </tr>
                        </thead>
                        <tbody>
                           {machines.map(m => (
                              <tr key={m.MachineID}>
                                 <td><input type="checkbox" className="route-inclusion-check" data-machine-name={m.MachineName} defaultChecked={m.fillPercent < 55} /></td>
                                 <td><strong>{m.MachineName}</strong></td>
                                 <td><span style={{ color: m.fillPercent < 55 ? 'var(--accent-red)' : 'var(--text-secondary)', fontWeight: m.fillPercent < 55 ? 'bold' : 'normal' }}>{m.fillPercent}%</span></td>
                                 <td>
                                     <AddressAutocomplete 
                                         value={machineLocations[m.MachineName]?.address || ''}
                                         onChange={(text, coords) => setMachineLocations({ ...machineLocations, [m.MachineName]: { address: text, coords }})}
                                         placeholder="Search location name / address..."
                                         styleObject={{ padding: '6px', fontSize: '0.85rem', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                                     />
                                 </td>
                              </tr>
                           ))}
                           {customStops.map(stop => (
                              <tr key={stop.id}>
                                 <td><input type="checkbox" defaultChecked /></td>
                                 <td><strong style={{ color: '#8b5cf6' }}>Custom Stop</strong></td>
                                 <td>-</td>
                                 <td style={{ display: 'flex', gap: '5px' }}>
                                     <AddressAutocomplete 
                                         value={stop.address}
                                         onChange={(text, coords) => setCustomStops(stops => stops.map(s => s.id === stop.id ? { ...s, address: text, coords } : s))}
                                         placeholder="Search wildcard address..."
                                         styleObject={{ padding: '6px', fontSize: '0.85rem', border: '1px solid var(--border-color)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }}
                                     />
                                     <button className="btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setCustomStops(s => s.filter(st => st.id !== stop.id))}>✕</button>
                                 </td>
                              </tr>
                           ))}
                        </tbody>
                     </table>
                  </div>
                  
                  <div style={{ marginTop: '10px' }}>
                     <button className="btn-secondary" style={{ fontSize: '0.85rem', padding: '6px 12px' }} onClick={() => setCustomStops([...customStops, { id: Date.now(), address: '', coords: null }])}>
                        ➕ Add Custom Stop
                     </button>
                  </div>
                  {routePath && routePath.features ? (
                     <div style={{ marginTop: '20px', padding: '20px', background: 'var(--bg-surface)', border: `2px solid var(--accent-green)`, borderRadius: '8px' }}>
                        <h3 style={{ color: 'var(--accent-green)', marginBottom: '10px' }}>✅ Optimized Itinerary Generated!</h3>
                        <div style={{ display: 'flex', gap: '20px', fontSize: '1.2rem', fontWeight: 'bold' }}>
                           <p>🚗 Total Drive: {(routePath.features[0].properties.distance / 1609.34).toFixed(1)} miles</p>
                           <p>⏱️ Total Drive Time: {Math.round((routePath.features[0].properties.time || 0) / 60)} minutes</p>
                        </div>
                        
                        <p style={{ marginTop: '10px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>You will complete {routePath.features[0]?.properties?.actions?.filter(a => a.type === 'job').length || 0} stops before returning to base.</p>
                        
                        <div style={{ marginTop: '15px', background: 'var(--bg-hover)', padding: '15px', borderRadius: '4px' }}>
                           <h4 style={{ marginBottom: '10px', borderBottom: '1px solid var(--border-color)', paddingBottom: '5px' }}>📍 Optimal Sequential Path:</h4>
                           <div style={{ paddingLeft: '5px', margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              <div style={{ marginBottom: '12px', color: 'var(--accent-green)', fontWeight: 'bold', fontSize: '0.85rem' }}>🚩 Start: {startAddress.split(',')[0]}</div>
                              
                              {routePath.features[0]?.properties?.actions?.filter(a => a.type === 'job').map((job, idx) => {
                                  const leg = routePath.features[0]?.properties?.legs?.[idx];
                                  const milesFromPrev = leg ? (leg.distance / 1609.34).toFixed(1) : '0';
                                  
                                  return (
                                    <div key={idx} style={{ marginBottom: '15px', position: 'relative', paddingLeft: '20px', borderLeft: '2px dashed var(--border-color)' }}>
                                       <div style={{ position: 'absolute', left: '-7px', top: '0', width: '12px', height: '12px', borderRadius: '50%', background: 'var(--accent-green)' }}></div>
                                       <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                          🚗 Drive {milesFromPrev} miles
                                       </div>
                                       <div>
                                          <strong>Stop {idx + 1}: {routeJobs[job.job_index]?.id || 'Delivery'}</strong>
                                          <span style={{ color: 'var(--text-secondary)', marginLeft: '8px', fontSize: '0.8rem' }}>(Drop: 5 mins)</span>
                                       </div>
                                    </div>
                                  );
                              })}
                              
                              <div style={{ marginTop: '10px', color: 'var(--text-secondary)', fontWeight: 'bold', fontSize: '0.85rem', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                                 🏁 Return: {(routePath.features[0]?.properties?.legs?.[routePath.features[0]?.properties?.legs?.length - 1]?.distance / 1609.34).toFixed(1)} miles back to base
                              </div>
                           </div>
                        </div>

                        <InteractiveRouteMap 
                           routePath={routePath} 
                           routeJobs={routeJobs} 
                           startCoords={startCoords} 
                           isExpanded={mapExpanded} 
                           onToggleExpand={() => setMapExpanded(!mapExpanded)} 
                        />

                        <button className="btn-secondary" style={{ marginTop: '15px', width: '100%' }} onClick={() => setRoutePath(null)}>Reset Map Engine</button>
                     </div>
                  ) : (
                     <button className="btn-primary" onClick={calculateOptimizedRoute} disabled={isUploading} style={{ width: '100%', marginTop: '20px', padding: '15px', fontSize: '1.1rem', backgroundColor: '#8b5cf6', borderColor: '#7c3aed', opacity: isUploading ? 0.7 : 1 }}>
                        {isUploading ? '🛰️ Generating Blueprint...' : '🚀 Calculate Most Efficient Trip'}
                     </button>
                  )}
               </div>
            </div>
         )}
         
         <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {machines.length === 0 ? <p>No machines found in the latest PDF sync.</p> : machines.map((machine, idx) => {
               
               let color = 'var(--accent-green)';
               if (machine.fillPercent < 50) color = 'var(--accent-red)';
               else if (machine.fillPercent < 80) color = '#eab308'; // yellow

               return (
                 <div 
                   key={idx} 
                   onClick={() => setSelectedMachine(machine)}
                   onMouseEnter={() => setHoveredMachine(idx)}
                   onMouseLeave={() => setHoveredMachine(null)}
                   style={{ 
                     position: 'relative',
                     background: 'var(--bg-hover)', 
                     padding: '20px', 
                     borderRadius: '12px', 
                     border: '1px solid var(--border-color)', 
                     boxShadow: '0 4px 6px rgba(0,0,0,0.05)', 
                     display: 'flex', 
                     flexDirection: 'column', 
                     gap: '15px',
                     cursor: 'pointer',
                     transition: 'transform 0.2s, box-shadow 0.2s',
                     transform: hoveredMachine === idx ? 'translateY(-2px)' : 'none'
                   }}
                 >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{machine.MachineName}</h3>
                        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: color }}>
                           {machine.fillPercent}%
                        </div>
                    </div>
                    
                    {/* Tooltip Preview */}
                    {hoveredMachine === idx && machine.topMissingStr && (
                      <div style={{
                        position: 'absolute',
                        top: '-10px', right: '-10px',
                        background: 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                        padding: '10px 15px',
                        borderRadius: '8px',
                        boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                        border: '1px solid var(--border-color)',
                        zIndex: 10,
                        width: 'max-content',
                        maxWidth: '280px',
                        fontSize: '0.85rem',
                        pointerEvents: 'none'
                      }}>
                         <strong style={{ display: 'block', marginBottom: '5px', color: 'var(--accent-red)' }}>Highest Priority Missing:</strong>
                         {machine.topMissingStr}
                      </div>
                    )}
                    
                    {/* The Progress Bar */}
                    <div style={{ width: '100%', height: '10px', backgroundColor: 'var(--border-color)', borderRadius: '5px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: machine.fillPercent + '%', backgroundColor: color, transition: 'width 0.5s ease' }}></div>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <span><strong>{machine.totalStock}</strong> units stocked</span>
                        <span><strong>{machine.totalCapacity - machine.totalStock}</strong> missing slots</span>
                    </div>
                 </div>
               );
            })}
         </div>
      </section>
    </div>
  );
}
