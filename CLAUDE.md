# Lobby — Contexto do projeto para Claude Code

## O que é o Lobby

App de comunicação por voz em tempo real para Windows. Alternativa leve ao Discord e TeamSpeak.
Foco: voz bem feita, binário pequeno, baixo consumo de RAM, servidor próprio.

## O que já está shippado (MVP completo + extras)

**Auth**
- Cadastro, login e atualização de perfil (username + senha) via JWT

**Servidores (multi-tenant)**
- Criação de servidor com invite code único
- Entrar em servidor pelo código
- Listagem dos servidores do usuário
- Salas de voz dentro de cada servidor (CRUD)

**Voz**
- Entrada/saída de salas com WebRTC via LiveKit
- Mute/unmute, controle de volume, seleção de microfone
- Medidor de nível de mic em tempo real
- Lista de participantes online com cards (avatar por cor, indicador de fala)
- Menu de contexto por participante (silenciar localmente)
- Voz persistente: navegar entre páginas sem cair da sala

**Chat de texto**
- Chat por servidor via WebSocket com persistência em PostgreSQL
- Histórico carregado ao entrar no servidor

**App desktop (Tauri)**
- Janela minimiza para o tray em vez de fechar
- Tray icon com menu "Abrir" e "Sair"
- Auto-updater: verifica ao iniciar + botão manual em Settings
- Settings modal: editar conta + verificar atualizações
- CI publica nova release a cada push no `main` (tag `v0.1.N`)

**Extras pós-MVP**
- Push-to-talk com hotkey global configurável (Settings > Push-to-talk)
- Detecção de jogo ativo via `tasklist` (Windows)
- Notificações nativas quando alguém entra em sala
- Lista de membros online/offline por servidor com jogo atual
- Autostart com Windows (toggle em Settings)
- Deep links `lobby://join/CODE` (single-instance)

## O que NÃO entra (fora de escopo atual)

Vídeo, compartilhamento de tela, overlay, permissões avançadas,
moderação, banimento, bots, notificações push, upload de arquivos.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Desktop | Tauri v2 + React + TypeScript + Vite |
| Voz (cliente) | livekit-client SDK |
| Backend HTTP | Node.js + Fastify + TypeScript |
| ORM | Prisma |
| Banco de dados | PostgreSQL |
| Autenticação | JWT |
| Servidor de mídia | LiveKit (binário local em dev, self-hosted em prod) |
| Deploy backend | Railway |
| CI/CD | GitHub Actions — build + release automática |

## Estrutura de pastas

```
lobby/
├── backend/
│   ├── src/
│   │   ├── routes/        # auth.ts | servers.ts | chat.ts
│   │   ├── services/      # livekit.ts
│   │   ├── plugins/       # jwt.ts
│   │   ├── db/            # client.ts (Prisma)
│   │   └── index.ts
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
├── desktop/
│   ├── src/
│   │   ├── components/    # ServerSidebar, ChatPanel, VoiceBar, ParticipantCard, SettingsModal…
│   │   ├── pages/         # LoginPage, RegisterPage, ServersLayout, ServerPage, RoomPage
│   │   ├── contexts/      # AuthContext, VoiceContext
│   │   ├── lib/           # api.ts, avatar.ts
│   │   └── App.tsx
│   ├── src-tauri/
│   │   ├── src/lib.rs     # tray icon + auto-updater
│   │   ├── capabilities/  # default.json (permissões Tauri v2)
│   │   └── tauri.conf.json
│   └── package.json
├── livekit/
│   ├── livekit-server.exe
│   └── livekit.yaml
├── .github/workflows/
│   └── build.yml          # CI: build + tag + release + prune
└── CLAUDE.md
```

## Fluxo de uma chamada de voz

1. App faz login no backend → recebe JWT
2. Usuário entra em sala → backend gera token LiveKit assinado
3. App conecta no LiveKit via WebRTC usando o token
4. LiveKit roteia o áudio; presença dos participantes vem via eventos do SDK

## Fluxo do auto-updater

1. No startup, `lib.rs` verifica o endpoint `releases/latest/download/latest.json`
2. Se há versão nova, baixa e instala em background → reinicia o app
3. Botão "Verificar atualização" em Settings chama `check()` do frontend (requer `updater:default` + `process:default` nas capabilities)
4. CI publica `latest.json` + `.sig` a cada release (`bundle.createUpdaterArtifacts: true`)

## Schema do banco (Prisma)

- `User` — id, username, email, passwordHash
- `Server` — id, name, inviteCode, ownerId
- `ServerMember` — userId + serverId + role (unique pair)
- `Room` — id, name, serverId
- `RoomMember` — userId + roomId (unique pair, usado para presença)
- `Message` — id, content, authorId, serverId, createdAt (index em serverId+createdAt)

## Variáveis de ambiente (backend)

- `DATABASE_URL` — string de conexão PostgreSQL
- `JWT_SECRET` — segredo para assinar tokens
- `LIVEKIT_API_KEY` — chave da API do LiveKit
- `LIVEKIT_API_SECRET` — segredo da API do LiveKit
- `LIVEKIT_URL` — URL do servidor LiveKit (ex: `ws://localhost:7880`)
- `PORT` — porta HTTP (padrão: 3000)
- `CORS_ORIGINS` — origens extras permitidas no CORS, separadas por vírgula (opcional)

## Secrets do CI (GitHub)

- `TAURI_SIGNING_PRIVATE_KEY` — chave privada para assinar os artefatos de update
- `VITE_API_URL` — URL do backend injetada no build do frontend

## Convenções de código

- TypeScript estrito em todo o projeto — sem `any` explícito
- Sem comentários que descrevem o que o código faz — só o porquê quando não for óbvio
- Imports absolutos no backend (`src/` como base)
- Componentes React em PascalCase, hooks em camelCase com prefixo `use`
- Rotas Fastify organizadas por domínio em `src/routes/`
- Versão do app é sempre sobrescrita pelo CI para `0.1.${run_number}` — não alterar manualmente

## Próximas possibilidades

- Permissões por sala (owner pode moderar)
- Overlay flutuante sobre outros apps
- Upload de avatar real (hoje é gerado por cor)
- Mover presença pra Redis se for escalar pra múltiplas instâncias do backend
