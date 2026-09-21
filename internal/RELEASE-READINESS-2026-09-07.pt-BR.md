# RC Surface — auditoria para decisão de lançamento

Data: 2026-09-07. Estado: **auditoria concluída para decisão do responsável; lançamento não aprovado por este documento**.

### Entrega posterior — candidata local encerrada

Após a auditoria e F01/F02, o responsável ampliou o trabalho e depois pediu
encerramento imediato do escopo para receber o pacote. O estado mais recente é
[RELEASE-CANDIDATE-CHECKLIST.pt-BR.md](RELEASE-CANDIDATE-CHECKLIST.pt-BR.md):
ABLX gerada, hash registrado, 1.160 testes de código e 120 UI aprovados,
2 skips intencionais. Implementados também o desligamento da análise tonal
aposentada, MIX 8+8, seletor de entrada Browser, segurança de gravação de presets,
labels musicais, mensagens localizadas e ajustes de documentação/landing/pacote.
As observações e contagens abaixo são históricas. As 19 frentes não estão
integralmente aprovadas; hardware, Native Track e publicação continuam pendentes.

Escopo original: revisão do projeto completo e registro de frentes. Após a entrega da auditoria, o responsável aprovou a recomendação de implementar **F01/F02**. As demais frentes continuam separadas; instalação, publicação e operação do Live não foram autorizadas nem realizadas.

Base: worktree `audio-descriptors-v1`, branch `feat/audio-descriptors-v1`, commit `6142b21aaf32e6220148ae577ff0d30d828c9d34`. Preservadas as alterações de documentação do teste nativo já existentes. Revisão solo.

### Atualização — estabilização F01/F02

Correções implementadas localmente sobre a base acima, ainda sem instalação ou
publicação. Os achados e números da auditoria original abaixo ficam preservados
como histórico; o comportamento corrente de F01/F02 é o descrito nesta atualização.

- **F01:** inicialização única para Starts concorrentes; Stop invalida a tentativa
  pendente, inclusive autostart aguardando storage. Uma nova tentativa aguarda o
  fechamento dos sockets anteriores. Erros de listeners antigos não desligam a
  nova sessão. Desativação invalida callbacks e leituras de mappings, idioma e
  autostart; falha na inicialização SDK permite nova tentativa.
- **F02:** a fila verifica se ainda pertence à execução atual. Escritas verificam
  binding, alvo, contexto e sessão de cliente antes de enviar ao SDK. Clear All,
  troca/remoção e desconexão não reproduzem a cauda antiga. O actuator também
  cancela microtasks ainda não enviadas e entrega o primeiro valor de um binding
  novo mesmo quando coincide com o anterior. Notas trigger mantidas recebem OFF;
  trabalho de smooth aposentado recebe a liberação deliberada.
- **Limite:** nenhuma alteração desfaz uma chamada SDK já enviada. A suíte usa
  dependências de I/O/SDK controladas e testes headless; não mede latência real,
  não certifica o comportamento no Live e não valida o experimento Track.
- **Ainda pendente:** checklist manual de F01/F02 em
  [TESTER-GUIDE.md](TESTER-GUIDE.md#lifecycle-and-mapping-cancellation--f01f02).
  Import/rollback de perfil usam a mesma verificação de binding, mas não receberam
  nesta fatia um teste dedicado com escrita SDK lenta; aprofundar em F08.

Regressões novas: `tests/server-start-stop-race.test.mjs`,
`tests/extension-activation-race.test.mjs`, `tests/server-storage-lifecycle.test.mjs`,
`tests/live-mapping-write-cancellation.test.mjs`, além de casos no scheduler e
actuator. As falhas foram observadas antes das correções, incluindo listeners
órfãos, escritas `[1,0,1]` após Clear All e ausência de Note Off. Um teste antigo
de autostart baseado em regex foi substituído por cobertura comportamental do
bootstrap; checks do painel foram mantidos.

Validação final desta atualização: `npm run ci` retornou **0**, com **748 testes
static/scripts + 401 source = 1.149 aprovados**, ESLint/TypeScript, build de
produção com `ABLETON_RC_DEV_SYNC=0` e **114 testes UI aprovados + 2 skips
intencionais do Audio Lab**. São 38 casos source adicionais em relação à base
auditada. `git diff --check` limpo. Log local ignorado:
`.agent-context/runtime/f01-f02-ci.log`. Não houve commit, instalação, sincronização
para AppData, merge, push, tag ou publicação.

F03–F19 não foram implementadas nesta fatia. Teste nativo permanece
**PENDING_OWNER_DEFERRED**.

## 1. Resumo para decisão

**Vale fazer uma rodada de estabilização antes do lançamento. Não há evidência que justifique reescrever o projeto inteiro.** A base tem módulos separados, proteções de rede, persistência com rollback, descritores testados e uma suíte automatizada significativa. Entretanto, os testes existentes não cobrem todos os cenários de concorrência e não equivalem a uma apresentação real no Live.

Os achados de maior importância são:

1. **Start/Stop do servidor tem uma corrida de inicialização reproduzida.** Um Start pendente pode terminar depois de Stop; dois Starts sobrepostos podem deixar um servidor fora do controle do estado global.
2. **Clear All não invalida eventos de mapping já enfileirados.** Reproduzido com SDK simulado: o parâmetro recebeu novas escritas depois de a lista de mappings ficar vazia.
3. **Follow está desligado na interface e na emissão, mas parte de seu processamento continua ativa.** YIN/pitch, BPM e análise tonal ainda ocupam o caminho de análise da AUD. Há uma limpeza concreta a fazer sem perder o código aposentado.
4. **Produto local, documentação e entrega pública não descrevem a mesma versão.** Localmente é 1.0.0; a última release pública consultada é 0.6.0. Guias ainda mandam usar controles que não existem mais.
5. **A landing está construída, mas precisa de revisão editorial e uma correção responsiva pequena.** Não falta refazê-la do zero.

O teste nativo fica **ADIADO PELO RESPONSÁVEL**. Não foi aprovado nem abandonado tecnicamente. O Gate A continua impedindo integrar/publicar o modo Track como pronto; ele **não precisa bloquear uma versão Browser**, se essa for a decisão de escopo do lançamento.

### Como ler as prioridades

- **P1:** recomendo resolver ou aceitar explicitamente o risco antes de lançar a funcionalidade afetada.
- **P2:** acabamento, robustez ou validação importante; pode ser separado em uma rodada própria.
- **P3:** evolução opcional, não defeito que obrigue aumentar o escopo do lançamento.
- **Confirmado:** observado na fonte, na página ou numa reprodução isolada descrita abaixo.
- **Pendente:** falta evidência operacional; não significa que esteja quebrado.
- Esforço relativo: **P** pequeno/localizado; **M** várias camadas; **G** integração e validação extensa. Não são estimativas em horas.

## 2. Evidência nova e limites da revisão

### Verificações realizadas

Ambiente local: Windows, Node 24.19.0; build sempre com `ABLETON_RC_DEV_SYNC=0`.

| Verificação | Resultado observado |
|---|---|
| `npm run ci` | Código 0: testes, lint/TypeScript, build de produção e UI |
| Testes static/scripts | 748 aprovados; 0 falhas; 0 skips. Contagem também reconferida diretamente com reporter TAP |
| Testes source | 363 aprovados na execução de CI |
| ESLint + TypeScript estrito | Aprovados |
| Build de produção | Aprovado; cópia para a instalação do Live desabilitada |
| Playwright | 114 aprovados; 2 skips intencionais do Audio Lab dormente; 116 casos no total |
| `npm audit --json` | 0 vulnerabilidades conhecidas reportadas pela base consultada |
| Landing local, Chromium headless | EN/PT-BR em 1440×900 e 390×900; sem page errors, assets locais ausentes, links locais ausentes, IDs duplicados ou âncoras internas quebradas nas verificações executadas |
| Landing local, responsividade | Overflow horizontal de 13 px em 390×900 PT-BR; 0 nas outras três combinações |
| Reprodução Start/Stop | Falha confirmada com listener e carregamento de certificado simulados; nenhum socket real aberto por esse probe |
| Reprodução Clear All | Falha confirmada usando `applyMapping`/`clearMappings` reais e apenas o parâmetro SDK simulado |
| Reprodução AUD dormente | 19 chamadas YIN durante 59 callbacks de análise, inclusive em modo Worklet |
| Publicação | Landing pública HTTP 200; última release v0.6.0; consulta à release v1.0.0 retornou 404 |

Os 1.111 testes static/source aprovados e os 114 testes UI **não contradizem os bugs reproduzidos**: estes são cenários adicionais, ainda ausentes dos gates correntes. Os probes não foram incorporados à suíte oficial nem usados para modificar o produto.

### Cobertura por frente do projeto

| Subsistema | O que foi cruzado | Conclusão desta rodada |
|---|---|---|
| Bootstrap/runtime | `extension.ts`, contexto, safety, autostart e teardown | Corrida no ciclo de vida; rever cancelamento assíncrono |
| HTTP/TLS/WS | Rotas, papéis, cookie/token, origin, limites, heartbeat, backpressure e testes | Base protegida; falta validação de campo e fechar Start/Stop |
| Escrita no Live | Mappings, scheduler, actuator, takeover, curvas, perda de sinal e limpeza | Escritas antigas após Clear All; regressões importantes já existem |
| Configurações/presets | Migração, fingerprint, relink, staging, backup/rollback e testes | Não apagar compatibilidade; aprofundar Set real e presets |
| PERF/MIX/SNP/SNS | Controles, módulos de sessão, snapshots, sync, transport, wake lock e testes UI | Funcionalidade coberta em Chromium; MIX 8+8 não implementado |
| AUD Browser | Captura, Worklet, stream/FFT, espectro, settings, timeline e integração | 12 descritores implementados; processamento aposentado ainda ativo |
| VID | Lifecycle de câmera, inferência, filtros/gestos e testes | Boa estrutura de cancelamento; validação real/offline ainda necessária |
| Panel/Admin/MAP | Catálogos, editores, rendering, mensagens, autorização e testes | Duplicação e strings fora do catálogo; preservar interfaces em uso |
| OSC/MIDI/Max | Transporte OSC, sender/receiver e protótipo Track | Separar três mecanismos diferentes; UDP Receiver exige proteção própria |
| Distribuição | Manifest, package/lock, build, tester kit, CI/release e árvore Git | Pipeline existe; falta candidato final testado e publicação alinhada |
| Landing/documentação | HTML, i18n, navegação, assets, guias, changelog e conteúdo público | Estrutura pronta; conteúdo parcialmente desatualizado |

Esta é uma revisão transversal profunda com inspeção direcionada e reproduções, **não uma prova formal nem leitura linha a linha de todos os arquivos históricos**. Não houve operação do Live, instalação de extensão, captura de microfone/câmera, teste de rede a partir de outro dispositivo, pentest completo, execução no macOS/iOS, ou medição de latência real. As telas da landing inspecionadas visualmente foram as capturas iniciais de desktop e celular; o restante foi percorrido pelo DOM/probes, não aprovado visualmente seção por seção.

## 3. Mapa das frentes para escolher

| ID | Frente | Natureza / prioridade | Esforço | Dependência principal |
|---|---|---|---|---|
| F01 | Start/Stop e desativação sem corrida | Correção local; aceite no Live pendente / P1 | M | Nenhum teste nativo |
| F02 | Cancelar escritas antigas ao limpar/trocar mappings | Correção local; aceite no Live pendente / P1 | M | Nenhum teste nativo |
| F03 | Tirar pitch/Follow do processamento ativo | Limpeza funcional confirmada / P2 | M | Preservar amplitude e migrações |
| F04 | Alinhar versões, release e landing pública | Entrega divergente / P1 | M | Escopo e autorização do responsável |
| F05 | Documentação e roteiro de teste coerentes | Defeito confirmado / P1 | M | Inventário final do produto |
| F06 | Landing: conteúdo técnico e responsividade | Defeitos confirmados / P2 | P–M | F04/F05 para publicação |
| F07 | Segurança operacional e UDP MIDI | Risco conhecido + teste pendente / P1 se MIDI distribuído | M | Outro dispositivo/OS para validação |
| F08 | Configurações, presets e mudança de Set | Robustez / P2 | M | F02; cenários reais do Live |
| F09 | Performance e latência Browser ponta a ponta | Medição pendente / P2 | M | Fonte/host/rede reais |
| F10 | Qualidade e interpretação dos descritores | Validação + evolução / P2 | M | Fixtures e corpus musical controlado |
| F11 | Câmera, sensores e recuperação mobile | Validação pendente / P2 | M | Android/iOS e permissões reais |
| F12 | Consistência de SYNC entre páginas | Coerência/validação / P2 | M | Definir convenção de notas e compassos |
| F13 | MIX com visual AUD e 8 knobs/8 faders | Pedido ainda pendente / P3 | M | Decisão de incluir ou adiar |
| F14 | Escolha do dispositivo Browser de áudio | Evolução opcional / P3 | M | Permissão e deviceId por navegador |
| F15 | Track nativo / Gate A | Experimento adiado / P3 para release Browser | G | Medição nativa antes de Tasks 3–6 |
| F16 | Refatorações pequenas por responsabilidade | Dívida técnica / P2–P3 | M em fatias | F01/F02; testes de caracterização |
| F17 | Traduções, feedback e acessibilidade | Acabamento / P2 | M | Revisão EN/PT e teclado/touch |
| F18 | Empacotamento, dependências e licenças | Fechamento de release / P1 | M | Build candidato + inspeção do pacote |
| F19 | Matriz final de aceitação e operação | Validação de lançamento / P1 | M | Frentes escolhidas concluídas |

F01/F02 foram aprovadas posteriormente e implementadas localmente. As demais prioridades são recomendações técnicas, **não autorização para executar todas as frentes**.

## 4. Achados detalhados

### F01 — Inicialização, parada e desativação

**Histórico do defeito na base auditada.** Correção posterior descrita na atualização acima; referências de linha a seguir pertencem à revisão original.

**Confirmado.** Em [state.ts](../src/server/state.ts#L113), o guard verifica `serverInstance` antes de `await loadCerts()`, mas só grava a instância depois do bind, na linha 183. [stopServer](../src/server/state.ts#L230) retorna sem invalidar uma inicialização pendente quando ainda não existe instância.

Reprodução isolada do corpo real desse módulo, com I/O falso:

| Sequência | Servidores criados | Ainda ativos após a parada |
|---|---:|---:|
| Start concluído → Start → Stop | 1 | 0 |
| Start aguardando certificado → Stop → liberar certificado | 1 | 1 |
| Dois Starts aguardando certificado → concluir ambos → Stop | 2 | 1 |

No terceiro caso, o estado global já indica parado apesar de restar um listener simulado ativo. No ambiente real, o fallback de porta pode esconder a duplicidade. A ocorrência exata dentro do Live não foi provocada nesta rodada.

Também revisar [extension.ts](../src/extension.ts#L105): callbacks de storage/autostart não checam uma geração de ativação antes de continuar, e a inicialização SDK pode falhar depois de `activated=true`. São extensões da investigação, não incidentes reais adicionais comprovados.

**Aceite:** Starts concorrentes compartilham uma inicialização; Stop/deactivate invalidam callbacks antigos; start-fail/start-again recupera; nenhum listener, token/estado ou loop ressuscita após parada. Testes devem atrasar certificado, storage e bind deliberadamente. O lifecycle de câmera já oferece um exemplo local de geração/cancelamento em `static/phone-v3/camera-lifecycle.js`.

### F02 — Escritas antigas depois de Clear All

**Histórico do defeito na base auditada.** Correção posterior descrita na atualização acima; referências de linha a seguir pertencem à revisão original.

**Confirmado.** [clearMappings](../src/live/mappings.ts#L2145) limpa mappings, estado derivado, actuator e moduladores, mas não invalida o trabalho pendente do [WriteScheduler](../src/server/write-scheduler.ts#L76), alimentado por [applyMappedValue](../src/live/mappings.ts#L706).

Reprodução: mapear `pad-1` para um parâmetro 0..1 falso; bloquear a primeira `setValue`; enviar `1, 0, 1`; executar `clearMappings`; liberar a primeira Promise. Resultado:

```text
Antes de limpar:                       escritas [1]
Logo depois de limpar:                 escritas [1], mappings 0
Ao terminar a primeira escrita lenta:  escritas [1, 0, 1], mappings 0
```

Isso permite que um comando antigo mexa no alvo quando o operador acredita que a ligação já foi retirada. Não foi usado UDP nem alterado um parâmetro de verdade.

A simples chamada a `WriteScheduler.clear()` não deve ser presumida suficiente: seu método só limpa o Map, enquanto `flush()` conserva referência à fila atual através de um `await`. Investigar também remoção de um alvo, load/import/rollback de perfil, desconexão e desativação. Esses outros fluxos são extensão do teste, não todos reproduzidos aqui.

**Aceite:** trabalhos ainda não enviados ao SDK são invalidados por geração/ownership; uma chamada SDK já em andamento não pode ser magicamente desfeita, mas não deve iniciar a fila antiga ao terminar. Preservar os releases necessários de gates/notas; testar parâmetros contínuos, pads, toggle e mudança de alvo. Nenhum esvaziamento indiscriminado pode deixar uma nota presa.

### F03 — Follow aposentado de verdade no caminho ativo

**Confirmado, sem reativar a feature.** A capability Follow continua falsa e os cinco controles aposentados estão fora do picker. Porém [audio-processor.js](../static/phone-v3/audio-processor.js#L442) ainda chama YIN a cada três frames com gate aberto, `_detectOnsets` na linha 527 e chromagram na linha 657. A inicialização constrói estabilizadores de nota/BPM e outros auxiliares. [app.js](../static/phone-v3/app.js#L998) ainda procura readouts/controles removidos e calcula estado tonal.

O probe em modo Worklet observou **19 chamadas YIN em 59 callbacks de análise**, embora esse resultado não seja mais uma fonte pública ativa. Não foi medido o custo em ms/bateria no celular; não atribuir uma porcentagem de ganho sem benchmark.

**Trabalho:** isolar a análise tonal e o antigo editor/diagnóstico sob fronteira explicitamente dormente; manter fonte, histórico e migração de perfis, sem executá-los ou expô-los na versão corrente. `rms`, `envelope`, `gate` e `attack` continuam sendo fontes ativas e não devem ser eliminadas junto com pitch. Revisar particularmente a origem de `attack` antes de desligar as rotinas de onset/velocity.

**Aceite:** zero chamadas YIN/chromagram/estimador de BPM na AUD normal; nenhum painel Follow/Decisions reaparece; perfis antigos não emitem notas; amplitude, doze descritores, loss/OFF e todos os mappings atuais conservam comportamento. Código aposentado permanece recuperável.

### F04 — A versão que existe localmente não é a disponível para baixar

**Confirmado na consulta pública desta auditoria:** [site](https://ntworm.github.io/rc-surface/) respondeu 200 com título 0.6.0; [última release publicada](https://github.com/ntworm/rc-surface/releases/latest) resolveu para v0.6.0 com asset `Ableton-RC-Surface-0.6.0.ablx`; a consulta à release v1.0.0 retornou 404. São observações daquela consulta, não monitoramento contínuo.

Localmente package, manifest, bootstrap e [landing](../docs/index.html#L904) anunciam 1.0.0. O botão Download 1.0.0 usa `/releases/latest`, que hoje leva à release anterior. O README aponta para uma tag de release ainda indisponível. Não tratar o número local como prova de publicação.

**Trabalho:** decidir escopo/versão candidata; revisar os 14 commits desta branch acima do `main` local; conferir separadamente divergências remotas antes da futura integração. O `main` local é ancestral desta branch (`0 14`); isso não prova que o remoto está atualizado nem autoriza merge. Preservar o trabalho alheio em `docs/SECURITY.pt-BR.md` do checkout principal.

**Aceite:** commit/tag/manifest/pacote/changelog/landing/CTA concordam; usuário baixa exatamente o candidato aprovado; URL antiga tem comportamento documentado. A release workflow já cria **draft** após validação e CI; publicação exige autorização separada.

### F05 — Documentação e testes manuais ainda ensinam a interface antiga

**Confirmado.** Exemplos que precisam ser corrigidos em conjunto:

- [README](../README.md#L36): Gate, Tone Stability e BPM Window como controles da AUD.
- [TESTER-GUIDE](TESTER-GUIDE.md#L218): mapear Audio Pitch para Song Tempo; na linha 236, testar knobs retirados. O próprio guia depois descreve corretamente os doze descritores e a aposentadoria do pitch.
- [CHANGELOG](../CHANGELOG.md#L11): quatro descritores e quatro cards na narrativa 1.0.0, apesar dos doze atuais; mistura correções históricas com descrição de comportamento atual.
- [internal/README](README.md#L65): inventário de quatro descritores.
- [landing](../docs/index.html#L2264) e `docs/site-i18n.js`: uma seção ainda lista somente Transient/Kick/Snare/Brightness; outra já descreve os doze.

**Trabalho:** produzir um inventário canônico de funcionalidades disponíveis, opcionais e dormentes; atualizar EN/PT-BR, README, landing, changelog e tester kit. Manter notas históricas identificadas como históricas; não apagar migrações só porque o texto ficou antigo.

**Aceite:** uma instalação limpa consegue seguir o guia sem procurar knobs/pickers inexistentes; testes manuais têm resultado esperado observável; os doze IDs e unidades coincidem entre catálogo, DSP, protocolo, picker e documentação. A revisão deve distinguir Gate como fonte ainda válida de um antigo knob visual removido.

### F06 — Landing: construída, mas ainda não pronta editorialmente

Já existem hero, requisitos, comparação, diagrama de sinal, mapas interativos, famílias de controles, cenários, vídeo de instalação, troubleshooting, documentação, idioma, metadados sociais e favicon. EN/PT-BR renderizaram sem erros JS e sem referências locais ausentes nos checks executados. Não recomendo um redesign completo como condição de lançamento.

**Correções concretas:**

- [Diagrama e texto](../docs/index.html#L976) apresentam o caminho dos controles como OSC em ambos os sentidos a 30 Hz. Mappings de parâmetros escrevem pelo SDK/actuator; OSC serve o transporte/Deep Sync. Áudio imediato e motor de moduladores não seguem um único relógio de 30 Hz. Separar esses caminhos evita instruções de diagnóstico erradas.
- [Campo Source](../docs/index.html#L916) aponta para a própria landing, não para o repositório-fonte.
- FAQ contém explicação de portas que mudam entre execuções: hoje há portas preferidas 8730/8731 com fallback; tokens, por outro lado, são renovados no Start. Corrigir a distinção.
- Overflow global de **13 px em PT-BR, 390×900**. Zero em EN nessa largura e em ambos os idiomas a 1440 px. A reprodução confirma o sintoma, não isola a regra CSS responsável; tabelas/nav com scroll local intencional não devem ser confundidas com overflow global.
- Conferir a acessibilidade do seletor EN/PT no topo estreito, foco/scroll dos mapas, contraste e vídeo com alternativa textual/legendas. São tarefas de acabamento, não todas falhas comprovadas por auditoria de acessibilidade.

**Aceite:** teste responsivo dedicado da landing em 320/390/768/1440, EN/PT e teclado; página sem scroll horizontal acidental, scroll local de tabelas preservado; termos técnicos corretos; CTA da release validado após publicação autorizada. A página pública e a local são entregas diferentes e precisam ser conferidas separadamente.

### F07 — Segurança de rede e Receiver MIDI

Já há separação viewer/controller/admin, tokens aleatórios, cookie HttpOnly, verificação de origem, limites de payload/conexões/taxa, backpressure, redaction e testes negativos. HTTP é loopback; HTTPS/WSS é LAN. `npm audit` sem alertas conhecidos é um bom sinal, **não uma declaração de ausência de vulnerabilidades**.

**Risco conhecido:** o Max Receiver escuta UDP 9000 sem autenticação; mandar para 127.0.0.1 não restringe o endereço de escuta do Receiver. A própria [política de segurança](../docs/SECURITY.md#bundled-max-devices) registra exposição e proteção obrigatória por firewall. Tokens WS não protegem MIDI UDP.

**Trabalho/validação:** conferir bloqueio vindo de outra máquina e preservação do envio local, Windows e macOS; registrar regra efetiva e resultado, sem instalar regras automaticamente nesta tarefa. Decidir se o Receiver continua no pacote principal ou como opcional claramente separado. Revisar ainda os envios diretos `ws.send` em `src/live/state.ts`, que não passam pelo helper de backpressure, e endpoints de diagnóstico/log sob carga. Estes são pontos de hardening, não exploits demonstrados nesta rodada.

**Aceite:** teste negativo de rede real anexado, requisitos de rede confiável claros, nenhuma credencial em logs/pacote/relatório, nenhum MIDI externo inesperado. Sem evidência de isolamento, não anunciar o Receiver como seguro para redes compartilhadas indiscriminadamente.

### F08 — Presets, `.rcsurface` e identidade do Set

Há serialização das mutações de mapping, staging/rollback, backup e relink semântico com estados de revisão/ambiguidade. Esses mecanismos são úteis e não devem ser substituídos só para diminuir linhas.

O SDK vendorizado não oferece IDs persistentes completos nem caminho/nome do Set, segundo as limitações expostas por [getProjectConfigStatus](../src/live/mappings.ts#L281). [project-config.ts](../src/live/project-config.ts) usa fingerprint/nomes/estrutura e pontuação; isso pede uma bateria com dois dispositivos de nomes iguais, reordenação, rename, remoção, mudança de Set, import antigo e restauração de backup. Não foi detectada perda real de perfil do usuário nesta auditoria.

Também revisar `savePreset`, que grava JSON diretamente, fora da serialização usada por outras mutações; testar gravação interrompida/concorrente antes de classificá-la como bug confirmado. Não eliminar presets antigos sem migração e backup.

**Aceite:** perfis incorretos não assumem alvos silenciosamente; ambiguidade exige confirmação; falha de I/O mantém estado anterior; troca de perfil invalida filas antigas (F02); backup e export/import funcionam em um Set de teste real.

### F09 — Responsividade Browser e orçamento de latência

O caminho rápido já possui captura Worklet, buffers/FFT pré-alocados, limite de uma mensagem aguardando ACK, rejeição de frames velhos e uma escrita por alvo em andamento. Não há motivo demonstrado para jogar isso fora.

Ainda falta medir separadamente **captura → descritor → envio → SDK/alvo → áudio percebido** e **telemetria → gráfico**. Janela DSP, RTT e buffer ASIO não são intercambiáveis. FFT espectral de 2N, suavização solicitada, fallback rAF, carga gráfica, navegador em background e Wi-Fi acrescentam efeitos diferentes.

**Trabalho:** benchmark antes/depois de F03, com UI aberta/oculta, AUD+VID simultâneos, painel de diagnóstico aberto, dois celulares, tráfego concorrente e CPU/memória ao longo do tempo. Registrar percentis p50/p95/p99, perda de ataques, frames descartados e máximo, não apenas média. Separar resultados offline/sintéticos dos end-to-end.

**Aceite:** orçamento mensurável acordado para uma configuração de referência, sem fila histórica de transientes e sem degradação crescente. Sem essa medição, não anunciar latência zero ou um número universal.

### F10 — Qualidade dos descritores e bandas

Implementados: Transient, Kick, Snare, Brightness, Centroid, Rolloff 95%, Flux, Flatness, Spread, Low, Mid, High; além das fontes de amplitude. O espectro usa janelas e correções específicas; o catálogo normalizado difere dos readouts em Hz. Em `audio-spectral-descriptors.js`, centroide/dispersão usam magnitude; rolloff/flatness/bandas usam potência. Um rolloff numericamente menor que centroide não prova, sozinho, erro no cálculo.

**Limites honestos:** Kick/Snare são heurísticas de ataques por banda, não classificadores confiáveis de instrumento em qualquer mix. Low/Mid/High são RMS linear com shaping explícito; não medem diretamente a percepção de loudness. Entrada mono também merece teste com sinais estéreo fora de fase. Não atribuir a observação anterior de High fraco a cache ou a um bug específico sem gravar a entrada.

**Trabalho:** validar tons calibrados perto das bordas 250/2000 Hz, ruído branco/rosa, silêncio, impulses, variação de volume, estéreo e gravações musicais licenciadas/autorizadas; comparar Worklet e fallback, 44,1/48/96 kHz e WINDOW x1/x2/x4. Avaliar um modo perceptual somente como proposta separada, sem mudar silenciosamente mappings RMS salvos.

**Aceite:** unidades/formulações documentadas, ausência de NaN, reset em silêncio, limites por banda claros e comportamento estável sob ganho. Qualidade musical e tempo de resposta recebem avaliações separadas.

### F11 — VID, sensores, permissões e recuperação

O lifecycle de câmera já evita aquisições duplicadas e encerra streams de gerações canceladas. O processamento limita frames em voo e usa `requestVideoFrameCallback` quando disponível. Há testes de captura, pose, clutch, perda/recuperação, workspace e permissões simuladas.

**Pendente de campo:** recusar e conceder novamente câmera/microfone/movimento; bloquear e desbloquear tela; alternar abas; encerrar track; trocar câmera; câmera+áudio simultâneos; aquecimento/bateria; funcionamento offline do MediaPipe e recuperação de inferência travada. Não carregar plugins opcionais novos como parte dessa validação.

**Aceite:** estado UI corresponde à captura real, nenhum indicador fica saudável com inferência morta, neutralização segue Safe Loss, retomada não produz salto nem novos pedidos automáticos indevidos. Registrar dispositivos/navegadores reais, especialmente Safari.

### F12 — SYNC e convenções musicais

**Já feito:** AUD oferece 24 opções retas/triplet/dotted até 1/128; FREE é persistido separadamente e SMOOTH OFF continua disponível. Portanto, não reabrir como se o mínimo atual ainda fosse 1/16. Isso não mede a latência física.

**Frente restante:** as tabelas de AUD, LFO/stutter, burst e morph estão em módulos diferentes. `modules/snapshots.js` assume explicitamente labels de compasso em 4/4; o áudio usa frações de nota inteira. Revisar coerência de rótulos em 3/4, 6/8 e mudanças de andamento/assinatura, sem alterar duração de snapshots antigos silenciosamente.

**Aceite:** duração calculada e texto têm uma definição comum; uma nota inteira não é anunciada como um compasso em toda assinatura; mudar BPM atualiza controles sem recriar o knob em arraste. Documentar que release/smooth exponenciais não são um agendamento de evento na grade nem um corte rígido ao fim da nota.

### F13 — MIX: visual e oito canais de controle

**Pedido do responsável ainda pendente.** MIX continua com seis knobs e seis faders; o desenho flat/grupos da AUD não foi aplicado a ele. É evolução de produto, não motivo para dizer que os seis controles existentes estão quebrados.

**Trabalho possível:** preservar IDs 1..6, adicionar 7/8, atualizar grid, catálogo de mapping, templates, snapshots, valores iniciais, legendas, guias e mapas da landing. Reaproveitar a linguagem visual do dial AUD com tamanho apropriado, sem copiar seus ajustes DSP para o MIX.

**Aceite:** oito knobs/oito faders utilizáveis em landscape pequeno e desktop; keyboard/touch/reset/bipolar preservados; presets antigos continuam carregando; resize/STAGE não deslocam thumbs. Decidir se entra na 1.0 ou numa atualização posterior antes de começar.

### F14 — Selecionar o dispositivo de entrada no Browser

É uma melhoria independente do modo Track. Hoje o caminho Browser pede captura pelo navegador; não oferece o seletor completo solicitado de dispositivo explícito. `enumerateDevices`, nomes após permissão, `deviceId`, troca/remoção de entrada e persistência por navegador precisam de tratamento próprio.

**Aceite:** padrão continua simples; loopback/microfone escolhido é identificável; desaparecimento do dispositivo mostra estado de perda e não muda de fonte silenciosamente; troca durante captura libera a fonte antiga; iOS e permissões não recebem promessas que o browser não cumpra. Essa frente não exige esperar a bancada nativa.

### F15 — Track nativo: manter experimental e adiado

**Status:** protótipo com transient broadband e um Remote slot; não há seletor Track de produção nem os doze descritores nativos completos. Contrato estrito/timing e scaffolding foram implementados; Tasks 3–6 continuam atrás do Gate A.

O proprietário confirmou que os AMXDs revisados carregam e que ganho/OFF reagem. Isso é validação funcional básica, **não medição quantitativa**. As versões originais que causaram crash permanecem somente como material forense e não devem ser carregadas ou distribuídas. Usar apenas a pasta revisada indicada no [procedimento](NATIVE-AUDIO-VALIDATION.md).

Na última montagem: BUS contém REF/RESPOSTA; CAPTURA recebe BUS Post Mixer sem saída física. SSL ASIO, 48 kHz, buffer 128, Safe Mode ligado foram mostrados pelo proprietário. Não foram recebidos WAVs Remote/controle; os tempos de entrada/saída do driver não são o resultado deste benchmark.

**Aceite para retomar:** responsável libera a retomada; coletar áudio de referência/resposta/controle com roteamento revisado; medir Gate A, release/remoção, identidade, pareamento Node/SDK e null estéreo. Somente depois ampliar DSP, slots, bridge e UI. O celular continua fora do caminho musical; nem por isso se promete atraso total zero.

### F16 — Limpeza e refatoração por responsabilidade

Hotspots medidos no HEAD auditado: `style.css` 4.426 linhas, `app.js` 2.656, `controls.js` 2.372, `mappings.ts` 2.266, `mapping-mode.js` 1.839, `panel/mappings.js` 1.780; landing 2.675 e seu catálogo 2.190. Tamanho é um indicador de acoplamento, não um bug por si só.

**Fatias úteis:**

- Separar bootstrap/estado AUD ativo do legado tonal (F03).
- Separar catálogo/comandos, persistência e execução de mappings, mantendo a fachada e imports públicos.
- Reaproveitar definições de targets, fontes, unidades, timing e rótulos nos três editores; não fazer uma migração total de framework.
- Quarentenar Audio Lab/Follow/CSS aposentado e o arquivo `.amxd.original` preservado, distinguindo código histórico de assets de produção. O build já exclui `.original` e testes, mas copia o Lab dormente e auxiliares sob `static`; confirmar uso antes de cortar distribuição.
- Tratar comentários obsoletos como dívida editorial, não contrato atual: por exemplo, comentários de bundling no OSC devem ser confrontados com `build.ts` antes de orientar manutenção.

**Não apagar:** migração de chaves por cliente, perfis antigos, fallback compatível, Trigger Note independente, Sender/Receiver legítimos, testes de regressão que protegem esses fluxos. Aposentar Follow não é autorização para remover todo MIDI.

**Aceite:** uma responsabilidade por fatia, diff revisável, comportamento/pacote verificados antes/depois, nenhuma reativação de legado. Preferir correção pontual a grande refactor antes da release.

### F17 — Idiomas, mensagens e acessibilidade

O catálogo compartilhado e os testes dão uma base, mas existem strings diretas fora dele: por exemplo `SESSION EXPIRED — RESCAN QR` e `OUTRA ABA ASSUMIU — RECARREGUE` em `modules/session.js`, e mensagens de conflito/instalação em `mapping-mode.js`. A UI pode misturar idiomas justamente quando algo falha. Confirmado na fonte; não é necessária uma falha de rede real para identificar o texto não catalogado.

**Trabalho:** mensagens de erro/estado nos mesmos catálogos EN/PT; tempos limite de comando e feedback de pendência; acessibilidade de dials, pickers, gráficos e mapas; legenda e isolamento por curva como alternativa a cor; navegação por teclado e foco em overlays. Não confundir ausência de botões vazios no probe com aprovação WCAG completa.

**Aceite:** erro compreensível no idioma escolhido, nenhum comando parece concluído sem ACK, foco previsível e controle utilizável sem depender só de cor. Automação cobrindo strings de sessão e casos de teclado/touch relevantes.

### F18 — Distribuição, dependências e licenças

Manifest/package/lock estão alinhados em 1.0.0; Node é limitado à família 24. Há SDK/CLI beta vendorizados, lockfile, CI declarada em Windows/macOS/Linux e workflow de release por tag com draft. Esse pipeline **existe**, mas não foi executado remotamente nesta auditoria nem valida por si só o host Ableton em cada OS.

O build de produção passou e não fez sync da instalação. O tester kit seleciona Sender/Receiver tradicionais, não os devices nativos experimentais. Inspecionar o `.ablx` e ZIP finais é uma etapa distinta; não foram gerados/instalados novos candidatos nesta rodada. Scripts/benchmarks nativos e fixtures DC não podem vazar para uma entrega anunciada como pronta.

**Trabalho:** candidato limpo, hashes/SHA256, árvore interna, ausência de segredos/certs/sourcemaps de produção/testes desnecessários, assets offline, fontes e licenças. Há `NOTICE`, licenças MediaPipe e fonte; conferir que os avisos relevantes também acompanham o kit final. O `stageDocs` de `package-tester-kit.mjs` inclui `LICENSE`, mas não lista o `NOTICE` raiz: revisar a completude, sem concluir automaticamente uma infração jurídica.

Revisar SDK beta, versões de Live/Max realmente suportadas e dependências antigas fixadas; não atualizar MediaPipe ou SDK em massa apenas por idade. Zero alertas npm não cobre todas as falhas de aplicação/licenciamento.

**Aceite:** instalação limpa e atualização de candidato em ambientes declarados, asset reproduzível e identificável, nenhum binário experimental misturado, documentação embarcada coerente. Publicar/instalar somente após autorização específica.

### F19 — Matriz de aceitação para a versão escolhida

O próximo documento de execução deve ser uma matriz pequena por cenário, com **build/hash, OS, Live/Max, navegador/dispositivo, resultado, evidência e pendência**. Não repetir dezenas de testes manuais vagos quando o automatizado já cobre a mesma regra.

Conjunto mínimo a selecionar:

- Instalação limpa e atualização; abertura do painel/QR; reinício e token expirado; Start/Stop rápido (F01).
- PERF pads/modos, MIX reset/bipolar, MAP bind/unbind, ranges/curvas/takeover/Safe Loss, clear/load durante escrita lenta (F02).
- SNP captura/recall/morph e persistência; SYNC/tempo/transport com e sem AbletonOSC; retorno de reconexão sem replay.
- AUD Worklet/fallback, 12 fontes, OFF/loss, silêncio, fonte correta e gráficos; VID/SNS/permissões/recovery.
- Dois celulares e segunda aba; servidor lento, desconexão, Sleep/Wake; sessão prolongada sem crescimento de memória/fila.
- EN/PT, tamanhos pequenos/desktop/STAGE, touch/teclado, Android e Safari conforme suporte anunciado.
- MIDI opcional e firewall; pacote/licenças/docs/landing corretos; rollback do candidato.

**Aceite:** os cenários exigidos pela versão têm evidência; riscos adiados estão declarados, não escondidos num checkbox. A CI local Chromium não vale como aceite de Safari, Max ou rede física. O Gate A nativo só entra nessa matriz se o modo Track entrar no escopo de lançamento.

## 5. O que não deve ser confundido com pendência

- Os doze descritores Browser e os knobs/grupos AUD existem; não recomeçar sua implementação.
- AUD SYNC até 1/128 com T/D já foi implementado. Falta validação de uso/convenções entre páginas, não a grade inicial.
- O range vertical já aparece no gráfico e foi aceito pelo responsável. Um eixo extra é opcional.
- Follow/velocity 21 não é um item a reativar para lançar. Preservar a migração/código futuro e retirar processamento ativo desnecessário.
- Testes sintéticos e UI passaram nesta rodada. Não marcar todos os testes do projeto como pendentes por faltar uma gravação nativa.
- Ausência de release 1.0 publicada não significa build quebrado; significa que o processo de entrega ainda não foi concluído.
- Não é preciso trocar framework, refazer toda a arquitetura de áudio, introduzir IA para Kick/Snare ou criar detector de BPM para fechar essa revisão.

## 6. Escolhas que cabem ao responsável

Três recortes possíveis, sem começar automaticamente nenhum deles:

1. **Estabilizar a versão atual:** F01/F02, documentação/landing/versionamento, segurança/pacote e matriz essencial. Menor expansão de funcionalidade.
2. **Acabamento de produto antes de lançar:** acrescentar F03, MIX 8+8, consistência visual/SYNC e seleção Browser, conforme prioridade musical.
3. **Lançar também Track nativo:** exige retomar F15 e seus gates; não pode ser tratado como simples acabamento. Neste momento o teste está adiado.

Minha recomendação técnica é começar por **F01 + F02**, depois alinhar **F04/F05**, e escolher se F03/MIX entram nessa mesma rodada. Não transformar essa recomendação em implementação sem a decisão solicitada pelo responsável.

## 7. Evidência reproduzível e handoff

### Probes locais desta auditoria

Materiais de diagnóstico estão em `.agent-context/runtime/release-audit-2026-09-07/` (ignorados pelo Git; não são parte da distribuição):

```powershell
node .agent-context/runtime/release-audit-2026-09-07/lifecycle-probe.mjs
node --import tsx .agent-context/runtime/release-audit-2026-09-07/mapping-clear-probe.mjs
node .agent-context/runtime/release-audit-2026-09-07/audio-dormancy-probe.mjs
node .agent-context/runtime/release-audit-2026-09-07/landing-probe.mjs
```

O probe de lifecycle transpila o módulo original removendo apenas imports e fornece servidor/certificado falsos; portanto demonstra a corrida na lógica, não o tempo de bind do Windows. O de mapping usa imports reais de TS, contexto SDK falso e storage nulo. O de áudio usa buffers sintéticos e rAF controlado, sem capturar áudio. O da landing serve apenas `docs` em 127.0.0.1/porta efêmera, abre Chromium headless temporário, bloqueia recursos externos e encerra seu servidor no fim.

Capturas: `landing-1440.png` e `landing-390.png`. Os scripts ignorados não viajam num clone; as sequências, entradas e resultados essenciais estão descritos em F01/F02/F03/F06 para reconstruir testes de regressão versionados quando essas frentes forem autorizadas.

### Continuação por outro agente

1. Ler este documento e a instrução atual do responsável. **Não retomar automaticamente testes nativos ou implementar todas as frentes.** Aguardar escolha de IDs/prioridade.
2. Trabalhar na worktree `audio-descriptors-v1`; consultar Workflow Main e instruções locais; verificar status e HEAD reais. O snapshot desta revisão é `6142b21` e não inclui futuros commits.
3. Preservar as alterações preexistentes dos três documentos nativos. Não tocar o checkout principal ou material alheio. Usar SOLO enquanto a instrução de não usar subagentes continuar vigente.
4. Ao implementar uma frente escolhida, criar regressão do cenário, corrigir a camada responsável, verificar efeitos adjacentes e atualizar este inventário com evidência nova.
5. Gates: Node >=24.16 <25; `ABLETON_RC_DEV_SYNC=0`; `npm test`, `npm run lint`, `npm run ci` conforme risco. Para qualquer commit de produto, seguir a exigência local de test e depois lint antes de commitar. Nenhuma autorização implícita para instalar, operar Live, mergear, publicar ou enviar remoto.
6. Native Track: ler [plano](../docs/superpowers/plans/2026-09-06-native-track-audio.md), [spec](../docs/superpowers/specs/2026-09-06-native-track-audio-design.md) e [validação](NATIVE-AUDIO-VALIDATION.md). Gate A continua fechado e adiado pelo proprietário.

**Entrega desta rodada:** documento de frentes + status/handoff atualizados. Nenhum bug corrigido, nenhum código de produção removido/refatorado, nenhuma release publicada e nenhum teste auditivo contado como medição de latência.
