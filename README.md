# 🍱 FoodPass

**FoodPass** is a modern, responsive, and offline-resilient web application designed for QR-powered food distribution at college events, fests, and conferences. It ensures duplicate-proof meal distribution, works in remote locations with poor connectivity, and provides administrators with real-time tracking dashboard metrics.

---

## 🚀 Key Features

*   📷 **QR Code Scanner**: Built-in camera integration (`html5-qrcode`) for volunteer scanning with custom sound alerts and physical vibration feedback on success or warning states.
*   📴 **Offline-First Design**: Transactions are saved locally in the browser's storage and automatically synced to the server once an internet connection is restored.
*   🔖 **QR Wristband Generator**: Password-protected area to bulk-generate, preview, download, or print QR codes for participants using manual inputs or CSV files.
*   📊 **Live Admin Dashboard**: Interactive statistics overview tracking total registrants, meals served, pending feeds, and individual serving-line breakdowns.
*   ✏️ **Participant Management**: Simple UI for search, pagination, record insertion, info editing, entry deletion, and scan state resets.

---

## 🛠️ Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/) (App Router, Typescript, API Routes)
*   **Database**: [Supabase](https://supabase.com/) (PostgreSQL client integration, indexed fields, RLS security)
*   **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & Vanilla CSS variables
*   **Libraries**: 
    *   `html5-qrcode` (webcam QR scan handler)
    *   `qrcode` (QR canvas renderer & image downloads)
    *   `papaparse` (CSV ingestion)

---

## 📁 File Structure

```text
├── src/
│   ├── app/                      # Next.js App Router structure
│   │   ├── admin/                # Admin Panel: stats table, edit/delete actions, CSV loader
│   │   ├── api/                  # Backend endpoints
│   │   │   ├── admin/            # Participant list, upload-csv, and stats aggregators
│   │   │   ├── bulk-sync/        # Synchronizes offline local queues to the cloud
│   │   │   └── scan/             # Validates QR scans, prevents meal double-dipping
│   │   ├── generate/             # QR ticket printing / generation interface
│   │   ├── scan/                 # In-browser camera scanner layout (Volunteer endpoint)
│   │   ├── globals.css           # Styling theme config (CSS custom variables)
│   │   ├── layout.tsx            # Main layout wrapper
│   │   └── page.tsx              # Application index / landing screen
│   ├── components/               # Shareable components
│   └── lib/                      # Core helpers
│       ├── localStorage.ts       # Offline sync queue database helpers
│       ├── meals.ts              # Meal definitions (BREAKFAST, LUNCH, etc.)
│       ├── supabase.ts           # Supabase client initializer
│       └── syncQueue.ts          # Network listener & background queue synchronizer
├── supabase-schema.sql           # Database schema definition
├── supabase-migration-...sql     # Meal tracking schema upgrade script
└── sample-participants.csv       # Reference CSV format for importing attendees
```

---

## 💾 Database Setup (Supabase)

FoodPass expects a table named `participants` in public schema. Open the **SQL Editor** in your Supabase project dashboard and run:

```sql
-- Create the participants table
CREATE TABLE IF NOT EXISTS public.participants (
  id             TEXT PRIMARY KEY,              -- Participant ID (e.g., USER0001)
  name           TEXT NOT NULL,
  meal           TEXT NOT NULL,                 -- Initial registration tag/cohort
  scanned        BOOLEAN NOT NULL DEFAULT false, -- True if served any meal
  scanned_at     TIMESTAMPTZ DEFAULT NULL,      -- Last serving timestamp
  scanned_meals  JSONB NOT NULL DEFAULT '[]'::jsonb -- Served meals (e.g., ["LUNCH","DINNER"])
);

-- Optimize queries with indexes
CREATE INDEX IF NOT EXISTS idx_participants_scanned ON public.participants (scanned);
CREATE INDEX IF NOT EXISTS idx_participants_meal ON public.participants (meal);

-- Enable Row Level Security (RLS)
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- Allow anonymous operations (internal network deployment policy)
CREATE POLICY "Allow all for anon" ON public.participants
  FOR ALL USING (true) WITH CHECK (true);
```

---

## ⚙️ Environment Variables

Create a file named `.env.local` in the root folder of the project with the following configuration:

```env
# Supabase project settings (Settings -> API)
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key

# Protection key for /admin and /generate
NEXT_PUBLIC_ADMIN_PASSWORD=admin123
```

---

## 🏁 Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Run Locally
Start the development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your web browser.

### 3. Build & Production
To create a production-optimized package:
```bash
npm run build
npm run start
```

---

## 📋 How It Works (Scan Lifecycle)

1. **Attendee QR Wristbands**: Prepared ahead of time via `/generate` (by typing details or uploading a standard CSV). The wristband QR encodes only the participant ID.
2. **Serving Stations**: Volunteers open `/scan` on their devices and select their specific serving line (e.g., `LUNCH`).
3. **Double-Dipping Protection**: Once a wristband QR is scanned, the server updates the `scanned_meals` array. If the participant tries to scan at the same serving line again, they will trigger a **Red (Already Taken)** warning overlay.
4. **Connection Loss Resilience**: If the internet goes down, the client notes the scan inside the browser's `localStorage` cache. Once connection status changes back to online, the background manager triggers `/api/bulk-sync` to sync all queued entries safely.
