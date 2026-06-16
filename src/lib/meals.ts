/** Allowed meal / serving types (operator selects at scan time; QR is usually ID-only). */
export const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'] as const;
export type MealType = (typeof MEALS)[number];

export function isValidMeal(s: string): boolean {
  const u = s.trim().toUpperCase();
  return (MEALS as readonly string[]).includes(u);
}

export function normalizeScannedMeals(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x).trim().toUpperCase()).filter(Boolean))];
  }
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) return normalizeScannedMeals(p);
    } catch {
      /* ignore */
    }
  }
  return [];
}
