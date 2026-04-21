export interface ActivityLog {
  id?: string;
  userId: string; // Admin's ID
  staffId: string; // Staff's ID
  action: string; // e.g., 'login', 'create_invoice', 'delete_product'
  module: string; // e.g., 'sales', 'inventory'
  details?: string;
  timestamp: number;
}
