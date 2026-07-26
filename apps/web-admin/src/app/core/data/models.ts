/** Domain models for the NestPG mock-data layer. */

export type PropertyType = 'PG' | 'HOSTEL' | 'CO_LIVING' | 'RENTAL';
export type BedStatus = 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'MAINTENANCE' | 'BLOCKED';
export type BookingStatus = 'RESERVED' | 'CHECKED_IN' | 'NOTICE_GIVEN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
export type PaymentStatus = 'PAID' | 'DUE' | 'OVERDUE' | 'PARTIAL' | 'REFUNDED';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED';
export type TicketPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type KycStatus = 'PENDING' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVIEW';

export interface Property {
  id: string;
  name: string;
  type: PropertyType;
  city: string;
  address: string;
  status?: string;
  coverImageUrl?: string | null;
  totalBeds: number;
  occupiedBeds: number;
  /** Live bed-status breakdown (from backend `stats`). Optional for back-compat. */
  reservedBeds?: number;
  availableBeds?: number;
  maintenanceBeds?: number;
  occupancyRate?: number;
  monthlyRevenuePaise: number;
  manager: string;
  rating: number;
}

export interface Resident {
  id: string;
  name: string;
  initials: string;
  phone: string;
  email: string;
  propertyId: string;
  bedLabel: string;
  status: BookingStatus;
  kyc: KycStatus;
  joinedOn: string;
  duesPaise: number;
}

export interface Bed {
  id: string;
  label: string;
  roomNo: string;
  floor: number;
  propertyId: string;
  status: BedStatus;
  residentId?: string;
  rentPaise: number;
}

export interface Booking {
  id: string;
  residentName: string;
  initials: string;
  propertyId: string;
  bedLabel: string;
  status: BookingStatus;
  checkIn: string;
  checkOut?: string;
  amountPaise: number;
}

export interface Payment {
  id: string;
  residentName: string;
  initials: string;
  propertyId: string;
  amountPaise: number;
  status: PaymentStatus;
  dueDate: string;
  method?: string;
}

export interface Ticket {
  id: string;
  title: string;
  residentName: string;
  propertyId: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  createdAt: string;
  assignee?: string;
}

export interface KycSubmission {
  id: string;
  residentName: string;
  initials: string;
  docType: string;
  status: KycStatus;
  submittedAt: string;
  riskScore: number;
}

export interface PlatformStats {
  totalProperties: number;
  totalBeds: number;
  occupiedBeds: number;
  monthlyRevenuePaise: number;
  activeResidents: number;
  openTickets: number;
  pendingKyc: number;
  collectionRate: number;
}
