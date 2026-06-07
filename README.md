# AI Call

AI asistent pro automatické telefonní hovory přes [VAPI](https://vapi.ai). Zadáš seznam čísel s kontextem (jméno, popis nemovitosti, odkaz na inzerát) a aplikace je hromadně obvolá, vyhodnotí výsledek hovoru a vytvoří shrnutí.

## Stack

- **Framework:** Next.js 14 (App Router)
- **Frontend:** React, Tailwind CSS, Shadcn UI (Radix)
- **Auth:** Supabase (přihlášení přes Google)
- **Hovory:** VAPI.ai (outbound)
- **Klasifikace hovoru:** Claude (Anthropic API)

## Rychlý start

```bash
npm install
cp .env.local.example .env.local   # pokud existuje
npm run dev
```

Aplikace poběží na **http://localhost:3000**. Stránky: `/` (přesměrování), `/login`, `/ai-call`.

## Proměnné prostředí

| Proměnná | Účel |
|----------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase projekt (přihlášení) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon klíč |
| `ANTHROPIC_API_KEY` | (volitelné) klasifikace a shrnutí hovoru přes Claude |

> VAPI údaje (API klíč, Assistant ID, Phone Number ID) i údaje makléře se zadávají
> přímo ve webovém rozhraní v sekci **VAPI konfigurace** a ukládají se v prohlížeči
> (localStorage) – nejsou tedy v env proměnných.

V dev režimu bez vyplněného Supabase lze použít tlačítko **„Vstoupit jako admin (náhled)"** na přihlašovací stránce.

## Jak to funguje

1. Přihlas se přes Google.
2. Na stránce **AI Volání** vyplň VAPI konfiguraci (API klíč, Assistant ID, Phone Number ID) a volitelně údaje makléře (jméno, telefon, název RK) – předají se asistentovi jako proměnné `brokerName`, `brokerPhone`, `agencyName`.
3. Přidej až 10 záznamů (telefon, jméno majitele, URL inzerátu, popis nemovitosti).
4. Spusť hromadné volání. Aplikace volá postupně, sleduje stav přes polling a po skončení hovoru:
   - stáhne přepis a shrnutí z VAPI,
   - klasifikuje výsledek (úspěšný / neutrální / odmítnutí) a vytvoří krátké shrnutí.

## API routy

- `POST /api/ai-call` – spustí outbound hovor přes VAPI (vyžaduje přihlášení).
- `GET /api/ai-call/[callId]?apiKey=…` – stav, přepis a shrnutí hovoru.
- `POST /api/ai-call/analyze` – klasifikace výsledku hovoru přes Claude.

## Skripty

- `npm run dev` – vývoj
- `npm run build` – build
- `npm run start` – produkční běh
- `npm run lint` – ESLint
