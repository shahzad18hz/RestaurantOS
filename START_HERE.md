# RestaurantOS: existing data + isolated demo

## Use the configured local folder

The local outputs/RestaurantOS-ready folder contains this source and a private, configured .env.
From a terminal in that folder, run:

```powershell
npm ci
npm run dev
```

Stop the previous dev server first. Use your existing RestaurantOS Super Admin email and password.
Do NOT run seed, reset, db push, or setup again for this already-configured installation.

## Why login failed

The previous .env pointed at a different database with ADMIN/CUSTOMER records.
The original RestaurantOS connection was recovered from your previously supplied archive.
Read-only checks found 1 SUPER_ADMIN, 7 OWNER accounts and 7 restaurants there.
No account, password or restaurant record was changed.

## Connection rules

- MAIN_DATABASE_URL points to the original RestaurantOS database. APP_DATABASE_SCHEMA defaults to public.
- DEMO_DATABASE_URL points to the existing demo database. DEMO_DATABASE_SCHEMA defaults to restaurantos_demo_v2.
- DATABASE_URL is only a fallback when an explicit connection is absent.
- Normal login always uses the main connection, even when an old demo cookie exists.
- Signed demo sessions use the demo connection for operational queries and raw SQL.
- Invalid or expired tokens cannot fall back to the main connection.
- Demo provisioning, rate limits and cleanup explicitly use the demo connection.
- Existing main data is not copied, reset or migrated.

The ZIP intentionally excludes credentials. The configured .env exists only in the local ready folder.
When moving the app to another machine or deployment, configure the same private variables there.
Never replace the configured file with the placeholder .env.example.

## Demo setup and account safety

setup:demo is for a missing demo schema only. It never changes the main database URL or schema.
Prisma migration configuration targets the demo schema only.
Admin seeding is disabled unless ALLOW_ADMIN_SEED=1 is intentionally set. Existing login does not require seeding.

Set NEXT_PUBLIC_PORTFOLIO_CONTACT_URL before publication. Secrets exposed in earlier shared logs should be rotated privately; rotating the device secret changes recognition of previous demo visitors.

## Verification

See FINAL_VERIFICATION.md for executed checks and limitations.
