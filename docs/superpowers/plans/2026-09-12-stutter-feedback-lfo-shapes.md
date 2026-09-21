# Próxima etapa — Stutter legível e formas de onda do LFO

## Atualização r12 — regressão reportada e corrigida (2026-09-12)

Substitui a regra visual r11: gate pisca em toda taxa permitida, sem corte5Hz,
sem pulso falso mais lento e sem replay de quadros perdidos. Arrasto horizontal
libera pin de subdivisão/rebaseia S1–S4; vertical preserva pin. Auto só ritmos
alcançáveis; FREE1–15Hz usa toda faixa (ratchet antigo eleva mínimo). Painel
desativa opções incompatíveis e expõe pedido→efetivo de presets antigos.
LFOs/rate-only UI preservados. CI1325PASS; pacote conferido e guia no diretório
.release-local/stutter-fix-r12. Ver registro final no plano mestre.
Pendente somente confirmação física do dono; sem AMXD novo, install ou publicação.

## Registro anterior r11

Status: **r11 gerado e conferido; calibração física pendente**.
O pedido posterior “gera a nova versão pra eu testar” autorizou implementar os
tetos candidatos antes do ensaio físico; não autoriza tratá-los como calibrados.
Executado pessoalmente, sem subagentes. r10 preservado para comparação.

**Ajuste de UI solicitado durante a execução:** o dono rejeitou AMP %, barra
de amplitude, rótulo VISUAL FIXO e excesso de informação. LFO/Stutter agora
mostram só a taxa no rodapé: Hz em FREE e duração musical em SYNC (1/4 = um
tempo; 1/8 = meio; T/D = tercina/pontuada). Sem atalho extra: formas no painel
da engrenagem já existente. Essa decisão substitui os itens visuais abaixo.

Código e UI final implementados. CI final exit0: 726 estáticos +457 host +136 UI
=1319 PASS, lint/TS/build PASS. Log: .agent-context/runtime/shape-limits-r11-compact-ci.log.
Pacote: .release-local/shape-limits-r11/RC-Surface-1.0.0-shape-limits-r11.ablx;
74 arquivos/85 entradas, todos conferidos por hash contra o build.
SHA256: 61AD719279FE0D77DF732DD640399CA31BF4379CB9E164FD50C555EA674B42A8.
Teste integrado no LEIA-ME ao lado; não pedir reinstalação de AMXD.
Próxima ação depende do relato/gravação física do dono; não reiniciar implementação.

Refinamento do dono: cada shape deve ter seu próprio limite de velocidade,
definido pela capacidade de manter uma boa forma no Ableton, não um teto único
para todos. A arquitetura de limites por shape faz parte da próxima etapa;
os valores numéricos dependem de ensaio, sem presumir qual forma será mais rápida.

**Objetivo:** deixar claro o que velocidade e amplitude fazem, mantendo os
controles pelo navegador, sem dispositivo Max adicional nem movimentos acumulados.

**Abordagem:** reutilizar o motor da extensão e os controles atuais. Corrigir a
coerência entre configuração, geração e desenho antes de cogitar velocidades maiores.
TypeScript no host, JavaScript/CSS/HTML no navegador; testes Node e Playwright.

## O que já existe — não recriar

- LFO tem cinco formas no painel da engrenagem ao lado de SYNC → Config de LFO
  → Forma de onda: senoide, triangular, rampa crescente, rampa decrescente e quadrada.
  Hoje a escolha é **global para L1–L4**, não individual. Fonte:
  `static/phone-v3/index.html#lfo-shape-grid`, `controls.js`/`syncSettings.lfoShape`.
- r10 mantém LFO em 0,1–4 Hz FREE, ritmos SYNC intermediários, fase contínua nas
  mudanças de velocidade, ajuste fino com Shift e leitura de Hz por LFO ativo.
- Stutter: X = velocidade, Y = amplitude. As cinco linhas/zebra representam
  amplitude em faixas; não representam quantidade de repetições. Fonte:
  `static/phone-v3/controls.js`/`makeStutterButton` e `globalPhysicsLoop`.
- Inconsistência confirmada no código: preview usa relógio local absoluto e teto
  visual de 15 Hz; host FREE/fallback limita a 15 Hz, mas host SYNC segue beat,
  subdivisão, swing e ratchet sem esse teto. O comentário que promete equivalência
  dos caminhos está incorreto. Uma piscada bonita não comprova entrega ao Live.

## Ordem de implementação

### Tetos experimentais implementados — validação física pendente

| Forma/módulo | Teto candidato | Justificativa e ponto crítico |
| --- | ---: | --- |
| Senoide | 5 Hz | Aumento de 25% sobre 4 Hz, sem salto agressivo; preservar curvatura e picos. |
| Triângulo | 8 Hz | Hipótese de ganho com trechos lineares; preservar os dois vértices por ciclo. |
| Rampa crescente | 6 Hz | Preservar a inclinação e o retorno abrupto ao mínimo. |
| Rampa decrescente | 6 Hz | Mesmo critério da crescente, invertido; não há motivo atual para tetos diferentes. |
| Quadrada | 15 Hz | Dois níveis, mas subida/descida precisam chegar no tempo certo; preservar patamares. |
| Stutter | 15 Hz efetivos | Candidato coerente com o teto FREE atual; considerar ratchet e swing, não apenas a taxa base. |

Esses números são **decisões iniciais de produto para experimentar**, não limites
extraídos de especificação da Ableton nem medição do SDK. Não afirmar que sobram
pontos a partir de um print. O timer host de 4 ms solicita avaliações; não prova
250 atualizações/s gravadas. O r10 continua com LFO máximo de 4 Hz até implementar
e validar o candidato. Não reduzir silenciosamente os ritmos SYNC do Stutter
atual: o novo teto comum só entra depois do ensaio e da documentação da mudança.

No caso quadrado, 15 Hz equivale a patamares de aproximadamente 33,3 ms com 50%
de duty e a 30 transições/s. Isso é aritmética da onda desejada, **não taxa medida**.
Swing pode encurtar mais alguns intervalos. É por isso que a quadrada não recebe
um teto arbitrariamente alto só por ter dois níveis.

### Como decidir os tetos finais em um ensaio integrado

Registrar no mesmo projeto uma sequência de cada forma a 4 Hz, numa velocidade
intermediária e no teto candidato; começar com um LFO e repetir com quatro alvos
simultâneos. Usar mapping linear/Smooth0 para isolar o gerador e repetir no Auto
Filter com a escala normalmente usada: escala do parâmetro pode alterar o desenho.
Incluir SYNC a 120/180 BPM e Stutter com swing/ratchet. Usar trechos de 10 s,
sem editar/simplificar a automação capturada e sem normalizar os picos individuais
de cada ciclo, o que esconderia perda de amplitude.

Avaliar os dados da gravação e, se disponível, os timestamps de conclusão SDK
separadamente. Gate inicial de engenharia para liberar um candidato:

- Nenhum ciclo perdido/extra nos trechos estáveis; frequência média dentro de 2%
  da solicitada. Não contar mudanças intencionais de rate/transport como falha.
- Senoide/triângulo/rampas: erro RMS normalizado <=5% da faixa e picos/vértices
  dentro de 5%; comparar a forma considerando a escala real do parâmetro.
- Quadrada/Stutter: nenhuma transição perdida; erro de instante p95 <=10% do
  período e patamares preservados. Aplicar também aos retornos abruptos das rampas.
- Remover somente um atraso constante por trecho na comparação; não realinhar
  cada ciclo separadamente, pois isso esconderia jitter. Registrar também o atraso
  removido, sem apresentar o erro de forma como medida de latência.
- OFF sem reprodução de histórico; a última chamada já enviada pode terminar.

Essas tolerâncias são propostas do projeto, não normas universais. Se o teto
candidato falhar, reduzir gradualmente até passar; não suavizar o gráfico nem
enfileirar movimentos antigos para fazê-lo parecer melhor. Só liberar um teto
maior em outra rodada se a gravação mostrar margem. A representação por pontos e
segmentos é documentada no [manual oficial de automação do Live](https://www.ableton.com/en/manual/automation-and-editing-envelopes/#editing-breakpoints);
isso não certifica os tetos numéricos acima nem a entrega pelo nosso SDK.

- [ ] **1. Conferir o pulso real antes de redesenhar.** Criar regressões host/preview
  para FREE/SYNC, Auto/divisão fixa, swing/ratchet, pausa/retomada e mudança de
  rate/depth. Comparar frequência, fase e instantes das transições em 30/60 FPS
  simulados e ticks atrasados. Usar `tests/live-host-modulators.test.mjs`,
  `tests/host-modulator-phase-continuity.test.mjs` e
  `static/phone-v3/stutter-mode.test.mjs`. Identificar exatamente onde divergem;
  não aumentar taxa de mensagens nem criar uma fila de pulsos para compensar.

- [ ] **2. Substituir a zebra por informações inequívocas.** Nos S1–S4, mostrar
  frequência configurada em Hz e amplitude em %, com uma barra contínua de
  amplitude. Retirar linhas por faixas e animações decorativas concorrentes.
  Manter X=rate/Y=depth, modos A/B/C/D, mapeamentos, snapshots e OFF. Alterar
  `static/phone-v3/controls.js`, `index.html`, `style.css`; testar desktop/mobile
  em `tests/ui/lfo-bandwidth.spec.mjs` e nos testes estáticos de Stutter.

- [ ] **3. Fazer o feedback refletir a mesma regra do motor.** Compartilhar ou
  testar em paridade frequência efetiva, fase, swing e ratchet entre
  `src/live/host-modulators.ts`, `transport-clock.ts` e `controls.js`. Não desenhar
  uma piscada lenta independente quando o motor está rápido. Se a tela não
  representar as transições com clareza, exibir indicação estática de atividade
  e Hz configurados, explicitando a limitação visual. Não aplicar um novo teto
  ao Stutter sincronizado sem ensaio: preservar o comportamento musical aceito.
  Hz configurados/efetivos do gerador **não** devem ser rotulados como Hz medidos
  no Live. Usar tempos monotônicos no preview e epoch no host sem misturá-los.

- [ ] **4. Tornar a forma do LFO fácil de encontrar.** Melhorar indicação/acesso
  ao painel existente e mostrar a forma selecionada sem cobrir L1–L4. Preservar
  configuração global e persistência atuais; formas individuais por LFO ficam
  fora desta etapa. Testar as cinco formas, reload e fase contínua ao mudar rate.
  Mudar a própria forma pode mudar o valor instantâneo, sem reiniciar a fase.

- [ ] **5. Implementar limites próprios por shape, calibrados no Live.** Usar uma
  política explícita de limites para `sine`, `triangle`, `ramp_up`, `ramp_down` e
  `square`, aplicada igualmente pelo host e preview. Comparar as formas no mesmo
  parâmetro do Live e registrar frequência efetiva, intervalos de entrega,
  transições perdidas, parada/OFF e os critérios específicos:
  senoide = curvatura/picos; triângulo = trechos lineares/vértices;
  rampas = inclinação e retorno abrupto; quadrada = transições e duração dos níveis.
  Triângulo e quadrada podem admitir outro teto, mas poucos níveis/segmentos não
  garantem transições pontuais. Não adotar números maiores sem essa evidência.
  Manter 4 Hz como ponto de partida conservador até calibrar cada shape; limites
  resultantes podem coincidir se o ensaio não justificar diferença.
  A política deve alcançar FREE, ritmos permitidos em SYNC, divisões fixadas,
  pausa/fallback, snapshots e a leitura de Hz. Ao trocar de shape, respeitar o
  novo teto imediatamente e preservar a fase do oscilador; não prometer continuidade
  do valor entre formas diferentes. Exibir o limite da forma escolhida no painel.
  Testar paridade host/preview, mudanças de shape/rate/BPM, configurações antigas,
  descarte de valores atrasados e OFF. Documentar como a ampliação da faixa altera
  a velocidade de rates normalizados salvos. Nenhum dispositivo Max adicional.

- [ ] **6. Documentar, validar e entregar.** Atualizar guias EN/PT,
  `static/shared/i18n-catalog.js`, `docs/index.html`, `docs/site-i18n.js`,
  `internal/TESTER-GUIDE.md` e CHANGELOG. Regressões RED/GREEN, depois
  `$env:ABLETON_RC_DEV_SYNC='0'; npm run ci` (zero falhas). Gerar novo ABLX separado
  do r10 e conferir arquivos/hashes; um único ensaio integrado do dono.

## Critérios de conclusão

Stutter mostra Hz e amplitude sem insinuar repetições inexistentes; desenho e
motor seguem a mesma regra, ou a limitação visual é explícita. Rate não altera
depth, depth não altera rate; OFF não reproduz histórico. Formas de LFO existentes
ficam acessíveis; cada shape tem uma política de teto identificável e nenhum teto
aumenta sem evidência. Testes e documentação não
confundem simulação local, envio SDK e automação efetivamente gravada.

Não reabrir Receiver/XY/MIX já aceitos; ensaio AUDIO/latência adiado permanece
separado. Não instalar, alterar Set, publicar, fazer commit/push/tag ou gerar
pacote nesta rodada de **planejamento**. r10 e trabalhos anteriores preservados.

## Planejamento original — histórico (execução acima prevalece)

Escopo e fontes conferidos no código atual. Sem passos de implementação
executados. Sequência: regressões → correção/visual → formas → ensaio de teto →
documentação/pacote. Limites por shape fazem parte do escopo; seus números e
eventuais aumentos dependem de evidência física. Não bloqueia melhorar a interface
ou preparar a política mantendo os valores conservadores atuais.
