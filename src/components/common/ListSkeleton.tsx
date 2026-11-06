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
