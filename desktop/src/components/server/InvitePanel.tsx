import { useState } from "react";
import { Server } from "../../lib/api";

interface Props {
  server: Server | null;
  inviteCode: string;
  isOwner: boolean;
  currentChannelMuted: boolean;
  onResetInvite: (opts: { maxUses: number | null; expiresInHours: number | null }) => void;
  onToggleCurrentChannelMuted: () => void;
}

export function InvitePanel({
  server,
  inviteCode,
  isOwner,
  currentChannelMuted,
  onResetInvite,
  onToggleCurrentChannelMuted,
}: Props) {
  const [inviteMaxUses, setInviteMaxUses] = useState("");
  const [inviteExpiresHours, setInviteExpiresHours] = useState("");
  const [copiedMsg, setCopiedMsg] = useState<string | null>(null);

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text);
    setCopiedMsg(label);
    setTimeout(() => setCopiedMsg(null), 2000);
  }

  function handleReset() {
    onResetInvite({
      maxUses: inviteMaxUses.trim() ? Number(inviteMaxUses) : null,
      expiresInHours: inviteExpiresHours.trim() ? Number(inviteExpiresHours) : null,
    });
  }

  return (
    <div className="invite-box">
      <span style={{ color: "var(--text-dim)" }}>Código de convite:</span>
      <code>{inviteCode}</code>
      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>
        Usos: {server?.inviteUses ?? 0}{server?.inviteMaxUses ? `/${server.inviteMaxUses}` : ""}
        {server?.inviteExpiresAt ? ` · expira em ${new Date(server.inviteExpiresAt).toLocaleString("pt-BR")}` : ""}
      </span>
      <div className="invite-box-actions">
        <button onClick={() => copy(inviteCode, "Código copiado!")} className="btn-secondary">
          Copiar código
        </button>
        <button onClick={() => copy(`lobby://join/${inviteCode}`, "Link copiado!")} className="btn-secondary">
          Copiar link
        </button>
        <button onClick={onToggleCurrentChannelMuted} className="btn-secondary">
          {currentChannelMuted ? "Ativar canal" : "Silenciar canal"}
        </button>
        {isOwner && (
          <>
            <input
              value={inviteMaxUses}
              onChange={(e) => setInviteMaxUses(e.target.value.replace(/\D/g, ""))}
              placeholder="Usos máx."
              style={{ width: 90 }}
            />
            <input
              value={inviteExpiresHours}
              onChange={(e) => setInviteExpiresHours(e.target.value.replace(/\D/g, ""))}
              placeholder="Expira h"
              style={{ width: 90 }}
            />
            <button onClick={handleReset} className="btn-danger-outline">
              Resetar
            </button>
          </>
        )}
        {copiedMsg && <span className="invite-box-confirm">{copiedMsg}</span>}
      </div>
    </div>
  );
}
