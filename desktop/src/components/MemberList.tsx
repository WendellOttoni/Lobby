import { memo, useState } from "react";
import { api, Member } from "../lib/api";
import { Avatar } from "./Avatar";
import { useVisiblePolling } from "../lib/usePolling";

interface Props {
  serverId: string;
  token: string;
  currentUserId: string;
  currentUserRole: string;
}

export function MemberList({ serverId, token, currentUserId, currentUserRole }: Props) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useVisiblePolling(
    async () => {
      const { members: list } = await api
        .listMembers(token, serverId)
        .catch(() => ({ members: [] as Member[] }));
      setMembers(list);
    },
    60_000,
    !!token && !!serverId
  );

  if (members === null) {
    return (
      <aside className="member-list">
        <div className="member-list-heading">Carregando...</div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="member-row skeleton">
            <div className="member-row-avatar-wrap">
              <div className="skeleton-box" />
            </div>
            <div className="member-row-info">
              <span className="skeleton-line" />
            </div>
          </div>
        ))}
      </aside>
    );
  }

  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);

  if (members.length === 0) {
    return (
      <aside className="member-list">
        <div className="member-list-empty">Sem membros aqui ainda.</div>
      </aside>
    );
  }

  return (
    <aside className="member-list">
      {online.length > 0 && (
        <section>
          <div className="member-list-heading">
            <span className="member-list-heading-dot" />
            Online · {online.length}
          </div>
          {online.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              online
              token={token}
              serverId={serverId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onChanged={(next) => setMembers(next)}
              members={members}
            />
          ))}
        </section>
      )}
      {offline.length > 0 && (
        <section>
          <div className="member-list-heading">Offline · {offline.length}</div>
          {offline.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              online={false}
              token={token}
              serverId={serverId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onChanged={(next) => setMembers(next)}
              members={members}
            />
          ))}
        </section>
      )}
    </aside>
  );
}

const MemberRow = memo(function MemberRow({
  member,
  online,
  token,
  serverId,
  currentUserId,
  currentUserRole,
  members,
  onChanged,
}: {
  member: Member;
  online: boolean;
  token: string;
  serverId: string;
  currentUserId: string;
  currentUserRole: string;
  members: Member[];
  onChanged: (members: Member[]) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const canManage = currentUserRole === "owner" || currentUserRole === "admin";
  const canEditRole = currentUserRole === "owner" && member.role !== "owner" && member.id !== currentUserId;
  const canModerate =
    canManage &&
    member.id !== currentUserId &&
    member.role !== "owner" &&
    (currentUserRole === "owner" || member.role !== "admin");

  async function updateRole(role: "admin" | "member") {
    try {
      await api.setMemberRole(token, serverId, member.id, role);
      onChanged(members.map((m) => (m.id === member.id ? { ...m, role } : m)));
      setMenuOpen(false);
    } catch {}
  }

  async function kick() {
    if (!window.confirm(`Expulsar ${member.username} do servidor?`)) return;
    try {
      await api.kickMember(token, serverId, member.id);
      onChanged(members.filter((m) => m.id !== member.id));
      setMenuOpen(false);
    } catch {}
  }

  async function ban() {
    if (!window.confirm(`Banir ${member.username} do servidor?`)) return;
    try {
      await api.banMember(token, serverId, member.id);
      onChanged(members.filter((m) => m.id !== member.id));
      setMenuOpen(false);
    } catch {}
  }

  return (
    <div className={`member-row${online ? "" : " offline"}`} style={{ position: "relative" }}>
      <div className="member-row-avatar-wrap">
        <Avatar name={member.username} id={member.id} src={member.avatarUrl} size={32} />
        <span className={`member-row-dot${online ? " online" : ""}`} />
      </div>
      <div className="member-row-info">
        <div className="member-row-name">{member.username}</div>
        {online && member.game && (
          <div className="member-row-sub">Jogando {member.game}</div>
        )}
        {online && !member.game && member.statusText && (
          <div className="member-row-sub">{member.statusText}</div>
        )}
      </div>
      {(canEditRole || canModerate) && (
        <button
          className="channel-row-menu-btn"
          title="Ações de membro"
          onClick={() => setMenuOpen((v) => !v)}
        >
          ⋯
        </button>
      )}
      {menuOpen && (
        <div className="ctx-menu" style={{ position: "absolute", right: 8, top: 34, zIndex: 250, minWidth: 170 }}>
          <div className="ctx-menu-header">{member.username}</div>
          {canEditRole && member.role === "member" && (
            <button className="ctx-menu-item" onClick={() => updateRole("admin")}>Promover a admin</button>
          )}
          {canEditRole && member.role === "admin" && (
            <button className="ctx-menu-item" onClick={() => updateRole("member")}>Remover admin</button>
          )}
          {canModerate && (
            <>
              <div className="ctx-menu-divider" />
              <button className="ctx-menu-item ctx-menu-item-danger" onClick={kick}>Expulsar</button>
              <button className="ctx-menu-item ctx-menu-item-danger" onClick={ban}>Banir</button>
            </>
          )}
          <button className="ctx-menu-item" onClick={() => setMenuOpen(false)}>Cancelar</button>
        </div>
      )}
    </div>
  );
});
