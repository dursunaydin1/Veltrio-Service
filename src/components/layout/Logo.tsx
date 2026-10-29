/** Dişli dış hattı (8 diş) — scripts/make-icons.mjs ile aynı geometri. */
const GEAR =
  "M19.96 8.93 L20.77 4.67 L27.23 4.67 L28.04 8.93 L31.80 10.49 L35.38 8.04 L39.96 12.62 L37.51 16.20 L39.07 19.96 L43.33 20.77 L43.33 27.23 L39.07 28.04 L37.51 31.80 L39.96 35.38 L35.38 39.96 L31.80 37.51 L28.04 39.07 L27.23 43.33 L20.77 43.33 L19.96 39.07 L16.20 37.51 L12.62 39.96 L8.04 35.38 L10.49 31.80 L8.93 28.04 L4.67 27.23 L4.67 20.77 L8.93 19.96 L10.49 16.20 L8.04 12.62 L12.62 8.04 L16.20 10.49 Z";
const HOLE = "M36 24 A12 12 0 1 0 12 24 A12 12 0 1 0 36 24 Z";
/** Onay işareti biçiminde "V": kısa sol kol, uzun ve yukarı kalkık sağ kol. */
const CHECK_V = "M16.8 23.6 L22.2 29.6 L31 18";

/** Zeminsiz logo çizimi (dişli + onay biçiminde V); rengi `currentColor`. */
export function LogoGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d={`${GEAR} ${HOLE}`} fill="currentColor" fillRule="evenodd" />
      <path d={CHECK_V} stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Veltrio logo işareti (K-046): koyu mavi zeminde beyaz dişli (servis/tamir) ve içinde
 * onay işareti biçiminde "V" (iş tamam).
 * Küçük boyutta da okunacak kadar sade tutulur.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <LogoGlyph size={size * 0.8} />
    </span>
  );
}
