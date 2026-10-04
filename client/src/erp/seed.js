export const COST_CENTERS = [
  { code: '4711', label: '4711 · Opex – general' },
  { code: '0400', label: '0400 · Capex – equipment' },
  { code: '4720', label: '4720 · Opex – services' },
]

export const CAPTURE_INVOICES = [
  { id: 'INV-4471', supplier: 'Kessler Maschinen GmbH', entity: 'DE · Stuttgart', amount: 6850, date: '2026-12-03', description: 'CNC spindle replacement unit', category: 'equipment', costCenter: '4711', assetNo: '', status: 'open' },
  { id: 'INV-4472', supplier: 'Brandt Office Supplies', entity: 'DE · Stuttgart', amount: 312.4, date: '2026-12-04', description: 'Printer toner, December delivery', category: 'supplies', costCenter: '4711', assetNo: '', status: 'open' },
  { id: 'INV-4473', supplier: 'Strojírny Plzeň s.r.o.', entity: 'CZ · Plzeň (subsidiary)', amount: 2140, date: '2026-12-02', description: 'Machined brackets, batch 77', category: 'parts', costCenter: '4711', assetNo: '', status: 'open' },
]

export const TEACH_INVOICES = [
  { id: 'INV-5120', supplier: 'Kessler Maschinen GmbH', entity: 'DE · Stuttgart', amount: 7200, date: '2026-12-09', description: 'Hydraulic press, 20 t', category: 'equipment', costCenter: '4711', assetNo: '', status: 'open' },
]
