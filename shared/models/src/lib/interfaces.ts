import {
  UserRole,
  UserStatus,
  KycStatus,
  PropertyStatus,
  PropertyType,
  RoomType,
  BedStatus,
  BookingStatus,
  Gender,
  PaymentMode,
} from './enums';

// ─── Pagination ──────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms
}

export interface LoginCredentials {
  phone: string;
  password: string;
}

// ─── User ────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  phone: string;
  email: string | null;
  role: UserRole;
  status: UserStatus;
  fullName: string | null;
  dateOfBirth: string | null;
  gender: Gender | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  occupation: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KycRecord {
  id: string;
  userId: string;
  status: KycStatus;
  documentType: string | null;
  documentUrl: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

// ─── Property ────────────────────────────────────────────────────────────────

export interface Property {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  propertyType: PropertyType;
  status: PropertyStatus;
  addressLine1: string;
  addressLine2: string | null;
  areaLocality: string | null;
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  securityDepositPaisa: number;
  noticePeriodDays: number;
  foodIncluded: boolean;
  foodDescription: string | null;
  rules: string | null;
  createdAt: string;
}

// ─── Booking ─────────────────────────────────────────────────────────────────

export interface Booking {
  id: string;
  bedId: string;
  tenantId: string;
  managerId: string | null;
  status: BookingStatus;
  rentPaisa: number;
  securityDepositPaisa: number;
  advancePaisa: number;
  paymentMode: PaymentMode;
  checkInDate: string | null;
  checkOutDate: string | null;
  noticePeriodDays: number | null;
  cancellationReason: string | null;
  createdAt: string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface OccupancyStats {
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  reservedBeds: number;
  blockedBeds: number;
  occupancyRate: number;
}

export interface BookingStats {
  totalBookings: number;
  activeBookings: number;
  checkInsToday: number;
  checkOutsToday: number;
  pendingNotices: number;
}

export interface RevenueStats {
  totalRevenuePaisa: number;
  monthlyRevenuePaisa: number;
  pendingRevenuePaisa: number;
}
