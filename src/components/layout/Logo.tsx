/**
 * Logo geometrisi (K-051) — scripts/make-icons.mjs ile aynı, 64 birimlik alan.
 * Kıvrımlı onay işareti: ayrı duran kısa parça (pirinç) + kıvrılarak yukarıda sivrilen uzun kol (beyaz).
 */
const SWOOSH =
  "M21.5 31.2 L25.2 30.6 C26.5 30.5 27.6 31.3 28.3 32.6 L30.6 37.6 C34.5 28.8 40 21.8 47.5 16 C40.5 23.5 35.5 31.5 31.8 43.6 C31.3 45.3 29 45.6 28.2 44 Z";
const CHIP = "M17.8 22.2 L23.4 22.2 L26.6 28.4 L21.2 28.8 Z";

/**
 * Zeminsiz logo çizimi. Uzun kol `currentColor`, kısa parça pirinç (`--accent-primary`).
 * `ring` ince halkayı ekler (büyük boyutlar için; küçükte halka kaybolur, onay büyütülür).
 */
export function LogoGlyph({ size, ring = false }: { size: number; ring?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      {ring ? (
        <>
          <circle cx="32" cy="31.5" r="25" stroke="var(--accent-primary)" strokeWidth="2.2" />
          <path d={CHIP} fill="var(--accent-primary)" />
          <path d={SWOOSH} fill="currentColor" />
        </>
      ) : (
        <g transform="translate(-6.4 -6.2) scale(1.2)">
          <path d={CHIP} fill="var(--accent-primary)" />
          <path d={SWOOSH} fill="currentColor" />
        </g>
      )}
    </svg>
  );
}

/**
 * Veltrio logo işareti (K-051): gece mavisi kare zemin, pirinç halka ve kıvrımlı onay işareti (iş tamam).
 * 40 px'ten küçükte halka çizilmez.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span className="logo-mark" style={{ width: size, height: size }} aria-hidden="true">
      <LogoGlyph size={size} ring={size >= 40} />
    </span>
  );
}

/**
 * Yazılı marka: "Veltrio" iri, "SERVICE" küçük, harf aralıklı ve pirinç.
 * `stacked`: alt alta ortalı (giriş ekranı); `lockup`: alt alta sola dayalı, logonun yanında (üst çubuk, K-055).
 */
export function Wordmark({ stacked = false, lockup = false }: { stacked?: boolean; lockup?: boolean }) {
  const variant = stacked ? " wordmark-stacked" : lockup ? " wordmark-lockup" : "";
  return (
    <span className={`wordmark${variant}`}>
      <span className="wordmark-name">Veltrio</span>{" "}
      <span className="wordmark-tag">Service</span>
    </span>
  );
}
