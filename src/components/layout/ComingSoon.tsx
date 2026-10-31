/** Henüz geliştirilmemiş bölümler için geçici sayfa içeriği. */
export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <section className="stack stack-md">
      <h1>{title}</h1>
      <div className="empty-state" role="note">
        Bu bölüm {phase} kapsamında geliştirilecek.
      </div>
    </section>
  );
}
