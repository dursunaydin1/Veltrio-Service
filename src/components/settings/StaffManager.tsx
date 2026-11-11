"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createInvite,
  formatInviteCode,
  isInviteOpen,
  listInvites,
  listTeam,
  revokeInvite,
  setStaffActive,
  setStaffPermissions,
  type StaffInvite,
} from "@/lib/auth/staff";
import { DEFAULT_STAFF_PERMISSIONS, PERMISSION_LABELS, ROLE_LABELS, STAFF_PERMISSIONS } from "@/lib/auth/permissions";
import { writeAuditLog } from "@/lib/sync/audit";
import { readTeamDevices, refreshTeam, type TeamDevices } from "@/lib/auth/actors";
import { StaffActivityList } from "@/components/settings/StaffActivityList";
import { useBusinessContext } from "@/hooks/useBusinessContext";
import { useSessionStore } from "@/stores/session";
import { formatDate } from "@/lib/utils";
import { errorMessage } from "@/lib/errors/message";
import { confirmDialog } from "@/components/common/ConfirmDialog";
import { PageHead } from "@/components/layout/PageHead";
import type { User } from "@/types";

/** İzin anahtarları: çalışan kartında ve davet formunda aynı liste */
function PermissionSwitches({
  value,
  onChange,
  disabled,
}: {
  value: readonly string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div className="stack stack-sm">
      {STAFF_PERMISSIONS.map((p) => (
        <label key={p} className="toggle-row">
          <span>
            <span>{PERMISSION_LABELS[p].label}</span>
            <small>{PERMISSION_LABELS[p].hint}</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            checked={value.includes(p)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
          />
        </label>
      ))}
    </div>
  );
}

function inviteMessage(invite: StaffInvite): string {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return [
    `Merhaba ${invite.name}, Veltrio Service'e davet edildiniz.`,
    `1) ${origin}/register adresinden kendi e-postanızla hesap açın.`,
    `2) Açılan ekranda "Davet koduyla katıl" deyip bu kodu yazın: ${formatInviteCode(invite.code)}`,
    `Kod ${formatDate(invite.expires_at)} tarihine kadar geçerlidir.`,
  ].join("\n");
}

/**
 * Ayarlar → Çalışanlar (K-119). Patron davet kodu üretir, çalışanın izinlerini açıp kapatır,
 * işten ayrılanı pasifleştirir (cihazları iptal edilir, telefonundaki veri silinir).
 * Hepsi internet gerektirir.
 */
export function StaffManager() {
  const ctx = useBusinessContext();
  const isOnline = useSessionStore((s) => s.isOnline);
  const me = useSessionStore((s) => s.user?.id);
  const [team, setTeam] = useState<User[] | null>(null);
  const [invites, setInvites] = useState<StaffInvite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [newPermissions, setNewPermissions] = useState<string[]>([...DEFAULT_STAFF_PERMISSIONS]);
  const [copied, setCopied] = useState<string | null>(null);
  const [devices, setDevices] = useState<TeamDevices>({});
  const [showActivity, setShowActivity] = useState<string | null>(null);
  const businessId = ctx?.businessId;

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const [users, inv] = await Promise.all([listTeam(supabase), listInvites(supabase)]);
      setTeam(users);
      setInvites(inv.filter((i) => isInviteOpen(i)));
      if (businessId) {
        // Yaptıkları listesi için çalışanın cihazları
        await refreshTeam(supabase, businessId).catch(() => undefined);
        setDevices(readTeamDevices(businessId));
      }
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Çalışanlar yüklenemedi."));
    }
  }, [businessId]);

  useEffect(() => {
    // Sayfa açılışında sunucudaki liste bir kez yüklenir
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isOnline) void load();
  }, [isOnline, load]);

  async function run(action: () => Promise<void>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(errorMessage(e, fallback));
    }
    setBusy(false);
  }

  function audit(entityId: string, reason: string, oldValue: Record<string, unknown>, newValue: Record<string, unknown>) {
    if (!ctx) return Promise.resolve();
    return writeAuditLog({
      businessId: ctx.businessId,
      entityType: "users",
      entityId,
      action: "STATE_CHANGE",
      deviceCode: ctx.deviceCode,
      actorId: ctx.actorId,
      reason,
      oldValue,
      newValue,
    });
  }

  function addInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Çalışanın adını yazın.");
    void run(async () => {
      await createInvite(createClient(), name, newPermissions);
      setName("");
      setNewPermissions([...DEFAULT_STAFF_PERMISSIONS]);
      setAdding(false);
    }, "Davet oluşturulamadı.");
  }

  function changePermissions(user: User, next: string[]) {
    void run(async () => {
      await setStaffPermissions(createClient(), user.id, next);
      await audit(user.id, "Çalışan izinleri değişti", { permissions: user.permissions ?? [] }, { permissions: next });
    }, "İzinler kaydedilemedi.");
  }

  async function toggleActive(user: User) {
    const active = user.is_active !== false;
    const ok = await confirmDialog(
      active
        ? {
            title: `${user.name} pasifleştirilsin mi?`,
            message: "Uygulamaya giremez; telefonlarındaki yerel veri bir sonraki bağlantıda silinir. Kayıtları geçmişte kalır.",
            confirmLabel: "Pasifleştir",
            danger: true,
          }
        : {
            title: `${user.name} yeniden etkinleştirilsin mi?`,
            message: "Telefonunu yeniden cihaz olarak kaydetmesi gerekir.",
            confirmLabel: "Etkinleştir",
          }
    );
    if (!ok) return;
    void run(async () => {
      await setStaffActive(createClient(), user.id, !active);
      await audit(user.id, active ? "Çalışan pasifleştirildi" : "Çalışan yeniden etkinleştirildi", { is_active: active }, { is_active: !active });
    }, "Çalışan durumu değiştirilemedi.");
  }

  async function copy(invite: StaffInvite) {
    try {
      await navigator.clipboard.writeText(inviteMessage(invite));
      setCopied(invite.id);
    } catch {
      setError("Kopyalanamadı; kodu elle yazın.");
    }
  }

  async function cancelInvite(invite: StaffInvite) {
    if (!(await confirmDialog({ title: "Davet iptal edilsin mi?", message: "Kod artık kullanılamaz.", confirmLabel: "Daveti iptal et", danger: true }))) return;
    void run(() => revokeInvite(createClient(), invite.id), "Davet iptal edilemedi.");
  }

  return (
    <section className="stack stack-md">
      <PageHead title="Çalışanlar" />
      <p>
        Çalışanlar satış, servis, teslim, tahsilat ve müşteri kaydını her zaman yapar. Aşağıdaki işler için izni siz
        verirsiniz. Her kayıtta işi kimin yaptığı görünür.
      </p>
      {!isOnline ? <div className="alert alert-warning" role="status">Çalışan yönetimi için internet bağlantısı gerekir.</div> : null}
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

      {team === null ? null : (
        <ul className="stack stack-md" aria-label="Ekip">
          {team.map((u) => {
            const active = u.is_active !== false;
            return (
              <li key={u.id} className="card stack stack-sm" data-faded={active ? undefined : ""}>
                <span className="row row-between">
                  <strong>{u.name}</strong>
                  <span className="row row-gap-sm">
                    {u.id === me ? <span className="badge badge-green">Siz</span> : null}
                    <span className={`badge ${u.role === "owner" ? "badge-blue" : "badge-gray"}`}>{ROLE_LABELS[u.role]}</span>
                    {!active ? <span className="badge badge-red">Pasif</span> : null}
                  </span>
                </span>
                <small className="muted">{u.email}</small>
                {u.role === "staff" ? (
                  <>
                    {active ? (
                      <PermissionSwitches value={u.permissions ?? []} onChange={(next) => changePermissions(u, next)} disabled={busy || !isOnline} />
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm self-start"
                      aria-expanded={showActivity === u.id}
                      onClick={() => setShowActivity(showActivity === u.id ? null : u.id)}
                    >
                      {showActivity === u.id ? "Yaptıklarını gizle" : "Yaptıkları"}
                    </button>
                    {showActivity === u.id && businessId ? (
                      <StaffActivityList businessId={businessId} devices={Object.keys(devices).filter((d) => devices[d] === u.id)} />
                    ) : null}
                    <button
                      type="button"
                      className={`btn btn-sm self-start ${active ? "btn-danger-soft" : "btn-secondary"}`}
                      onClick={() => void toggleActive(u)}
                      disabled={busy || !isOnline}
                    >
                      {active ? "Pasifleştir…" : "Yeniden etkinleştir"}
                    </button>
                  </>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {invites.length > 0 ? (
        <section className="stack stack-sm" aria-labelledby="invites-title">
          <h2 id="invites-title">Bekleyen davetler</h2>
          {invites.map((i) => (
            <div key={i.id} className="card stack stack-sm">
              <span className="row row-between">
                <strong>{i.name}</strong>
                <small className="muted">{formatDate(i.expires_at)} tarihine kadar</small>
              </span>
              <div className="invite-code" aria-label="Davet kodu">{formatInviteCode(i.code)}</div>
              <div className="row row-gap-sm">
                <a
                  className="btn btn-primary btn-sm"
                  href={`https://wa.me/?text=${encodeURIComponent(inviteMessage(i))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  WhatsApp ile gönder
                </a>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy(i)}>
                  {copied === i.id ? "Kopyalandı" : "Kopyala"}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelInvite(i)} disabled={busy || !isOnline}>
                  İptal
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {adding ? (
        <form className="card stack stack-md" onSubmit={addInvite} noValidate>
          <h2>Yeni çalışan</h2>
          <div className="form-group">
            <label className="form-label" htmlFor="st-name">Adı soyadı *</label>
            <input id="st-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <PermissionSwitches value={newPermissions} onChange={setNewPermissions} disabled={busy} />
          <small className="muted">
            Kaydedince bir davet kodu oluşur. Kodu çalışana WhatsApp ile gönderin; kendi e-postasıyla hesap açıp kodu
            yazınca ekibe katılır.
          </small>
          <div className="row row-gap-md">
            <button type="button" className="btn btn-secondary grow" onClick={() => setAdding(false)} disabled={busy}>Vazgeç</button>
            <button type="submit" className="btn btn-primary grow" disabled={busy || !isOnline}>Davet kodu oluştur</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn btn-primary btn-full" onClick={() => setAdding(true)} disabled={!isOnline}>
          + Çalışan ekle
        </button>
      )}
    </section>
  );
}
