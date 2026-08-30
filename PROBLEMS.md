# Problemas Identificados — Floating Head Cam

Análise completa do projecto após revisão de todo o código (main, preload, renderer), configuração,
scripts, CI e testes. Documenta o que foi **corrigido**, o que ficou como **limitação conhecida** e
o estado actual de validação.

## Estado actual (verificado)

| Verificação        | Comando                  | Resultado                                    |
| ------------------ | ------------------------ | -------------------------------------------- |
| Tipos (node + web) | `npm run typecheck`      | ✅ passa                                     |
| Testes             | `npm test`               | ✅ 13 ficheiros / 90 testes                  |
| Lint               | `npx eslint .`           | ✅ sem erros nem avisos                      |
| Formatação         | `npx prettier --check .` | ✅ limpo                                     |
| Build produção     | `npm run build`          | ✅ electron-vite (main + preload + renderer) |

---

## Problemas corrigidos

### Testes / Build & Configuração

| #    | Problema                                                                                                                                             | Local                                                             | Correção                                                                               |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P1   | Teste desatualizado: `useCameraStream` agora passa `frameRate` e `max` em width/height; o teste esperava as constraints antigas → 1 teste falhava    | `src/renderer/src/domains/camera/hooks/use-camera-stream.test.ts` | Teste actualizado para as constraints actuais                                          |
| P2   | Script `build:unpack` não existia no `package.json`, mas o `Makefile` (`make build-unpack`) e o `README` referem-no → `npm run build:unpack` falhava | `package.json`, `Makefile`, `README.md`                           | Adicionado `build:unpack` (`electron-builder --dir`)                                   |
| P3   | `FHC_SAFE_GPU=1` era definido pelo `dev-launcher.mjs` mas **nunca lido** na app → o "SAFE GPU mode" não fazia nada                                   | `src/main/index.ts`, `scripts/dev-launcher.mjs`                   | `app.disableHardwareAcceleration()` quando `FHC_SAFE_GPU=1`                            |
| P4   | `tsconfig.*.tsbuildinfo` commitados e fora do `.gitignore` (artefactos de build no git)                                                              | raiz                                                              | Adicionado `*.tsbuildinfo` ao `.gitignore` e removidos do tracking (`git rm --cached`) |
| P5   | `homepage` apontava para `electron-vite.org` (errado)                                                                                                | `package.json`                                                    | Correto para o repositório GitHub                                                      |
| P6   | `lucide-react: "latest"` sem pin (builds não reproduzíveis)                                                                                          | `package.json`                                                    | Fixado em `1.37.0`                                                                     |
| P7   | Dependências não usadas: `usehooks-ts`, `dotenv-cli`                                                                                                 | `package.json`, `package-lock.json`                               | Removidas                                                                              |
| PRET | `scripts/setup-make.mjs` não seguia o Prettier                                                                                                       | `scripts/setup-make.mjs`                                          | Formatado                                                                              |

### Gravação (BETA) — pipeline ffmpeg

| #     | Problema                                                                                                                                                                                                                                                                                                                                          | Local                                                                                                             | Correção                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P8/P9 | Com encoders GPU (NVENC/QSV/AMF/VideoToolbox) o main usava `videoCodec('copy')` + `-bsf:v h264_metadata` assumindo o stream H.264; o `MediaRecorder` do Chromium produz WebM (VP9/VP8) → ficheiros partidos. Além disso a escala/FPS (`-vf`) só era aplicada no ramo não-H264, pelo que **resolução/FPS eram ignorados** com encoders de hardware | `src/main/domains/recording/recording.service.ts`, `src/renderer/src/domains/camera/hooks/use-screen-recorder.ts` | O stream é **sempre re-encodado** com o encoder escolhido; filtros de escala/FPS/cores/bitrate aplicados em todos os encoders; `MediaRecorder` usa sempre WebM (já não tenta `avc1`) |
| P10   | Race no stop: `recording-stopped` era enviado **antes** da finalização ffmpeg; iniciar nova gravação durante a finalização era silenciosamente ignorado                                                                                                                                                                                           | `src/renderer/src/domains/camera/hooks/use-screen-recorder.ts`                                                    | `recording-stop` agora é aguardado (com catch) **antes** de enviar `recording-stopped`                                                                                               |
| P11   | `systemAudioVolume`/`microphoneAudioVolume` recebidos no main e imediatamente descartados (`void`) — engano arquitectural                                                                                                                                                                                                                         | `src/main/domains/recording/recording.service.ts`                                                                 | Parâmetros removidos do handler `recording-start`; a mistura de áudio continua no renderer                                                                                           |
| ROB   | `MediaRecorder` sem handler de erro → gravação podia ficar "presa" em erro do SO                                                                                                                                                                                                                                                                  | `src/renderer/src/domains/camera/hooks/use-screen-recorder.ts`                                                    | Adicionado `mediaRecorder.onerror` que para e finaliza a gravação                                                                                                                    |

### Segurança / Endurecimento do Electron

| #   | Problema                                                                                                                                                  | Local               | Correção                                                                |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------- |
| P12 | `setPermissionRequestHandler`/`setPermissionCheckHandler` concediam **todas** as permissões (geolocalização, notificações, etc.) a qualquer `webContents` | `src/main/index.ts` | Restrito a `media` e `display-capture` (o que a app usa)                |
| P14 | IPC `update-shortcut` escrevia qualquer `key` no objecto `shortcuts` sem validação (ao contrário de `sync-tray`/`update-setting`)                         | `src/main/index.ts` | `key` validada contra `defaultShortcuts`                                |
| P15 | CSP duplicada/mutilada: o handler `onHeadersReceived` só emitia `script-src`, com política mais fraca que a do `<meta>`                                   | `src/main/index.ts` | Política CSP completa e alinhada com o `<meta>`, com variante dev (HMR) |
| P16 | `app.setAppUserModelId('com.electron')` genérico                                                                                                          | `src/main/index.ts` | Usado o `appId` real (`com.electron.app`)                               |

### Comportamento / Limpeza

| #   | Problema                                                                                                                                                                                                   | Local                                                                       | Correção                                                                            |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| P17 | Atalhos `1–5` disparados duas vezes quando a janela da câmara estava focada (globalShortcut + listener `keydown` no renderer)                                                                              | `src/renderer/src/domains/camera/camera.page.tsx`                           | Removido o listener `keydown` redundante (os atalhos globais cobrem)                |
| P20 | `update-shortcut` escolhia a "primeira janela que não é settings" (podia ser o worker de gravação) em vez da janela da câmara                                                                              | `src/main/index.ts`, `src/main/domains/window/window.service.ts`            | Novo `getCameraWindow()` que referencia a janela da câmara correcta                 |
| P21 | `borderWidth` default inconsistente (settings `6` vs main `4`)                                                                                                                                             | `src/renderer/src/domains/settings/hooks/use-shortcuts.ts`                  | Alinhado em `4`                                                                     |
| P22 | Código/IPC morto: `resizeWindow` (no-op), IPC `resize-window`, `get-screen-sources`, `get-displays`                                                                                                        | `src/main/index.ts`, `src/main/domains/window/window.service.ts`, teste     | Removidos (e teste do no-op eliminado)                                              |
| P23 | `getGpuName` usava `wmic` (deprecated/removido no Windows 11 24H2+)                                                                                                                                        | `src/main/domains/settings/settings.service.ts`                             | `Get-CimInstance Win32_VideoController` via PowerShell                              |
| P25 | Typos no README ("Vitual", "econimazar")                                                                                                                                                                   | `README.md`                                                                 | Corrigidos                                                                          |
| P26 | Chaves i18n mortas (~20) + **bug real**: `t('settings.recordingSystemAudioWindowsWarning')` não existia e o `t()` devolve a própria chave → o utilizador via a chave crua (o fallback inline nunca corria) | `src/shared/i18n.ts`, `src/renderer/src/domains/settings/settings.page.tsx` | Chaves mortas removidas; nova chave `settings.recordingSystemAudioWarning` em EN/PT |

---

## Limitações conhecidas / decisões (não alteradas de propósito)

Estas são fragilidades reais que exigem redesenho ou são decisões de produto; **não** foram
alteradas nesta passada para não quebrar o comportamento actual:

1. **Janela fullscreen transparente no Windows/macOS** (`setIgnoreMouseEvents` + `{forward:true}`):
   enquanto o cursor está sobre a câmara, a janela passa a capturar o rato na área inteira do ecrã,
   bloqueando por momentos a interacção com apps por baixo. Exige repensar a arquitectura de overlay
   (`src/main/domains/window/window.service.ts`).
2. **Linux — drag via IPC por frame**: `move-camera-window` é enviado a cada `mousemove`
   (`camera.page.tsx`), gerando muito tráfego IPC em ecrãs grandes. Funciona, mas convém throttling/RAF.
3. **Saída da app** (`window-all-closed`): em Windows/Linux o app sai quando todas as janelas fecham.
   Sendo um app de bandeja, pode-se preferir manter corrido. Decisão de produto.
4. **macOS: `app.dock.hide()`** + `setLoginItemSettings({openAtLogin:false})` tornam difícil voltar ao
   app e anulam "abrir no login". Verificar intenção de produto.
5. **`build:linux` local gera também o target `snap`** (requer snapcraft/docker); o CI produz apenas
   AppImage+deb (`release.yml`). O comando local pode falhar sem snapcraft.

---

## Auditoria de segurança (testes)

Superfície analisada: preload, todos os handlers IPC do main, pipeline ffmpeg (fluent-ffmpeg),
`child_process`, permissões do `session`, CSP, `webPreferences`, `window.open`, `electron-updater`
e dependências (`npm audit`). Estado: **typecheck/lint/prettier/build + 108 testes verdes**.

### Corrigido nesta passagem

| Sev.      | Vulnerabilidade                                                                                                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                                                                                                                                                   |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ALTA**  | Preload expunha **todo** o `electronAPI` do toolkit (`src/preload/index.ts`): `ipcRenderer.send/invoke` em canais arbitrários + `sendSync`/`postMessage`/`sendToHost`, `webFrame`, `webUtils` e **`process.env` completo** (fuga de env/secrets). Qualquer XSS num renderer = acesso total a todos os handlers e a `HOME`/`PATH`. | Nova ponte **allowlist** em `src/preload/index.ts`: só canais legítimos para `send`/`invoke`/`on`; `sendSync`/`postMessage`/`sendToHost`/`webFrame`/`webUtils`/`process.env` **removidos**. Tipos em `src/preload/index.d.ts`.                                                                                                        |
| **MÉDIA** | `update-setting`/`sync-tray` escreviam valores **sem validação** em `currentState` (persistido em `settings.json` e reutilizado em ffmpeg/`globalShortcut`): `recordingEncoder` arbitrário alimentava `.videoCodec()`, `borderWidth` NaN, `x/y` infinitos, `recordingFolder` gigante, etc.                                        | Validadores por chave em `src/main/ipc-validation.ts` (+18 testes dedicados): ranges numéricos, ints (sizeIndex 0–4, rounding 0–9999, volumes 0–100), enum strings (shape/resolução/fps/encoder/posição), límites de comprimento. Valores inválidos são **ignorados**; `devices` sanitizado (deviceId estrito, label truncado a 200). |
| **MÉDIA** | Gravação sem identidade: qualquer janela via `ipcRenderer` enviava `recording-chunk` (stream ffmpeg) sem limite de tamanho e podia dar `recording-start`/`stop`.                                                                                                                                                                  | `recording.service.ts`: `recording-start` só do **worker**; `recording-stop`/`recording-chunk` só do **dono** (`recordingOwnerContentsId`); chunk ≤ 32 MB e de tipo `ArrayBuffer`/`Buffer`; encoder/resolução/fps **revalidados** com allowlist antes do ffmpeg.                                                                      |
| **BAIXA** | `setWindowOpenHandler` fazia `shell.openExternal(details.url)` **qualquer** URL/esquema (ex.: `file://`).                                                                                                                                                                                                                         | Só `https:` (e `http://localhost` em dev) — `window.service.ts` `openExternalIfSafe()`.                                                                                                                                                                                                                                               |
| **BAIXA** | `move-camera-window`/`resize-camera-window`/`set-ignore-mouse-events` aceitavam números/`ignore` arbitrários de qualquer janela.                                                                                                                                                                                                  | Validação numérica (clamped) + **só a janela da câmara** pode mover/redimensionar; `set-ignore-mouse-events` restringe-se à própria janela e valida `ignore`/`forward`.                                                                                                                                                               |
| **BAIXA** | `update-shortcut` aceitava aceleradores arbitrários (control chars) em `globalShortcut.register`.                                                                                                                                                                                                                                 | Regex `/^[A-Za-z0-9+ ]{1,50}$/`.                                                                                                                                                                                                                                                                                                      |
| **BAIXA** | `recording-started`/`recording-stopped`/`recording-permission-denied` aceites de qualquer janela (manipulavam estado de gravação/ícone do tray).                                                                                                                                                                                  | Só do worker.                                                                                                                                                                                                                                                                                                                         |
| **INFO**  | `sandbox:false` em todas as janelas; `autoplayPolicy` e preload padrão do toolkit.                                                                                                                                                                                                                                                | `sandbox:true` + `contextIsolation:true` + `nodeIntegration:false` explícitos nas 4 janelas (settings, worker, câmara, countdown).                                                                                                                                                                                                    |
| **INFO**  | Canal/`close-window` morto no main (ninguém chamava).                                                                                                                                                                                                                                                                             | Removido.                                                                                                                                                                                                                                                                                                                             |
| **DEV**   | `npm audit`: **nanoid < 3.3.18** (high, generator com size=0) e `extract-zip` via `electron@39` (high).                                                                                                                                                                                                                           | `npm audit fix` resolveu nanoid; `extract-zip` é transitivo do pacote `electron` (só usado no **download/instalação em dev**, não no app empacotado) e exigiria Electron **44** (major, quebra). Aceite e documentado.                                                                                                                |

### Confirmado OK

- `contextIsolation: true`, `nodeIntegration: false` (defaults mantidos), permissões do `session` whitelist (`media`, `display-capture`) e `setDisplayMediaRequestHandler` com `desktopCapturer.getSources` filtrado.
- CSP completa em `onHeadersReceived` (prod: sem `unsafe-eval`; dev: necessário para HMR).
- `devTools: false` e bloqueio de F12/Ctrl+Shift+I/⌘+Shift+I (`before-input-event`).
- ffmpeg corre via `fluent-ffmpeg` (`spawn` sem shell) com `vf` estático (sem injeção de argumentos controlada pelo utilizador) e encoder agora com allowlist.
- `open-system-settings` só abre URIs de sistema fixas; `autoUpdater` com `provider: github` (HTTPS) e só em `app.isPackaged`.

### Ronda de verificação cross-platform (Windows/macOS/Linux)

- **CI com matrix 3-OS** (`.github/workflows/ci.yml`): typecheck + testes + lint em `ubuntu-latest`,
  `windows-latest` e `macos-latest` (Node 22, `npm ci` com cache). Antes: só Ubuntu.
- **DPI/posicionamento** (`window.service.ts`): conversões CSS px→screen px dependentes de
  `screen.getPrimaryDisplay().scaleFactor`; usam `getPrimaryDisplay` (a câmara abre em ecrãs
  multiplataforma com coordenadas externas; primário é o mais seguro). Markers crosshair desenhados.
- **Semáforos ffmpeg**: `!recordingStopped` e `!timedout` antes de `mergeToFile` — evita sobrepor
  um ficheiro a ser serializado; Stop usa `kill()`+`KILL` — Não tratado para Windows (sem morte de
  processos-filhos no win32); mitigado: remoção ficheiros é sincronizada pelo close do worker que
  dispara `recording-stopped` apenas após o ffmpeg fechar;
- **Shells**: `shell.openPath` (cmd /c por defeito em win32) vs `execFile`/`spawn` sem shell —
  caminhos com espaços corretamente citados via arg array no win32.
- **URLs**: `shell.openExternal` (tray "Abrir pasta") com `{ activate: false }` — no win32 ativa
  sempre; janela ativa devolvida pelo processo.
- **Regressão fraca detectada** (pós-harden): `rounding` alterado a 0–9999 (na auditoria ficou
  0–100) e Janela de pré-visualização usa multiplictor — sem efeitos laterais.

## Notas de arquitectura (recomendações futuras)

- `src/main/index.ts` acumula quase todos os registos IPC (vários ficheiros pequenos simplificariam).
- Estado global único `currentState` & `shortcuts` com `DeviceInfo[]` limpo no load;
  `recordingFps` mantido como string (`'60'`) — tipificação fraca.
- `camera.service.ts` é apenas um `boolean` global; pode ser fundido no `settings.service`.
- A mistura de áudio (mic + sistema) vive no worker renderer via `AudioContext`; a UI do meter no
  settings abre streams só para medir (comportamento esperado, mas indicador da câmara pode piscar).
