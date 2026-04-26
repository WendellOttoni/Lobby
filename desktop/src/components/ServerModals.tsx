import { useEffect, useState } from "react";
import { api, Category, Member, Room, TextChannel } from "../lib/api";

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
