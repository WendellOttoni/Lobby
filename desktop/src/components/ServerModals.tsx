import { useEffect, useState } from "react";
import { api, Category, ChannelPermission, Member, Room, ServerAuditLog, ServerBan, TextChannel } from "../lib/api";
import { Avatar } from "./Avatar";

// ── ItemContextMenu ───────────────────────────────────────────────────────────

interface ItemMenuState {
  type: "channel" | "room" | "category";
  id: string;
  x: number;
  y: number;
}

interface ItemContextMenuProps {
  menu: ItemMenuState;
  categories: Category[];
  channels: TextChannel[];
  rooms: Room[];
  onClose: () => void;
  onRename: (type: ItemMenuState["type"], id: string, currentName: string) => void;
  onDelete: (type: ItemMenuState["type"], id: string) => void;
  onMove: (type: "channel" | "room", id: string, categoryId: string | null) => void;
}

export function ItemContextMenu({
  menu,
  categories,
  channels,
  rooms,
  onClose,
  onRename,
  onDelete,
  onMove,
}: ItemContextMenuProps) {
  const item =
    menu.type === "channel" ? channels.find((c) => c.id === menu.id) :
    menu.type === "room" ? rooms.find((r) => r.id === menu.id) :
    categories.find((c) => c.id === menu.id);
  if (!item) return null;
  const currentCategoryId =
    menu.type === "category" ? null : (item as TextChannel | Room).categoryId ?? null;

  return (
    <div
      className="ctx-menu"
      style={{ position: "fixed", top: menu.y, left: menu.x, zIndex: 200 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ctx-menu-header">{item.name}</div>
      <button className="ctx-menu-item" onClick={() => onRename(menu.type, menu.id, item.name)}>
        Renomear
      </button>
      {menu.type !== "category" && categories.length > 0 && (
        <>
          <div className="ctx-menu-divider" />
          <div className="ctx-menu-section-label">Mover para</div>
          {currentCategoryId !== null && (
            <button
              className="ctx-menu-item"
              onClick={() => onMove(menu.type as "channel" | "room", menu.id, null)}
            >
              ↑ Sem categoria
            </button>
          )}
          {categories
            .filter((c) => c.id !== currentCategoryId)
            .map((c) => (
              <button
                key={c.id}
                className="ctx-menu-item"
                onClick={() => onMove(menu.type as "channel" | "room", menu.id, c.id)}
              >
                {c.name}
              </button>
            ))}
        </>
      )}
      <div className="ctx-menu-divider" />
      <button
        className="ctx-menu-item ctx-menu-item-danger"
        onClick={() => onDelete(menu.type, menu.id)}
      >
        Deletar
      </button>
      <button className="ctx-menu-item" onClick={onClose}>Cancelar</button>
    </div>
  );
}

export type { ItemMenuState };

// ── TransferModal ─────────────────────────────────────────────────────────────

interface TransferModalProps {
  token: string;
  serverId: string;
  currentUserId: string;
  onTransfer: (id: string, name: string) => void;
  onClose: () => void;
}

export function TransferModal({
  token,
  serverId,
  currentUserId,
  onTransfer,
  onClose,
}: TransferModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listMembers(token, serverId)
      .then(({ members }) => setMembers(members.filter((m) => m.id !== currentUserId)))
      .catch((err) => setError(err instanceof Error ? err.message : "Erro ao listar membros"));
  }, [token, serverId, currentUserId]);

  return (
    <div className="ctx-menu-overlay" onClick={onClose}>
      <div className="ctx-menu" style={{ minWidth: 240 }} onClick={(e) => e.stopPropagation()}>
        <div className="ctx-menu-header">Transferir servidor</div>
        <p style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0 8px" }}>
          Escolha o novo dono. Você vira membro.
        </p>
        {error && <p className="error" style={{ fontSize: 12, padding: "4px 0" }}>{error}</p>}
        {members.length === 0 && !error && (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Sem outros membros.</p>
        )}
        {members.map((m) => (
          <button
            key={m.id}
            className="btn-secondary"
            style={{ width: "100%", justifyContent: "flex-start", marginBottom: 4 }}
            onClick={() => onTransfer(m.id, m.username)}
          >
            {m.username}
            {m.role === "owner" && " (dono)"}
          </button>
        ))}
        <div className="ctx-menu-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ── ServerAdminModal ─────────────────────────────────────────────────────────

interface ServerAdminModalProps {
  token: string;
  serverId: string;
  onClose: () => void;
}

const ACTION_LABELS: Record<string, string> = {
  "member.join": "entrou no servidor",
  "member.leave": "saiu do servidor",
  "member.role": "alterou cargo",
  "member.kick": "expulsou membro",
  "member.ban": "baniu membro",
  "member.unban": "removeu banimento",
  "invite.reset": "resetou convite",
  "server.transfer": "transferiu servidor",
};

export function ServerAdminModal({ token, serverId, onClose }: ServerAdminModalProps) {
  const [tab, setTab] = useState<"bans" | "audit" | "permissions">("bans");
  const [bans, setBans] = useState<ServerBan[]>([]);
  const [logs, setLogs] = useState<ServerAuditLog[]>([]);
  const [channels, setChannels] = useState<TextChannel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [permissionRole, setPermissionRole] = useState<"member" | "admin">("member");
  const [permissions, setPermissions] = useState<ChannelPermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listBans(token, serverId),
      api.listAuditLogs(token, serverId),
      api.listChannels(token, serverId),
    ])
      .then(([banData, auditData, channelData]) => {
        if (cancelled) return;
        setBans(banData.bans);
        setLogs(auditData.logs);
        setChannels(channelData.channels);
        setSelectedChannelId((current) => current || channelData.channels[0]?.id || "");
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar administração");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token, serverId]);

  async function unban(ban: ServerBan) {
    if (!window.confirm(`Remover banimento de ${ban.username}?`)) return;
    try {
      await api.unbanMember(token, serverId, ban.userId);
      setBans((prev) => prev.filter((item) => item.userId !== ban.userId));
      const { logs } = await api.listAuditLogs(token, serverId);
      setLogs(logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao remover banimento");
    }
  }

  useEffect(() => {
    if (tab !== "permissions" || !selectedChannelId) return;
    let cancelled = false;
    api.listChannelPermissions(token, serverId, selectedChannelId)
      .then(({ permissions }) => {
        if (!cancelled) setPermissions(permissions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Erro ao carregar permissões");
      });
    return () => { cancelled = true; };
  }, [tab, token, serverId, selectedChannelId]);

  async function savePermission(next: { canRead: boolean; canWrite: boolean }) {
    if (!selectedChannelId) return;
    try {
      const { permission } = await api.setChannelPermission(token, serverId, selectedChannelId, permissionRole, next);
      setPermissions((prev) => {
        const others = prev.filter((item) => item.role !== permission.role);
        return [...others, permission];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar permissões");
    }
  }

  const currentPermission = permissions.find((item) => item.role === permissionRole);
  const canRead = currentPermission?.canRead ?? true;
  const canWrite = currentPermission?.canWrite ?? true;

  return (
    <div className="ctx-menu-overlay" onClick={onClose}>
      <div
        className="ctx-menu"
        style={{ width: "min(620px, calc(100vw - 32px))", maxHeight: "min(720px, calc(100vh - 48px))", overflow: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ctx-menu-header">Administração</div>
        <div className="ctx-menu-actions" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
          <button className={tab === "bans" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("bans")}>
            Banidos
          </button>
          <button className={tab === "audit" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("audit")}>
            Auditoria
          </button>
          <button className={tab === "permissions" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("permissions")}>
            Permissões
          </button>
        </div>
        {error && <p className="error" style={{ fontSize: 12, padding: "4px 0 8px" }}>{error}</p>}
        {loading && <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Carregando...</p>}
        {!loading && tab === "bans" && (
          <div>
            {bans.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Nenhum banimento ativo.</p>}
            {bans.map((ban) => (
              <div key={ban.id} className="member-row" style={{ borderRadius: 6 }}>
                <div className="member-row-avatar-wrap">
                  <Avatar name={ban.username} id={ban.userId} src={ban.avatarUrl} size={32} />
                </div>
                <div className="member-row-info">
                  <div className="member-row-name">{ban.username}</div>
                  <div className="member-row-sub">
                    Por {ban.bannedByName} · {new Date(ban.createdAt).toLocaleString("pt-BR")}
                    {ban.reason ? ` · ${ban.reason}` : ""}
                  </div>
                </div>
                <button className="btn-secondary" onClick={() => unban(ban)}>Desbanir</button>
              </div>
            ))}
          </div>
        )}
        {!loading && tab === "audit" && (
          <div>
            {logs.length === 0 && <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Sem eventos registrados.</p>}
            {logs.map((log) => (
              <div key={log.id} className="member-row" style={{ borderRadius: 6 }}>
                <div className="member-row-info">
                  <div className="member-row-name">
                    {log.actorName} {ACTION_LABELS[log.action] ?? log.action}
                  </div>
                  <div className="member-row-sub">
                    {new Date(log.createdAt).toLocaleString("pt-BR")}
                    {log.targetId ? ` · alvo: ${log.targetId}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!loading && tab === "permissions" && (
          <div>
            {channels.length === 0 ? (
              <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Crie um canal de texto para configurar permissões.</p>
            ) : (
              <>
                <div className="ctx-menu-actions" style={{ justifyContent: "flex-start", marginBottom: 10 }}>
                  <select
                    className="rooms-new-select"
                    value={selectedChannelId}
                    onChange={(e) => setSelectedChannelId(e.target.value)}
                  >
                    {channels.map((channel) => (
                      <option key={channel.id} value={channel.id}>#{channel.name}</option>
                    ))}
                  </select>
                  <select
                    className="rooms-new-select"
                    value={permissionRole}
                    onChange={(e) => setPermissionRole(e.target.value as "member" | "admin")}
                  >
                    <option value="member">Membros</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
                <label className="member-row" style={{ borderRadius: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={canRead}
                    onChange={(e) => savePermission({ canRead: e.target.checked, canWrite: e.target.checked ? canWrite : false })}
                  />
                  <div className="member-row-info">
                    <div className="member-row-name">Pode ver o canal</div>
                    <div className="member-row-sub">Quando desligado, o canal some da lista e do histórico.</div>
                  </div>
                </label>
                <label className="member-row" style={{ borderRadius: 6, cursor: canRead ? "pointer" : "not-allowed", opacity: canRead ? 1 : 0.55 }}>
                  <input
                    type="checkbox"
                    checked={canRead && canWrite}
                    disabled={!canRead}
                    onChange={(e) => savePermission({ canRead, canWrite: e.target.checked })}
                  />
                  <div className="member-row-info">
                    <div className="member-row-name">Pode enviar mensagens</div>
                    <div className="member-row-sub">Bloqueia mensagens, digitação e edição no canal.</div>
                  </div>
                </label>
              </>
            )}
          </div>
        )}
        <div className="ctx-menu-actions" style={{ marginTop: 10 }}>
          <button type="button" className="btn-secondary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
