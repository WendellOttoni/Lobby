# Lobby Desktop

Cliente desktop do Lobby, construído com Tauri v2, React, TypeScript e Vite.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run tauri dev
```

## Integrações Tauri

- Tray icon e fechamento para bandeja
- Auto-update via GitHub Releases
- Deep links `lobby://join/CODE`
- Atalhos globais para push-to-talk, mute e deafen
- Notificações nativas
- Autostart com Windows
- Overlay de voz sempre no topo
- Detecção de jogo ativo no Windows

## Variáveis de build

`VITE_API_URL` define a URL do backend usada pelo cliente. Em desenvolvimento, o padrão é `http://localhost:3000`.
