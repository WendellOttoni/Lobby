import { useVoice } from "../contexts/VoiceContext";
import { useDM } from "../contexts/DMContext";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { Avatar } from "./Avatar";
import { Ico } from "./icons";

export function IncomingCallModal() {
  const { incomingCall, sendCallDecline, dismissCall } = useDM();
  const { connectDM } = useVoice();
  const { token } = useAuth();

  if (!incomingCall) return null;

  async function handleAccept() {
    if (!token || !incomingCall) return;
    dismissCall();
    try {
      const { token: lkToken, url, roomName } = await api.getCallToken(token, incomingCall.from.id);
      await connectDM(lkToken, url, roomName);
    } catch {}
  }

  function handleDecline() {
    if (!incomingCall) return;
    sendCallDecline(incomingCall.from.id);
    dismissCall();
  }

  return (
    <div className="incoming-call-overlay">
      <div className="incoming-call-modal">
        <Avatar name={incomingCall.from.username} id={incomingCall.from.id} size={48} />
        <div className="incoming-call-info">
          <span className="incoming-call-name">{incomingCall.from.username}</span>
          <span className="incoming-call-label">Chamada de voz recebida</span>
        </div>
        <div className="incoming-call-actions">
          <button className="incoming-call-btn accept" onClick={handleAccept} title="Atender">
            <Ico.headphones />
          </button>
          <button className="incoming-call-btn decline" onClick={handleDecline} title="Recusar">
            <Ico.headphonesOff />
          </button>
        </div>
      </div>
    </div>
  );
}
