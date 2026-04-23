import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { api, Member } from "../lib/api";
import { avatarBg, avatarInitials } from "../lib/avatar";

interface Props {
  serverId: string;
  token: string;
}

export function MemberList({ serverId, token }: Props) {
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      const game = await invoke<string | null>("detect_game").catch(() => null);
      await api.heartbeat(token, game).catch(() => {});

      if (cancelled) return;

      const { members: list } = await api.listMembers(token, serverId).catch(() => ({ members: [] }));
      if (!cancelled) setMembers(list);
    }

    tick();
    const id = setInterval(tick, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [serverId, token]);

  const online = members.filter((m) => m.online);
  const offline = members.filter((m) => !m.online);

  return (
    <div className="member-list">
      {online.length > 0 && (
        <section>
          <div className="member-list-heading">Online — {online.length}</div>
          {online.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </section>
      )}
      {offline.length > 0 && (
        <section>
          <div className="member-list-heading">Offline — {offline.length}</div>
          {offline.map((m) => (
            <MemberRow key={m.id} member={m} />
          ))}
        </section>
      )}
    </div>
  );
}

function MemberRow({ member }: { member: Member }) {
  return (
    <div className={`member-row ${member.online ? "online" : "offline"}`}>
      <div className="member-avatar" style={{ background: avatarBg(member.id) }}>
        {avatarInitials(member.username)}
        <span className={`member-dot ${member.online ? "online" : "offline"}`} />
      </div>
      <div className="member-info">
        <span className="member-name">{member.username}</span>
        {member.game && <span className="member-game">{member.game}</span>}
      </div>
    </div>
  );
}
