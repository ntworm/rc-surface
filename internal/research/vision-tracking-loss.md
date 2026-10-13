# Perda de tracking: continuidade musical e release

Leitura das fontes: 2026-10-13. Diagnóstico do código na base
`b38c02593078f6d9f6c3bf5dd6cb3e142c272032`. Este documento compara políticas;
não altera reconhecimento, mapeamentos ou valores padrão.

Uma ausência óptica não informa se o músico quer parar. A decisão pertence ao
instrumento e ao tipo de saída. A pesquisa sustenta oferecer **manter**, **manter
com prazo** e **soltar na perda**, conservando confirmação de gesto, tratamento
distinto de parâmetros contínuos e parada explícita. Nenhuma fonte consultada
estabelece 10 segundos como duração ideal ou garante ausência de falsos disparos.

## Referências

### R01 — MediaPipe Hands e Hand Landmarker

- Autoria: Google/MediaPipe. Hands: documentação da API legada, sem data de
  atualização indicada; Hand Landmarker Web: atualização indicada 2026-08-17.
- Tipo: documentação técnica primária. URLs:
  [Hands](https://chuoling.github.io/mediapipe/solutions/hands.html) e
  [Hand Landmarker Web](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js).
  São uma família de referência, não duas entradas para cumprir a contagem.
- Problema: localização, oclusão e retomada da detecção. Evidência: Hands,
  `ML Pipeline`, `min_tracking_confidence` e `JavaScript Solution API`;
  Landmarker, `Configuration options`, `Run the task` e `Handle and display results`.
- Fato documentado: Hands reutiliza regiões de frames anteriores; confiança de
  tracking insuficiente provoca detecção no próximo frame. A API atual também
  descreve redetecção; `detectForVideo` é síncrono e pode bloquear a interface.
  As saídas descritas são landmarks/handedness, não Note-Off.
- Limite: as opções das duas APIs não são intercambiáveis. RC Surface usa
  `@mediapipe/hands` 0.4.1675469240, não Tasks Hand Landmarker. Confiança de
  handedness não equivale à confiança do classificador de G1–G3.
- Aplicação inferida: separar detecção recuperada, gesto confirmado e saída
  musical; não tentar resolver nota sustentada apenas alterando confiança.

### R02 — Air-Keys/Air-Pads: nota presa e perda de identidade

- Jihyun Han e Nicolas Gold, **Lessons Learned in Exploring the Leap Motion
  Sensor for Gesture-based Instrument Design**, NIME 2014, pp. 371–374.
  Tipo: artigo acadêmico e protótipos musicais reais.
  [Texto completo](https://www.nime.org/proceedings/2014/nime2014_485.pdf);
  [DOI 10.5281/zenodo.1178784](https://doi.org/10.5281/zenodo.1178784).
- Evidência: §3.1.1, p. 372, sobre debounce; §3.1.4, p. 372, sobre dedo perdido,
  novo ID na volta e nota presa; §3.3, p. 373, avaliação informal.
- Fato documentado: verificam a cada frame os dedos associados às notas; dedo
  ausente recebe Note-Off para a nota originalmente acionada e sua entrada é
  removida. Associar OFF à posição nova, em vez da nota original, também falha.
- Limite: solução de teclado óptico, Leap antigo, avaliação pelo primeiro autor;
  não compara grace/timeout nem mede RC Surface. A verificação requer frames.
- Aplicação inferida: release na perda é opção legítima; manter registro da voz
  original e limpar exatamente essa voz. É preciso acrescentar uma solução para
  quando não chegam frames, sem atribuir esse watchdog ao artigo.

### R03 — Embodied Sonic Meditation: extrapolar movimento perdido

- J. Cecilia Wu, Yijun Zhou, Mark Rau, Yun Zhang e Matthew James Wright,
  **Towards Robust Tracking with an Unreliable Motion Sensor Using Machine
  Learning**, NIME 2017, pp. 42–47. Tipo: artigo acadêmico e projeto de performance
  vocal/visual real.
  [Texto completo](https://www.nime.org/proceedings/2017/nime2017_paper0009.pdf);
  [DOI 10.5281/zenodo.1176165](https://doi.org/10.5281/zenodo.1176165).
- Evidência: §1.2.1–1.2.2, pp. 42–43, perdas/oclusões; §4–5, p. 44, gestos
  discretos, parâmetros contínuos e aquisição; §6.1, pp. 44–45; §7–8, pp. 46–47.
- Fato documentado: aprendem trajetórias e usam a trajetória média prevista fora
  do alcance. O melhor resultado de classificação de trajetória foi 30 ± 4%;
  classificação de gestos sobrepostos, 62%. O projeto aceita erros de previsão
  compatíveis com sua estética de continuidade.
- Limite: dados específicos da performer, Leap, não MediaPipe; métricas não são
  taxas de falso Note-On nem avaliação de um timeout. Continuidade estética não
  demonstra intenção musical.
- Aplicação inferida: extrapolação pode ser exploração futura para efeitos
  contínuos, mas não deve confirmar G1–G3 ou criar notas na ausência da mão.

### R04 — GECO: LAST, repouso e transição gradual

- Uwyn/Geert Bevin, **GECO User Manual**, sem data editorial indicada; página
  consultada em 2026-10-13. Tipo: documentação primária de controlador musical
  óptico comercial.
  [Manual](https://uwyn.com/geco/docs/).
- Evidência: `MIDI Messages`, `Data Offset`, `Rest Value`, `Advanced
  Configuration`, `Data Filtering` e `Openness detection`.
- Fato documentado: `LAST` conserva o valor depois da mão sair; um valor de
  repouso pode substituir o sinal ausente; `Decay` controla o retorno. Há latch
  entre offset/repouso e filtragem com custo de latência. Reconhecimento de abertura
  também permite trocar robustez por latência.
- Limite decisivo: esse manual explicitamente exclui Note On/Off; LAST e Decay
  são evidência direta para CC/Pitch Bend/OSC e analogia para uma nota sustentada.
  Não documenta timeout de 10 segundos.
- Aplicação inferida: manter valor, neutralizar e retornar gradualmente são
  escolhas úteis para efeitos. Um CC em zero pode significar mínimo, não silêncio;
  pitch bend deve considerar seu centro de repouso.

### R05 — Glover/MiMU: Gate, Trigger e parada manual

- MiMU, **Instruments**, sem data editorial indicada; consultado em 2026-10-13.
  Tipo: documentação primária de instrumento gestual real.
  [Manual](https://mimugloves.com/documentation/instruments/).
- Evidência: `Chord Machine → Input`, `Mode`, `Sustain chords into the next Scene`
  e `Stop all chords`.
- Fato documentado: Gate envia Note-Off quando a entrada cessa; Trigger toca até
  o próximo acorde. Troca de Scene para por padrão, com opção de sustentar.
  Existe comando manual que para todos os acordes.
- Limite: a página descreve semântica musical, não define quando tracking óptico
  perdido equivale a cessar input, nem um prazo de falha. É uma analogia musical
  para RC Surface, não prova de tratamento de dropout MediaPipe.
- Aplicação inferida: nomes e comportamento musical devem ser previsíveis;
  manter intencionalmente é diferente de tolerar perda acidental. Uma parada
  explícita deve continuar disponível em qualquer modo.

### R06 — Relato técnico de landmarks ocluídos no MediaPipe

- `matanox`, **Avoiding predicting occluded (hand) landmarks**, issue #3008,
  aberta 2022-01-22. Tipo: relato/proposta de desenvolvedor no repositório primário.
  [Issue completa](https://github.com/google-ai-edge/mediapipe/issues/3008).
- Evidência: corpo da issue, sobre auto-oclusão e mão parcialmente fora da imagem.
- Fato observado na fonte: o autor relata previsão de pontos mesmo ocluídos e
  propõe indicadores de visibilidade/treinamento adicional. A página consultada
  não apresenta validação experimental ou solução implementada para notas.
- Limite: relato sobre Hands legado; issue encerrada não comprova correção ou
  comportamento da API atual. Não tratar landmarks existentes como observação
  independente de todos os dedos.
- Aplicação inferida: validar qualidade/coerência de cada resultado, e exigir
  retorno qualificado; não usar simplesmente array não vazio para renovar uma
  sustentação. É evidência complementar, não uma das duas fontes acadêmicas.

### R07 — Execução em segundo plano no navegador

- MDN contributors/Mozilla, **Page Visibility API**, atualização indicada
  2025-12-30; consultado em 2026-10-13. Tipo: documentação de plataforma.
  [Página completa](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).
- Evidência: `Concepts and usage` e `Policies in place to aid background page
  performance`: suspensão de requestAnimationFrame, throttling de timers e
  exceções para áudio/conexões em tempo real.
- Fato documentado: callback de renderização e timer de página não oferecem o
  mesmo comportamento em background. As exceções não garantem execução de uma
  página descartada ou congelada pelo sistema.
- Aplicação inferida: vigiar frescor de frames fora do callback de inferência;
  um prazo de proteção das notas deve ter autoridade no host da saída, com
  heartbeat qualificado por câmera/sessão. Não prometer precisão rígida de tempo
  durante suspensão ou travamento do próprio host.

Os PDFs NIME foram lidos integralmente, incluindo resultados e limites; os
manuais foram lidos nas páginas citadas. As seções R01–R05 atendem cinco trabalhos
distintos, incluindo dois acadêmicos, MediaPipe primário e instrumentos reais.
R06–R07 complementam o diagnóstico. Não foi encontrada, nessas fontes, uma
comparação experimental que selecione um timeout universal para performance.

## Matriz

As consequências abaixo são análise de projeto, não medidas de latência ou
recomendação automática das fontes.

| Estratégia | Continuidade e saída | Custo/falha possível | Evidência e adequação |
| --- | --- | --- | --- |
| Grace/debounce curto | Tolera lacuna curta antes de declarar perda; evita OFF/ON repetidos. | Atrasa OFF intencional; sozinho deixa ausência longa sem solução. | Debounce em R02; grace já existe no código. Manter como mecanismo interno. |
| Histerese | Critério de saída menos sensível que entrada evita oscilar em torno do limiar. | Critério permissivo demais conserva pose errada. | R04 discute robustez/latência; releaseRatio existe no código. Não resolve câmera parada. |
| Hold ilimitado | Preserva voz/valor durante ausência; adequado a drone/efeito deliberado. | Nota pode durar indefinidamente; não cria ON novo, mas prolonga ON errado. | LAST de R04 para contínuos; Trigger de R05 como analogia. Modo explícito. |
| Hold com prazo | Preserva perdas breves; limita ausência continuada. | OFF após prazo pode cortar frase legítima; atraso depende do valor escolhido. | Recomendação inferida, não regra MediaPipe nem valor validado pelos artigos. |
| Release na perda | OFF quando ausência é declarada, sem espera musical adicional. | Pode cortar notas em dropout curto; zero grace dá máxima sensibilidade. | Tratamento direto de dedo ausente em R02; Gate de R05 é analogia musical. |
| Neutralização gradual | Retorna CC/OSC/efeito ao repouso sem salto. | Muda som sem gesto; destino de repouso incorreto pode ser perigoso musicalmente. | R04; Safe loss atual. Não prolongar Note-Off com glide. |
| Rearme explícito | Exige novo gesto/ação após perda prolongada. | Mais esforço e atraso de retorno; reduz reativação involuntária. | Proposta inferida para contexto crítico; evitar quarto modo na primeira versão. |
| Confirmação do retorno | Só gesto atual válido cancela prazo ou aciona nova voz. | Aumenta latência conforme holdMs; não elimina todos os erros ópticos. | Necessidade derivada de R01/R02/R06 e do código. Regra comum dos modos. |
| Watchdog/parada manual | Cobre falta de callbacks; parada voluntária encerra saída própria. | Falha do host/MIDI receptor não permite garantia absoluta. | Limites de plataforma R07; parada em R05. Regra comum, não modo extra. |
| Extrapolação | Pode manter evolução de efeito sem observação atual. | Pode inventar intenção e falso ON; acrescenta treinamento/complexidade. | R03, resultado restrito. Fora da primeira implementação de poses. |

| Tipo de saída | O que perda/release deve significar |
| --- | --- |
| Nota MIDI com gate hold | Liberar a voz realmente criada, no canal/nota/target originais; um OFF lógico, sem novo ON de recuperação não confirmada. |
| One-shot/pulso | Não repetir evento na volta. Duração do one-shot ou Note-Off já programado continua independente do tracking. |
| Clip lançado | Não equivale a nota presa. Não parar clip automaticamente ao perder a mão; respeitar comando/mode de lançamento existente. |
| Parâmetro contínuo | Aplicar Safe loss por alvo: manter, zero, centro, custom ou retorno gradual. Não usar política de nota como destino de parâmetro. |
| Estado visual | Separar observado agora, último conhecido, sustentação musical e release realizado; TEST passado não prova tracking atual. |

## Semântica de perda

Proposta para decisão: o prazo musical limita **tempo sem confirmação atual do
gesto que sustenta aquela saída**, não tempo desde Note-On. Preservar três
tempos diferentes: `holdMs` confirma entrada; `unknownGraceMs` filtra lacuna
curta; TTL de perda limita sustentação sem evidência. `releaseMs`/`releaseRatio`
tratam saída do reconhecedor, não substituem TTL.

| Situação | Tratamento recomendado, ainda não implementado |
| --- | --- |
| Perda curta com frames atuais | Marcar suspeita de perda, aplicar grace. No modo temporizado, consumir esse tempo dentro do prazo total, sem acrescentar grace ao teto. |
| Mão ausente prolongadamente | Manter apenas no modo ilimitado; no temporizado soltar ao deadline; no imediato soltar quando perda for declarada. |
| Mão presente, pose desconhecida/inválida | Seguir saída/histerese do reconhecedor; não renovar TTL por presença de mão. Presença e G1 confirmado são fatos distintos. |
| Mesma pose válida antes do prazo | Renovar `lastQualifiedAt` somente com resultado fresco, estável e não contraditório. Cancelar perda; se a voz ainda está ativa, nenhum ON adicional. |
| Outra pose válida | Encerrar pose/voz anterior e confirmar nova pose pela FSM; não presumir identidade contínua a partir de handedness. |
| Retorno depois do release | Estado anterior permanece encerrado. Exigir confirmação normal da pose para novo ON; alternativa de rearme manual fica como decisão futura. |
| Câmera sem frames/inferência sem resultados | Watchdog compara relógio monotônico e última evidência fresca; não esperar novo `processMissing`. Preview ou WebSocket vivo não renovam validade. |
| Aba suspensa/tela apagada | Detectar ciclo de vida quando possível; o host da saída deve expirar validade se a página para. Exceções de browser não são garantia. |
| Câmera OFF, parada explícita, desconexão | Encerrar vozes próprias e trabalho agendado, independentemente de hold ilimitado. Um socket antigo não pode parar sessão substituta. |
| Troca de modo ou mapping durante hold | Recalcular a partir de timestamps existentes, sem zerar idade artificialmente; fechar voz aposentada e invalidar callbacks/timers antigos. |

Semântica de relógio proposta: `deadline = lastQualifiedAt + timeoutMs`, por
saída ativa. Um frame de ausência inicia estado de perda, mas não reinicia a
idade; ausência repetida, frame duplicado, heartbeat genérico e outra mão não
renovam prazo. O watchdog também identifica ausência de frames desde o último
resultado fresco. Se houver recuperação qualificada antes do deadline, volta
a acompanhar esse gesto. Depois de vencer, não ressuscita estado antigo.

Uma mensagem contendo landmarks no mesmo frame congelado não é evidência nova.
Propor número/timestamp crescente do frame e geração da sessão como parte da
qualificação, mantendo relógios de página/host separados. Um timer independente
da inferência na página melhora falhas comuns, mas sozinho não cobre suspensão;
para limite confiável, o host precisa saber a idade da validade e checar o prazo
mesmo sem tráfego da página. Cálculo deve usar tempo monotônico local e prazo
declarado pelo protocolo, sem subtrair diretamente relógios de máquinas.

## Diagnóstico do RC Surface

Fontes abaixo referem-se ao commit-base indicado; não são inspeção de um pacote
instalado nem aceite musical em Live.

- `static/phone-v3/vision-processor.js:1115`: usa Hands legado com uma mão,
  modelComplexity 0 e limites de confiança. A documentação Tasks atual não
  autoriza uma migração de API nesta mudança.
- `static/phone-v3/safe-input-layer.js:632`: `markMissing` expira candidato após
  grace e conserva `activeName`. `recognize` em `:640` trata descritor inválido
  por grace/release; em `:681` usa histerese e em `:704` confirma candidato com
  holdMs. Ausência e descritor inválido seguem caminhos diferentes.
- `static/phone-v3/vision-processor.js:1054`: `processMissing` conserva pose ativa.
  Resultados com mão em `:1352` entram em reconhecimento; sem mão, `:1371`
  chama esse caminho. `:1043` emite release ao mudar nome ativo.
- `static/phone-v3/app.js:2432`: perda de mão envia `lost:true` para poses após
  grace, uma vez por canal, mantendo LAST KNOWN. `:2498` pode restaurar ON para
  o slot ainda ativo ao chegar `handData.active`. Essa ramificação não exige
  uma nova confirmação temporal da pose anterior; um primeiro frame de mão
  desconhecida ainda pode encontrar activeName retido pela histerese.
- `static/phone-v3/app.js:2512`: progress é feedback de TEST; seu percentual não
  é timer musical. `:2573` emite ON de pose e `:2579` emite OFF na transição.
  Câmera OFF em `:2743` envia `sensor.vision.active=0` sem lost; pagehide chama
  stopVision em `:2758`.
- `src/live/mappings.ts:118`: migração de vision anterior à versão 2 converte
  policy ausente/release para hold, preservando outras policies. Portanto,
  simplesmente mudar um default na UI não redefine mappings existentes.
- `src/live/mappings.ts:721`: release por `hand_lost` pula vozes aprendidas;
  câmera parada não tem essa exceção. `:982` distingue os dois eventos.
  `:1065` retorna sem alterar saída de pose com target hold; demais targets
  momentâneos recebem off. Um `lost:true` não é ordem incondicional de OFF.
- `src/live/mappings.ts:997`: Launch Clip recebe caminho próprio; perda é no-op.
  `:1432` resolve neutralPolicy por target, com repouso por tipo de controle.
  `:1466` aposenta trabalho da sessão desconectada e agenda tratamento de perda;
  isso não é o mesmo evento de uma mão ausente com conexão viva.
- `static/phone-v3/vision-processor.js:139` agenda callbacks de vídeo/renderização;
  `:1195` envia frames e `:1305` calcula latência. O timeout encontrado em `:234`
  limita inicialização do worker; não é TTL de sustentação. Na cadeia estudada,
  falta política de prazo de pose que avance sem novos resultados. Erro de
  inferência detectado em `:829` já limpa histórico/emite release; não confundir
  essa falha explícita com silêncio indefinido do pipeline.

Testes existentes delimitam o que está comprovado:

- `static/phone-v3/vision-processor.test.mjs:1462` verifica preservação de activeName
  na ausência; `:2180` comprova grace, LAST KNOWN, reemissão ON única e rejeição de
  callbacks antigos. Usa retorno da pose de teste, não toda mão desconhecida.
- `tests/vision-pose-safe-loss.test.mjs:15` compara hold e release: hold não duplica
  a nota sustentada; release produz OFF e ON na volta; câmera OFF libera ambos.
- `tests/live-mappings-safe-loss.test.mjs:38` verifica destinos distintos; `:51`
  diferencia repouso de eixo/gate; `:113` testa retorno gradual de contínuos.
- `tests/server-safe-loss-wire.test.mjs:70` prova que lost chega à policy e que
  placeholder zero não vira medição literal.

Conclusão técnica: sustentação indefinida na ausência é consequência explícita
de preservação do reconhecedor e Safe loss hold. Não é comportamento imposto
pelo MediaPipe. A nova implementação deverá coordenar os dois níveis e provar
retorno desconhecido, congelamento e precedência; não basta inserir setTimeout
no feedback de TEST ou emitir o mesmo lost:true depois de dez segundos.

## Recomendação

Propor três modos em **VID → configurações → Perda de tracking**, com um único
campo adicional de duração no modo temporizado. São recomendações de projeto,
não configurações aprovadas ou já presentes:

| Rótulo PT / EN | Uso principal | Regra musical proposta |
| --- | --- | --- |
| Manter sem limite / Hold without time limit | Drone, sustentação deliberada, gesto como latch. | Conservar durante ausência; saída normal da FSM ao voltar, troca de pose ou parada explícita termina a voz. Mostrar LAST KNOWN e ausência de prazo. |
| Manter por até… / Hold for up to… | Performance com continuidade em dropout e teto para ausência. | Sustentar até prazo total sem evidência qualificada; liberar uma vez ao expirar. Mostrar tempo restante. |
| Soltar na perda / Release on tracking loss | Gate estrito/percussão e situações onde ficar tocando é pior que interrupção. | Sem espera musical extra depois de declarar perda. Preservar grace interno; se desejar zero grace real, decidir e rotular separadamente. |

Preferência técnica para instalações novas: modo temporizado, porque expõe um
limite verificável. **Padrão final e duração permanecem pendentes.** Migração
conservadora sugerida: manter comportamento antigo em projetos existentes e
mostrar modo herdado, evitando alteração sonora silenciosa. Isso também precisa
ser decidido; 10 s continua somente um valor a testar, ao lado de prazos menores.

Precedência sugerida: modo VID estabelece teto para vozes MIDI aprendidas que
ele criou; Safe loss por alvo pode soltar antes e continua determinando repouso
de contínuos, mas `hold` não pode anular silenciosamente teto explícito de VID.
Tornar exceções por alvo uma opção avançada futura somente se houver necessidade
musical; a primeira versão deve mostrar a policy efetiva. Alternativa de overrides
por alvo dominantes existe, mas exigiria explicar por que “até T” deixa de valer.

Grace, histerese e confirmação são mecanismos internos comuns, não três menus
novos. Extrapolação e rearme manual não entram no conjunto inicial. Parada de
vozes próprias/câmera OFF/desconexão vence qualquer modo; não enviar All Notes Off
global que possa matar notas de outros controladores. Usar registro das vozes
próprias e preservar identidade do target/sessão.

## Decisões para Gabriel

1. Adotar os três modos propostos e confirmar que “soltar na perda” inclui grace
   curto, ou exigir opção de zero grace com risco de mais interrupções.
2. Escolher padrão para projetos novos e migração dos antigos: manter hold atual
   até escolha explícita ou converter com aviso/consentimento de migração.
3. Escolher duração padrão, mínimo, máximo e passo. Proposta de interface para
   avaliação: segundos, 0,1–30 s, passo 0,1 s; não é faixa acadêmica validada.
   Para garantir tolerância ao grace atual, o mínimo efetivo do modo temporizado
   deve ser pelo menos esse grace; validar novamente ao trocar preset, sem
   alongar o teto silenciosamente. Prazo inferior exige decidir outra semântica.
   Testar 10 s e valores menores musicalmente antes de fixar padrão.
4. Confirmar prazo desde última evidência qualificada, grace dentro do teto,
   renovação só por mesma pose atual válida e nova confirmação após release.
5. Confirmar teto VID sobre hold por alvo, com Safe loss podendo antecipar release;
   ou escolher overrides por target dominantes e aceitar indicação de exceções.
6. Definir política de pipeline parado/aba suspensa: aplicar prazo de validade do
   modo selecionado no host; câmera OFF/desconexão/parada sempre liberam vozes.
   Hold ilimitado em falha técnica, além de mão ausente, exige escolha explícita.

## Plano de validação

Na implementação futura, usar relógio falso para prazo/FSM e mensagens MIDI
capturadas; não esperar segundos reais para provar limites. Separar testes de
protocolo/host dos testes de câmera e do aceite musical:

1. Para G1–G3, sustentar e perder mão abaixo, no limite e acima de grace/TTL.
   Ausências repetidas não movem deadline. No modo temporizado, testar tempo
   restante e OFF exatamente uma vez; no ilimitado, comprovar conservação.
   Verificar duração menor que grace e troca de preset sem teto oculto.
2. Retornar com mesma pose válida, outra pose, mão desconhecida e descritor
   contraditório antes/depois do prazo. Nenhum ON novo apenas pela presença;
   voz ainda ativa não duplica ON; após OFF, confirmar entrada antes de novo ON.
3. Congelar frames, repetir timestamp/imagem, bloquear resultados, lançar erro
   de inferência e suspender aba. Watchdog continua independente de novo frame;
   heartbeat genérico não preserva validade. Testar limite de suspensão do host.
4. Câmera OFF, pagehide, disconnect/reconnect, socket substituído, troca de modo,
   mapping editado e target removido cancelam trabalho antigo. Callback/timer
   atrasado não corta nota da sessão nova nem recria voz aposentada.
5. Validar mistura de targets: MIDI hold/release, parâmetros hold/center/custom,
   one-shot e Launch Clip no mesmo gesto. Teto e overrides têm comportamento
   documentado; clip não para na perda; glide pertence só a contínuos.
6. Carregar configurações antigas visionSafeLossVersion/maxTakes; preservar
   presets de reconhecimento e banco 3–6, TEST e captura. Não alterar holdMs
   para simular timeout nem exigir recaptura de modelos compatíveis.
7. Aceite no Live com mão/câmera reais: dropout rápido, retirada prolongada,
   mudança de luz/velocidade, áudio audível e log MIDI próprio. Comparar prazos
   em frases/percussão/drone, registrar cortes indesejados e retomadas, em mais
   de uma sessão. Aprovar comportamento musical e rótulos antes de release.

O check estrutural do relatório não valida suporte das citações. A revisão deve
conferir particularmente R02 §3.1.4, limites de R03, exclusão de Note On/Off em
R04 e ausência de política de tracking em R05, além dos caminhos de retorno e
Safe loss citados. Pesquisa pronta para decisão não significa modo implementado.
