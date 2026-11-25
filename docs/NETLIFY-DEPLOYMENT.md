# Netlify deployment configuration

The primary Next.js application is deployed to the Netlify site `javawasthu`.

## Deploy previews

Pull requests targeting `main` create Netlify Deploy Previews. Keep feature work on its feature branch and verify the generated Deploy Preview before merging.

## Required environment variables

Configure these values in the Netlify project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SECRET_KEY` (server-side only; never expose it through a `NEXT_PUBLIC_*` variable)

Use the same Supabase project that the application is already configured to use. Do not add database credentials to source control.

## Database safety

A Netlify build deploys application code only. It does not authorize or automatically run Supabase migrations. Database changes must remain a separate, explicitly approved operation.

## Latest verified release

The JAVAWASTHU MANAGEMENT application release was promoted from verified Netlify Preview commit `d25356ea75a897a11ac74d431e32281e7b43adc2` to `main`. This documentation update triggers the Netlify Production build; it does not run Supabase migrations.
