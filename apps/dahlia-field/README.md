# Dahlia Field

A separate Android companion for Dahlia Management System. This app is built as an independent Flutter project inside the existing repository; it does not replace or restructure the Next.js web application.

## Phase 1 features

- Internal field users (Mandor / Pengawas / field staff): worker attendance, comprehensive six-stage daily project reports, and material requisitions.
- Subcontractor users: only their linked contract segments, work-progress submissions, approved-quantity claims and payment-request submissions.
- Offline-first submission queue. Payloads are encrypted with AES-256-GCM; the encryption key is stored in Android secure storage.
- Idempotent server operations use one UUID per queued operation. Retrying the same payload returns the original server result instead of creating a duplicate.
- Daily project reports record work quantities, assigned personnel and attendance snapshots, material consumption notes, equipment usage/condition, weather, site conditions, obstacles and follow-up. They reuse the same validated `dahlia_save_daily_report` workflow as the web module and do not create duplicate attendance, warehouse-stock, payroll, or payment transactions.
- Attendance remains submitted and is verified in Dahlia Management by Personalia.
- Material requisitions are PRs only. They never create or approve official Purchase Orders.
- Progress and claims remain subject to the current Dahlia database validation. Finance still controls payment approval and actual payout.

## Security model

- Sign-in uses Supabase Auth. The client only contains a Supabase publishable/anon key; never place a service_role key in the APK.
- User mapping is stored in the non-exposed dahlia_private schema. Administrators link an internal user to an active employee or a subcontractor user to one active subcontractor using the dahlia_field_link_user RPC. A company-level user with an active `director` role is recognized separately and does not need an employee link.
- Internal access continues to use the existing user_role_assignments and permission checks. The Mandor role already has the project-scoped attendance, execution reporting and procurement request permissions. Director receives a separate read-only monitoring mode for all company projects and their daily-report history; no attendance, reporting, material-request, progress, or payment submission actions are exposed to that role in Dahlia Field.
- Subcontractor reads and writes are filtered by the exact linked subcontractor_id; other subcontractors' contracts and claims are not returned.
- New PR tables have RLS enabled and direct Data API grants revoked. The app can only use the validated RPC surface.
- Existing PO, attendance, progress, contract and payment tables are not replaced. The payment RPC receives one additional, narrow authorization path for the exact mapped subcontractor; all existing financial calculation and claim validation remains in place.

## Local development

1. Install Flutter stable (Dart 3.12 or later).
2. From this directory run flutter pub get.
3. Create the Android host once: flutter create --project-name dahlia_field --org id.dahlia.management --platforms android --empty .
4. Set the Supabase project URL and publishable key as Dart defines:
   --dart-define=DAHLIA_SUPABASE_URL=...
   --dart-define=DAHLIA_SUPABASE_PUBLISHABLE_KEY=...
5. Run flutter test, flutter analyze, then flutter run.

The repository CI creates the Android host in a temporary folder and copies its generated android/ directory into this Flutter package, so native Android scaffolding does not need to be mixed with the existing web application's root.

## Database migration and deployment

Migrations `202611220001` through `202611220006` were applied to the Dahlia Management production Supabase project on 22 November 2026. Do not re-run, rewrite, or reset these applied migrations. Subsequent dashboard/mobile integration changes must use a new forward-only migration, reviewed and applied in sequence.

Migration `202611220007_dahlia_field_dashboard_workflow.sql` adds the Dashboard account-link lookup APIs, a unique employee-to-Field-account mapping, and an atomic approved Field PR to official Purchase Order conversion. It was applied to the production Supabase project on 22 November 2026. The matching Dashboard code is in the `feat/dahlia-field-dashboard-integration` preview branch and is not yet merged to the production application.

A Field material request is a purchase requisition (PR), not an official Purchase Order. Mandor supplies project, material description, unit, quantity, need-by date, priority and notes. Purchasing reviews the PR, selects an active supplier, enters the unit prices from the supplier quotation, then converts the approved PR into a normal PO. The PO uses the existing approval and warehouse receiving lifecycle. Approving a PR alone never creates a PO.

### Account linking

Use an administrator account with the existing user.manage permission and call:

- Internal user: dahlia_field_link_user(user_id, 'internal', employee_id, null)
- Subcontractor: dahlia_field_link_user(user_id, 'subcontractor', null, subcontractor_id)
- Unlink: dahlia_field_unlink_user(user_id)

An internal user must also have the appropriate existing project role assignment (for example foreman) for the target project. Linking alone does not grant project permissions.

## APK test

GitHub Actions workflow: Dahlia Field Android CI. On a successful run, download dahlia-field-android-apk from the run's Artifacts section. This is an unsigned release APK for internal device testing, not a Play Store release.

GitHub Actions repository variables used by the build:
- DAHLIA_SUPABASE_URL
- DAHLIA_SUPABASE_PUBLISHABLE_KEY (or legacy anon key for compatibility; never a service-role key)

If those variables are not configured, the APK still builds but displays a configuration warning and cannot sign in until the app is built with the correct public client values.

## Deliberately deferred

Photo evidence upload, GPS/geofencing, push notifications, background sync after the OS terminates the app, subcontractor self-registration, payroll approval and payment disbursement are not part of phase 1.
