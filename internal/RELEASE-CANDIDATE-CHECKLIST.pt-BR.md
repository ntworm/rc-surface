# RC Surface 1.0.0 — candidata de teste r3

## Atualização — Receiver v2.1.1 aceito para prosseguir (2026-09-09)

O dono confirmou funcionamento normal, OFF/ON, Panic, desativação/reativação e
save/reopen básico. Nome/range/tipo e um Note Off também foram lidos no Live.
Encerrou explicitamente a rodada manual: não repetir os microtestes históricos
abaixo. Casos adicionais sem execução ficam não verificados, não reprovados nem
aprovados; medição de latência continua sem evidência. Isso permite prosseguir
com desenvolvimento, não equivale a aprovação da release oficial.
O AMXD atual está em static e no ensaio receiver-manual-sdk-r2; a ABLX r3 abaixo
permanece preservada e não contém esse AMXD atualizado.

## Entrega r3 — 2026-09-08

- [ABLX r3](../.release-local/reviewed-r3/RC-Surface-1.0.0-reviewed-r3.ablx)
- [Receiver v2](../.release-local/reviewed-r3/RC-Midi-Receiver.amxd) e
  [Sender v2](../.release-local/reviewed-r3/RC-Audio-Sender.amxd)
- SHA256 ABLX: `7DA2BDE2CA694A79ED3C125E1064071647C42FB17D612AA00CE9B67F669EF2DA`.
- 13.671.150 bytes; 84 entradas ZIP (73 arquivos). CRC/manifesto aprovados;
  os72 arquivos de payload coincidem byte a byte com o build testado.
- CI final:1071 testes de código e122 UI passaram, zero skip/falha;
  lint/TypeScript/build aprovados; audit produção sem vulnerabilidade conhecida.
- Revisão externa retestou e fechou duas falhas pré-pacote: tipo Float do
  comando Max e ordenação OFF antes do próximo ON sob SDK lento. Isso não é
  validação de execução no Live. Fonte:701e2ef + alterações locais, sem tag nova.

Nova candidata local com Receiver/Sender v2 sem UDP, correção de Song Tempo,
MIX8+8, descritores Browser e revisão visual/documental. Não é release oficial.
O manifesto continua1.0.0: identifique esta rodada pelo nome **reviewed-r3** e
SHA256, não só pelo número mostrado pelo Live. Artefatos r2/anteriores preservados.

O ABLX e os dois AMXDs ficam juntos em `.release-local/reviewed-r3/`.
Instalar só a extensão NÃO atualiza devices antigos salvos no Set. Os arquivos
`RC-Audio-Descriptors` e `RC-Native-Latency-Target` não fazem parte desta entrega.

## Testar nesta ordem

1. **Atualização segura:** salve uma cópia do Set, encerre o Live e instale o
   ABLX r3. Reabra, inicie o servidor e leia o QR novo; recarregue o navegador.
   Para MIDI, substitua todas as instâncias antigas pelos AMXDs desta pasta.
   Confirme **RC MIDI RECEIVER v2 / SDK / LOCAL MAX — NO UDP**. Receiver vem
   antes do instrumento na track MIDI; só um Receiver por track de destino.
2. **MIDI v2 (prioridade):** crie dois destinos MIDI diferentes. Mapeie um pad
   para cada track; cada um deve tocar apenas o destino escolhido. Teste notas
   graves/agudas, velocities diferentes, toques repetidos rápidos e segurar/soltar.
   Retire mapping, use Clear All e desconecte o telefone durante uma nota:
   nenhuma nota deve ficar presa. Repita com a track reordenada após pressionar.
   Salve/reabra o Set: não deve surgir nota espontânea. O input Audio Sender
   deve começar OFF. Receiver antigo/duplicado precisa ser recusado na interface.
3. **Sender separado (se usar):** coloque Sender v2 na track de áudio; habilite
   Audio Sender input só no Receiver de destino. Teste silêncio, nota sustentada,
   repetição e Panic. Esse caminho converte pitch em MIDI; NÃO é Follow nem
   análise dos descritores AUD. Vários Receivers habilitados recebem o Sender.
4. **Song Tempo/perfis:** mapeie Tempo, exporte/import e reabra o perfil; deve
   continuar vinculado ao BPM global, mesmo após alterar nomes/ordem de tracks.
   Confira também um perfil antigo sem descartar sua cópia original.
5. **AUD Browser:** escolha loopback/cabo virtual/interface, ligue/troque/desligue
   captura. Confira12 cartões, curvas/legenda/escala e ausência de Follow/knobs
   tonais. Teste Transient/Kick e Centroid/Flatness em um parâmetro de faixa segura,
   com Smooth OFF, Gain×1 e WINDOW x1 inicialmente. Trocar/desconectar entrada
   deve liberar a modulação conforme Safe loss. Recarregar não liga o microfone.
   Em SYNC, teste1/128, T/D e OFF; mude BPM no Live; em FREE os ms devem voltar.
6. **Regressão curta:** knobs/faders7/8 e snapshot após recarregar; salvar/carregar
   presets; Start/Stop/reconectar, QR antigo recusado após reiniciar servidor;
   PERF/SNS/VID/transporte e layout/idioma no seu celular. Faça um ensaio de20–30min
   observando falhas, aquecimento e atraso crescente. Registre o que falhar.

## Latência: três coisas diferentes

- **AUD Browser desta candidata:** ainda precisa de gravação real de referência
  e resposta no mesmo relógio. Ouvir a reação é smoke test, não medição. Anote
  interface/driver, sample rate/buffer, navegador, rede, entrada, WINDOW e Smooth.
  Use ataques isolados repetíveis; preserve os WAVs sem normalizar/alinhar/recortar
  separadamente. Precisamos de uma captura-controle para distinguir atraso da
  rota/gravação do atraso adicional do descritor e do mapeamento.
- **Trigger Note v2 desta candidata:** testar rajadas/OFF é obrigatório. A
  latência/jitter de telefone→SDK→Receiver/instrumento ainda não foi medida.
  Gravar apenas a saída de um pad tocado à mão não marca a hora da entrada;
  antes da coleta numérica, montar referência sincronizada com o disparo.
- **Bancada Native Track adiada:** continua sem gravações Remote/controle; não foi
  integrada nem concluída. O teste antigo REF/RESPOSTA/CAPTURA está em
  [NATIVE-AUDIO-VALIDATION.md](NATIVE-AUDIO-VALIDATION.md). Retomar separadamente,
  reconferindo o Set. **O sinal daquela bancada contém DC: sem caixas/fones nem
  saída física.** Não usar essa bancada como teste da ABLX Browser ou do MIDI v2.

Quando houver capturas válidas, analisar mediana, p95, máximo e eventos perdidos;
não deduzir esses números do tamanho de buffer ou da janela DSP. O roteiro de
Browser está em [AUDIO-AUDIT.pt-BR.md](../docs/AUDIO-AUDIT.pt-BR.md).

## Segurança e limites de publicação

O pacote remove os objetos de rede dos dois Max devices; confirmar no Live a
ausência do listener antigo faz parte da migração. Não desative o firewall.
Se algum Receiver UDP antigo continuar carregado, o risco antigo permanece.
Instalação real, macOS/Safari, medição física e pipeline multiplataforma no tag
final ainda não foram aprovados. Planos históricos adiados não viraram concluídos
por causa desta candidata. Nada foi instalado/publicado pelo agente.

---

# Histórico — revisão r2 e correções antes do empacotamento r3

Não seguir as instruções de instalar r2 abaixo para testar as correções atuais.

## Alterações posteriores à r2 — Receiver v2 e correções confirmadas

O pacote r2 abaixo é histórico e NÃO contém estas mudanças. Não reinstalá-lo
como correção do UDP. Não foi gerado novo ABLX nesta etapa.

- [ ] Instalar/reabrir manualmente Receiver v2 e Sender v2; confirmar ausência
  de listener UDP 9000 atribuível a eles. Trocar todas as instâncias antigas;
  biblioteca atualizada sozinha não altera Set salvo.
- [ ] Trigger Note em duas tracks: destinos separados, nota/velocity corretas,
  soltar/Stop/desconectar/Clear All/reordenar sem nota presa; testar rajadas.
- [ ] Receiver antigo/duplicado recusado na interface, sem fallback UDP.
- [ ] Salvar/reabrir Set: comando MIDI não reaparece como nota ou automação;
  Audio Sender input inicia OFF. Habilitar só no destino do Sender e testar
  Panic/OFF. Esse teste não é o experimento Native Track adiado.
- [ ] Medir latência/jitter do novo caminho SDK no Live. Nenhuma promessa
  de atraso zero; audio browser/DSP não foi alterado.
- [ ] Exportar/importar Song Tempo e perfil antigo; mapping continua ativo.

As pendências abaixo continuam históricas da r2. A proteção de firewall da
versão UDP continua necessária se um device antigo permanecer carregado.

**Atualização de direção — 2026-09-08:** consolidar o estado em commits locais,
sem push, merge na main, tag, pipeline de release ou novo pacote oficial.
O responsável ainda fará alterações e testará o áudio depois. Este documento
continua registrando a candidata r2; não é uma aprovação de publicação.

Entrega local revisada: **2026-09-08**. Substitui a candidata abaixo para novos
testes. Não foi instalada nem publicada. O teste físico de áudio continua com
o responsável; Native Track não integra esta versão.

## Pacote atual

- [RC-Surface-1.0.0-reviewed-r2.ablx](../.release-local/RC-Surface-1.0.0-reviewed-r2.ablx)
- SHA256: `9EAD23555DFD27BF9AA419AEF870102FB2D76C932AB92D670544F43A17F4987C`.
- 13.669.394 bytes; 84 entradas ZIP; manifest `1.0.0`, entrada `dist/extension.js`.
- Worktree `audio-descriptors-v1`, base `6142b21` + alterações locais.
- CRC aprovado. Os 72 arquivos empacotados, além do manifesto normalizado,
  coincidem byte a byte com o build testado. Manifesto conferido separadamente.
- Sem Follow, Audio Lab, testes, certificados ou dispositivos nativos
  experimentais. RC-Audio-Sender e RC-Midi-Receiver independentes preservados.
- A candidata antiga não foi sobrescrita. O código excluído continua
  recuperável pelo Git; arquivos pessoais/presets no Live não foram alterados.

## Alterações revisadas

- Follow Detected Note excluído: vozes/velocity, YIN, notas/chroma, BPM de
  áudio, controles antigos, traduções, CSS e laboratório exclusivo removidos.
  A decisão foi abandonar a tentativa após resultados musicais insatisfatórios.
- Gate antigo retirado do gráfico e da legenda; amplitude mostra RMS/envelope.
  Gate continua apenas como fonte de amplitude compatível, sem knob tonal.
  Live BPM/SYNC, MIDI Trigger fixo e os doze descritores foram preservados.
- SYNC/FREE atualiza imediatamente RELEASE/SMOOTH, sem chamar o código removido.
  Divisões até1/128, tercinas/pontuadas e SMOOTH OFF permanecem disponíveis.
- MIX com oito knobs/oito faders e desenho plano; SNP captura e recupera
  controles7/8 também após recarregar, com feedback SALVO/PRONTO em português.
- Seletor de entrada Browser, perda de captura, reconexão, ownership de writes,
  Start/Stop e persistência de presets revistos com regressões automatizadas.
- Modos de mapping não suportados são descartados ao carregar, não convertidos
  silenciosamente em controles contínuos. Vínculos válidos permanecem.
- Landing e documentação EN/PT alinhadas a8+8, doze descritores, entrada
  selecionável, SYNC musical e retirada do Follow. Correções de tradução,
  entidades HTML, legenda MAP, unidades e desenhos antigos. Sem publicação.
- Inventário de três worktrees: nenhum commit exclusivo perdido; correções úteis
  da landing importadas seletivamente. Os outros worktrees e alterações manuais
  não relacionadas foram preservados.

## Lista curta para testar

Instale **r2** em uma cópia de Set salvo e recarregue a página. A versão do
manifesto continua1.0.0; use o nome/hash acima para distinguir o pacote.

- [ ] **AUD / amanhã:** selecionar loopback/interface, ligar/trocar/desligar
  captura; conferir12 descritores, famílias/legenda/escala. Não deve existir
  Follow nem knobs de clareza, Gate, estabilidade ou BPM estimado.
- [ ] **Reação real:** mapear Transient/Kick e um descritor espectral ao synth,
  começar com faixa pequena e Smooth OFF/zero; testar música, ataques e silêncio.
  Desligar a captura deve liberar os valores. Julgamento musical e latência
  física não foram aprovados por testes sintéticos.
- [ ] **SYNC/FREE:** experimentar1/128, T/D, OFF; mudar BPM do Live e voltar a
  FREE. Valores livres em milissegundos devem ser restaurados.
- [ ] **MIX/SNP:** conferir knobs e faders7/8, reset e snapshot salvo/recuperado
  depois de recarregar. Conferir SALVO/PRONTO e desenho no celular.
- [ ] **Regressão curta:** Start/Stop/reconexão; salvar/carregar preset, retirar
  mapping durante modulação e testar MIDI Trigger fixo com Note Off. PERF,
  SNS, VID e transporte devem continuar funcionando.

## Evidência e limites

- `ABLETON_RC_DEV_SYNC=0 npm run ci`: **retorno0**;663 static/scripts +
  380 host = **1.043 testes de código**, **120 UI**, nenhum skip/falha.
- ESLint, TypeScript e build de produção aprovados. Testes reais de integração
  UI para SYNC/FREE, snapshots e input selector; Worklet sintético no navegador.
- Landing EN/PT em320/390/768/1440 px, AUD em568..1920 px; screenshots AUD/MIX
  inspecionadas. Suporte a telas baixas usa rolagem local dos grupos/lista.
- `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas reportadas.
  Isso não certifica segurança total ou compatibilidade de todos os sistemas.
- `git diff --check`: aprovado. Logs em `.agent-context/runtime/`:
  `final-review-r2-ci-final.log`, `final-review-r2-audit.json`,
  `final-review-sync-green.log`, `final-review-audio-doc-{red,green}.log`,
  `final-review-mix-visual.log`, `final-review-r2-package-verification.json`.
- O número menor de testes de código corresponde à exclusão da feature tonal e
  de sua suíte exclusiva, não à remoção de testes dos descritores ativos.
- Browser áudio aguarda teste físico. Native GateA continua
  **PENDING_OWNER_DEFERRED**, fora da ABLX. Nada de atraso zero ou “Track pronto”.
  Instalação real, Safari/telefone, sessão longa e firewall/macOS não foram
  operados nesta revisão; a checklist histórica mantém os limites de campo.
- Plano mestre: [revisão final](../docs/superpowers/plans/2026-09-07-product-final-review.md).
  A implementação/revisão local está encerrada; não reiniciar a auditoria
  inteira para continuar. Publicação depende da aceitação do responsável.

---

# Histórico — candidata anterior, não usar como evidência da r2

Entrega: 2026-09-07. Escopo encerrado por solicitação do responsável.
Esta é uma candidata Browser, não uma declaração de lançamento público aprovado.
Não foi instalada, sincronizada para AppData, publicada ou testada operando o Live.

## Pacote

- Arquivo: [.release-local/RC-Surface-1.0.0-candidate-2026-09-07.ablx](../.release-local/RC-Surface-1.0.0-candidate-2026-09-07.ablx)
- Worktree: `audio-descriptors-v1`; branch: `feat/audio-descriptors-v1`.
- Base: `6142b21aaf32e6220148ae577ff0d30d828c9d34` + alterações locais, sem commit novo.
- Manifest: versão `1.0.0`, entrada `dist/extension.js`.
- Tamanho: 13.701.769 bytes; 86 entradas no arquivo ZIP/ABLX.
- SHA256: `FF71CCBC0AF1DF9BF74C981411ABC70F2E9A25CAA7A4194A34111DEC7F1F46DC`.

## O que conferir no Live e no celular

Use uma cópia de um Set, salve antes de instalar a candidata e recarregue a página
após a atualização. Não precisa retomar o teste nativo nesta rodada.

- [ ] **Instalação e conexão:** instalar esta ABLX, iniciar o servidor e abrir
  o link atual no celular. Repetir Start/Stop; testar reconexão e sessão antiga.
  Esperado: sem servidor órfão, token antigo recusado e mensagens EN/PT coerentes.
- [ ] **MIX 8+8:** arrastar os oito knobs e oito faders, mapear especialmente
  os números 7 e 8, usar dois toques para reset e capturar/recuperar snapshot.
  IDs 1–6 e presets antigos devem continuar funcionando. Conferir layout no
  celular; no desktop, setas/Home/End também devem controlar os sliders.
- [ ] **AUD — entrada:** selecionar a entrada padrão e o loopback/interface
  desejado. Trocar com captura ligada; desativar e recarregar.
  Esperado: escolha lembrada, mas captura nunca inicia sozinha após recarregar.
  Desconectar/negar a entrada deve exibir falha, não trocar para outro microfone.
  O navegador só lista os dispositivos que a plataforma/permissão disponibiliza.
- [ ] **AUD — descritores e gráfico:** conferir os 12 detectores, alternar
  Amplitude/Ataques/Timbre/Textura/Bandas/Todos, esconder curvas pela legenda
  e observar a escala vertical. Mapear Transient/Kick e um descritor espectral.
  Desligar áudio deve liberar a saída, sem valores antigos voltando.
  Follow, seus knobs antigos e seu processamento tonal permanecem dormentes.
- [ ] **SYNC/FREE:** RELEASE/SMOOTH até 1/128, tercinas/pontuadas, OFF no
  smooth; mudar o BPM do Live e retornar a FREE. Esperado: SYNC acompanha o BPM,
  FREE preserva milissegundos. Tempos de snapshot agora dizem beats/tempos,
  não compassos; não devem mudar de duração só pela fórmula de compasso.
- [ ] **Mappings e presets:** salvar, carregar e excluir um preset; importar
  uma cópia de perfil. Com modulação ativa, remover/trocar mapping e usar
  Clear All. Esperado: nenhuma cauda antiga recomeça; notas mantidas recebem OFF.
  Uma chamada SDK que já foi enviada não pode ser desfeita pela extensão.
- [ ] **Regressão rápida:** PERF, SNP, SNS, VID, transporte, câmera/permissão,
  idioma EN/PT e dois clientes. Depois, ensaio de duração no seu aparelho
  para observar calor, bateria, rede e resposta sob carga.

## Evidência automatizada desta entrega

- `ABLETON_RC_DEV_SYNC=0 npm run ci`: retorno 0.
- 756 testes static/scripts + 404 source = **1.160 aprovados**.
- ESLint, TypeScript e build de produção aprovados.
- Playwright: **120 aprovados**, 2 skips intencionais do Audio Lab dormente.
  Chromium desktop e emulação mobile; isso não equivale a Safari/telefone real.
- Landing local EN/PT-BR: 320, 390, 768 e 1440 px sem overflow da página.
  Tabelas/diagramas largos têm rolagem local. A landing pública não foi publicada.
- `npm audit --omit=dev --json`: zero vulnerabilidades conhecidas reportadas
  nas dependências de produção na consulta desta entrega.
- `python -m zipfile -t`: integridade aprovada; manifesto, bundle, seletor,
  Worklet, MediaPipe e LICENSE/NOTICE presentes. Audio Lab, contrato nativo,
  dispositivos experimentais nativos, testes e certificados não entram no pacote.
  RC-Audio-Sender e RC-Midi-Receiver independentes foram preservados.
- `git diff --check`: aprovado. Logs locais ignorados:
  `.agent-context/runtime/release-final-ci.log`, `release-audit.json`,
  `release-landing-ui.log`.

## Pendências deliberadamente não encerradas

O pedido final encerrou a expansão da revisão para entregar o pacote. As 19
frentes da auditoria não são todas certificadas por esta candidata.

- **F15 / Native Track:** `PENDING_OWNER_DEFERRED`. Sem captura Gate A,
  medição de latência ou integração Track no produto. Nenhuma alegação de atraso zero.
- **F09–F11:** profiling adicional, benchmark físico, celular/Safari, sessão
  longa, estéreo/loopback real e julgamento musical ainda exigem validação.
  Kick/Snare são heurísticas; Low/Mid/High são RMS linear, não loudness percebido.
- **F07/F18:** firewall de segunda máquina, macOS, instalação/atualização e
  aceitação em Live real não foram executados. UDP Max mantém seus limites
  documentados; a consulta de dependências não é uma auditoria de segurança total.
- **F08/F12/F17:** a fatia local corrigiu presets, labels e mensagens; cenários
  adicionais de import/rollback com SDK lento, métricas não usuais e revisão
  completa de acessibilidade/localização continuam na auditoria.
- **F04–F06/F16/F19:** docs e pacote local foram alinhados, sem publicação,
  reescrita geral, limpeza destrutiva ou certificação final de lançamento.

Referência histórica completa:
[RELEASE-READINESS-2026-09-07.pt-BR.md](RELEASE-READINESS-2026-09-07.pt-BR.md).
## Candidato de calibração r13 — 2026-09-13

- ABLX: .release-local/RC-Surface-1.0.0-calibration-r13.ablx.
- CI:730 static+459 host+144 UI, lint/TypeScript/build aprovados.
- 76 arquivos comparados com o build;13.682.943bytes; SHA256
  3B4A2D92A28ACD32AE51413B51B5793CBCB50099020033FD89F409DB9D45E6CC.
- Novidade: CALIBRAR independente em SNS/AUD/VID; instrução/progresso,
  cancelar/restaurar; orientação estável, resposta RMS/envelope e câmera
  verificada com ajustes automáticos opcionais. Guias EN/PT atualizados.
- AMXDs idênticos ao r12; não precisam ser substituídos para esta mudança.
- Pendente: aceitação física desses três caminhos. Sem compensação de latência.
  Stutter r12 já aceito com pequeno offset não medido; não reabrir microtestes.
- Sem instalação, commits/merge, tag, push ou publicação nesta etapa.
