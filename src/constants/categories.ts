export interface CategoryField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date';
  options?: string[];
  required?: boolean;
}

export interface CategoryDefinition {
  id: string;
  label: string;
  fields: CategoryField[];
}

export const PRODUCT_CATEGORIES: CategoryDefinition[] = [
  {
    id: 'electronics',
    label: 'Electronics',
    fields: [
      { name: 'brand', label: 'Brand', type: 'text', required: true },
      { name: 'model', label: 'Model', type: 'text' },
      { name: 'warranty', label: 'Warranty (Months)', type: 'number' },
      { name: 'battery', label: 'Battery Capacity', type: 'text' },
      { name: 'processor', label: 'Processor', type: 'text' }
    ]
  },
  {
    id: 'clothing',
    label: 'Clothing & Apparel',
    fields: [
      { name: 'brand', label: 'Brand', type: 'text' },
      { name: 'size', label: 'Size', type: 'select', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'Free Size'], required: true },
      { name: 'color', label: 'Color', type: 'text', required: true },
      { name: 'material', label: 'Material', type: 'text' },
      { name: 'gender', label: 'Gender', type: 'select', options: ['Men', 'Women', 'Unisex', 'Kids'] }
    ]
  },
  {
    id: 'groceries',
    label: 'Groceries & Food',
    fields: [
      { name: 'brand', label: 'Brand', type: 'text' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date', required: true },
      { name: 'weight', label: 'Weight/Volume', type: 'text', required: true },
      { name: 'ingredients', label: 'Ingredients', type: 'text' }
    ]
  },
  {
    id: 'furniture',
    label: 'Furniture',
    fields: [
      { name: 'material', label: 'Material', type: 'text', required: true },
      { name: 'dimensions', label: 'Dimensions (LxWxH)', type: 'text' },
      { name: 'color', label: 'Color', type: 'text' },
      { name: 'assembly', label: 'Assembly Required', type: 'select', options: ['Yes', 'No'] }
    ]
  },
  {
    id: 'auto_parts',
    label: 'Auto Parts',
    fields: [
      { name: 'make', label: 'Vehicle Make', type: 'text', required: true },
      { name: 'model', label: 'Vehicle Model', type: 'text', required: true },
      { name: 'year', label: 'Year', type: 'number' },
      { name: 'partNumber', label: 'Part Number', type: 'text' }
    ]
  },
  {
    id: 'cosmetics',
    label: 'Cosmetics & Personal Care',
    fields: [
      { name: 'brand', label: 'Brand', type: 'text', required: true },
      { name: 'skinType', label: 'Skin Type', type: 'select', options: ['All', 'Oily', 'Dry', 'Sensitive', 'Combination'] },
      { name: 'volume', label: 'Volume/Weight', type: 'text' },
      { name: 'expiryDate', label: 'Expiry Date', type: 'date' }
    ]
  },
  {
    id: 'other',
    label: 'Other',
    fields: [
      { name: 'brand', label: 'Brand', type: 'text' },
      { name: 'specification', label: 'Specification', type: 'text' }
    ]
  }
];
