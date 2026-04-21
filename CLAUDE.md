# Lobby — Contexto do projeto para Claude Code

## O que é o Lobby

App de comunicação por voz em tempo real para Windows. Alternativa leve ao Discord e TeamSpeak.
Foco: voz bem feita, binário pequeno (<10MB), baixo consumo de RAM, servidor próprio.

## MVP — o que entra

- Cadastro e login de usuários
- Criação e listagem de salas privadas
- Entrada/saída de salas
- Comunicação por voz em tempo real (WebRTC via LiveKit)
- Controles: mute, volume, escolha de microfone
- Lista de participantes online na sala

## MVP — o que NÃO entra ainda

Chat de texto, vídeo, compartilhamento de tela, push-to-talk global, tray icon, overlay,
permissões avançadas, moderação, banimento, integrações, bots, notificações push, upload de arquivos.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Tauri + React + TypeScript + Vite |
| Voz (cliente) | livekit-client SDK |
| Backend HTTP | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Banco de dados | PostgreSQL |
| Cache / presença | Redis |
| Autenticação | JWT |
| Servidor de mídia | LiveKit (binário local) |

## Estrutura de pastas

```
lobby/
├── backend/
│   ├── src/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── db/
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
├── desktop/
│   ├── src/                  # Frontend React
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── App.tsx
│   ├── src-tauri/            # Rust (Tauri core)
│   │   ├── src/
│   │   └── Cargo.toml
│   ├── package.json
│   └── vite.config.ts
├── livekit/
│   └── livekit.yaml
├── docs/
│   └── arquitetura.md
├── .gitignore
├── README.md
└── CLAUDE.md
```

## Fluxo de uma chamada de voz

1. App faz login no backend Node → recebe JWT de sessão
2. Usuário entra em sala → backend valida no Postgres → gera token LiveKit assinado
3. App conecta diretamente no LiveKit via WebRTC usando o token
4. LiveKit roteia o áudio entre todos os participantes da sala

## Variáveis de ambiente

Todas as variáveis sensíveis ficam em `.env` (nunca commitar).
Use `.env.example` como referência das variáveis necessárias sem valores reais.

Variáveis esperadas no backend:
- `DATABASE_URL` — string de conexão PostgreSQL
- `REDIS_URL` — string de conexão Redis
- `JWT_SECRET` — segredo para assinar tokens JWT
- `LIVEKIT_API_KEY` — chave da API do LiveKit
- `LIVEKIT_API_SECRET` — segredo da API do LiveKit
- `LIVEKIT_URL` — URL do servidor LiveKit (ex: ws://localhost:7880)

## Convenções de código

- TypeScript estrito em todo o projeto (backend e frontend)
- Sem `any` explícito — usar tipos corretos ou `unknown`
- Sem comentários que descrevem o que o código faz — só o porquê quando não for óbvio
- Imports absolutos no backend (`src/` como base)
- Componentes React em PascalCase, hooks em camelCase com prefixo `use`
- Rotas Fastify organizadas por domínio em `src/routes/`

## Sprints

- **Sprint 0** — Ambiente (Rust, Node, Postgres, Redis, LiveKit instalados)
- **Sprint 1** — Backend base: Fastify + Prisma + cadastro/login com JWT ← *estamos aqui*
- **Sprint 2** — Salas: CRUD + geração de token LiveKit
- **Sprint 3** — App Tauri base: login, lista de salas
- **Sprint 4** — Voz: integração LiveKit SDK, lista de participantes, controles
- **Sprint 5** — Polimento MVP: presença online, logout, empacotamento .msi
- **Sprint 6+** — Push-to-talk global, tray, auto-start, deploy real
