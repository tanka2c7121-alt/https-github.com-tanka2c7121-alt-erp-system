# NAS Docker Deploy

## NAS Folders

Docker deployment folder:

```text
\\192.168.1.103\docker\erp-system
```

Photo storage folder:

```text
\\192.168.1.103\erp_photos
/volume1/ERP_PHOTOS
```

PostgreSQL data is stored in a Docker-managed volume:

```text
erp-postgres-data
```

Do not store PostgreSQL live data directly in a shared folder. PostgreSQL is strict about file ownership and can fail on NAS shared folders.

## Services

```text
erp-web       Next.js ERP server
erp-db        PostgreSQL database
erp-db-admin  Adminer web DB manager
```

## URLs

ERP test server:

```text
http://192.168.1.103:3000
```

Mobile photo upload:

```text
http://192.168.1.103:3000/mobile/photos
```

Adminer database manager:

```text
http://192.168.1.103:8080
```

## Adminer Login

```text
System: PostgreSQL
Server: erp-db
Username: erp_admin
Password: KorCarvia_NAS_DB_2026
Database: erp_system
```

## Environment

The NAS `docker/erp-system/.env` file needs:

```text
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_DEPLOYMENT_LABEL=NAS TEST SERVER
POSTGRES_DB=erp_system
POSTGRES_USER=erp_admin
POSTGRES_PASSWORD=KorCarvia_NAS_DB_2026
```

## Current Stage

Vercel production still uses Supabase.

NAS test ERP currently uses:

```text
Database: Supabase, until migration is complete
Photos: NAS ERP_PHOTOS
```

PostgreSQL is being prepared for the next migration step.
