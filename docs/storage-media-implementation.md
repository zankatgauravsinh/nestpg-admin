# NestPG — Storage & Media Management

Production media-upload system for the NestPG PMS monorepo. Covers property
cover/gallery, building, room images, resident/owner avatars (public) and KYC
documents, agreements, invoices, ticket attachments (private).

**Golden rule: the database stores object KEYS, never full URLs.** Public URLs
are derived at read-time as `S3_PUBLIC_BASE_URL + '/' + key`. Private objects are
served only through short-lived presigned GET URLs. This makes CDN/bucket
migrations a config change, not a data migration.

---

## 1. Architecture summary

```
Browser ──(1) POST /uploads/presign──▶ API ──▶ StorageService (sign PUT)
   │                                   ▲
   │◀──────── { key, uploadUrl } ──────┘
   │
   ├──(2) PUT uploadUrl (file bytes) ─────────────▶ S3 / MinIO / R2   (direct, no API)
   │
   └──(3) POST /uploads/confirm ──▶ API ──▶ HEAD object + ownership + prefix check
                                          └──▶ INSERT media row (key only)

Reads:
  public  →  S3_PUBLIC_BASE_URL + key          (anonymous, CDN-cacheable)
  private →  POST /uploads/presign-get → 60s signed GET URL  (KYC self/admin only)
```

### Backend libraries

| Lib | Responsibility |
|-----|----------------|
| `@nestpg/storage` | `StorageService` (S3 client, key generation, MIME/size validation, presigned PUT/GET, HEAD/COPY/DELETE, public-URL resolution), `PresignedUrlService` (upload-intent orchestration), S3/config providers, scope rules. `@Global`. |
| `@nestpg/media` | Generic `Media` entity + `MediaService` (presign/confirm/list/bulk-map/remove), `MediaOwnershipService`, `UploadsController` + `MediaController`. Exposes a light `@nestpg/media/service` entry to avoid a barrel import cycle. |

`StorageModule` and `MediaModule` are wired in `apps/api/src/app.module.ts`.

### Scope → storage rules (single source of truth)

`libs/storage/src/storage.types.ts` maps each scope to its key prefix,
visibility, MIME allowlist, and size override. The **client never chooses a
path** — the server builds `{prefix}/{uuid}{ext}`.

| Scope | Prefix | Visibility | entityType |
|-------|--------|-----------|------------|
| `property-cover` | `property/{id}/cover` | public | property |
| `property-gallery` | `property/{id}/gallery` | public | property |
| `building` | `building/{id}` | public | building |
| `room` | `room/{id}` | public | room |
| `resident-avatar` | `resident/{id}/avatar` | public | resident |
| `owner-avatar` | `owner/{id}/avatar` | public | owner |
| `ticket` | `ticket/{id}` | private | ticket |
| `agreement` | `agreement/{id}` | private | agreement |
| `invoice` | `invoice/{id}` | private | invoice |
| `kyc` | `kyc/{userId}` | private | (own table) |

---

## 2. API documentation

All routes are versioned (`/api/v1`) and require `JwtAuthGuard`.

### `POST /api/v1/uploads/presign`
Request a presigned PUT URL + server-generated key.
```jsonc
// body
{ "scope": "property-gallery", "entityId": "<uuid>", "contentType": "image/webp", "sizeBytes": 204800 }
// 200
{ "data": { "key": "property/<id>/gallery/<uuid>.webp", "uploadUrl": "https://...", "expiresIn": 300, "scope": "property-gallery" } }
```
Validates: scope exists, MIME allowlist, size ≤ scope/global limit, write
access (for media-backed scopes), KYC self-only.

### `POST /api/v1/uploads/confirm`
Persist a Media row after the browser PUT succeeds.
```jsonc
{ "entityType": "property", "entityId": "<uuid>", "key": "property/<id>/gallery/<uuid>.webp", "role": "gallery", "sortOrder": 0 }
// 201 → MediaView { id, entityType, entityId, role, key, url, mimeType, fileSize, sortOrder, createdAt }
```
Verifies: key prefix belongs to the entity (anti-tamper), ownership, object
exists in storage (HEAD). `role: "cover" | "avatar"` enforces a single record
(previous is soft-deleted + object removed).

### `POST /api/v1/uploads/presign-get`
Short-lived (60s) signed GET for a **private** object.
```jsonc
{ "key": "kyc/<userId>/<uuid>.pdf" }   // 200 → { url, expiresIn: 60 }
```
Deny-by-default: KYC keys are self-or-admin; other private objects are admin-only.

### `GET /api/v1/media?entityType=&entityId=`
List media rows for an entity (public scopes include derived `url`).

### `DELETE /api/v1/media/:id`
Soft-delete a Media row and best-effort delete the object. Ownership enforced.

### KYC documents (private)
- `GET  /api/v1/kyc/me/documents` — list own documents (keys only).
- `POST /api/v1/kyc/me/documents` — `{ docType, key }`; verifies `kyc/{me}/`
  prefix + object exists, records metadata, moves KYC to `SUBMITTED`.
- `GET  /api/v1/kyc/:userId/documents` — admin reviewers (OPS_ADMIN/SUPER_ADMIN).

---

## 3. Database changes

New migration `migrations/V3_022__media.ts` — generic `media` table:

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| entity_type | varchar(40) | property/building/room/resident/owner/… |
| entity_id | uuid | |
| role | varchar(24) null | cover / gallery / avatar |
| storage_key | text | **key only**, unique (partial, where not deleted) |
| mime_type | varchar(100) | |
| file_size | bigint | |
| sort_order | smallint | |
| uploaded_by | uuid → users(id) | |
| created_at / updated_at / deleted_at / created_by / updated_by | audit | |

Indexes: `uk_media_storage_key` (unique, soft-delete aware),
`idx_media_entity (entity_type, entity_id)`.

The legacy orphan columns (`pg_properties.cover_image_url`, `media_urls`,
`rooms.media_urls`) are **left untouched** but are no longer read/written — the
generic table supersedes them. `kyc_documents.s3_key` continues to hold KYC keys
(separate auditable table by design).

Run: `npm run migrate:run` (or the documented `typeorm migration:run` command).

---

## 4. Frontend changes

- **`core/data/upload.service.ts`** (new) — `presign`, `putToStorage` (progress),
  `confirm`, `presignGet`, `list`, `remove`. The presigned PUT is an absolute
  MinIO/S3 URL, so the auth interceptor (scoped to `/api`) does not attach a bearer.
- **`shared/components/image-upload.component.ts`** (`os-image-upload`, rewritten) —
  validate → presign → PUT(progress) → confirm → emit KEY. Drag-drop,
  per-item progress/retry/cancel, preview, delete, multiple, seeds from
  `existing` media. Outputs `keysChange` and `mediaChange`. Entity-bound
  (`scope`, `entityType`, `entityId`, `role`).
- **Property workspace** — gallery editor wired to the live property id.
- **Create-property wizard** & **Add-inventory workspace** — collect `File`s and
  upload after the record is created (presigned upload requires a server-side
  entityId; first image → `cover`).
- Backend now returns media on reads: property `media { coverImageUrl, coverImageKey, gallery[] }`,
  building/room `images[]`, user `avatarUrl/avatarKey`.

---

## 5. Verification report

| Check | Result |
|-------|--------|
| `nx build api` | ✅ Successful (only pre-existing `@sentry/node` optional-dep warning) |
| `nx build web-admin` (ng) | ✅ Application bundle generated |
| Unit tests — properties | ✅ 13/13 |
| Unit tests — inventory | ✅ 18/18 |
| Unit tests — users | ✅ 10/10 |
| Unit tests — auth (incl. KYC) | ✅ 37/37 |
| `docker compose config` | ✅ Valid (minio + minio-init added) |
| Migration naming/glob | ✅ `V3_022__media.ts` picked up by datasource globs |

**Not executed (infra unavailable in this environment):** live end-to-end
upload against a running MinIO + Postgres + API. The Docker daemon, Postgres
(:5432), MinIO (:9000) and the API (:3000) were all down. To run E2E:

```bash
cd backend
docker compose up -d postgres redis minio minio-init
npm run migrate:run
nvm use 22.22.3 && npx nx serve api      # terminal 1
cd ../apps/web-admin && npx ng serve     # terminal 2
# then: create a property → add gallery photos in Property Workspace
```

---

## 6. Remaining risks / follow-ups

1. **No E2E run here.** Presign→PUT→confirm was verified by build + unit tests
   only; exercise it against live MinIO before production sign-off (CORS on the
   browser PUT is the most likely first issue — `MINIO_API_CORS_ALLOW_ORIGIN` is
   set to `*` for local).
2. **Orphan-object cleanup.** A presigned PUT that is never confirmed leaves an
   object with no Media row. The compose lifecycle rule only targets a `tmp/`
   prefix; add a sweeper (or move unconfirmed uploads under `tmp/`) for prod.
3. **Private read authZ breadth.** `presign-get` strictly gates KYC (self/admin)
   and restricts other private scopes (agreement/invoice/ticket) to admins.
   Owner/tenant access to their own agreements/invoices needs per-entity
   ownership resolution before those features ship.
4. **Wizard/inventory deferred upload** is best-effort: if a photo upload fails
   after the record is created, the record persists without the image (logged,
   non-fatal). Photos can be re-added from the Property Workspace.
5. **Legacy image columns** remain in the schema; drop them in a later migration
   once no reader references them.
6. **Image processing** (thumbnail/webp transcode, virus scan) is out of scope —
   add an async pipeline on the confirm event if required.
