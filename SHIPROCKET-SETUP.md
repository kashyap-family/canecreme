# Shiprocket Delivery Setup

## Current Status
- Shiprocket API user created: `canecremeorders@gmail.com`
- API password is saved privately by the owner.
- Website must not store Shiprocket password or tokens in `js/config.js`.
- Secure server-side function scaffold exists at:
  `supabase/functions/create-shiprocket-order/index.ts`

## Required Supabase Secrets
Set these as Supabase Edge Function secrets before deployment:

```text
SHIPROCKET_EMAIL=canecremeorders@gmail.com
SHIPROCKET_PASSWORD=<saved privately by owner>
SHIPROCKET_PICKUP_LOCATION=Kshitiz
SHIPROCKET_PACKAGE_LENGTH_CM=12
SHIPROCKET_PACKAGE_BREADTH_CM=12
SHIPROCKET_PACKAGE_HEIGHT_CM=8
SHIPROCKET_PACKAGE_WEIGHT_KG=0.5
SERVICE_ROLE_KEY=<from Supabase dashboard, never commit>
```

## Pickup Location
Pickup address is verified in Shiprocket. Use the exact pickup nickname
`Kshitiz` as `SHIPROCKET_PICKUP_LOCATION`.

Do not commit the pickup address, Shiprocket password, or Supabase service role key.

## Deploy
Supabase CLI is not installed on this machine yet. Once installed and logged in:

```bash
supabase functions deploy create-shiprocket-order --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_EMAIL="canecremeorders@gmail.com" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PASSWORD="<password>" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PICKUP_LOCATION="Kshitiz" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PACKAGE_LENGTH_CM="12" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PACKAGE_BREADTH_CM="12" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PACKAGE_HEIGHT_CM="8" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SHIPROCKET_PACKAGE_WEIGHT_KG="0.5" --project-ref qfphvsyidbyhbyeyigrh
supabase secrets set SERVICE_ROLE_KEY="<service-role-key>" --project-ref qfphvsyidbyhbyeyigrh
```

After the function is deployed and tested, wire checkout success to call:

```text
https://qfphvsyidbyhbyeyigrh.supabase.co/functions/v1/create-shiprocket-order
```
