import { useState } from "react";
import { api, Member } from "../lib/api";
import { Avatar } from "./Avatar";
import { useVisiblePolling } from "../lib/usePolling";

interface Props {
  serverId: string;
  token: string;
}

export function MemberList({ serverId, token }: Props) {
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
            <MemberRow key={m.id} member={m} online />
          ))}
        </section>
      )}
      {offline.length > 0 && (
        <section>
          <div className="member-list-heading">Offline · {offline.length}</div>
          {offline.map((m) => (
            <MemberRow key={m.id} member={m} online={false} />
          ))}
        </section>
      )}
    </aside>
  );
}

function MemberRow({ member, online }: { member: Member; online: boolean }) {
  return (
    <div className={`member-row${online ? "" : " offline"}`}>
      <div className="member-row-avatar-wrap">
        <Avatar name={member.username} id={member.id} size={32} />
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
    </div>
  );
}
