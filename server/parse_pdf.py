import json
import sys
import re
from docling.document_converter import DocumentConverter

def process_picklist(pdf_path):
    print(f"Starting Docling conversion on {pdf_path}...")
    converter = DocumentConverter()
    doc = converter.convert(pdf_path).document
    
    # Actually, Markdown export from docling is extremely consistent
    md_text = doc.export_to_markdown()
    
    # We will parse the markdown manually which is very clean
    lines = md_text.split('\n')
    
    final_machines = []
    final_inventory = {}
    active_machine = None
    
    # List of metadata tags and model names that Docling sometimes drops right after 'Name:'
    skip_tags = [
        'Number:', 'Serial:', 'Route:', 'Source:', 'Combo', 'Snacks', 'Cold Drinks', 
        'Wittern 3566', 'Seaga N2G 4000', r'Nayax LLC Default-VPOS T\O\F', 'DN 276E', 
        'Seaga N2G [101=0] (4000)'
    ]
    
    for i in range(len(lines)):
        line = lines[i].strip()
        
        if line == 'Name:':
            lookahead = 1
            found_name = None
            while i + lookahead < len(lines):
                potential = lines[i + lookahead].strip()
                if not potential:
                    lookahead += 1
                    continue
                if potential in skip_tags:
                    pass
                else:
                    found_name = potential
                    break
                lookahead += 1
                
            if found_name:
                active_machine = found_name
                # Exclude the Garage since it's the warehouse proxy, not a field machine!
                if active_machine.lower() != 'garage':
                    if active_machine not in [m['id'] for m in final_machines]:
                        final_machines.append({
                            'id': active_machine,
                            'MachineID': active_machine,
                            'MachineName': active_machine
                        })
                        final_inventory[active_machine] = []
            continue
                
        # Markdown tables in docling format: | BIN | Product | Price | Pick | On Hand... | PAR | Notes |
        if active_machine and active_machine.lower() != 'garage' and "|" in line and 3 < line.count("|") < 10:
            parts = [p.strip() for p in line.split("|")]
            # parts will have empty strings at ends: ['', '110', 'Mini Chocolate Chip..', '1.25', ...]
            if len(parts) >= 8:    
                bin_col = parts[1]
                prod_col = parts[2]
                price_col = parts[3]
                pick_col = parts[4]
                hand_col = parts[5]
                par_col = parts[6]
                
                # skip header or divider
                if "BIN" in bin_col or "---" in bin_col:
                    continue
                    
                # Clean up product name
                prod_name = prod_col
                # Sometimes product name has "Page 5 of 15" injected by bad pdf readers, but Docling is better.
                # Just in case, clean it
                prod_name = re.sub(r'Page \d+ of \d+', '', prod_name).strip()
                
                # COMPLETELY IGNORE EMPTY/UNKNOWN COLUMNS (e.g., Empty Snacks, Empty Candy, Unknown)
                if "empty" in prod_name.lower() or "unknown" in prod_name.lower():
                    continue
                
                try:
                    price = float(price_col.replace('$', ''))
                    deficit = int(pick_col)
                    on_hand = 0 if hand_col == '-' else int(hand_col)
                    par = int(par_col)
                    
                    final_inventory[active_machine].append({
                        "item": prod_name,
                        "price": price,
                        "capacity": par,
                        "currentStock": on_hand,
                        "deficit": deficit,
                        "bin": bin_col
                    })
                except ValueError:
                    # Not a valid data row
                    pass

    with open('nayax_offline_data.json', 'w') as f:
        json.dump({
            "machines": final_machines,
            "inventory": final_inventory
        }, f, indent=2)
        
    print(f"Successfully processed PDF with Docling! Found {len(final_machines)} machines.")

if __name__ == "__main__":
    target_pdf = sys.argv[1] if len(sys.argv) > 1 else "PickList.pdf"
    process_picklist(target_pdf)
