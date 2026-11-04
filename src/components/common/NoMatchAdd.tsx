import Link from "next/link";
import { Plus } from "lucide-react";

/**
 * Aramada sonuç yoksa (K-087): "“Ege Motor” bulunamadı" ve aranan adla doldurulmuş ekleme düğmesi.
 * Böylece kullanıcı adı ikinci kez yazmaz; önce aranıp sonra eklendiği için yinelenen kayıt da azalır.
 */
export function NoMatchAdd({ query, noun, href }: { query: string; noun: string; href: string }) {
  const q = query.trim();
  return (
    <div className="empty-state" role="note">
      <span>
        “{q}” adında {noun} bulunamadı.
      </span>
      <Link href={href} className="btn btn-primary btn-sm">
        <Plus size={16} aria-hidden="true" /> “{q}” ekle
      </Link>
    </div>
  );
}

/** Aranan metin yalnızca rakamsa telefon, değilse ad olarak forma taşınır. */
export function prefillQuery(query: string): string {
  const q = query.trim();
  const digits = q.replace(/[\s()+-]/g, "");
  return /^\d{4,}$/.test(digits) ? `phone=${encodeURIComponent(q)}` : `name=${encodeURIComponent(q)}`;
}
