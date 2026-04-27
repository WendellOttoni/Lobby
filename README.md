# Lobby

<p align="center">
  <img src="desktop/src-tauri/icons/128x128@2x.png" width="96" alt="Lobby logo" />
</p>

<p align="center">
  Comunicação por voz em tempo real para Windows.<br/>
  Alternativa leve ao Discord e TeamSpeak — sem electron, sem bloatware.
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/WendellOttoni/Lobby?label=versão&color=7c3aed" alt="release" />
  <img src="https://img.shields.io/github/actions/workflow/status/WendellOttoni/Lobby/build.yml?label=build" alt="build" />
  <img src="https://img.shields.io/badge/plataforma-Windows-0078d4" alt="windows" />
</p>

---

## Funcionalidades

- **Voz em tempo real** via WebRTC (LiveKit) — baixa latência, sem servidor central obrigatório
- **Servidores e salas** — crie servidores privados, convide pessoas por link (`lobby://join/CODIGO`)
- **Chat de texto** por servidor com canais, histórico, busca, respostas, reações, pins e anexos
- **Amigos e DMs** — solicitações de amizade, mensagens diretas e chamadas de voz privadas
- **Moderação e auditoria** — admins, expulsão, banimento, desbanimento, log administrativo e remoção de mensagens
- **Permissões por canal** — regras por cargo para ver e enviar em canais de texto
- **Convites avançados** — reset com expiração e limite de usos
- **Avatares reais** — upload de imagem no perfil
- **Silenciar servidor/canal** — preferências persistidas com cache local
- **Compartilhamento de tela** em salas de voz
- **Overlay de voz** sempre no topo com participantes da sala
- **Push-to-talk global** — segure uma tecla configurável e fale sem abrir o app
- **Reconexão automática** — cai a rede, volta sozinho
- **Notificações de sistema** quando alguém entra na sala
- **Auto-update** — detecta e instala novas versões automaticamente
- **Tray icon** — minimiza para a bandeja, sempre acessível
- **Binário leve** — instalador < 10 MB, baixo consumo de RAM

## Download

Baixe o instalador mais recente na [página de releases](https://github.com/WendellOttoni/Lobby/releases/latest).

> Requer Windows 10 ou superior (64-bit).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Tauri v2 + React + TypeScript |
| Voz | LiveKit (WebRTC) |
| Backend | Node.js + Fastify + Prisma |
| Banco | PostgreSQL |
| Deploy | Railway |

## Desenvolvimento local

### Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- [PostgreSQL](https://www.postgresql.org/) 15+
- [LiveKit Server](https://github.com/livekit/livekit/releases)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### Setup

```bash
# Backend
cd backend
cp .env.example .env   # preencha as variáveis
npm install
npm run dev

# LiveKit (outro terminal)
cd livekit
./livekit-server --config livekit.yaml

# Desktop (outro terminal)
cd desktop
npm install
npm run tauri dev
```

### Variáveis de ambiente (backend)

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/lobby
JWT_SECRET=seu-segredo
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
LIVEKIT_URL=ws://localhost:7880
PUBLIC_URL=http://localhost:3000
```

## Operação

O backend atual deve rodar como instância única. Presença, conexões WebSocket e sinalização de DMs ficam em memória do processo; para escalar horizontalmente, mova esses estados para Redis/pub-sub antes de subir múltiplas réplicas.

## Licença

[MIT](LICENSE)
