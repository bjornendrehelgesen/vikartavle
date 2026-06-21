# Vikartavle

Digital vikartavle for skoler — en sanntids informasjonsskjerm som viser fraværende lærere, vikarer, vakter og bussvakter for dagen.

## Funksjonalitet

**Infoskjerm (`/`)** — beregnet for å vises på storskjerm i skolens fellesareal:
- Fraværstabell med lærerinitialer og vikar per time
- Vakter og bussvakter med fargekodede vikar-celler (grønn = fylt, rød = tom)
- Informasjonsseksjon med generell beskjed til personalet
- Oversikt over hvem som er helt fraværende vs. kun deler av dagen
- Automatisk skalering slik at alt alltid får plass uten scroll

**Admin-side (`/admin`)** — for den som setter opp tavlen hver morgen:
- Logg inn med e-post og passord (Supabase Auth)
- Legg til fraværende lærere og fyll inn vikar per time
- Registrer vakter (område + tid + vikar) og bussvakter (retning + tid + vikar)
- Skriv informasjonstekst til personalet
- Marker lærere som helt fraværende eller kun deler av dag
- Legg til ekstra navn under Fravær/Deler av dag manuelt
- Alle endringer lagres automatisk og vises umiddelbart på infoskjermen

## Teknologi

- [Next.js 16](https://nextjs.org) — App Router
- [Supabase](https://supabase.com) — database, autentisering og sanntidsoppdateringer
- [Tailwind CSS v4](https://tailwindcss.com)

## Oppsett

### 1. Klon og installer

```bash
git clone https://github.com/bjornendrehelgesen/vikartavle.git
cd vikartavle
npm install
```

### 2. Supabase-prosjekt

Opprett et prosjekt på [supabase.com](https://supabase.com) og kjør migrasjonene i rekkefølge via SQL Editor:

```
supabase/migration.sql
supabase/migration_v2.sql
supabase/migration_v3.sql
supabase/migration_v4.sql
supabase/migration_v5.sql
supabase/migration_v6.sql
```

### 3. Miljøvariabler

Opprett `.env.local` i prosjektmappen:

```env
NEXT_PUBLIC_SUPABASE_URL=https://<ditt-prosjekt>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<din-anon-nøkkel>
```

### 4. Start utviklingsserver

```bash
npm run dev
```

Åpne [http://localhost:3000](http://localhost:3000) for infoskjermen og [http://localhost:3000/admin](http://localhost:3000/admin) for admin-siden.
