# NestPG PMS — Entity Catalog

> Traced from `backend/libs/**/entities/*.entity.ts` + migrations `V1_001 … V3_022`.
> Every domain entity extends `BaseEntity`. Documentation only.

## BaseEntity (shared)
`libs/shared-utils/src/entities/base.entity.ts` — inherited by all domain entities:
`id (uuid pk)`, `createdAt`, `updatedAt`, `deletedAt (soft delete)`, `createdBy (uuid)`, `updatedBy (uuid)`.
Soft delete is the norm — list queries filter `deleted_at IS NULL`; partial indexes encode the same.

Money is integer **paise** everywhere. Enums are Postgres `enum` types.

---

## Identity & Auth

### User — `users`
Core account. Login by `phone`.
- `phone` (unique, 15), `email` (unique, nullable), `passwordHash` (select:false — never serialized), `role` (UserRole, default TENANT), `status` (UserStatus, default PENDING), `phoneVerifiedAt`, `emailVerifiedAt`, `lastLoginAt`, `failedLoginAttempts`, `lockedUntil`.
- Relations: 1–1 `UserProfile` (`profile`); 1–1 `UserKyc`; 1–N bookings/reservations as tenant; owns properties (PgProperty.ownerId).
- Index: `idx_users_role_status (role,status)`.
- Lifecycle: PENDING → ACTIVE (after OTP verify) → SUSPENDED/DELETED (admin). Runtime-derived `kycStatus`, `avatarUrl/avatarKey` are attached on read (not columns).

### UserProfile — `user_profiles`
1–1 with User (`user_id` unique).
- `fullName`, `dateOfBirth`, `gender` (Gender), `profilePhotoUrl`, `addressLine1`, `city`, `state`, `pincode`, `occupation`, `emergencyContactName`, `emergencyContactPhone`, `preferences` (jsonb).

### OtpVerification — `otp_verifications`
- `phone`, `otpHash`, `purpose` (REGISTRATION|LOGIN|PASSWORD_RESET|KYC), `attempts`, `expiresAt`, `verifiedAt`. Short-lived; consumed on verify.

### RefreshToken — `refresh_tokens`
- `userId`, `tokenHash` (unique), `deviceInfo` (jsonb), `expiresAt`, `revokedAt`. Rotated on `/auth/refresh`; revoked on logout/role-status change.

---

## KYC

### UserKyc — `user_kyc`
1–1 with User (`user_id` unique). Sensitive fields encrypted at rest (`*_encrypted` via `encryptTransformer`).
- `status` (KycStatus, default NOT_STARTED), `aadhaarNumberEncrypted`, `aadhaarName`, `aadhaarDob`, `aadhaarFrontUrl`, `aadhaarBackUrl`, `panNumberEncrypted`, `panName`, `panUrl`, `selfieUrl`, `livenessScore`, `reviewedBy`, `reviewedAt`, `rejectionReason`, `submittedAt`.
- Lifecycle: NOT_STARTED → SUBMITTED → (UNDER_REVIEW) → APPROVED | REJECTED.

### KycDocument — `kyc_documents`
Append-only document metadata. `userId`, `docType`, `s3Key` (KEY only, never URL), `submissionNo`, `status`, `reviewedBy`, `reviewedAt`, `rejectionReason`, `createdAt`.

### KycReview — `kyc_reviews`
Immutable audit row written per decision. `userId`, `reviewedBy`, `decision` (APPROVED|REJECTED), `reason`, `createdAt`.

---

## Properties & Structure

### PgProperty — `pg_properties`
- `ownerId`, `slug` (unique), `name`, `description`, `propertyType` (PropertyType), `status` (PropertyStatus, default DRAFT), `addressLine1/2`, `areaLocality`, `city`, `state`, `pincode`, `latitude`, `longitude`, `location` (point, generated), `totalBeds`, `availableBeds` (denormalized — superseded by live `beds` aggregation), `minPricePaisa`, `maxPricePaisa`, `securityDepositPaisa`, `noticePeriodDays`, `foodIncluded`, `foodDescription`, `rules` (text[]).
- Legacy orphan columns `cover_image_url`, `media_urls` exist in DB but are **no longer read/written** (superseded by the generic `media` table).
- Indexes: `idx_props_city_status`, `idx_props_owner`.
- Lifecycle: DRAFT → PENDING_REVIEW → ACTIVE → PAUSED / REJECTED / ARCHIVED.

### Building — `buildings`
- `propertyId`, `name`, `description`, `totalFloors`, `totalBeds`, `availableBeds`, `sortOrder`. Index `idx_buildings_property`.

### Floor — `floors`
- `buildingId`, `propertyId`, `floorNumber`, `label`, `totalBeds`, `availableBeds`.

---

## Inventory

### Room — `rooms`
- `floorId`, `buildingId`, `propertyId` (denormalized chain), `roomNumber`, `roomType` (RoomType), `status` (RoomStatus, default AVAILABLE), `capacity`, `currentOccupancy`, `furnishing` (FurnishingType), `attachedBathroom`, `acAvailable`, `balcony`, `areaSqft`, `description`, `mediaUrls` (text[] — **legacy orphan**, superseded by `media`). Indexes on floor/property.

### Bed — `beds`
Smallest rentable unit; carries denormalized location for fast queries.
- `roomId/floorId/buildingId/propertyId`, `bedNumber`, `label`, `status` (BedStatus, default AVAILABLE), `genderAllocation` (BedGender, default ANY), `pricePaisa`, `isPremium`, `notes`, `blockedReason`, `blockedUntil`, `currentTenantId`, `currentBookingId`, `expectedVacancyDate`, `lastOccupiedAt`, `lastVacatedAt`, `sortOrder`.
- Indexes: `idx_beds_prop_status`, partial `idx_beds_gender_avail` (AVAILABLE only).
- Lifecycle (status): AVAILABLE → RESERVED → OCCUPIED → VACATING_SOON → AVAILABLE; MAINTENANCE/BLOCKED are manual side-states. Booking/reservation flows drive AVAILABLE/RESERVED/OCCUPIED; only AVAILABLE/MAINTENANCE/BLOCKED are settable via the bed-status API.

### BedPricingRule — `bed_pricing_rules`
Time-boxed price override. `bedId`, `propertyId`, `ruleName`, `pricePaisa`, `validFrom`, `validTo`, `isActive`.

### WaitlistEntry — `waitlist_entries`
- `propertyId`, `tenantId`, `roomType`, `genderPreference`, `maxPricePaisa`, `preferredMoveIn`, `status` (WAITING|NOTIFIED|CONVERTED|EXPIRED|CANCELLED), `notifiedAt`, `notifiedBedId`, `expiresAt`.

---

## Booking & Occupancy

### BedReservation — `bed_reservations`
Temporary hold (default 2h TTL). `bedId`, `tenantId`, `propertyId`, `reservedFrom`, `reservedUntil`, `expiresAt`, `status` (ACTIVE|CONVERTED|EXPIRED|CANCELLED), `convertedToBookingId`.

### Booking — `bookings`
- `bookingNumber` (unique, generated via `booking_sequences`), `tenantId`, `bedId/roomId/floorId/buildingId/propertyId`, `ownerId`, `status` (BookingStatus, default PENDING), `checkInDate`, `checkOutDate`, `actualCheckInAt`, `actualCheckOutAt`, `rentPaisa`, `securityDepositPaisa`, `advancePaisa`, `totalPaidPaisa`, `paymentMode` (PayGateway), `specialRequests`, `cancellationReason`.
- Lifecycle: see state machine (PENDING → CONFIRMED → CHECKED_IN → CHECKED_OUT; CANCELLED/EXPIRED/NO_SHOW branches).

### BookingHistory — `booking_history`
Append-only transition log. `bookingId`, `fromStatus`, `toStatus`, `changedBy`, `reason`, `createdAt`.

### BedOccupancyHistory — `bed_occupancy_history`
Per-stay record. `bedId`, `bookingId`, `tenantId`, `propertyId`, `checkInDate`, `checkOutDate`, `actualCheckInAt`, `actualCheckOutAt`.

### BookingSequence — `booking_sequences`
Monthly counter for human-readable booking numbers. PK `monthKey` (char 7, e.g. `2026-06`), `currentVal`.

### ExpectedMoveOut — `expected_move_outs`
Notice tracking. `bookingId` (unique), `bedId`, `tenantId`, `propertyId`, `expectedDate`, `noticeGivenAt`, `confirmed`, `actualCheckoutAt`, `status`.

### Corporate accounts — `corporate_accounts`
`companyName`, `gstin`, `hrContactUserId`, `billingEmail`, `billingAddress`, `creditLimitPaisa`, `panNumberEncrypted`, `isActive`.

### CorporateBooking — `corporate_bookings`
`bookingNumber` (unique), `corporateAccountId`, `propertyId`, `hrUserId`, `totalBedsRequested`, `totalBedsConfirmed`, `checkInDate`, `checkOutDate`, `totalAmountPaisa`, `billingCycle` (MONTHLY…), `invoiceTo` (CORPORATE|INDIVIDUAL), `status`, `poNumber`.

### OccupancySnapshot — `occupancy_snapshots`
Daily analytics rollup. `propertyId`, `buildingId?`, `floorId?`, PK part `snapshotDate`, `totalBeds`, `occupiedBeds`, `reservedBeds`, `availableBeds`. Written nightly by the occupancy-snapshot cron.

---

## Media

### Media — `media`
Generic media for every entity (the centralized table). `entityType`, `entityId`, `role` (cover|gallery|avatar|null), `storageKey` (**KEY only, never URL**; unique partial), `mimeType`, `fileSize`, `sortOrder`, `uploadedBy`. Index `idx_media_entity (entity_type, entity_id)`. Public URLs derived at read-time; private (kyc/agreement/invoice/ticket) served via presigned GET.

---

## Enum reference

| Enum | Values |
|------|--------|
| UserRole | SUPER_ADMIN, OPS_ADMIN, FINANCE_ADMIN, PG_OWNER, PROP_MANAGER, CARETAKER, HOUSEKEEPING, SECURITY, CORP_HR, TENANT, GUEST |
| UserStatus | PENDING, ACTIVE, SUSPENDED, DELETED |
| Gender | MALE, FEMALE, OTHER, PREFER_NOT_SAY |
| KycStatus | NOT_STARTED, SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED |
| PropertyType | MALE_ONLY, FEMALE_ONLY, COLIVING, FAMILY, CORPORATE |
| PropertyStatus | DRAFT, PENDING_REVIEW, ACTIVE, PAUSED, REJECTED, ARCHIVED |
| FurnishingType | FULLY_FURNISHED, SEMI_FURNISHED, UNFURNISHED |
| RoomType | SINGLE, DOUBLE, TRIPLE, QUAD, DORMITORY, STUDIO |
| RoomStatus | AVAILABLE, FULLY_OCCUPIED, MAINTENANCE, INACTIVE |
| BedStatus | AVAILABLE, RESERVED, OCCUPIED, MAINTENANCE, BLOCKED, VACATING_SOON |
| BedGender | MALE, FEMALE, ANY |
| BookingStatus | PENDING, CONFIRMED, CHECKED_IN, CHECKED_OUT, CANCELLED, EXPIRED, NO_SHOW |
| PayGateway | RAZORPAY, CASHFREE, STRIPE, MANUAL, CASH, BANK_TRANSFER |

## Tables NOT present (gaps vs. the requested domain)
No dedicated tables exist for: **Payment, Invoice, Ticket, Communication, Notification, Agreement (standalone), AuditLog (generic), Owner/Manager (modeled as User roles, not separate entities)**. Notifications are in-memory (`NotificationService`). Audit is per-domain (`booking_history`, `kyc_reviews`) plus the outbox. See `api-catalog.md` §11 and the quality audit in `frontend-integration-guide.md`.
