/** Liste yüklenirken soluk yer tutucu satırlar (K-065): ekran bir an boş kalmaz. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="menu-list skeleton-list" aria-busy="true" aria-label="Yükleniyor">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <span className="skeleton skeleton-avatar" />
          <span className="skeleton-lines">
            <span className="skeleton" style={{ width: `${62 - i * 7}%` }} />
            <span className="skeleton skeleton-short" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Detay ekranı yüklenirken (K-115): özet kutuları ve birkaç satır; ekran bir an boş kalmaz. */
export function DetailSkeleton() {
  return (
    <div className="stack stack-lg" aria-busy="true" aria-label="Yükleniyor">
      <div className="tile-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="tile">
            <span className="skeleton skeleton-short" />
            <span className="skeleton skeleton-value" />
          </div>
        ))}
      </div>
      <ListSkeleton rows={3} />
    </div>
  );
}
