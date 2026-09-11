# ShiftPay — webová appka (PWA)

Evidence směn, mzdy a dýšek. Běží v prohlížeči, dá se přidat na plochu telefonu jako appka
(bez App Store / Google Play poplatků).

## 1. Založ Supabase projekt

1. Jdi na https://supabase.com, vytvoř zdarma nový projekt.
2. V levém menu otevři **SQL Editor** → **New query**, vlož obsah souboru `supabase/schema.sql`
   a spusť ho (vytvoří to tabulky a zabezpečení, aby si každý uživatel viděl jen svoje data).
3. V **Project settings → API** najdeš `Project URL` a `anon public` klíč.

## 2. Nastav appku lokálně

```bash
npm install
cp .env.example .env
```

Do `.env` vlož hodnoty ze Supabase:

```
VITE_SUPABASE_URL=https://tvuj-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=tvuj-anon-klic
```

```bash
npm run dev
```

Appka poběží na `http://localhost:5173`. Zaregistruj si účet přímo v appce (obrazovka
Přihlášení → Zaregistruj se). Supabase může vyžadovat potvrzení e-mailu — dá se to
v Project settings → Authentication vypnout pro rychlejší testování.

## 3. Nasazení zdarma (Vercel)

1. Nahraj tuhle složku na GitHub (nebo použij `vercel` CLI přímo).
2. Na https://vercel.com klikni **New project**, vyber repozitář.
3. V nastavení projektu (Environment Variables) přidej `VITE_SUPABASE_URL`
   a `VITE_SUPABASE_ANON_KEY` se stejnými hodnotami jako v `.env`.
4. Deploy. Appka poběží na adrese typu `shiftpay.vercel.app` zdarma.

## 4. Přidání appky na plochu telefonu

Appka je nastavená jako PWA (`vite-plugin-pwa`). Po otevření nasazené appky v mobilním
prohlížeči (Chrome/Safari) se objeví nabídka "Přidat na plochu" — appka pak funguje
jako klasická ikona, bez publikace do App Store nebo Google Play.

Než appku sdílíš, doplň skutečné ikony `public/icon-192.png` a `public/icon-512.png`
(zatím tam nejsou — bez nich appka pořád funguje, jen bude mít výchozí ikonu prohlížeče).

## Struktura

- `supabase/schema.sql` — tabulky `employers`, `shift_types`, `shifts` + zabezpečení po uživatelích
- `src/lib/supabase.js` — připojení k Supabase
- `src/lib/calc.js` — výpočet hodin a mzdy (odečtení pauzy, příplatky)
- `src/components/Login.jsx` — přihlášení / registrace
- `src/App.jsx` — přehled, směny, nastavení
