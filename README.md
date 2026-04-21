# Lobby

App de comunicação por voz em tempo real para Windows. Alternativa leve ao Discord e TeamSpeak.

## Pré-requisitos

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://rustup.rs/) (stable)
- [PostgreSQL](https://www.postgresql.org/) 15+
- [Redis](https://redis.io/) (ou [Memurai](https://www.memurai.com/) no Windows)
- [LiveKit Server](https://github.com/livekit/livekit/releases) (binário local)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (requerido pelo Tauri no Windows)

## Estrutura

```
lobby/
├── backend/      # API Node.js + Fastify
├── desktop/      # App Tauri (React + Rust)
├── livekit/      # Configuração do servidor de mídia
└── docs/         # Documentação
```

## Setup rápido

```bash
# Backend
cd backend
cp .env.example .env   # preencha as variáveis
npm install
npm run dev

# LiveKit (em outro terminal, na pasta livekit/)
livekit-server --config livekit.yaml

# Desktop (em outro terminal)
cd desktop
npm install
npm run tauri dev
```

## Documentação

- [Arquitetura](docs/arquitetura.md)
