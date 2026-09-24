# RC Surface — Guia do usuário

Tudo o que quem toca precisa para operar o controlador no celular durante
montagem, passagem de som e apresentação. Leia uma vez antes de tocar um set.

> **Escopo**: o cliente do celular (`/phone-v3/`) é a superfície principal. O
> painel do Ableton e o painel administrativo estão cobertos à parte, no
> [`CUSTOMIZATION.pt-BR.md`](./CUSTOMIZATION.pt-BR.md).
> O RC Surface 1.0 suporta um controlador por vez: opere a performance pelo celular ou desktop, nunca ambos simultaneamente.

---

### Controle em tempo real na versão candidata atual

O MAP não reduz mais a frequência do controle: XY, MIX e sensores usam um fluxo
separado, com primeiro envio imediato e tráfego seguinte agrupado com espaçamento
mínimo de 8 ms. Esse é um limite de despacho, não uma promessa de latência total.
Posições contínuas novas substituem as ainda não enviadas; pressões e solturas
dos pads mantêm a ordem. Use **Smooth = 0** para não acrescentar rampa ao mapeamento.
Smooth explícito, envelopes musicais e perda segura de sinal continuam válidos.
Main/Master agora abre como **Main → device → parâmetro**, igual às tracks;
Tempo continua acessível diretamente.

Recarregue a página após atualizar a extensão. Hosts antigos continuam funcionando
pelo caminho legado de snapshots, mas não recebem o novo comportamento rápido.
A latência física no Live ainda depende do benchmark gravado que ficou pendente.

## 1. A tela do celular de relance

A interface do celular é uma página só, com seis abas. Troque pelos botões da
faixa de cima:

| Aba | O que faz |
| --- | --------- |
| PERF | Performance: pads, XY, LFOs, stutters, atalhos UTIL |
| MIX | Oito knobs e oito faders, para o mixer |
| SNP | Snapshots: 8 slots de captura, com morph entre eles |
| SNS | Sensores: leitura ao vivo de movimento e orientação |
| AUD | Microfone e as entradas de análise de áudio |
| VID | Câmera, rastreio de mãos e poses estáticas aprendidas |

A faixa de cima também tem o botão **MAP**, perto do indicador de BPM, e mais
**SYNC**, **STAGE** e **CALIBRAR** contextual em SNS/AUD/VID. Veja
[§ 7 Controles da barra superior](#7-controles-da-barra-superior) e
[§ 8 Modo MAP](#8-modo-map--mapeamento-pelo-celular).

---

## 2. Modos de pad (A / B / C / D)

O seletor de modo fica na coluna do meio da aba PERF:

```
┌───┬───┬───┬───┐
│ A │ B │ C │ D │
└───┴───┴───┴───┘
```

O modo escolhido vale para **os 12 pads** (`pad-1`..`pad-12`), **os 4 LFOs**
(`toggle-1`..`toggle-4`, rotulados `L1`..`L4`) e **os 4 stutters**
(`button-1`..`button-4`, rotulados `S1`..`S4`). O modo é compartilhado: você
escolhe uma vez e todos os controles seguem a mesma regra.

### Modo A — Momentâneo (padrão)

- O toque manda um valor diferente de zero; soltar manda zero.
- Arraste **na vertical** para escalar o valor de `0` (ponto de soltura) até
  `1` (150 px acima do início do toque). É a mesma faixa que knobs, faders,
  LFOs e stutters usam.
- Melhor para: hits de percussão, one-shots, efeitos momentâneos.

### Modo B — Hold

- O toque trava o controle **ligado**; soltar sem arrastar volta a
  desligá-lo. Qualquer movimento, vertical ou horizontal, mantém segurado até
  você arrastar o valor de volta a zero de propósito.
- Para stutters especificamente (veja [§ 4](#4-stutters-s1--s2--s3--s4)): um toque
  desliga; soltar com amplitude abaixo de `0.02` também desliga. Arrastar a
  velocidade na horizontal mantém o stutter ligado enquanto há amplitude.
- Melhor para: LFOs travados que seguem modulando depois de soltar, varreduras
  de stutter sustentadas, pads que você quer deixar soando.

### Modo C — Toggle

- Um toque liga; outro toque desliga.
- Um arrasto vertical curto com ele ligado remodula o valor sem desligar — o
  arrasto é ignorado pelo estado do toggle.
- Ao ligar por toque, o valor volta para o último que você usou neste modo. Se
  você nunca definiu um, o padrão é `1`.
- Melhor para: pads que devem ficar pressionados (comportamento de pedal de
  sustain), LFOs que precisam manter o ajuste entre um toggle e outro.

### Modo D — Burst

- O toque dispara um envelope de uma vez só, com pico em `1`.
- Arraste **na vertical enquanto segura** para modular o pico entre `0.15` e
  `1`.
- Melhor para: stabs, ghost notes, percussão que precisa de cauda, risers.

**A página inteira faz burst, não só os pads.** O modo D é uma forma, e todo
controle que ele alcança segue essa forma: o valor de um pad sobe e desce, e um
LFO ou stutter abre a profundidade no attack e fecha no release. Em `FREE` o
envelope são 520 ms fixos com 70 ms de attack, igual em todos eles. Passe o
header para `SYNC` e a duração passa a vir do andamento do Live, escolhida em
**Ajustes de Deep Sync → Config de burst (pad modo D)**:

| Controle | O que faz |
| --- | --- |
| Duração (subdivisão) | De um compasso até 1/16. A 120 BPM, `1 beat` dá 500 ms. |
| Attack | Arraste o pico ao longo do envelope desenhado. A forma é o que você está ajustando, então é a forma que você arrasta. |

Abaixo do desenho o painel escreve no que o ajuste atual realmente dá — a
subdivisão, o andamento pelo qual ela é multiplicada, a fonte de clock por trás
desse andamento, e os milissegundos que saem disso. É essa linha que se lê
quando uma duração não está se comportando: andamento desatualizado, fonte de clock
diferente e o `FREE` atropelando a grade parecem a mesma coisa até ela dizer
qual é. Com o `SYNC` desligado a grade de duração fica apagada, porque nada do
que ela oferece chega no burst.

Um burst é de uma vez só, então estar fora da grade se ouve na hora — é este o
ajuste que põe o stab **no** beat, e não perto dele. A seção vale só com o
`SYNC` ligado; o `FREE` ignora os dois controles e mantém o envelope fixo. Se o
Live ainda não informou um andamento, a duração usa 120 BPM em vez de
ficar muda.

---

## 3. LFOs (L1 / L2 / L3 / L4)

Os quatro LFOs ficam na coluna da direita da aba PERF, sob o título `LFOS`.
Cada LFO é um oscilador de baixa frequência contínuo, que emite valores entre
`0.5 - depth/2` e `0.5 + depth/2`, com centro em `0.5`.
FREE oferece ajuste contínuo de **0,1 Hz até o teto da forma escolhida**.
Tetos medidos de fallback: **senoide 4 Hz; triângulo 3 Hz; rampas crescente e
decrescente 3 Hz; quadrada 12 Hz**. São limites provisórios de fallback, baseados
na regra do teto de escrita (~50 escritas/s); os tetos definitivos e a fidelidade
no Live ainda dependem do teste na bancada física (A1 / write-ceiling P04).
Abra **⚙ ao lado de SYNC → Config de LFO → Forma de onda**.
A forma só define o limite de velocidade; ela não escolhe uma taxa automaticamente.
A forma global se aplica por padrão a L1–L4, mas **a configuração CFG por controle tem precedência**: abra **CFG** no header e toque no LFO (L1–L4), ou clique com o botão direito no desktop, para definir uma forma que prevalece sobre o LFO CONFIG global daquela instância (ver 9.5). Trocar a forma mantém a fase, mas pode mudar o valor instantâneo.

Mudar a velocidade preserva a fase em FREE e SYNC, inclusive ao trocar subdivisão.
Morphs de velocidade em FREE integram a aceleração. SYNC Auto usa divisões retas,
tercinas (T) e pontuadas (D) dentro do teto da forma no BPM atual. A 120 BPM (2 beats por segundo):
- Subdivisão 1/8 solicita 4 Hz. Em senoide (4 Hz) ou quadrada (12 Hz), 1/8 é permitido.
- Em triângulo ou rampa (teto de 3 Hz), 1/8 ultrapassa 3 Hz; portanto, 1/8 e subdivisões
  mais rápidas (1/16, 1/32, 1/64) ficam desabilitadas na grade e bloqueadas para
  mouse, toque e teclado.
- Uma seleção prévia acima do teto permanece como intenção do usuário, e o mostrador
  exibe explicitamente a taxa solicitada versus efetiva (por ex., 1/8 → 1/4).
  O runtime limita (clamp) a emissão ao teto da forma sem alterar silenciosamente
  a subdivisão salva.
Deep Sync mostra a divisão pedida/efetiva; Auto libera a divisão fixada anterior. Tudo usa o navegador e a extensão
existente, **sem nenhum device Max adicional**.

Compatibilidade: rates normalizados salvos não mudam; snapshots FREE antigos
podem tocar mais rápido e SYNC Auto pode escolher outra divisão após mudar a
forma/faixa. Divisões fixadas são mantidas, com o limite aplicado na reprodução.
Amplitude e alvos não mudam. Stutter SYNC também aplica agora seu teto efetivo;
divisões/ratchets rápidos antigos ou combinações com swing podem ficar mais
lentos. Teste em uma cópia do Set.

Com SYNC selecionado, o LFO ativo continua andando quando o Live para e volta
à posição musical ao dar Play/retomar/mover o transporte. Depois de gestos de
velocidade, a fase depende da sequência desses gestos até o próximo alinhamento.
Stop não é OFF do LFO.
O clock interno ignora a posição do transporte. Uma subdivisão fixada em Deep
Sync também é usada durante a pausa, com o mesmo teto da forma.
Alternar SYNC/FREE não garante preservar frequência nem uma transição de fase
sem salto.

### Controles de cada LFO

- **Arrasto vertical** → define a **profundidade** (quantidade de modulação,
  `0..1`). Começa em `0.5`. A faixa de arrasto é 150 px.
- **Arrasto horizontal** → define a **taxa** (velocidade da modulação). FREE é
  contínuo; SYNC escolhe divisões rítmicas. No desktop, segure **Shift** durante o
  arrasto para ajuste fino com um quarto da sensibilidade normal de velocidade.
- O LFO segue emitindo a fase continuamente enquanto o botão está **ativo**. O
  jeito de ficar ativo e inativo segue o modo de pad escolhido (A/B/C/D) —
  veja [§ 2](#2-modos-de-pad-a--b--c--d).
- Retorno visual: a barra dentro do LFO acende quando ele está ativo. Um brilho
  na borda de baixo reflete a profundidade atual; um brilho na borda da direita
  reflete a taxa atual. O controle mostra só a velocidade: Hz em FREE; duração musical em SYNC.
  Por exemplo, 1/4 = um tempo por ciclo, 1/8 = meio tempo; T = tercina, D = pontuada.
  Os botões de subdivisão do painel usam essas mesmas unidades musicais;
  os valores internos salvos em beats não mudaram.

### Uso típico

- Mapeie um LFO no cutoff de um filtro, no feedback de um delay, ou na posição
  de uma wavetable. Toque **MAP** no celular, ou use o editor de mapeamento do
  painel, para ligar qualquer parâmetro do Live a um controle `toggle-N`.

---

## 4. Stutters (S1 / S2 / S3 / S4)

Os quatro stutters ficam ao lado dos LFOs na PERF. Geram um gate no parâmetro
mapeado, alternando entre zero e **profundidade/amplitude**. Não gravam nem
repetem áudio por conta própria; o resultado sonoro depende do alvo.

### Dois eixos, um botão

- **Arrasto vertical para cima** → aumenta a **amplitude** (`0..1`, inicial `0.5`).
- **Arrasto horizontal para a direita** → aumenta a **velocidade** (`0..1`,
  inicial `0.1`). FREE deriva a frequência desse valor; SYNC escolhe subdivisões.
- Os eixos agora são iguais aos do LFO. O `count`/ratchet antigo continua
  legível e restaurável, mas não é controlado pelo arrasto horizontal.
- A faixa de arrasto nos dois eixos é 150 px.
- O botão segue o modo de pad escolhido (A/B/C/D) para ativar, com uma exceção
  importante — veja abaixo.

### Comportamento do modo B nos stutters

No modo B:

- **Toque, sem mover** → o stutter desliga.
- **Soltar com amplitude abaixo de `0.02`** → o stutter desliga.
- **Arrastar a velocidade com amplitude acima desse limiar** → o stutter
  continua rodando, mesmo na velocidade mínima.

Snapshots incluem amplitude; snapshots antigos sem esse campo mantêm o valor atual.

### Velocidade com visual enxuto

S1–S4 mostram somente a velocidade embaixo do identificador: **Hz em FREE**,
**duração musical em SYNC**. 1/4 = um tempo por ciclo; 1/8 = meio tempo; T = tercina,
D = pontuada. A divisão considera ratchet e limite efetivos. Com swing, ela
descreve o ritmo médio; os intervalos alternados são intencionalmente desiguais.
Sem AMP %, listras, barra de amplitude ou rótulos extras no botão.
A amplitude continua no gesto vertical; removemos somente sua indicação adicional.

FREE percorre 1–15 Hz continuamente (ratchet antigo eleva o mínimo), sem uma
faixa final presa no teto. SYNC Auto distribui somente divisões alcançáveis pelo
gesto. Os ajustes desativam divisões-base que excederiam 15 Hz conforme BPM,
swing e o maior ratchet salvo entre S1–S4. A 120 BPM, sem swing/ratchet, 1/16
equivale a 8 Hz; 1/128 exigiria 64 Hz e fica indisponível. Divisões fixadas antigas
acima do teto ainda desaceleram por oitavas, com divisão pedida → efetiva nos ajustes.
Arrastar na horizontal libera a divisão fixada compartilhada e volta ao Auto; arrastar
só na vertical mantém a divisão escolhida. Velocidades normalizadas salvas podem
voltar com uma velocidade diferente da r11.

O brilho segue o gate local em todas as velocidades, sem visual fixo acima de
5 Hz e sem animação substituta mais lenta. Uma tela lenta pode perder pulsos;
pulsos perdidos nunca são repetidos depois. A leitura descreve o gerador, não a
entrega medida no Live. O menor meio-pulso previsto com swing/ratchet continua
em pelo menos 1/30 s; a frequência média pode ser menor que 15 Hz.

Para alvos contínuos, só o valor não enviado mais recente fica pendente. OFF
substitui os pulsos pendentes por zero, sem suavização; uma escrita que já saiu
para o SDK não pode ser cancelada. Mapeamentos explícitos de toggle e MIDI preservam
a ordem dos eventos.

---

## 5. Atalhos PERF UTIL

A aba PERF tem um bloco `UTIL` compacto, para ações que você precisa durante um
set sem sair da superfície de performance.

- **CAP** arma a captura de snapshot direto da página PERF.
- **1-4** recuperam os slots de snapshot 1 a 4.
- **CAP + 1-4** salva o estado atual de performance naquele slot.
- **OFF** cancela o morph de snapshot em andamento, desliga pads, LFOs e
  stutters, e devolve os XY pads ao centro. Não mexe nos knobs e faders da MIX,
  nem em sensores, áudio, visão ou transporte.

---

## 6. XY pads

Dois pads na coluna do meio da aba PERF.

### XY 1 — controle direto

Toque em qualquer lugar do pad. O ponto pula para a posição do seu dedo.
Valores:

- `xy-1.x` — posição horizontal, `0..1` (esquerda → direita)
- `xy-1.y` — posição vertical, `0..1` (cima → baixo)

Use para crossfades, campo estéreo, controle de dois parâmetros.

### XY 2 — joystick com física

O ponto tem inércia. Dê um peteleco e ele desliza. Ele ricocheteia com força de
mola quando você solta perto da borda.

- `xy-2.x` e `xy-2.y` seguem os mesmos eixos do XY 1.
- O ajuste fino fica no painel (constantes de física). Melhor para performance
  expressiva, com caráter de gesto.

---

## 7. Controles da barra superior

Três botões na faixa de cima, presentes em todas as páginas.

### SYNC

Alterna o clock de BPM entre **SYNC** (travado no Live) e **FREE** (interno).

- **SYNC** (ciano): as taxas de LFO e stutter ficam quantizadas ao BPM do Live,
  o burst do pad modo D tira a duração da grade (veja
  [§ 2](#2-modos-de-pad-a--b--c--d)), e uma transição de snapshot em Sync faz o
  mesmo (veja [§ 10](#10-aba-snp--snapshots-e-morph)). O header mostra o BPM
  atual (`120.0 BPM`, e assim por diante).
- **FREE** (âmbar): o celular roda o próprio clock. Use quando o Live não está
  rodando, ou quando você quer andamento interno independente dele.

Apertar SYNC restaura o BPM da sessão, como informado na última transmissão do
Live.

### CALIBRAR

CALIBRAR funciona por página: aparece somente em **SNS**, **AUD** e **VID**.
Cada página começa **Não calibrado** e mantém seu próprio estado nesta sessão do
navegador. Trocar de página cancela uma coleta em andamento, mas não uma
calibração já concluída em outra aba. Recarregar a página restaura as três.

- **SNS:** mantenha o celular parado na postura neutra desejada e aperte
  CALIBRAR. Um segundo de leituras novas e estáveis define a orientação neutra.
  Girar a tela invalida essa referência. Isso não zera a aceleração.
- **AUD:** ative a entrada escolhida e mantenha um trecho representativo tocando
  no volume normal por cinco segundos. A calibração ajusta somente a **resposta
  dos controles RMS/envelope**, com ganho limitado (0,25–8x), não o volume no
  Live, EQ, ganhos dos detectores, limiares, RELEASE ou SUAVE. Não remove ruído.
  Silêncio não é um trecho válido. Desligar/trocar a entrada restaura o ajuste.
- **VID:** ative a câmera, fique no enquadramento de uso e levante a mão de
  controle. Durante quatro segundos, a página verifica luminosidade, excesso de
  luz e continuidade das detecções reais da mão. Só ativa exposição/foco contínuos
  se a câmera oferecer suporte e confirmar a alteração. Caso contrário, informa
  que verificou a câmera sem alterar ajustes. Luz ruim ou mão ausente pedem nova
  tentativa, não um sucesso fictício. Coordenadas, posição neutra da mão, gestos
  aprendidos e confiança do MediaPipe nunca são modificados.

A faixa compacta explica o que fazer e mostra o progresso. **CANCELAR** interrompe
a coleta; **RESTAURAR** retorna à resposta padrão da página e aos ajustes de
câmera anteriores à calibração. Falha/cancelamento do vídeo desfaz seus ajustes.
Recalibrar substitui a calibração anterior daquela aba. O botão não ativa
microfone/câmera sozinho. Isso não é calibração de latência.

### STAGE

Alterna o **modo palco**:

- Esconde a barra de cima, as abas e os rótulos — tudo menos os próprios
  controles de performance.
- Pede tela cheia ao navegador, para a interface ocupar o aparelho inteiro e
  nada mais roubar o foco no meio do set.
- Aperte de novo — ou saia da tela cheia por qualquer gesto do sistema — para
  sair.

Use o modo palco tocando: ele tira a moldura e dá a maior superfície possível
para os controles.

> **Limitação conhecida — 12/07/2026:** ligar o sensor de áudio ou a câmera com
> o modo palco em tela cheia pode fazer o Chrome sair da tela cheia. No Samsung
> S25F testado, a tela cheia pode não voltar a ficar disponível até a aba do
> controlador ser fechada e aberta de novo. Quando der, ligue áudio e câmera
> antes de entrar no modo palco.

---

## 8. Modo MAP — mapeamento pelo celular

Toque **MAP**, perto do indicador de BPM, para entrar no modo de mapeamento
pelo celular. Isso não abre outra página no navegador; ele sobrepõe um fluxo de
mapeamento em cima do controlador de verdade, para você escolher o controle que
já está usando.

### Escolher um controle

Com o modo MAP ativo, os controles mapeáveis da página visível ficam
selecionáveis, com contorno e rótulo azuis. Isso inclui:

- Controles da PERF: pads, XY pads, LFOs, stutters.
- Controles da MIX: knobs e faders.
- Controles de sensor, na lista de fallback do painel do MAP.

Toque num controle destacado para escolher. Nos XY pads, o editor expõe os
eixos separadamente:

- `xy-1.x` / `xy-2.x` — eixo horizontal.
- `xy-1.y` / `xy-2.y` — eixo vertical.

### Bind num parâmetro

Use **Bind** quando quiser que um controle do celular mova um parâmetro do
Ableton. O seletor de destino é hierárquico:

- **Song / Main / Master**: andamento da música e destinos de main e master.
- **Tracks**: tracks normais do Live, destinos de mixer, devices e parâmetros.
- **Return Tracks**: destinos de mixer das returns, devices e parâmetros.

Abra uma track, depois um device, depois escolha o parâmetro. A busca filtra a
árvore mantendo o contexto de track e device à vista, para você saber qual
parâmetro pertence a qual track.

### Trigger note numa track MIDI

Use **Trigger Note** quando um controle do celular deve mandar uma nota MIDI,
em vez de mover um parâmetro continuamente.

1. Escolha um pad, LFO, stutter, eixo de XY, knob ou fader no modo MAP.
2. Toque **Trigger Note**.
3. Escolha uma track MIDI.
4. A extensão procura o `RC-Midi-Receiver.amxd` naquela track. Se já existir,
   reaproveita. Se estiver faltando, coloque o device incluído na release/User
   Library naquela track MIDI no Live e tente de novo. O SDK de Extensions do
   Live não consegue inserir devices Max for Live automaticamente.
5. Escolha a nota nos controles de **Pitch** e **Oitava**, e ajuste a
   **Velocity**.

**Receiver v2.2:** **SDK Notes** arma sozinho quando o device termina de
carregar, depois de descartar qualquer valor de pacote que o Set restaurou, então
um toque novo no pad toca sem nenhum clique. Desativar o device desliga e
reativar arma de novo; **Panic** desliga e fica OFF até você clicar. Desligue
SDK Notes antes de carregar um preset num device já aberto. Audio Sender input é
uma habilitação separada. Não automatize nem mapeie por MIDI `RC MIDI Packet v2`:
a API exige um parâmetro automatizável e, com SDK Notes ON, essa automação pode
tocar notas.

Vários controles podem disparar notas na mesma track MIDI. Notas diferentes são
tratadas como destinos de trigger diferentes.

### Campos do editor de mapeamento

Cada destino mapeado pode ser ajustado pelo celular:

| Campo | Significado |
| ----- | ----------- |
| Mode | `continuous`, `toggle` ou `trigger_note`. |
| Curve | `linear`, `exponential`, `logarithmic`, ou `s-curve`. |
| Target scale | `Auto` mantém mixer e andamento lineares e usa percurso geométrico para faixas de frequência largas e positivas que ele reconhece; `Linear` ou `Geometric` explícitos passam por cima do Auto, quando o destino permite. |
| In Min / In Max | A faixa de entrada lida do controle do celular. |
| Out Min / Out Max | A faixa de saída mandada para o destino no Live. |
| Drive | Empurra a curva de resposta para cima ou para baixo. |
| Comp | Comprime ou expande o meio da curva de resposta. |
| Smooth | Acrescenta suavização, para reduzir saltos bruscos de valor. |
| Threshold | Limiar, para os modos não contínuos. |
| MIDI Note | Pitch e oitava, para mapeamentos de trigger note fixa. |
| Velocity | Velocity MIDI para trigger note fixa. |

O canvas de curva mostra a forma de resposta atual e um ponto em movimento com
a entrada e a saída ao vivo do controle escolhido. Use para conferir se faixa,
curva, drive e compressão batem com o que você espera.

As entradas do celular chegam no motor de mapeamento num único domínio
normalizado `0..1`. Centroide, Dispersão e Rolloff mostram Hz na AUD, mas
mapeiam nesse mesmo domínio `0..1`. Pitch, nota detectada e BPM do áudio
foram removidos; não são fontes atuais. A escala do destino converte esse
domínio comum na faixa real do parâmetro
do Live, e limita no momento da escrita.

### Presets, refresh e desfazer bind

O painel do MAP salva, carrega e apaga presets locais de mapeamento. Os presets
ficam guardados no armazenamento da extensão, no computador.

Use **Refresh** se as tracks ou devices do Live mudaram com o modo MAP aberto.
Use **Unbind Target** para remover um destino do controle escolhido, ou
**Clear All** para remover todos os mapeamentos daquele controle.

Remover ou substituir um mapeamento cancela os comandos de parâmetro ainda
não enviados. Um comando já enviado ao Live pode terminar; isso não desfaz
uma alteração anterior. Notas de trigger mantidas são liberadas quando o
mapeamento é removido. Se o salvamento falhar, o mapeamento anterior continua
ativo: resolva o erro antes de considerá-lo removido.

Ao sair do modo MAP, o celular volta para a página de performance anterior e o
toque volta a se comportar normalmente.

---

## 9. Aba MIX — knobs e faders

A aba MIX tem oito knobs (`knob-1`..`knob-8`) e oito faders
(`fader-1`..`fader-8`).

Os dois painéis dividem igualmente a largura e a altura disponíveis, inclusive
no STAGE. Knobs planos com arco ficam em uma grade 4×2; a faixa de arrasto não muda.
IDs 1–6 e perfis antigos continuam compatíveis; 7–8 são controles adicionais.
Use Tab e setas (Shift para passos maiores), Home/End para os limites. O reset
do knob volta a 50%; o reset dos faders é descrito abaixo.

### Knobs

- **Arraste na vertical** para definir o valor (`0..1`).
- Faixa de arrasto de 150 px, igual a todo o resto.

### Faders

- **Arraste na vertical** para definir o valor (`0..1`).
- **Clique duplo ou toque duplo** volta à posição inicial: 85% em mapeamentos
  normais, 50% em parâmetros bipolares como pan. São posições normalizadas da
  superfície; a faixa do parâmetro mapeado determina o valor real em dB.
- Visual: um cursor sobre uma trilha, com a trilha preenchida de baixo até o
  valor atual. Um fader ligado a um parâmetro bipolar, como o pan, preenche a
  partir do centro — o meio é o repouso dele, não meio curso.
- Faixa de arrasto de 150 px.

A aba MIX é onde a maioria das pessoas liga volume, pan, sends, EQ e macros do
Live. Toque **MAP**, depois toque num knob ou fader, para fazer o bind direto
pelo celular.

---

## 9.5 Modo Config (CFG)

O Modo Config permite que controles de performance guardem seus próprios
overrides individuais (modos, formas, alcances, valores de reset, física). O
botão **CFG** fica no header do celular, ao lado de **MAP**. Abra-o
uma vez para mudar o comportamento de um controle; feche-o para voltar
à execução normal. As configurações persistem por controle no próprio
navegador do celular, não no Live.

### O que dá para mudar por controle

- **Pads** — escolha o modo A (momentâneo), B (hold), C (toggle) ou D
  (burst). Substitui o modo global dos pads sem precisar trocar de aba.
- **Knobs** — defina a amplitude do gesto (quantos pixels de arrasto
  correspondem a varrer o valor de 0 a 1). Amplitude grande é melhor
  em telas pequenas; amplitude pequena dá controle mais fino no painel
  de mapeamento do desktop.
- **Faders** — escolha um valor de reset. Quando você dá um toque duplo no
  fader, o valor salta para esse valor de reset em vez de ir a zero. Útil
  para pan, sends e macros onde existe um ponto de partida conhecido.
- **LFO (toggle 1 a 4)** — escolha a forma de onda (senoide, triangular,
  rampa ↑, rampa ↓, quadrada). O modal SYNC continua mostrando a
  prévia ao vivo; a forma escolhida aqui sobrescreve a forma global
  só para aquele toggle.
- **Stutter (button 1 a 4)** — escolha o modo A (momentâneo), B (hold),
  C (toggle) ou D (burst). Troque o modo do botão de stutter sem
  sair da página. (Subdivisão contínua, swing e deslocamento de fase
  ficam nas configurações globais do Deep Sync, acessíveis pelo ⚙ ao lado de SYNC).
- **XY pads** — em `xy-1`, deixe o padrão. Em `xy-2`, ajuste
  **Atrito** e **Quique**; o pad se comporta como um pequeno joystick com
  física que volta ao centro quando você solta.

### Como abrir o CFG

1. Toque em **CFG** no header do celular. O corpo da página ganha a
   classe `config-mode`; cada controle mostra uma pequena etiqueta
   resumindo o override atual (letra do modo, ícone da forma de onda,
   fração da subdivisão).
2. Toque (ou clique com o botão direito, no desktop) em qualquer
   controle para abrir o menu por instância. O menu lista só as
   chaves que se aplicam àquele controle.
3. Use a ação **Mapear para…** para vincular o valor daquele controle a
   um parâmetro do Live sem sair do celular. Se o MAP já estiver aberto,
   o CFG fecha o MAP antes de abrir o menu.
4. Toque em **CFG** de novo, pressione **Esc**, ou toque fora de um
   menu aberto para fechar. O modo Stage também fecha o CFG para
   manter o palco limpo.

### Limpando os overrides

- **Um controle só** — abra o menu por instância e toque em
  **Restaurar padrão**. O override some; o controle volta ao padrão
  global.
- **Todos os controles** — pressione e segure o botão **CFG** por
  cerca de meio segundo. Aparece um popover listando cada controle
  com override. Toque em **Limpar toda a config de controles** para confirmar.
  O popover usa o mesmo menu dentro da página, sem alerta do
  navegador.

### Onde os dados ficam

Os overrides ficam em `localStorage` sob a chave
`ableton-rc:control_config`. Limpar os dados do navegador do celular
apaga os overrides; limpar os dados do site pelo host do Live não
apaga. Não há ida e volta com o Set do Live: os overrides ficam no
celular e seguem aquele celular, não o Set.

---

## 10. Aba SNP — snapshots e morph

A aba SNP captura o **estado de todos os controles de performance** num
instante, e deixa você interpolar entre os snapshots capturados.

### Slots

Oito slots, numerados de `1` a `8`. Slots vazios mostram `VAZIO`; os
preenchidos mostram o número do slot.

### Capturar

1. Deixe os controles (pads, XY, LFOs, stutters, knobs, faders) no estado que
   você quer guardar.
2. Aperte **CAPTURAR** (o botão vermelho de gravação).
3. Toque num slot vazio. O slot passa a guardar o estado atual.

### Limpar

**Limpar slots** apaga os oito slots.

### Tempo de morph

O slider à direita dos controles define quanto tempo leva a transição até o
snapshot chamado. O
par **Free / Sync** acima dele decide o que o slider significa:

- **Free** — o slider é em segundos, de `0.1 s` a `5.0 s`, padrão `1.0 s`. A
  transição ignora o andamento do Live.
- **Sync** — o slider escolhe uma duração musical, e a leitura mostra `4 tempos`
  ou `1/4 tempo` em vez de um número de segundos:

  | | | | | | | | | |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 16 tempos | 8 tempos | 4 tempos | 2 tempos | 1 tempo | 1/2 tempo | 1/4 tempo | 1/8 tempo | 1/16 tempo |

  A duração é lida do andamento do Live no início da transição, então mudar o
  andamento move todas as transições seguintes sem tocar no slider. A 120 BPM,
  `4 tempos` dá 2 segundos. Cada tempo aqui é uma semínima, independente do compasso.

Essas subdivisões retas também aparecem na grade do stutter; LFOs têm sua própria
grade rítmica ampliada dentro do teto da forma escolhida. As transições de snapshot também
oferecem 8 e 16 tempos de semínima para gestos mais lentos. Se o Live ainda não informou um andamento, a
duração cai para 120 BPM em vez de travar.

### Modos de morph

- **Grade (1-8)** — toque em qualquer slot para fazer morph do estado atual até
  o estado do slot, ao longo do tempo de morph. Toque em outro slot para fazer
  morph de novo. O Tempo de transição (configurado pelos controles Free / Sync)
  aplica-se somente à Grade.
- **Vetor XY (1-4)** — aparece um pad vetorial 2D para interpolação direta,
  sem Transition Time. O pad tem quatro cantos, cada um ligado a um snapshot.
  Arraste o ponto dentro do pad para misturar os quatro contínua e instantaneamente;
  o bloco de tempo de morph (slider Free/Sync) fica desabilitado no modo Vetor.
  Útil para interpolar ao vivo e sem rampa temporal entre quatro configurações de macro.

Os parâmetros mapeados no Live acompanham o morph durante a transição. Se um
LFO, stutter, knob ou fader está mapeado no Live, o valor mapeado se move ao
longo da transição, em vez de esperar o morph terminar.

---

## 11. Aba SNS — sensores

Leituras ao vivo dos sensores do celular. Não há controles aqui — são os
valores sendo transmitidos para o Live, para você conferir que funcionam e
mapear em outro lugar.

### Estado do sensor

Cada painel mostra o estado atual do sensor, informado separadamente por API:

- `ready` — leituras reais e finitas estão chegando e podem ser mapeadas.
- `waiting` / `no-readings` — a página aguarda a primeira leitura. Um
desktop sem hardware de movimento permanece aqui; isso é silêncio, nunca
uma negação de permissão.
- `lost` — um sensor que funcionava parou de entregar por mais de dois
segundos. Valores antigos são descartados e deixam de ser mapeados.
- `denied` — a permissão do navegador foi recusada explicitamente.
- `error` — a chamada de permissão falhou; tente novamente pelo botão.

Movimento e orientação são rastreados de forma independente: uma API negada
não afeta a outra. O pedido de permissão só aparece em navegadores que o
exigem (permissão por gesto, estilo iOS).

### MOVIMENTO

Seis eixos, do acelerômetro e do giroscópio:

- `GX`, `GY`, `GZ` — velocidade angular do giroscópio (rad/s)
- `AX`, `AY`, `AZ` — aceleração linear (m/s²)

Os valores chegam nos mapeamentos como:

- `sensor.motion.ax`, `sensor.motion.ay`, `sensor.motion.az`
- `sensor.motion.gx`, `sensor.motion.gy`, `sensor.motion.gz`

### ORIENTAÇÃO

Três ângulos, do sensor de orientação do aparelho:

- `YAW` (alpha) — direção, como uma bússola
- `PITCH` (beta) — inclinação para frente e para trás
- `ROLL` (gamma) — inclinação para os lados

Os valores chegam nos mapeamentos sob `sensor.orient.*`. O yaw aparece com uma
órbita de bússola; pitch e roll com órbitas de nível.

A calibração SNS só começa com leituras novas e finitas nos três eixos de
orientação. Em um desktop sem hardware de movimento, o CALIBRAR mostra o aviso
neutro "Sem leituras de movimento neste dispositivo", em vez de um erro de
permissão.

### VISÃO LOCAL

Duas chaves: mostram e escondem os painéis de MOVIMENTO e ORIENTAÇÃO nesta aba.
Elas mexem só no que é exibido aqui — **não** silenciam a transmissão do
sensor.

---

## 12. Abas AUD e VID — áudio e visão

Entradas do microfone e da câmera do celular. Elas exigem que o navegador peça
permissão na primeira vez em que você liga.

Em janelas maiores no desktop, AUD usa dials maiores e campos distribuídos pela
área dos detectores de áudio. Os ponteiros acompanham o arco do valor ao redor do centro do dial.
VID prioriza a largura da câmera, com os controles no topo e uma prévia proporcional
ao lado de três cartões de poses empilhados, com botões de tamanho limitado. Telas baixas em
paisagem mantêm a organização compacta do celular, tanto normal quanto em STAGE.

### Entrada de áudio

Ligue **Entrada de áudio** para liberar o microfone. No computador, o navegador
também deixa você escolher qual entrada usar, então um loopback ou um canal de
interface pode alimentar a análise no lugar de um microfone de sala.

A captura pede ao navegador que desligue o cancelamento de eco, a supressão de
ruído e o controle automático de ganho, para não remodelar a dinâmica e o espectro.
Navegador, driver e entrada escolhida ainda podem reamostrar ou processar áudio;
não é garantia de captura bit-perfect. Use os controles agrupados dos
detectores abaixo; os antigos controles de pitch/clareza foram removidos.

Uma vez ligada:

- `sensor.audio.rms` — amplitude RMS da entrada, `0..1`, não loudness percebido
- `sensor.audio.envelope` — envelope de amplitude de curto prazo
- `sensor.audio.gate` — `1` enquanto o RMS da entrada passa do limiar interno (com histerese)
- `sensor.audio.attack` — força do pico após um ataque, `0..1`; sem reconhecer nota


### Escolher a entrada de áudio do navegador

AUD começa em **Padrão do navegador**. O seletor lista as entradas permitidas
neste navegador (microfone, interface ou loopback/cabo virtual); habilite a
captura para conceder permissão e revelar os nomes disponíveis. A escolha é
salva apenas neste navegador. Trocar uma entrada habilitada libera os valores
antigos e reinicia a captura. Uma entrada explícita removida ou negada exibe
aviso, sem trocar silenciosamente para outro microfone. Escolha uma entrada
disponível e habilite novamente. Recarregar nunca liga a captura sozinho.
Isso não é o modo Track do Ableton: a análise/controle nativo continua
experimental e não entra na interface desta versão. Áudio não é enviado;
somente descritores/valores numéricos de controle trafegam pela rede local.

O cartão ÁUDIO mostra um histórico ao vivo de 2,5 s: ciano é RMS bruto e
verde é o envelope. A barra mostra o controle RMS suavizado/escalado.
Os doze descritores abaixo são fontes públicas. Follow Detected Note,
sua análise tonal, controles antigos e laboratório foram removidos após
resultados musicais pouco confiáveis. Modos de mapeamento não suportados são
descartados ao carregar; bindings válidos são preservados. BPM/SYNC do Live continua.

### Detectores de áudio integrados

Doze cartões expõem fontes normalizadas `0..1` para mapeamento imediato:

- `sensor.audio.transient` — quanta energia do quadro inteiro é nova.
- `sensor.audio.kick` — uma subida que aconteceu entre 35 e 100 Hz.
- `sensor.audio.snare` — uma subida que aconteceu entre 1,5 e 8 kHz.
- `sensor.audio.brightness` — centroide espectral do escuro ao brilhante, normalizado em escala logarítmica.

- `sensor.audio.centroid` — centro espectral ponderado por magnitude; leitura em Hz, mapeamento = Hz / 20000.
- `sensor.audio.flux` — mudança de forma espectral (metade da distância L1 entre magnitudes normalizadas); mudar apenas o ganho não aumenta o fluxo.
- `sensor.audio.flatness` — média geométrica/aritmética da potência: tonal perto de 0, ruidoso perto de 1.
- `sensor.audio.spread` — desvio padrão espectral ponderado por magnitude; leitura em Hz, mapeamento = Hz / 10000.
- `sensor.audio.rolloff` — frequência que contém 95% da potência espectral; leitura em Hz, mapeamento = Hz / 20000.
- `sensor.audio.low`, `sensor.audio.mid`, `sensor.audio.high` — loudness ponderado K (ITU-R BS.1770-4) nas bandas 20–250, 250–2000 e 2000–20000 Hz, mapeado para `0..1` de −50 LU a −5 LU em relação ao fundo de escala digital da entrada. Cada banda aplica a ponderação K por bin (high-shelf + high-pass RLB) e um integrador momentâneo de 400 ms sobre a potência ponderada K. `sensor.audio.flatness` usa entropia de Wiener em dB: tonal → 0 (−60 dB), ruidoso → 1 (0 dB).

As oito novas medidas usam centros de bins de 20 Hz até min(20 kHz, Nyquist), sem DC. As bandas não se sobrepõem; bins na fronteira pertencem à banda superior. Silêncio digital zera as oito medidas; reiniciar também zera o histórico do fluxo. Brilho preserva o centroide logarítmico ponderado por potência de 100–12000 Hz: é relacionado ao novo centroide por magnitude, mas não idêntico.

**Cor e identificação:** cada grupo tem sua cor — Ataques vermelho, Timbre âmbar, Textura violeta, Bandas ciano — usada no título e nos knobs. Seus três descritores usam tons claro, médio e escuro, iguais na amostra do cartão, na legenda e na curva contínua. As doze marcas superam contraste de 3:1 contra o fundo do gráfico. O tom identifica o descritor, não sua intensidade. A distinção dentro do grupo depende dos nomes e dos botões da legenda, não só da cor: oculte outras curvas se uma sobreposição ou diferença de visão de cores dificultar a leitura. O limiar tracejado do gate em Amplitude continua sendo uma referência, não um descritor.

**Controles dos detectores:** os knobs usam o mesmo corpo radial e ponteiro retangular da MIX, com a cor do grupo no foco e no arraste. Arraste verticalmente, use as setas com o controle focado ou dê um duplo clique para voltar ao padrão. Em Tudo, a faixa quebra em linhas pelo conteúdo no desktop; em telas baixas, deslize-a horizontalmente para alcançar todos os knobs e JANELA. O gráfico ocupa a altura restante, sem uma linha reservada para controles aposentados.

**Organização e gráfico:** os doze cartões ficam visíveis ao mesmo tempo, agrupados em Ataques, Timbre, Textura e Bandas. Um único controle acima do gráfico escolhe o que o histórico de 2,5 segundos desenha: Amplitude, um grupo, ou Tudo, que desenha os doze juntos. Toque no nome colorido da legenda para ocultar ou exibir aquela curva. O gráfico normalizado se ajusta à curva mais alta em tela e mostra o teto usado, por exemplo `0–0,28`, para que um descritor discreto fique legível sem parecer mais forte do que é. A curva rola na taxa da tela em qualquer JANELA: entre dois quadros de análise a última leitura é mantida até a borda direita, por no máximo 120 ms, então uma janela larga parece contínua sem inventar valores que não foram medidos. Cartões em Hz continuam mapeando em 0..1 e o gráfico nunca mistura Hz com amplitude no mesmo eixo. Em telas de celular muito baixas a coluna de cartões rola, em vez de esconder um grupo.

**Janela de timbre:** os oito novos descritores usam janela Hann com o dobro do tamanho da janela de ataque, com sobreposição de 50%. A 48 kHz são 1024 amostras (21,3 ms de sinal), atualizadas a cada 512 amostras. Os valores ficam zerados até completar a primeira janela. O envio de ataques não espera uma janela adicional. Os buffers são reutilizados, sem fila de suavização ou timer por descritor. As bandas têm normalização da energia da janela, sem ganho automático.

**Como um ataque é decidido.** O Transiente compara a energia que subiu no
quadro com a energia que aquele quadro vinha carregando nos últimos ~300 ms,
passando por um joelho suave — assim uma pancada forte não gruda em `1.000` e a
dinâmica sobrevive. Kick e Snare fazem então uma segunda pergunta: quanto dessa
energia nova caiu na banda deles, comparado com a fatia que aquela banda
costuma ter. Banda que só recebeu a fatia de sempre não dispara. O conteúdo de
banda é lido de um espectro com janela Hann do mesmo tamanho da janela de
ataque, porque o vazamento de um grave forte fingiria um ataque numa banda
vazia; e uma banda mais de 30 dB abaixo do quadro é tratada como mascarada.

Kick e Snare continuam sendo heurísticas, não separação de fontes: qualquer
coisa que acrescente energia naquela banda vai movê-los. O limite honesto é a
resolução em frequência — na janela estreita, um corpo de caixa perto de 200 Hz
também move o Kick, porque bins de 46–94 Hz não distinguem os dois. Aumente a
JANELA e eles se separam.

Para modular de forma reativa, entre no MAP, selecione um cartão e vincule um parâmetro do synth. Comece com uma faixa de saída pequena e Smooth em zero. **Captura contínua** usa AudioWorklet independente da atualização da tela: janelas contíguas do tamanho escolhido em JANELA, 1024 amostras a 44,1/48 kHz por padrão. Os pulsos têm ataque imediato e o release que você definir. A janela padrão equivale a cerca de 21 ms a 48 kHz, e não à latência medida do microfone até o Live. Navegador, rede e escritas no Live também contribuem; confira o alinhamento usando sua entrada e seu synth reais.

**Captura compatível** significa que o worklet não estava disponível ou falhou. A análise continua por um analisador curto lido na atualização da tela; ataques muito curtos entre quadros podem escapar. Não considere esse fallback igualmente reativo. Se o Live demorar, o mapeamento mantém só o valor pendente mais recente por parâmetro; não garante alinhamento amostra a amostra nem preserva todos os ataques durante travamentos do navegador, rede ou host.

### Os knobs dos detectores

Os knobs planos com arco abaixo do gráfico ficam em quatro grupos identificados.
Tudo mostra quatro knobs de Ataques e dois de Timbre, Textura e Bandas; uma
visualização de família mostra só seus controles. JANELA tem uma barra separada.
Telas baixas rolam grupos inteiros na horizontal. Arrasto vertical, setas do
teclado e clique duplo para restaurar funcionam sem reiniciar o microfone.

Com **SYNC**, RELEASE e SUAVE escolhem notas de `1/128` até `1/1` no BPM do
Live, com opções retas, tercinas (**T**, ×2/3) e pontuadas (**D**, ×1,5),
ordenadas por duração. A 120 BPM, `1/128` vale 15,625 ms e `1/128 T` vale
10,4167 ms; a 240 BPM, esta última vale 5,2083 ms. Só o rótulo arredonda para
milissegundos inteiros; o processamento preserva frações abaixo de 10 ms.
`1/1` é uma nota inteira (um compasso em 4/4), não um compasso dependente da
fórmula de compasso. SUAVE também oferece **OFF**, com resposta imediata.
O valor mostra divisão e milissegundos efetivos; mudanças de BPM atualizam
processamento e leitura sem interromper o arrasto. RELEASE é uma constante
de decaimento exponencial, não uma duração rígida de nota; SUAVE é uma
constante de tempo de um polo, não quantização para o próximo beat.
Suavização longa deixa a modulação deliberadamente menos imediata.

**FREE** recupera os valores em milissegundos salvos separadamente, listados
abaixo. Na migração, tempos não nulos recebem a nota disponível mais próxima;
suavização zero continua OFF. Subdivisões salvas válidas são preservadas;
RELEASE novo de 45 ms escolhe a subdivisão mais próxima (1/64 D a 120 BPM).
O áudio não estima BPM; em SYNC, o relógio vem do Live.

Bandas são **loudness ponderado K (ITU-R BS.1770-4)** com integrador momentâneo de 400 ms, mapeado logaritmicamente para `0..1` (0 = −50 LU, 1 = −5 LU, relativos ao fundo de escala digital da entrada — não SPL). O pré-filtro K e o high-pass RLB são aplicados por bin, então uma banda aguda claramente audível que carrega pouca energia RMS deixa de ficar presa perto de zero. Flatness é mapeada em dB (entropia de Wiener): tonal → 0 (−60 dB), ruidoso → 1 (0 dB). O knob de bandas adiciona um offset de ±dB na mesma escala (ganho `×2` → +6 dB, `×0,5` → −6 dB) antes do clamp; ele não multiplica o valor unitário.

| Knob | Grupo | O que decide |
| --- | --- | --- |
| SENS | Ataques | Quanto de subida relativa à banda já vale meia escala (`0..1`, padrão `0.65`). Mais alto pega toque mais fraco e mais da sala. |
| RELEASE | Ataques | Constante de decaimento do pulso (FREE: `10..500 ms`, padrão `45`). SYNC usa divisões de nota. Curto mantém pancadas rápidas separadas; longo vira envelope de pad. |
| CURVA | Ataques | O expoente de resposta (`0.3..3`, padrão `1`). Abaixo de 1 levanta as pancadas médias; acima de 1 o pulso fica mais parecido com gate. Nenhuma das pontas se move. |
| SUAVE | Timbre, Textura, Bandas | Constante de tempo de um polo (FREE: `0..200 ms`, padrão `0`; SYNC: OFF ou divisões de nota). Acalma a curva sem mudar onde ela assenta. |
| GANHO | todos os grupos | O nível de saída do grupo, `×0,25..×8` em torno de 1. Para Ataques, Timbre e Textura o ganho multiplica o valor unitário. Para Bandas é um offset em dB sobre a escala de loudness ponderado K: `×2` soma +6 dB, `×0,5` subtrai 6 dB, `×1` é o ganho unitário. Centroide, Rolloff e Dispersão ficam de fora de qualquer ganho: são impressos em Hz, e escalá-los mostraria uma frequência que o sinal não tem. |
| JANELA | tudo | O tamanho da análise: `x1`, `x2` (padrão) ou `x4`, isto é 512, 1024 ou 2048 amostras a 44,1/48 kHz. Estreita reage antes; larga resolve os graves, que é o que separa um bumbo do corpo de uma caixa. |

Abaixo de 512 amostras não há opção: 256 mandaria mais que as 120 mensagens por
segundo que o caminho de controle aceita.

SENS e RELEASE são compartilhados por Transiente, Kick e Snare de propósito —
é a resposta de um instrumento só, e uma versão por detector de cada knob
viraria uma parede de controles numa superfície que se toca com a mão.

### Nível de ataque

`sensor.audio.attack` mede o pico numa janela de 35 ms após um onset,
normalizado em 0–1 numa faixa de 40 dB abaixo do maior pico da sessão.
Não identifica notas nem produz velocity MIDI. O primeiro pico não nulo
define a referência; parar/reiniciar captura a reinicia.
Para modulação mais imediata, use Transiente/Kick/Snare, sem essa janela de pico.

### Escutar uma track em vez do microfone

A extensão não consegue ouvir uma track do Live. O SDK de Extensions expõe
nomes de track, devices e parâmetros, e uma renderização offline do
arrangement — sem medidor, sem buffer, sem stream — então nada rodando dentro
da extensão consegue escutar áudio. Só um device dentro do caminho de áudio do
Live consegue.

O `RC-Audio-Sender.amxd` separado converte áudio da track em MIDI; ele não
alimenta o gráfico de descritores da AUD. Ponha o Sender v2 na track de áudio
e o Receiver v2 no destino MIDI. Habilite **Audio Sender input** apenas nos
Receivers desejados (OFF ao carregar). Eles usam barramento interno do Max,
sem UDP. Vários Receivers habilitados recebem as mesmas notas do Sender.
O Trigger Note do celular endereça o Receiver escolhido pelo SDK.
Troque devices antigos no Set; veja a
[migração v2](./SECURITY.pt-BR.md#devices-max--migração-para-v2).

O device usa a estimativa de frequência do `fzero~` e um gate periódico de pico
de amplitude, com nível mínimo de `0.015`. Ao contrário do detector do celular,
o `fzero~` não reporta clareza; por isso o caminho do Max não tem controle de
piso de clareza. O device gerado rejeita estimativas MIDI arredondadas fora de
`21..108` e exige que uma mudança de nota permaneça estável por `70 ms` antes de
enviá-la.

> **O aceite em campo do v2 está pendente.** Os testes anteriores de F3/estéreo
> usavam os devices UDP. Confirme carregamento, destino, notas/OFF e latência
> medida antes do uso. Testes de fonte não comprovam esses resultados.

### Console de performance da VID

Abra a **VID** com o celular na horizontal. A prévia da câmera fica à esquerda,
os três cartões de pose aprendida ficam lado a lado, e a faixa de sinal direto
fica embaixo. Toque em **Câmera** para liberar o acesso. O sistema de visão é
de **uma mão só**, por decisão de projeto: ele rastreia uma mão na frente do
celular.

Se o acesso à câmera falhar, o erro fica dentro da prévia. Resolva a permissão
ou a câmera ocupada que ele apontou e toque em **Câmera** de novo; não precisa
recarregar a página.

O rastreio de mãos por câmera carrega o runtime e os arquivos de modelo do
MediaPipe Hands que vêm junto com a extensão. Funciona numa rede local
totalmente offline, depois que a extensão está instalada.

Valores de saída:

- `sensor.vision.x`, `sensor.vision.y` — posição horizontal e vertical da palma,
  em coordenadas normalizadas de imagem
- `sensor.vision.z` — profundidade normalizada pelo tamanho da palma: sobe
  conforme a mão chega perto da câmera. É um sinal direto de performance, não um
  espaço 3D calibrado nem simulado.
- `sensor.vision.fist`, `sensor.vision.pinch`, `sensor.vision.victory`,
  `sensor.vision.open` — canais de gesto
- `sensor.vision.rotateVal` (**Victory Rotate**) — rotação contínua do punho,
  neutra em `0.5`, ao vivo só enquanto o Victory está segurado
- `sensor.vision.pinch_x`, `sensor.vision.pinch_y`, `sensor.vision.pinch_z`
  (**Pinch Clutch X / Y / Z**) — três eixos contínuos de clutch
- `sensor.vision.gesture.1`, `.2`, `.3` — canais de pose estática aprendida

Faça a pinça para engatar o clutch, mova a mão para conduzir X/Y/Z, e solte. Os
eixos ficam onde foram deixados, então a próxima pinça continua daquela posição
em vez de pular de volta. Esses eixos de clutch estão sempre ao vivo e não
exigem o detector de pinça ligado.

Para uma pinça relaxada, vire a palma para a câmera, aproxime as pontas do
polegar e do indicador e mantenha os outros três dedos parcialmente estendidos.
As pontas não precisam se sobrepor, nem o indicador formar um círculo fechado.
A margem acompanha o tamanho aparente da palma; abrir os dedos solta o clutch.
Dorso da mão, punho fechado e indicador reto apontando não recebem essa
tolerância extra. O reconhecimento real ainda depende do rastreamento da câmera.

Só sinais intencionais de performance são mapeáveis: **X/Y/Z** direto, o Pinch
Clutch **X/Y/Z**, os quatro detectores opcionais, a rotação do Victory, e os
três slots de pose aprendida. **PALM** e **FACE** seguem como diagnóstico local
da câmera, na prévia. Contagem de dedos, landmarks individuais e leituras de
cor do quadro inteiro são diagnóstico interno e não são canais de mapeamento.

Quando a mão ou a câmera some, todo canal de visão exposto reporta perda de
sinal pelo mesmo catálogo; a política de perda segura de cada mapeamento decide
então se o destino no Live segura, centraliza, estaciona ou solta.

### Poses estáticas aprendidas

Cada um dos três slots aprendidos guarda uma forma de mão estática:

1. Segure a forma de mão desejada e toque **CAPTURAR POSE** três vezes,
   mudando um pouco de posição ou de distância entre os exemplos.
2. Mantenha a mão parada durante cada captura automática, que é rápida.
3. Toque **TESTE** e mostre a pose de novo. O reconhecimento tolera variação
   normal de posição na tela, distância da mão, landmarks de profundidade e um
   pequeno ângulo de punho. Ele é específico por mão: aprenda a pose com a mão
   que vai usar na performance, porque a outra mão é uma forma espelhada e não
   casa.
4. Use **APAGAR ÚLTIMA** para trocar só o exemplo mais novo, ou **LIMPAR** para
   treinar o slot do zero.

O preset de reconhecimento **Equilibrado** é o ajuste normal de performance.
**Precisão** rejeita mais variação; **Flexível** aceita mais. Um slot aprendido
é momentâneo (`0` ou `1`), sobrevive a recarregar a página, e só rearma depois
que a pose é desfeita. Poses salvas no antigo formato espacial mostram
**RECAPTURA NECESSÁRIA** em vez de serem tratadas como utilizáveis.

---

## 13. Referência rápida

### Faixa vertical por controle

Todo controle vertical do app usa uma faixa de arrasto de **150 px**, de `0` a
`1`. Isso é de propósito: com todos os controles na mesma escala física, a
memória muscular vale para a superfície inteira.

### Resumo dos modos

| Modo | Ativação | Arrasto vertical | Arrasto horizontal |
| ---- | -------- | ---------------- | ------------------ |
| A | enquanto segura | escala o valor 0..1 | sem efeito horizontal |
| B | o toque trava | escala, zero = desliga | mantém travado |
| C | o toque alterna | remodula o valor | sem efeito horizontal |
| D | burst no toque | pico (0.15..1) | sem efeito horizontal |

Em `SYNC`, o modo D tira a duração dos Ajustes de Deep Sync, em vez do envelope
fixo de 520 ms, e vale igual para pads, LFOs e stutters — veja
[§ 2](#2-modos-de-pad-a--b--c--d).

### Nomes de controle (para mapear)

```
pad-1 .. pad-12
knob-1 .. knob-8
fader-1 .. fader-8
xy-1.x, xy-1.y, xy-2.x, xy-2.y
toggle-1 .. toggle-4    (LFOs)
button-1 .. button-4    (stutters)
sensor.motion.{ax,ay,az,gx,gy,gz}
sensor.orient.{alpha,beta,gamma}
sensor.audio.{rms,envelope,gate,attack}
sensor.audio.{transient,kick,snare,brightness,centroid,flux,flatness,
              spread,rolloff,low,mid,high}
sensor.vision.{x,y,z,fist,pinch,victory,rotateVal,open,
               pinch_x,pinch_y,pinch_z,gesture.1,gesture.2,gesture.3}
```

---

## 14. Colinha de gestos

- **Toque** — pressão momentânea (padrão do modo A).
- **Toque longo** — igual ao toque; não tem ação separada.
- **Arrastar para cima** — aumenta o valor (profundidade, taxa, contagem etc).
- **Arrastar para baixo** — diminui o valor. Chegar ao fim da faixa manda `0`.
- **Arrastar na horizontal num stutter** — muda a velocidade; na vertical, a amplitude.
- **Arrastar na horizontal num LFO** — muda a taxa de modulação.

---

## 15. Diagnóstico

| Sintoma | Solução |
| ------- | ------- |
| O celular não conecta | Veja o [`INSTALL.pt-BR.md`](./INSTALL.pt-BR.md) — confira Wi-Fi, IP e o aviso de certificado. |
| Valores de sensor travados ou errados | Aperte **CALIBRAR** com o aparelho numa superfície estável. |
| LFOs fora de sincronia com o Live | Aperte **SYNC** para travar de novo no BPM do Live. |
| A lista de destinos do MAP parece desatualizada | Aperte **Refresh** no modo MAP, depois de adicionar ou remover devices no Live. |
| O Trigger Note não consegue adicionar o device | Coloque o `RC-Midi-Receiver.amxd` à mão na track MIDI e tente de novo. |
| Detecções de ataque indesejadas | Reduza **SENS** em Ataques e confira a entrada; Kick/Snare são heurísticas, não separação de bateria. |
| A resposta do áudio parece lenta | Confira RELEASE/SUAVE, use SUAVE OFF e JANELA menor; meça separadamente a resposta do conjunto. |
| O toque parece lento | Use rede cabeada, ou fique mais perto do ponto de acesso Wi-Fi. |
| Os indicadores de estado do celular parecem estranhos | Recarregue o navegador do celular; a sessão reinicia limpa. |

Para problemas mais complexos de instalação (certificados, rede, instalação), veja
o [`INSTALL.pt-BR.md`](./INSTALL.pt-BR.md) e o
[`FAQ.pt-BR.md`](./FAQ.pt-BR.md).



