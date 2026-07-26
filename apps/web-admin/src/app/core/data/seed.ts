import {
  Booking,
  Bed,
  KycSubmission,
  Payment,
  Property,
  Resident,
  Ticket,
} from './models';

export const PROPERTIES: Property[] = [
  { id: 'p1', name: 'Sunrise Residency', type: 'CO_LIVING', city: 'Bengaluru', address: 'HSR Layout, Sector 2', totalBeds: 120, occupiedBeds: 104, monthlyRevenuePaise: 18_72_000_00, manager: 'Rohan Verma', rating: 4.6 },
  { id: 'p2', name: 'Urban Nest PG', type: 'PG', city: 'Pune', address: 'Koregaon Park', totalBeds: 80, occupiedBeds: 71, monthlyRevenuePaise: 9_94_000_00, manager: 'Sneha Kulkarni', rating: 4.4 },
  { id: 'p3', name: 'Metro Hostel', type: 'HOSTEL', city: 'Hyderabad', address: 'Gachibowli', totalBeds: 200, occupiedBeds: 158, monthlyRevenuePaise: 22_12_000_00, manager: 'Imran Khan', rating: 4.2 },
  { id: 'p4', name: 'Garden View Rentals', type: 'RENTAL', city: 'Mumbai', address: 'Andheri West', totalBeds: 48, occupiedBeds: 45, monthlyRevenuePaise: 27_50_000_00, manager: 'Neha Patil', rating: 4.8 },
  { id: 'p5', name: 'Skyline Co-Living', type: 'CO_LIVING', city: 'Gurugram', address: 'Cyber City', totalBeds: 150, occupiedBeds: 132, monthlyRevenuePaise: 31_20_000_00, manager: 'Aditya Rao', rating: 4.5 },
];

export const RESIDENTS: Resident[] = [
  { id: 'r1', name: 'Ananya Iyer', initials: 'AI', phone: '+91 98450 11223', email: 'ananya@example.com', propertyId: 'p1', bedLabel: 'A-204', status: 'CHECKED_IN', kyc: 'APPROVED', joinedOn: '2025-11-02', duesPaise: 0 },
  { id: 'r2', name: 'Karthik Nair', initials: 'KN', phone: '+91 99001 22334', email: 'karthik@example.com', propertyId: 'p1', bedLabel: 'B-110', status: 'CHECKED_IN', kyc: 'NEEDS_REVIEW', joinedOn: '2026-01-15', duesPaise: 8_500_00 },
  { id: 'r3', name: 'Meera Joshi', initials: 'MJ', phone: '+91 98800 44556', email: 'meera@example.com', propertyId: 'p2', bedLabel: 'C-301', status: 'NOTICE_GIVEN', kyc: 'APPROVED', joinedOn: '2025-08-20', duesPaise: 0 },
  { id: 'r4', name: 'Vikram Singh', initials: 'VS', phone: '+91 97400 66778', email: 'vikram@example.com', propertyId: 'p3', bedLabel: 'D-012', status: 'CHECKED_IN', kyc: 'SUBMITTED', joinedOn: '2026-03-01', duesPaise: 12_000_00 },
  { id: 'r5', name: 'Diya Reddy', initials: 'DR', phone: '+91 96500 88990', email: 'diya@example.com', propertyId: 'p5', bedLabel: 'E-220', status: 'RESERVED', kyc: 'PENDING', joinedOn: '2026-06-15', duesPaise: 0 },
  { id: 'r6', name: 'Arjun Menon', initials: 'AM', phone: '+91 95000 12121', email: 'arjun@example.com', propertyId: 'p4', bedLabel: 'F-101', status: 'CHECKED_IN', kyc: 'APPROVED', joinedOn: '2024-12-10', duesPaise: 0 },
];

export const BEDS: Bed[] = Array.from({ length: 24 }).map((_, i) => {
  const statuses: Bed['status'][] = ['OCCUPIED', 'OCCUPIED', 'OCCUPIED', 'AVAILABLE', 'RESERVED', 'MAINTENANCE'];
  return {
    id: `b${i + 1}`,
    label: `A-${100 + i}`,
    roomNo: `${Math.floor(i / 3) + 101}`,
    floor: Math.floor(i / 8) + 1,
    propertyId: 'p1',
    status: statuses[i % statuses.length],
    rentPaise: 9_500_00 + (i % 4) * 1_000_00,
  };
});

export const BOOKINGS: Booking[] = [
  { id: 'bk1', residentName: 'Diya Reddy', initials: 'DR', propertyId: 'p5', bedLabel: 'E-220', status: 'RESERVED', checkIn: '2026-06-15', amountPaise: 14_000_00 },
  { id: 'bk2', residentName: 'Ananya Iyer', initials: 'AI', propertyId: 'p1', bedLabel: 'A-204', status: 'CHECKED_IN', checkIn: '2025-11-02', amountPaise: 11_500_00 },
  { id: 'bk3', residentName: 'Meera Joshi', initials: 'MJ', propertyId: 'p2', bedLabel: 'C-301', status: 'NOTICE_GIVEN', checkIn: '2025-08-20', checkOut: '2026-06-30', amountPaise: 10_000_00 },
  { id: 'bk4', residentName: 'Rahul Das', initials: 'RD', propertyId: 'p3', bedLabel: 'D-019', status: 'CHECKED_OUT', checkIn: '2025-02-01', checkOut: '2026-05-28', amountPaise: 9_000_00 },
];

export const PAYMENTS: Payment[] = [
  { id: 'pay1', residentName: 'Karthik Nair', initials: 'KN', propertyId: 'p1', amountPaise: 8_500_00, status: 'OVERDUE', dueDate: '2026-06-01' },
  { id: 'pay2', residentName: 'Vikram Singh', initials: 'VS', propertyId: 'p3', amountPaise: 12_000_00, status: 'DUE', dueDate: '2026-06-15' },
  { id: 'pay3', residentName: 'Ananya Iyer', initials: 'AI', propertyId: 'p1', amountPaise: 11_500_00, status: 'PAID', dueDate: '2026-06-01', method: 'UPI' },
  { id: 'pay4', residentName: 'Arjun Menon', initials: 'AM', propertyId: 'p4', amountPaise: 22_000_00, status: 'PAID', dueDate: '2026-06-03', method: 'Card' },
  { id: 'pay5', residentName: 'Meera Joshi', initials: 'MJ', propertyId: 'p2', amountPaise: 10_000_00, status: 'PARTIAL', dueDate: '2026-06-10' },
];

export const TICKETS: Ticket[] = [
  { id: 't1', title: 'AC not cooling in Room 204', residentName: 'Ananya Iyer', propertyId: 'p1', status: 'OPEN', priority: 'HIGH', category: 'Maintenance', createdAt: '2026-06-09', assignee: 'Rohan Verma' },
  { id: 't2', title: 'WiFi intermittent on 3rd floor', residentName: 'Vikram Singh', propertyId: 'p3', status: 'IN_PROGRESS', priority: 'MEDIUM', category: 'Connectivity', createdAt: '2026-06-08', assignee: 'Imran Khan' },
  { id: 't3', title: 'Refund request for deposit', residentName: 'Meera Joshi', propertyId: 'p2', status: 'ESCALATED', priority: 'URGENT', category: 'Billing', createdAt: '2026-06-07' },
  { id: 't4', title: 'Housekeeping missed schedule', residentName: 'Arjun Menon', propertyId: 'p4', status: 'RESOLVED', priority: 'LOW', category: 'Housekeeping', createdAt: '2026-06-05', assignee: 'Neha Patil' },
];

export const KYC_SUBMISSIONS: KycSubmission[] = [
  { id: 'k1', residentName: 'Karthik Nair', initials: 'KN', docType: 'Aadhaar + PAN', status: 'NEEDS_REVIEW', submittedAt: '2026-06-10', riskScore: 62 },
  { id: 'k2', residentName: 'Vikram Singh', initials: 'VS', docType: 'Passport', status: 'SUBMITTED', submittedAt: '2026-06-09', riskScore: 28 },
  { id: 'k3', residentName: 'Diya Reddy', initials: 'DR', docType: 'Aadhaar', status: 'PENDING', submittedAt: '2026-06-11', riskScore: 15 },
  { id: 'k4', residentName: 'Sahil Gupta', initials: 'SG', docType: 'Driving License', status: 'APPROVED', submittedAt: '2026-06-06', riskScore: 9 },
  { id: 'k5', residentName: 'Fatima Sheikh', initials: 'FS', docType: 'Aadhaar + PAN', status: 'REJECTED', submittedAt: '2026-06-04', riskScore: 88 },
];
