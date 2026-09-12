import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChefHat,
  CreditCard,
  Database,
  LayoutDashboard,
  MessageCircle,
  Receipt,
  Settings,
  Shield,
  ShoppingCart,
  Store,
  TableProperties,
  Tags,
  UserCog,
  UsersRound,
  UtensilsCrossed,
  Warehouse,
  CalendarDays,
  BanknoteIcon,
  Layers,
  LucideIcon,
} from "lucide-react";

export interface MenuItem {
  title: string;
  href: string;
  icon: LucideIcon;
  children?: MenuItem[];
}

export const MENU: Record<string, MenuItem[]> = {
  SUPER_ADMIN: [
    { title: "Restaurant Overview", href: "/dashboard/restaurants/all", icon: LayoutDashboard },
    { title: "Subscription Plans", href: "/dashboard/subscriptions/plans", icon: Layers },
    { title: "Roles & Permissions", href: "/dashboard/roles", icon: Shield },
    { title: "Payments", href: "/dashboard/payments", icon: CreditCard },
    { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
    { title: "System Configuration", href: "/dashboard/system-configuration", icon: Settings },
    { title: "Backups", href: "/dashboard/backups", icon: Database },
  ],

  OWNER: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "POS", href: "/dashboard/pos", icon: CreditCard },
    { title: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { title: "Kitchen", href: "/dashboard/kitchen", icon: ChefHat },
    { title: "Reservations", href: "/dashboard/reservations", icon: CalendarDays },
    { title: "Tables", href: "/dashboard/tables", icon: TableProperties },
    { title: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed },
    { title: "Categories", href: "/dashboard/owner/categories", icon: Tags },
    { title: "Inventory", href: "/dashboard/inventory", icon: Warehouse },
    { title: "Suppliers", href: "/dashboard/suppliers", icon: Store },
    { title: "Customers", href: "/dashboard/customers", icon: UsersRound },
    { title: "Staff", href: "/dashboard/staff", icon: UserCog },
    { title: "Billing", href: "/dashboard/billing", icon: Receipt },
    { title: "Expenses", href: "/dashboard/expenses", icon: Receipt },
    { title: "Finance", href: "/dashboard/finance", icon: BanknoteIcon },
    { title: "Reports", href: "/dashboard/reports", icon: BarChart3 },
    { title: "Branches", href: "/dashboard/branches", icon: Building2 },
    { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
    { title: "Email & SMS", href: "/dashboard/messaging", icon: MessageCircle },
    { title: "Roles & Permissions", href: "/dashboard/roles", icon: Shield },
    { title: "Activity Log", href: "/dashboard/activity", icon: Activity },
    { title: "Restaurant Profile", href: "/dashboard/restaurant-profile", icon: Store },
    { title: "Owner Profile", href: "/dashboard/owner-profile", icon: UserCog },
    { title: "Settings", href: "/dashboard/settings", icon: Settings },
  ],

  MANAGER: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "POS", href: "/dashboard/pos", icon: CreditCard },
    { title: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { title: "Kitchen", href: "/dashboard/kitchen", icon: ChefHat },
    { title: "Reservations", href: "/dashboard/reservations", icon: CalendarDays },
    { title: "Tables", href: "/dashboard/tables", icon: TableProperties },
    { title: "Menu", href: "/dashboard/menu", icon: UtensilsCrossed },
    { title: "Inventory", href: "/dashboard/inventory", icon: Warehouse },
    { title: "Customers", href: "/dashboard/customers", icon: UsersRound },
    { title: "Staff", href: "/dashboard/staff", icon: UserCog },
    { title: "Billing", href: "/dashboard/billing", icon: Receipt },
    { title: "Reports", href: "/dashboard/reports", icon: BarChart3 },
    { title: "Activity Log", href: "/dashboard/activity", icon: Activity },
  ],

  CASHIER: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "POS", href: "/dashboard/pos", icon: CreditCard },
    { title: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { title: "Billing & Receipts", href: "/dashboard/billing", icon: Receipt },
    { title: "Customers", href: "/dashboard/customers", icon: UsersRound },
    { title: "Notifications", href: "/dashboard/notifications", icon: Bell },
  ],

  WAITER: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "POS", href: "/dashboard/pos", icon: CreditCard },
    { title: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { title: "Tables", href: "/dashboard/tables", icon: TableProperties },
    { title: "Reservations", href: "/dashboard/reservations", icon: CalendarDays },
    { title: "Customers", href: "/dashboard/customers", icon: UsersRound },
  ],

  CHEF: [
    { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    { title: "Kitchen", href: "/dashboard/kitchen", icon: ChefHat },
    { title: "Orders", href: "/dashboard/orders", icon: ShoppingCart },
    { title: "Inventory", href: "/dashboard/inventory", icon: Warehouse },
  ],
};
