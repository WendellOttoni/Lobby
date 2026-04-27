# Arquitetura do Lobby

## Visão geral

```
┌─────────────────────────┐
│   App Tauri (Windows)   │
│  React + TS + LiveKit   │
└───────────┬─────────────┘
            │
      ┌─────┴─────┐
      ▼           ▼
┌──────────┐  ┌──────────────┐
│ Backend  │  │   LiveKit    │
│ Node.js  │  │   Server     │
│ Fastify  │  │  (mídia/voz) │
└────┬─────┘  └──────────────┘
     │
     ▼
┌────────────┐
│ PostgreSQL │
└────────────┘
```

O processo do backend também mantém estado efêmero em memória: presença online, conexões WebSocket de chat, conexões por usuário para DMs e sinalização de chamada privada. Por isso, a topologia suportada hoje é uma instância de backend. Redis/pub-sub é a próxima mudança necessária antes de múltiplas réplicas.

## Fluxo de uma chamada

1. Usuário abre o app Tauri → faz login no backend Node → recebe JWT de sessão
2. Usuário pede pra entrar na sala X → backend valida permissões no Postgres → gera token LiveKit assinado
3. App usa o token pra conectar direto no LiveKit via WebRTC
4. LiveKit cuida do roteamento de áudio entre todos os participantes da sala

## Fluxo de chat

1. O app abre `/servers/:serverId/ws` com o JWT na query string
2. O backend valida o usuário e a associação ao servidor
3. Ao selecionar um canal, o cliente envia `selectChannel` e recebe o histórico mais recente
4. Mensagens novas são persistidas no PostgreSQL e transmitidas aos clientes no mesmo canal
5. Clientes em outros canais recebem apenas um evento de unread

## Uploads

Uploads passam por `/upload`, exigem JWT e aceitam apenas JPEG, PNG, GIF, WebP, MP4 e PDF. O backend valida MIME e extensão, gera nome seguro no servidor e serve arquivos com `X-Content-Type-Options: nosniff`.

## Permissões e moderação

O modelo atual usa três cargos: `owner`, `admin` e `member`. O dono pode transferir o servidor, deletar o servidor, alterar cargos e resetar convites. Donos e admins podem gerenciar canais, categorias, salas, pins, permissões por canal e remover mensagens. Donos/admins também podem expulsar ou banir membros, com a regra de que admins não moderam outros admins.

Cada canal de texto pode ter permissões por cargo para leitura e escrita. Donos/admins passam pela permissão de gestão; membros respeitam as regras do canal no carregamento da lista, histórico, busca, digitação, envio, edição e reação.

Eventos administrativos relevantes são gravados em `ServerAuditLog`, incluindo entrada/saída, alteração de cargo, kick/ban/unban, reset de convite e transferência de propriedade. A tela de Administração mostra banidos, auditoria e permissões.

Preferências de notificação ficam em `NotificationPreference` por servidor/canal e são espelhadas no localStorage do desktop para resposta imediata da UI.

## Convites

Cada servidor mantém `inviteCode`, `inviteUses`, `inviteMaxUses` e `inviteExpiresAt`. Ao entrar por convite, o backend valida banimento, expiração e limite de usos antes de criar a associação do membro.

## Decisões de design

### Por que Tauri e não Electron?
Tauri usa o WebView nativo do SO (WebView2 no Windows) ao invés de empacotar o Chromium inteiro.
Resultado: binário ~5-10MB vs ~100MB+ do Electron, e muito menos RAM em runtime.

### Por que LiveKit?
LiveKit é um servidor WebRTC SFU (Selective Forwarding Unit) open source.
SFU significa que cada participante envia áudio uma vez pro servidor, e o servidor distribui pra todos.
Isso escala melhor do que P2P puro (que teria N conexões por participante).

### Por que Fastify e não Express?
Fastify é ~2x mais rápido que Express em benchmarks de throughput, tem validação de schema nativa
com TypeBox/JSON Schema, e tipagem TypeScript muito melhor out-of-the-box.

### Por que Prisma?
ORM com type-safety gerada a partir do schema. Migrações versionadas. Muito mais seguro do que
queries SQL manuais para um projeto sem DBA dedicado.

### Por que instância única no backend?
O produto usa WebSockets em memória para baixa complexidade no MVP. Isso evita Redis no setup local, mas significa que presença e eventos em tempo real não atravessam processos. Em produção, mantenha uma réplica ou implemente Redis/pub-sub antes de escalar.
