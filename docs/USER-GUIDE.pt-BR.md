# RC Surface — Guia do usuário

Tudo o que quem toca precisa para operar o controlador no celular durante
montagem, passagem de som e apresentação. Leia uma vez antes de tocar um set.

> **Escopo**: o cliente do celular (`/phone-v3/`) é a superfície principal. O
> painel do Ableton e o painel administrativo estão cobertos à parte, no
> [`CUSTOMIZATION.pt-BR.md`](./CUSTOMIZATION.pt-BR.md).
> O RC Surface 2.0 suporta um controlador por vez: opere a performance pelo celular ou desktop, nunca ambos simultaneamente.

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

A interface do celular é uma página só, com sete abas. Troque pelos botões da
faixa de cima:

| Aba | O que faz |
| --- | --------- |
| PERF | Performance: pads, XY, LFOs, squares, atalhos UTIL |
| MIX | Oito knobs e oito faders, para o mixer |
| SNP | Snapshots: 8 slots de captura, com morph entre eles |
| SNS | Sensores: leitura ao vivo de movimento e orientação |
| AUD | Microfone e as entradas de análise de áudio |
| VID | Câmera, rastreio de mãos e poses estáticas aprendidas |
| REC | Marcadores/Loop/pré-roll do Arrangement ou CLIP vazio da Session |

A faixa de cima também tem o modos **MAP / AUT / CFG**, perto do indicador de BPM, e mais
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

O modo escolhido vale para **os 12 pads** (`pad-1`..`pad-12`), **os oito slots LFO** (`toggle-1`..`toggle-8`, `T1`..`T8`). O modo é compartilhado: você
escolhe uma vez e todos os controles seguem a mesma regra.

### Modo A — Momentâneo (padrão)

- O toque manda um valor diferente de zero; soltar manda zero.
- Arraste **na vertical** para escalar o valor de `0` (ponto de soltura) até
  `1` (150 px acima do início do toque). É a mesma faixa que knobs, faders,
  LFOs e squares usam.
- Melhor para: hits de percussão, one-shots, efeitos momentâneos.

### Modo B — Hold

- O toque trava o controle **ligado**; soltar sem arrastar volta a
  desligá-lo. Qualquer movimento, vertical ou horizontal, mantém segurado até
  você arrastar o valor de volta a zero de propósito.
- Para squares especificamente (veja [§ 4](#4-square-pulse)): um toque
  desliga; soltar com amplitude abaixo de `0.02` também desliga. Arrastar a
  velocidade na horizontal mantém o square ligado enquanto há amplitude.
- Melhor para: LFOs travados que seguem modulando depois de soltar, varreduras
  de square sustentadas, pads que você quer deixar soando.

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
LFO ou square abre a profundidade no attack e fecha no release. Em `FREE` o
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

## 3. Oito toggles (T1–T8)

Os oito slots (`toggle-1`..`toggle-8`) usam o mesmo componente e começam em
**Global** para onda, modo e tempo. No CFG, escolha **Sine, Triangle, Ramp Up,
Ramp Down ou Square**, em qualquer combinação. Um título TOGGLES centralizado
agrupa T1–T4 acima de T5–T8. Cada slot mostra um rótulo curto da onda e seu modo
efetivo A/B/C/D.

As cores de ativação seguem os pads: A azul, B âmbar, C verde e D rosa.
A onda não introduz uma segunda paleta. Arraste horizontalmente para velocidade
e verticalmente para amplitude; esses valores saíram do CFG. A para ao soltar,
B mantém um ajuste arrastado, C alterna e D executa um burst. Duração/ataque do
burst e snapshots continuam disponíveis.

O CFG fica compacto: onda, modo, tempo e seletor de subdivisão em SYNC. Só
oferece ritmos válidos para o BPM e a onda atuais; Square também considera
ratchet e swing. Pins antigos fora do teto mostram o ritmo efetivamente limitado.
FREE oculta a subdivisão. Abra **Avançado** para fase e swing/ratchet da Square.
O corpo do menu rola dentro dos limites da tela.

Salvar e carregar projeto/preset/snapshot preserva a herança Global; isso não
vira um modo A ou Sine fixo. Uma escolha local afeta apenas aquele slot.
Restaurar padrões globais remove os overrides.

Tetos conservadores do gerador: senoide 4 Hz, triângulo/rampas 3 Hz, pulso
Square 15 Hz incluindo ratchet. São limites de software, sem garantia de
fidelidade física medida no Live.

## 4. Pulso Square

Square agora alterna entre **0 e a amplitude escolhida**: com 50% de amplitude,
alterna 0%/50%, em vez dos 25%/75% da antiga Square centrada. Ela inclui swing
e ratchet (1–4) do antigo Stutter, que deixa de existir como onda ou controle
separado. O pulso não grava nem repete áudio; o efeito musical depende do destino
mapeado. Qualquer T1–T8 pode usar Square.

O indicador local acompanha o gate real, com uma régua fina de valor. É uma
prévia, sem confirmação de entrega ao Live; a tela pode perder pulsos rápidos.
Trocar de/para Square interrompe o algoritmo anterior antes do próximo toque.

2.0.0 usa schema 2 no payload de performance e chaves novas de navegador.
Overrides e snapshots do primeiro candidato 2.0.0 não são importados, evitando
restaurar o modo A fixado e a onda Stutter retirada. Arquivos existentes ficam
intactos; configure este candidato do zero.

## 5. Atalhos PERF UTIL

A aba PERF tem um bloco `UTIL` compacto, para ações que você precisa durante um
set sem sair da superfície de performance.

- **CAP** arma a captura de snapshot direto da página PERF.
- **1-4** recuperam os slots de snapshot 1 a 4.
- **CAP + 1-4** salva o estado atual de performance naquele slot.
- **OFF** cancela o morph de snapshot em andamento, desliga pads, LFOs e
  squares, e devolve os XY pads ao centro. Não mexe nos knobs e faders da MIX,
  nem em sensores, áudio, visão ou transporte.

---

## 6. Painéis XY

XY1 e XY2 têm controles idênticos. Abra CFG no painel desejado e escolha
Estático ou Física. Estático fica onde você solta. Física continua em movimento
e ricocheteia; atrito (0,002–0,05), ricochete (0–0,95) e velocidade (0,1–4×)
são independentes em cada painel. Ambos começam Estáticos; qualquer combinação
é possível. Velocidade escala o movimento livre; atrito controla a desaceleração.
Trocar para Estático interrompe o movimento residual. Consultar CFG não emite valor.

Cada eixo é mapeado separadamente como `xy-1.x/y` ou `xy-2.x/y`. Setters de
posição e OFF interrompem o movimento; OFF centraliza os dois. Configuração
segue nos novos projetos, presets e snapshots de performance. `xy-N.friction`,
`.bounce` e `.speed` também são setters numéricos locais; os mappings para
destinos do Live continuam sendo os eixos X/Y.

---

## 7. Controles da barra superior

Três botões na faixa de cima, presentes em todas as páginas.

### SYNC

Alterna o clock de BPM entre **SYNC** (travado no Live) e **FREE** (interno).

- **SYNC** (ciano): as taxas de LFO e square ficam quantizadas ao BPM do Live,
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
> antes de entrar no modo palco. Quando a tela cheia cai desse jeito, o modo
> palco agora sai junto, em vez de deixar um botão **SAIR** numa página que já
> não está em tela cheia.

---

## 8. Modo MAP — mapeamento pelo celular

Toque **MAP**, perto do indicador de BPM, para entrar no modo de mapeamento
pelo celular. Isso não abre outra página no navegador; ele sobrepõe um fluxo de
mapeamento em cima do controlador de verdade, para você escolher o controle que
já está usando.

### Escolher um controle

Com o modo MAP ativo, os controles mapeáveis da página visível ficam
selecionáveis, com contorno e rótulo azuis. Isso inclui:

- Controles da PERF: pads, XY pads, LFOs, squares.
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

1. Escolha um pad, LFO, square, eixo de XY, knob ou fader no modo MAP.
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

Este candidato também passa MIDI upstream byte a byte por **midiin → midiout**,
separado dos gates SDK/Audio Sender e do caminho Panic/flush dessas notas.
Canais, Note-Off, velocity e controllers do teclado conservam os bytes originais.
Substitua a instância já aberta pelo `RC-Midi-Receiver.amxd` deste candidato;
atualizar a extensão não troca devices dentro do Set. Teste teclado e notas
geradas no Live antes da performance.

Vários controles podem disparar notas na mesma track MIDI. Notas diferentes são
tratadas como destinos de trigger diferentes.

### Modo Trigger Note (`trigger_note`)

Ao mapear um controle para disparar notas em uma track MIDI com o dispositivo `RcReceiver v2`, defina o modo do destino como `trigger_note`. O editor exibe uma interface contextual dedicada para acordes e notas musicais:

- **Destino e Troca de Track:** Exibe o nome da track MIDI de destino e o selo de status do dispositivo `RcReceiver v2`. Toque em **[TROCAR]** para mudar a track de destino preservando as configurações de nota, velocity e tempo já feitas.
- **Nota e Oitava:** Escolha a nota (C a B) e a oitava (-2 a 8). O editor calcula o número MIDI padrão (C-2 = 0, C2 = 48, G8 = 127). Notas acima de G8 (MIDI 128+) são rejeitadas.
- **Velocity:** Ajuste a intensidade da nota MIDI (1 a 127, padrão 100).
- **Tempo:**
  - `immediate` (Agora): Dispara a nota imediatamente ao reconhecer o gesto.
  - `beat` (Próx. Tempo): Quantiza o Note-On para o próximo tempo musical (semínima) com base na posição OSC fresca do transporte.
  - `bar` (Compasso): Quantiza o Note-On para o próximo início de compasso.
- **Gate:**
  - `pulse` (Curta): Dura pela fração musical escolhida. Notas sincronizadas novas usam **1/4 de compasso** por padrão; opções: 1/16, 1/8, 1/4, 1/2, 1, 2 ou 4 compassos. Também é possível escolher milissegundos livres (20–2000 ms). Mapeamentos antigos preservam seus milissegundos.
  - `hold` (Enquanto Pressionado): Sustenta a nota enquanto o gesto ou controle estiver sendo segurado.
  - *Restrição:* `hold` é incompatível com tempo sincronizado (`beat` ou `bar`). Ao escolher tempo sincronizado, o gate é automaticamente forçado para `pulse`.
- **Organização do editor:** Destino aparece uma vez, seguido de Nota (nota, oitava, número MIDI e velocity fixo) e Disparo (quando tocar e por quanto tempo). Sair de Agora para Próx. Tempo ou Compasso abre Musical, 1/4 de compasso automaticamente, inclusive após Enquanto Pressionado. Escolha ms explicitamente para duração livre; presets antigos em milissegundos permanecem intactos ao abrir.
- **Duração musical:** Disponível com Curta em Agora, Próx. Tempo e Compasso. Clique diretamente na fração, sem lista ou estimativa em ms. Agora começa imediatamente e usa o BPM/compasso conectado do Live para desligar a nota, inclusive com o transporte parado. Metadados musicais desconhecidos ou desconectados bloqueiam a nota com feedback; ms continua disponível. Enquanto Pressionado segue a soltura real do gesto, sem duração fixa.
- **Avançado:** Recolhido por padrão; contém limiar de disparo e comportamento real de perda de sinal. Bind e Trigger Note são escolhidos na entrada, sem repetir o seletor de modo aqui. Presets ficam recolhidos; Bind, Trigger Note, Desfazer o bind, Limpar o controle e Limpar todos os mapeamentos ficam logo abaixo do título do controle e acessíveis durante a rolagem. Vários mapeamentos formam um bloco identificado, com tipo Bind/Trigger Note e destino em cada linha selecionável. Só feedback de nota com conteúdo aparece.
- **Bind:** Botões diretos de Contínuo/Alternar e Linear/Exp/Log/S precedem o gráfico interativo ocupando a largura disponível. Saída mínima/máxima, Drive, Compressão e Suavização são os faders principais. Os três pontos do gráfico seguem a saída efetiva após Drive e Compressão; saída mínima/máxima continuam sendo os limites usados para escalar essa resposta. Arrastar um ponto considera essas configurações, e uma resposta saturada ou plana mantém os valores limitados. Entrada mínima/máxima, escala do alvo, retomada, perda de sinal, valor inativo e neutro ficam em Avançado. Alças menores conservam área de interação maior e reset por duplo clique.
- **Ciclo Seguro e Cancelamento:** Notas Próx. Tempo/Compasso ainda não enviadas são canceladas ao parar o transporte, mudar fórmula, saltar em seek/loop, detectar OSC desatualizado (>1000 ms), remover bind ou perder conexão. Uma nota Próx. Tempo/Compasso que já está soando é desligada ao parar o transporte, perder o relógio, remover bind ou perder conexão; depois de seek, salto de loop ou mudança de fórmula, ela termina no próprio Note-Off. Notas Agora não dependem do transporte: Curta termina no próprio Note-Off e Enquanto Pressionado quando o gesto ou controle é solto; remover bind ou perder conexão as desliga antes. Eventos mais de 20 ms atrasados são descartados. Na mesma track, uma nota nova aposenta o timer e envia o OFF anterior antes de seu ON, recebendo a duração integral. O limite é 64 tracks ativas.

### Launch Clip (`clip_launch`)

Use **Launch Clip** quando um controle — normalmente uma pose aprendida G1,
G2 ou G3 — deve pedir ao Live um clip da Session que já está no seu Set. Tudo
é configurado pelo MAP: sem loopMIDI, sem track auxiliar e sem mapeamento por
Ctrl+M. O Launch Clip precisa do AbletonOSC (veja o
[INSTALL](INSTALL.pt-BR.md)); o SDK de Extensions lista tracks e clips, mas
não lança clips.

1. Selecione o controle no MAP e toque em **Launch Clip**.
2. Escolha a track. Só aparecem tracks comuns que têm clips, com os nomes
   reais; tracks de grupo ficam de fora, porque lançar o slot de um grupo
   dispara uma linha inteira.
3. Escolha o clip (número do slot e nome real do clip).

Após criar, renomear ou apagar tracks/clips no Live, toque em **Atualizar**
no cabeçalho do picker. Bind, Trigger Note e os dois pickers de Launch Clip
têm esse botão; filtro e track escolhida são mantidos quando disponíveis.
Se salvar falhar, o picker de Launch Clip continua aberto e mostra o erro
para você tentar novamente.

**Escolha** — uma por mapeamento:

- **Lançar clip** (padrão): cada ativação pede aquele clip. Manter a pose não
  repete, soltar deixa o clip tocando e outra pose escolhe outro clip direto,
  sem pose neutra no meio. Se o Live já tem aquele clip aguardando ou
  tocando, nada é enviado.
- **Avançar lista**: de 2 a 8 clips da mesma track. Cada nova ativação pede o
  clip seguinte ao que o Live está tocando e volta ao primeiro no fim. Só um
  avanço por entrada quantizada: enquanto o clip pedido ainda aguarda no
  Live, novas ativações não avançam de novo.
- **Parar track**: o stop da track do Live, quantizado pelo Live. Também
  cancela um lançamento que ainda aguarda naquela track.

A **quantização** é sempre a do Live: a quantização de lançamento do próprio
clip, ou a da música quando o clip está em Global. O editor mostra o valor
efetivo separado de **Quantização global do Set**. Escolha um valor global
e toque **Aplicar** para alterar o Set inteiro, incluindo outros clips em
Global. Um clip com quantização própria mantém esse ajuste. Nenhuma é
permitida para o Set, mas regras de continuação ainda exigem quantum utilizável.

O editor espera o Live confirmar o valor solicitado (até dois segundos),
mantém o valor observado visível durante a espera e mostra desconexão ou
falha. Nunca tenta de novo nem reaplica o valor ao reconectar, abrir um editor
ou carregar mapping/preset. Salve o Set no Live para persistir o ajuste.

O **estado** vem só do que o Live informa: Pronto, Enviado — aguardando o
Live, Aguardando no Live (próximo limite), Tocando, Parada aguardando no
Live, Track parada, Sem confirmação do Live, AbletonOSC desconectado, Destino
ausente, Mais de um candidato e um estado de bloqueio quando o Live e o
AbletonOSC listam as tracks de forma diferente. Enviar uma mensagem nunca
aparece como reprodução. **Testar** executa uma ativação com as mesmas regras
do gesto.

Ausência confirmada da mão solta a pose aprendida e rearma sua borda; o clip
e o retorno RC continuam tocando. Recuperar exige uma nova entrada estável.
Desconectar/reconectar o celular nunca reenvia nada. Pequenas oscilações são filtradas pelo reconhecedor de poses e,
além disso, um pedido que o Live já recebeu não é repetido.

Mudar de ideia antes do limite (por exemplo G2 e logo depois G1 com a Base
tocando): a API não tem "cancelar lançamento", então pedir a Base de novo
substitui o clip que aguardava e, como documentado na API do Live, reinicia a
Base no limite.

**Depois que entra** — só no modo Lançar clip, separado da escolha:

- **Deixar o Live decidir** (padrão): o clip repete, ou a Follow Action nativa
  do Live assume.
- **RC: ir para clip** após N passagens (1 a 8), por exemplo Virada → Base
  depois de uma passagem.
- **RC: parar track** após N passagens.

Estas são regras do RC Surface. Elas não leem nem alteram as Follow Actions
do Live, que nenhuma API disponível expõe. Se o clip também tiver uma Follow
Action nativa, as duas agem: use uma ou outra.

Como a regra conta: com start marker S, início do loop A, fim do loop E e end
marker F, a primeira passagem dura `E − S` e cada passagem seguinte `E − A`,
então N passagens duram `T = (E − S) + (N − 1)(E − A)`. Um clip sem loop
toca uma vez (`T = F − S`, N precisa ser 1). A regra espera o Live confirmar
que o clip está tocando, acompanha a posição do clip informada pelo Live e
entrega o próximo pedido ao Live dentro do último quantum antes de `T`; a
quantização continua sendo do Live. O editor mostra a previsão: o retorno
entra no fim da passagem N, ou o clip toca alguns tempos a mais (clip em
loop), ou há alguns tempos de silêncio (clip sem loop).

A regra é recusada quando a quantização do Live é None, o quantum é curto
demais no andamento atual (janela menor que 250 ms), o clip está com Legato
ou com modo de lançamento diferente de Trigger, o clip é áudio sem warp, ou
um clip sem loop recebe mais de uma passagem. A regra é cancelada — e nunca
reenviada — quando outro clip é escolhido na track (pelo RC Surface ou no
Live), a track ou o transporte param, o mapeamento é removido ou alterado, o
link do AbletonOSC cai, ou as atualizações de posição não provam quantas
passagens tocaram (ela não chuta). Uma desconexão do celular não cancela uma
regra armada. Se a janela passar com a regra ainda válida, o próximo pedido é
enviado uma vez e marcado como **Retorno atrasado**.

Alterar a quantização global, aqui ou no Live, cancela toda continuação RC
ainda não enviada assim que a mudança é observada. Durante uma escrita RC
pendente, retornos e novas regras ficam suspensos; falha ou timeout cancela
as regras suspensas. Para uma nova regra, pare ou escolha outro clip, depois
ative novamente para obter um novo lançamento. Um retorno
já enviado continua sob controle do Live; o RC Surface não pode desfazer
esse pedido enfileirado. Receber o mesmo valor global não cancela uma regra.

A precisão do retorno é uma hipótese ainda em validação no Live 12, não uma
garantia. Quando o tempo exato importa mais que o gesto, configure a Follow
Action no Live e escolha Deixar o Live decidir.

Os **destinos** são guardados pelo nome da track e do clip, mais a identidade
do Live na sessão aberta. Reordenar tracks ou cenas mantém o mesmo clip. Um
clip renomeado, apagado ou duplicado não é lançado: o editor pede para
escolher de novo. Um slot vazio nunca é disparado. Mapeamentos, presets,
exportação e importação mantêm os alvos de Launch Clip e os reassociam pelo
nome quando um Set é reaberto.

Limites da API, em resumo: o SDK de Extensions não lança clips; o Live não
oferece chamada para cancelar um lançamento na fila (só um stop ou outro
lançamento); lançar um clip que já toca o reinicia; o AbletonOSC endereça
tracks e clips por índice e não devolve erros, então o RC Surface confere o
destino antes de cada pedido e só confia nos estados que o próprio Live
informa.

### Campos do editor de mapeamento

Cada destino mapeado pode ser ajustado pelo celular:

| Campo | Significado |
| ----- | ----------- |
| Mode | `continuous`, `toggle` ou `trigger_note`. No modo `trigger_note`, os sliders contínuos (curva, faixas in/out, drive, comp, smooth) ficam ocultos, mas seus valores são preservados se você alternar de volta. |
| Curve | `linear`, `exponential`, `logarithmic`, ou `s-curve`. |
| Target scale | `Auto` mantém mixer e andamento lineares e usa percurso geométrico para faixas de frequência largas e positivas que ele reconhece; `Linear` ou `Geometric` explícitos passam por cima do Auto, quando o destino permite. |
| In Min / In Max | A faixa de entrada lida do controle do celular. |
| Out Min / Out Max | A faixa de saída mandada para o destino no Live. |
| Drive | Empurra a curva de resposta para cima ou para baixo. |
| Comp | Comprime ou expande o meio da curva de resposta. |
| Smooth | Acrescenta suavização, para reduzir saltos bruscos de valor. |
| Threshold | Limiar, para os modos não contínuos. |
| MIDI Note | Pitch e oitava, para mapeamentos de trigger note fixa (C-2 a G8). |
| Velocity | Velocity MIDI para trigger note fixa (1 a 127). |
| Timing | Quantização do agendamento da nota (`immediate`, `beat`, `bar`). |
| Gate | Duração da nota (`pulse` com duração configurável, ou `hold`). |

O canvas de curva mostra a forma de resposta atual e um ponto em movimento com
a entrada e a saída ao vivo do controle escolhido no modo contínuo.
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

Toque em CFG e no controle (ou clique direito no desktop). Os oito LFOs oferecem
os mesmos ajustes de onda/modo/ritmo; Square acrescenta swing e ratchet.
Os dois XY oferecem Estático/Física; atrito, ricochete e velocidade aparecem só
em Física. Trocar para Estático preserva esses ajustes para depois. Pads mantêm
A/B/C/D; knobs, alcance do gesto; faders, valor de reset. Reset remove o override
daquele controle; segurar CFG lista overrides e oferece Limpar todos. Esc ou toque
fora fecha o menu.

Onda, modo e tempo usam botões diretos, sem dropdowns; escolher mantém o editor
aberto. Em SYNC, expanda Subdivisão para escolher Global, Auto ou valor da nota
com Reta/Pontuada/Tercina. Só aparecem combinações suportadas pela onda efetiva,
BPM, swing e ratchet, inclusive quando a onda herda Global. FREE oculta essa
seção. Avançado começa recolhido. Os valores dos toggles animam toda a largura
com a cor do modo A/B/C/D.

Cada pad mostra os ajustes do seu modo efetivo, inclusive quando herda Global:

- A: nível ao tocar, curso do arrasto (40–400 px) e resposta Linear/Fina/Rápida; soltar continua enviando zero.
- B: curso/resposta e Manter valor ou Zerar num toque sem arrasto. Toque cancelado não zera o latch.
- C: curso/resposta e Lembrar último ou nível Fixo ao ligar. Outro toque continua desligando para zero.
- D: tempo Global/SYNC/FREE, duração musical ou 40–10000 ms, proporção de ataque e pico. Duração/ataque efetivos aparecem; o piso de transmissão continua um frame de 30 Hz. Ajustes valem no próximo gesto.

Fina dá precisão a movimentos pequenos; Rápida alcança mudanças maiores antes.
Esses níveis controlam o sinal mapeado, não a velocity da nota MIDI. Threshold e
velocity de Trigger Note continuam no MAP. Trocar o modo solta o estado anterior
com segurança. Ajustes individuais entram no perfil de performance e snapshots.
Segundo clique direito no mesmo controle fecha o CFG; em outro, troca o editor.
Trocar onda, inclusive Square, mantém o toggle ativo sem novo toque; burst do modo
D conserva o fim original. Preenchimento usa transformações e evita reescrever
rótulos/rastros sem mudança; fluidez no dispositivo ainda exige teste físico.

Overrides do navegador usam `ableton-rc:v3:control_config`. Ajustes de LFO/XY
também são guardados na preferência de performance dos projetos e presets novos.
A configuração salva preserva a herança Global; carregar não transforma o modo
global em override por slot. Snapshot inclui configurações e valores atuais. Isso não salva o Set do Live.
Overrides de knob/fader continuam locais ao celular. Chaves e formatos de
performance anteriores não são carregados.

---

## 10. Aba SNP — snapshots e morph

A aba SNP captura o **estado de todos os controles de performance** num
instante, e deixa você interpolar entre os snapshots capturados.

### Slots

Oito slots, numerados de `1` a `8`. Slots vazios mostram `VAZIO`; os
preenchidos mostram o número do slot.

### Capturar

1. Deixe os controles (pads, XY, LFOs, squares, knobs, faders) no estado que
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

Essas subdivisões retas também aparecem na grade do square; LFOs têm sua própria
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
LFO, square, knob ou fader está mapeado no Live, o valor mapeado se move ao
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

Abra a **VID** com o celular na horizontal. A prévia da câmera ocupa o lado
esquerdo na altura toda da tela. Tudo o que você toca fica na coluna da
direita: os comandos da câmera (**Câmera**, **CONF**, **REC**), o banco rolável
de até quinze poses, os detectores integrados e as leituras de sinal direto. Num
tablet ou desktop os comandos ficam acima da prévia e as leituras ficam
embaixo, na largura toda. Toque em **Câmera** para liberar o acesso. O sistema de visão é
de **uma mão só**, por decisão de projeto: ele rastreia uma mão na frente do
celular.

Se o acesso à câmera falhar, o erro fica dentro da prévia. Resolva a permissão
ou a câmera ocupada que ele apontou e toque em **Câmera** de novo; não precisa
recarregar a página.

O rastreio de mãos por câmera carrega o runtime e os arquivos de modelo do
MediaPipe Hands que vêm junto com a extensão. Funciona numa rede local
totalmente offline, depois que a extensão está instalada.

No celular ou tablet, a prévia é a imagem ao vivo da câmera, sem a mão
desenhada por cima, e o rastreio de mãos roda num worker em segundo plano
quando o navegador permite (Web Worker com `OffscreenCanvas`), então a
inferência deixa de travar o resto da interface enquanto a câmera está ligada.
Num computador com mouse, a prévia mostra o quadro analisado com a mão
rastreada desenhada por cima, e o rastreio roda na página. No painel do Live,
**Latência do MediaPipe** mostra `worker` ou `thread principal` ao lado do
tempo; um navegador sem suporte a worker, ou um worker que falhe, rastreia na
página.

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

A faixa inferior **MAP** oferece **X/Y/Z**, **PALM** (tamanho aparente da palma)
e **FACE** (palma versus dorso da mão, sem rastreamento de rosto). PALM mantém
a leitura bruta 0–1; FACE mostra −1–1 com sinal e mapeia em 0–1. Podem controlar
parâmetros, notas e clips pelas ações e thresholds do mapeador existente.
Pinch Clutch **X/Y/Z**, os quatro detectores opcionais, a rotação do Victory e
poses aprendidas continuam mapeáveis. Contagem de dedos, landmarks individuais
e cor do quadro inteiro continuam internos. Amostras PALM/FACE ausentes ou
inválidas informam perda e seguem o Safe loss de cada destino.

A ausência da mão preserva a pose aprendida ativa como **LAST KNOWN**. Um
candidato ainda não confirmado expira depois de `unknownGraceMs` (140 ms por
padrão); após uma ausência longa, precisa cumprir o hold completo para seu
primeiro ON. Eixos e detectores básicos informam perda imediatamente. G1–G15
informam perda somente após essa tolerância; cada mapping aplica Safe loss.
VID → ⚙ oferece três políticas para gates de notas G1–G15: **Manter sem limite**,
**Manter com prazo** e **Soltar na perda**. Projetos novos usam **10 s**;
o campo aceita 0,1–30 s, passo 0,1 s. Projetos antigos conservam comportamento
herdado até escolha explícita. Safe loss por alvo pode soltar antes; hold do alvo
não ultrapassa o prazo VID. Contínuos, detectores básicos, clips, toggles e
pulsos com duração musical conservam comportamento existente. Somente nova pose
aceita renova validade; mão presente ou activeName antigo não restauram saída.
Retorno confirmado antes do prazo sustenta a nota existente sem outro Note-On;
após expirar, nova ativação exige confirmação normal da pose.
Landmarks incompletos contam como ausência. Um erro explícito de inferência
libera a pose ativa e continua visível. Os exemplos salvos permanecem; TEST
continua musicalmente silencioso. Um clip lançado e sua continuação armada
seguem tocando. Camera OFF, Panic, desvincular e desconectar liberam notas
sustentadas e agendadas.
O watchdog do host avança sem novos frames. Prazo conta desde a última pose
qualificada recebida pelo host; grace do reconhecimento consome essa janela.
Soltar na perda espera somente grace; manter sem limite não tem teto global.
Badge distingue tracking atual, última pose/hold com contagem e release.
Camera OFF e desconexão sempre encerram notas próprias. Host/Live travado não
garante deadline em tempo real; ao retomar, compara o prazo original.
Recarregue o cliente após instalar este candidato para usar metadados novos.

**⚙ acompanha a aba:** PERF abre Deep Sync; VID abre reconhecimento/perda de
tracking; AUD reutiliza entrada/análise; SNS mostra capacidades e ações explícitas
de habilitar/calibrar. MIX/SNP não mostram engrenagem. Abrir ajustes não inicia
câmera, microfone ou pedido de permissões. CONF/REC e CALIBRATE permanecem.

### Poses estáticas aprendidas

Cada slot aprendido guarda uma forma de mão estática; o banco começa com três slots e aceita até quinze:

1. Segure a forma de mão desejada e toque **CAPTURAR POSE** três vezes,
   variando um pouco a dobra dos dedos ou o ângulo da palma entre os exemplos.
2. Mantenha a mão parada durante cada captura automática, que é rápida.
3. Toque **TESTE** e mostre a pose de novo. O reconhecimento tolera variação
   normal de posição na tela, distância da mão, landmarks de profundidade e um
   pequeno ângulo de punho. Ele é específico por mão: aprenda a pose com a mão
   que vai usar na performance, porque a outra mão é uma forma espelhada e não
   casa.
4. Use **APAGAR ÚLTIMA** para trocar só o exemplo mais novo, ou **LIMPAR** para
   treinar o slot do zero.

Cada slot mostra **0/6 até 6/6** e aceita até **seis tomadas por pose**.
**TESTE e reconhecimento ao vivo funcionam a partir da terceira tomada**;
as capturas quatro a seis são opcionais. Use-as para variantes legítimas de
dobra dos dedos ou ângulo da palma, mantendo a mão estável e sem misturar
gestos diferentes. Todas as tomadas salvas participam do reconhecimento.
Preferências antigas de três tomadas voltam com capacidade para seis e
preservam os exemplos salvos. APAGAR ÚLTIMA e LIMPAR continuam sendo ações
deliberadas.

No TESTE, “mais próxima: tomada N · X% do raio” identifica o exemplo mais
próximo. O percentual compara a distância do segundo vizinho da classe com o
raio de entrada; não é uma probabilidade. Menor é mais próximo; acima de 100%
falha nesse limite. Ambiguidade e dedos em formato oposto ainda podem rejeitar
uma pose próxima. Use o benchmark de sessões rotuladas para comparar acertos,
falso ON/min e latência p95 antes de concluir o efeito das tomadas extras.

As proporções da câmera são corrigidas nas poses aprendidas, inclusive ao alternar entre quadros horizontais e verticais. Após esta atualização, poses salvas na versão 8 mostram **RECAPTURA NECESSÁRIA**. Capture essas poses novamente: o save antigo guarda descritores sem as dimensões originais do quadro, portanto não permite uma conversão segura. Eixos diretos e detectores básicos mantêm sua geometria atual.

Tomadas muito diferentes ampliam a tolerância da pose. Após três capturas, uma tomada isolada pode mostrar um aviso. **RETAKE** remove exatamente essa tomada, mesmo se foi capturada primeiro. Quando dedos claramente opostos deixam um banco de três a seis capturas sem maioria, o aviso geral informa que as capturas discordam; RETAKE remove a mais recente como ponto de partida para revisão. **KEEP** conserva todos os exemplos e dispensa o aviso atual; nova captura ou recarga revisa o banco novamente. Os avisos são orientações e não alteram thresholds, ranking nem tempos de hold/release. O comportamento com câmera ainda precisa de aceite com mão real.

O preset de reconhecimento **Equilibrado** é o ajuste normal de performance.
**Precisão** rejeita mais variação; **Flexível** aceita mais. O preset **Performance**
é especificamente calibrado para a execução de acordes por gestos ao vivo, tolerando
a variação natural de poses expressivas (como o gesto Rock) e agilizando o rearme físico
sem falsos disparos com mão aberta ou punho fechado. Um slot aprendido é momentâneo
(`0` ou `1`), sobrevive a recarregar a página, e só rearma depois que a pose é desfeita
(com estados de FSM `ready` → `candidate` → `held` → `releasing`).
Toque em **TEST** para verificar o reconhecimento da pose silenciosamente na câmera sem disparar notas MIDI.
Para ouvir os disparos musicais reais, mapeie o gesto aprendido em MAP e faça a pose diante da câmera. O TEST do treinamento só verifica reconhecimento e continua sem enviar MIDI.
O reconhecimento compara contradições fortes da forma dos dedos antes de
aceitar ou manter uma pose. Com três exemplos, exige concordância dos três;
com quatro a seis, pelo menos três exemplos claros e a maioria estrita do banco
protegem o estado do dedo. Uma captura extra incerta ou oposta não desativa essa
proteção. Um banco com três exemplos de cada estado oposto não reconhece nenhum
dos dois; refaça os exemplos conflitantes deliberadamente. Os exemplos salvos
permanecem preservados. Abrir o quinto dedo
(indicador, médio, anelar ou mindinho) que estava consistentemente dobrado na
pose de quatro solta a pose após o intervalo de liberação; se a mão aberta
estiver treinada em outro slot, pode trocar diretamente. O polegar tem um veto
próprio: pode dobrar ou se recolher pela palma mantendo a articulação reta.
Pelo menos duas tomadas claras e maioria estrita dos estados claros do polegar
devem concordar; uma vista extra incerta não apaga essa identidade. Abrir o
polegar aprendido recolhido, ou recolher o aprendido aberto, rejeita entrada
e libera HOLD. Evidência incerta dos dedos não começa nem completa novo disparo;
incerteza breve sozinha não redispara uma pose sustentada. TEST mostra DEDOS
INCERTOS ou DEDOS DIFERENTES. Ajuste o ângulo ou repare capturas conflitantes;
polegar oculto numa vista de perfil não é evidência confiável. Pequenas dobras
dentro do mesmo estado mantêm tolerância aprendida. Capturas v9 são preservadas,
inclusive bancos conflitantes; repare esses bancos deliberadamente. Frames sem mão preservam uma pose ativa; candidatos não confirmados expiram após a tolerância. Saves da versão 9 com 42/47 coordenadas carregam sem recaptura; a versão 8 exige recapturar. TEST usa a mesma compatibilidade do reconhecimento ao vivo.
O aviso de recaptura permanece após salvar, reiniciar a câmera e restaurar o projeto, até uma nova captura bem-sucedida ou um CLR explícito dessa pose.
A dobra das articulações também fornece evidência local para cada dedo,
inclusive o polegar: maioria de pelo menos duas capturas claras pode distinguir
uma cadeia reta, uma dobra parcial e uma dobra profunda mesmo quando varia a
projeção da ponta. Dobras intermediárias mantêm tolerância aprendida. Juntas
colapsadas e palma de perfil não fornecem ângulos confiáveis. São usadas as
coordenadas salvas, sem mudar formato do banco ou tempos de hold/release; isso
não recupera um dedo oculto quando os landmarks da câmera mostram outra forma.
Poses salvas no antigo formato espacial mostram **RECAPTURA NECESSÁRIA** em vez de serem tratadas como utilizáveis.

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
fixo de 520 ms, e vale igual para pads, LFOs e squares — veja
[§ 2](#2-modos-de-pad-a--b--c--d).

### Nomes de controle (para mapear)

```
pad-1 .. pad-12
knob-1 .. knob-8
fader-1 .. fader-8
xy-1.x, xy-1.y, xy-2.x, xy-2.y
toggle-1 .. toggle-8    (LFOs)
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
- **Arrastar na horizontal num square** — muda a velocidade; na vertical, a amplitude.
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


## Performance 2.0: configurações individuais e banco de poses

Clique direito novamente no mesmo controle fecha seu CFG. Clique direito em outro controle troca diretamente para sua configuração. Arrasto oferece Muito curto (60px), Curto (100px), Médio (150px) e Longo (300px); Nível ao tocar oferece Zero, Baixo (25%), Médio (50%) e Máximo. Curvas de resposta A/B/C e C Lembrar último / Fixo continuam individuais. Esses valores controlam o nível enviado ao destino, não a velocidade das notas MIDI.

No modo D, cada toggle tem **Duração do burst** e ataque próprios, independentes da subdivisão da onda (período de cada ciclo). A duração pode seguir o ajuste compartilhado, usar valor musical fixo em SYNC ou milissegundos em FREE. A seção recolhida mostra a duração selecionada. O modo D herdado de Global apresenta os mesmos ajustes. Pins persistem em projetos, presets e snapshots; abrir CFG nunca dispara controles.

VID inicia com três poses aprendidas. **+ ADICIONAR POSE** acrescenta IDs até G15 e fica cinza aos quinze cards. O banco tem rolagem escura e cards compactos: captura, reconhecimento e CLR mantêm a área normal de ações/status; avisos de exemplos ou diagnóstico do TEST acrescentam apenas o espaço necessário. **CLR** apaga exemplos preservando o card. O pequeno **×** abaixo de G1/G2/etc. remove aquele card e seus exemplos, cancela sua captura/teste e solta explicitamente sua saída ativa, inclusive Manter sem limite. Outros IDs e destinos nunca mudam de posição. O mapping do ID removido continua disponível no MAP; Adicionar reutiliza o primeiro ID livre, com pose vazia e esse mapping existente. Limpe seus alvos no MAP caso também queira descartar o destino. É possível remover todos os cards e restaurar um banco com IDs intercalados. Cada pose continua exigindo três exemplos e aceita até seis. Slots `sensor.vision.gesture.1` até `.15` seguem as mesmas regras de qualificação, MIDI e perda de tracking. Classificador, guardas de polegar e tempos de captura/reconhecimento não foram reajustados. Aceite físico da câmera continua necessário.

## 16. REC: Arrangement / CLIP

O knob de volume de cada faixa ajusta o mixer nativo, não o ganho de entrada.
Arraste verticalmente ou use as setas; duplo-clique restaura o padrão do parâmetro
no Live. A indicação é porcentagem normalizada, não dB. Valor desconhecido ou
vencido bloqueia o controle. Mudanças externas aparecem na próxima leitura;
troca de conexão ou Set cancela o gesto. STOP mantém prioridade sobre volume.

Escolha **ARRANGEMENT / CLIP** dentro de REC. Abrir a página, trocar o destino,
selecionar cena ou abrir CFG nunca arma faixa nem inicia playback/gravação.
A troca de destino fica bloqueada enquanto existe tentativa REC própria. STOP
segue essa posse. Nomes, ARM MULTI/EXCLUSIVE e SOLO/MUTE são compartilhados.

### Arrangement

Crie os marcadores do Arrangement no Live antes, depois abra **REC** com o
playback parado:

1. Arme as entradas nos cartões de tracks abaixo da timeline. Cada cartão
   mostra **ARM / SOLO / MUTE** observados. **ARM MULTI** é o padrão e mantém
   outras entradas armadas; **ARM EXCLUSIVE** desarma outras tracks somente
   quando você aperta ARM de uma track. Trocar o modo ou dar um toque simples no nome não
   altera o Live. Grupos têm SOLO/MUTE, mas não podem ser armados. A preferência
   global de arm do Live não muda; um resultado incompatível do host é informado.
   ARM confirma o conjunto de entradas armáveis sem esperar Loop, compasso ou click.
   Se a confirmação falhar, os estados ARM ficam desconhecidos até nova leitura;
   a escrita pode já ter sido aplicada. A superfície não a repete automaticamente.
2. Escolha o marcador de início. Cada marcador mostra **compasso.beat** acima
   do nome. Use **Zoom** e a rolagem para inspecionar os marcadores e a posição
   observada do playback.
   A lista segue o tempo da timeline, inclusive marcadores novos no início, com
   ordem estável nos empates e nomes completos. Compasso temporariamente atrasado
   mantém o último display confirmado com indicador pontilhado, sem autorizar REC.
   Salto de marcador confirma transporte parado/record off e identidade/monitor
   selecionado sem esperar estados do mixer sem relação. REC confirma o conjunto.
3. Para gravar passagens repetidas, ligue **Loop** e escolha um marcador final
   depois do início. Deixe Loop desligado para gravar sem um final definido.
4. Escolha **PRÉ-ROLL OFF / 1 / 2 / 4** compassos e aperte **REC**. OFF é o
   padrão e começa diretamente no marcador. As outras opções tocam os compassos
   anteriores com click até o Punch In nativo abrir a captura no marcador.
5. Aperte **STOP** para parar playback e gravação. Suas tracks permanecem armadas,
   permitindo novos takes consecutivos sem precisar rearmar.

REC grava exatamente as tracks armadas mostradas nos cartões. Fica desabilitado
sem entradas armadas e confirma o conjunto inteiro antes de gravar. ARM fica
bloqueado durante gravação ou pré-roll; SOLO/MUTE continuam disponíveis para
escuta. Uma track de terceiro armada depois nunca entra na limpeza do STOP.

Dê dois cliques no nome da faixa para editar ali mesmo (teclado: foque o nome
e aperte Enter). Enter confirma; Escape cancela. Sair do campo não salva.
O polling preserva o rascunho e o foco. Nomes usam 1–128 caracteres, sem espaços
nas pontas nem caracteres de controle. Só o nome daquela identidade é alterado;
renomeação externa, faixa substituída/reordenada ou troca de Set rejeita a edição
antiga. Use STOP da superfície para encerrar REC/pré-roll antes de renomear.

Para ouvir, clique em um marcador na faixa ou escolha o marcador inicial e use
**Play no cabeçalho**. A seleção usa o salto nativo de marcador do Live para
que Play comece nesse marcador. Selecionar posiciona o transporte parado sem
iniciar playback nem gravação. A faixa serve de referência de marcadores e
posição, sem waveform de áudio nem seleção de take lanes. Um marcador movido
ou removido precisa ser escolhido novamente.

Loop repete entre os dois marcadores até STOP; o marcador final não para a
gravação. REC aguarda o Live confirmar a região de loop antes de começar.
Todas as mudanças de loop compartilham um limite de dois segundos para a
confirmação; sem ela, a gravação não começa. Com Loop desligado, REC desliga
o Arrangement Loop do Live. STOP mantém a região escolhida para reprodução.
Configure monitoração da entrada e take lanes no Live. Para ouvir o Arrangement,
escolha Monitor Auto/Off em vez de In.

Pré-roll é uma preferência salva neste navegador, separada do count-in nativo
do Live. Usa a fórmula de compasso observada para calcular a antecipação;
é preciso haver tempo suficiente antes do marcador. Não resolve mudanças
anteriores de fórmula a partir de um mapa de compassos. REC confirma transporte
parado e record mode desligado, liga Punch In nativo no marcador e inicia
playback da posição anterior antes de ligar record mode. Se o playback já
chegou ao marcador antes dessa confirmação, aborta em vez de iniciar captura
atrasada. O host acompanha o pré-roll depois de devolver o comando, portanto
quatro compassos não ficam limitados pelo timeout de comando do celular.
Na primeira passagem observada pelo marcador, restaura o click original.
STOP restaura somente click, Punch In e início temporário do Loop ainda
pertencentes à tentativa, mantendo as entradas armadas; o início temporário só
volta enquanto Loop permanece desligado. Use STOP desta página para terminar
a limpeza mesmo se parou o transporte no Live. Mudanças de estado necessário
cancelam o pré-roll; perda de conexão/sessão ou um novo Set nunca repetem
escritas de limpeza. Confira esses ajustes no Live depois de uma perda.

Para definir o início real do playback, o pré-roll reutiliza um locator
exatamente na posição anterior ou cria um locator temporário **RC pre-roll**
pelo SDK. Salta nativamente para ele e remove somente o handle criado pela
tentativa, confirmando a remoção e os locators originais antes de armar ou tocar.
Um locator existente nunca é renomeado nem removido. Falha do SDK ou limpeza
não confirmada bloqueia playback e gravação; STOP é enviado imediatamente
mesmo com trabalho do SDK pendente. Se o host fechar ou a sessão/link/Set mudar
na breve janela entre criar e remover, o locator temporário pode permanecer.
Confira no Live: reconectar nunca procura nem apaga locators automaticamente.

`count_in_duration` do Live é somente leitura na API suportada; esta função
não o altera. A interação com count-in nativo e **Enable Only While Recording**
do metrônomo ainda exige aceite físico no Live depois da instalação.

REC exige todas as entradas armáveis e armadas, sem track armada fora do conjunto
enviado. Ajusta Punch In temporariamente para ON no pré-roll ou OFF no início
direto, confirma e restaura o valor original observado no STOP ou falha somente
enquanto a mudança ainda lhe pertence. Uma alteração externa observada de
Punch In encerra essa posse. Punch Out, Arrangement Overdub, Session Record e
retorno ao Arrangement pendente precisam estar desligados no Live. Estado necessário
desconhecido ou desatualizado bloqueia a gravação; leituras de estado em
segundo plano não travam os controles da página. A página mostra playback e
record mode observados, sem comprovar captura de áudio. Passagens anteriores e
preservação de takes ficam a cargo do Live: confira no Set antes de repetir e
salve o Set no Live. REC não apaga clips, seleciona take lanes ou aciona undo.

Escritas REC exigem permissão de controller/admin e conexão atual do celular.
Perder a conexão nunca para uma gravação em andamento nem repete uma escrita
ao reconectar. Se o link celular/host estiver indisponível, pare no Live.
O fluxo OSC/SDK tem regressões offline; limites de captura do Punch In nativo,
preferências de count-in/metrônomo, monitoração de áudio, preservação dos takes
e toque no celular ainda exigem aceitação no seu conjunto com Live.


### CLIP: gravar uma cena vazia da Session

1. Arme as entradas nos cards compartilhados. Escolha **CLIP** e selecione
   explicitamente uma linha de cena. Toda faixa armada precisa ter slot vazio
   nessa mesma cena. Clips existentes são referência; selecioná-los não dispara.
2. Abra **CFG** para **1 / 2 / 4 / 8 / 16 compassos** (padrão 4) e quantização
   nativa: **Global / Nenhuma / 1 compasso / 1 beat** (padrão Global). São escolhas
   locais desta página, sem persistência em projeto. Global segue o Live; as outras
   opções valem só nesse disparo e não alteram a preferência global do Live.
3. Aperte **REC**. O host reconfirma Set, identidades da cena/slots, slots vazios,
   armabilidade/monitoração e o conjunto armado inteiro, inclusive faixas fora da
   área rolada. A duração usa a fórmula observada em beats do Live. Clip tocando
   ou na fila em uma faixa de destino bloqueia a tentativa, assim como gravação
   do Arrangement ou o botão Session Record ativo.
4. **NA FILA / REC / PLAY / STOP** são estados observados, sem estimativa pelo
   tempo decorrido. A captura nativa com duração pode terminar tocando o clip.
   **STOP** cancela a preparação e solicita parada só das faixas ainda próprias.
   Mantém ARM e transporte global. Para parar todo o Live, use explicitamente
   os controles normais de transporte.

A grade mostra até oito cenas por janela, com rolagem interna escura e botões
anterior/próximo. Rolar não muda o conjunto armado. Pré-roll, marcadores/Loop do
Arrangement e Punch In ficam ocultos e não são usados em CLIP. ARM e renomeação
ficam bloqueados durante a tentativa própria; SOLO/MUTE são ações explícitas.

STOP respeita a quantização nativa e pode mostrar **Parada pendente**; confirme
no Live ou aperte STOP novamente. O polling libera a tentativa quando Clip Stop
nativo fresco (`playing_slot_index=-2`, `fired_slot_index=-1`) ou flags frescas de
clip parado comprovam conclusão, inclusive por parada externa. Stop na fila
(`fired_slot_index=-2`), estado desconhecido ou pausa do transporte isolada não
bastam. Após confirmação, não precisa recarregar nem repetir escrita de STOP.
Observações ausentes ou identidade de clip
ainda atrasada no SDK não autorizam parar uma faixa às cegas. Uma observação
fresca de gravação pode vincular o clip criado; depois, STOP explícito conclui.
Clip externo observado, troca de faixa/cena/slot ou substituição de clip encerra
a posse daquele alvo sem pará-lo. Perda de sessão/link/Set retira posse, sem
repetir parada, disparo ou limpeza na reconexão. Sem link, pare no Live.

Quando Session substitui o playback do Arrangement, **VOLTAR AO ARR** aparece em
REC. Após todas as faixas de Session confirmadas ociosas e gravação desligada,
aperte para retornar explicitamente. O comando confirma o sinal nativo e só então
seleciona ARRANGEMENT. Com transporte rodando, Arrangement continua na posição
atual; não envia Pause/Play, move playhead, muda arm/Loop/Punch In nem apaga clips.
Clip ativo/na fila/desconhecido bloqueia o retorno. Abrir REC, trocar destino ou
parar clips nunca retorna automaticamente.

Os disparos multifaixa são pedidos OSC sequenciais, sem transação atômica no host.
Falha parcial tenta parar somente os alvos emitidos cuja identidade e posse
observada ainda estão confirmadas. A superfície não apaga nem sobrescreve clip
existente. Este primeiro CLIP não tem overdub de clip existente, navegador de
take lanes, audition ou seleção de comp. Gravação nativa de áudio/MIDI, duração,
quantização e limites de captura ainda exigem aceite no seu Live; a prova
automatizada usa mocks SDK/OSC.

## AUT: loops de movimento dos XY

SYNC oferece cinco botões de compassos (1–5 compassos). FREE usa um slider de
1–30 segundos em passos de um segundo. Os padrões continuam 2 compassos e
10 segundos; loops salvos de 10 ou 20 segundos mantêm sua duração.

**AUT**, ao lado de MAP/CFG, seleciona gravação de automação para XY1 ou XY2. Com AUT ligado, os dois XY ficam destacados e mantêm 100% de suas dimensões sem encolher nem exibir barras individuais. Para abrir os ajustes de um XY, use toque longo (segurar 600ms sem mover) no celular ou clique direito no desktop. Isso nunca inicia captura, playback nem altera o loop. O estado LOOP/REC/contagem permanece dentro do próprio XY.

Para gravar, ative AUT e toque na área de movimento do XY: o modo de seleção fecha para seus próximos toques controlarem normalmente o painel. Três pulsos vermelhos contam 3–2–1, a borda vermelha contínua indica captura e o movimento completo entra em loop automaticamente. Clique direito no XY (celular: segure 600ms sem mover) abre a configuração. Os ajustes incluem **SYNC / FREE**, **1–5 compassos** ou **1–30 segundos em passos de um segundo**, Gravar/substituir, Reproduzir, Parar e Apagar. Escolher uma ação do menu ou dispensar o menu devolve a performance normal. Abrir configuração não emite controle. MAP, AUT e CFG permanecem visíveis no topo. Suas seleções são exclusivas; sair da seleção AUT não para um loop existente.

SYNC usa posição, andamento e fórmula de compasso observados do playback do Live, com horário de recebimento preservado independentemente da renderização do MAP. Contagem/captura exigem Live tocando e relógio atualizado. Comandos Play/Pause aguardam confirmação do Live; mensagens de tempo/beat não confirmam esses comandos. Posição desatualizada é consultada independentemente de outras mensagens OSC recebidas. Os dados capturados ficam alinhados à grade da música. Durante reprodução, mudanças de posição e voltas do Loop do Live seguem a posição atual; STOP do Live pausa um loop SYNC habilitado e Play retoma na posição real. Relógio parado/desatualizado, mudança de posição, volta do Loop ou mudança de compasso durante a **captura** cancelam aquela tentativa e mantêm o buffer anterior completo. Para capturar vários compassos, deixe Arrangement Loop desligado até concluir. Mudança de compasso durante reprodução para o loop. FREE usa segundos decorridos e independe do transporte do Live.

O pequeno quadrado branco no XY marca o alvo de retomada do mapping. Ele
pisca enquanto a retomada está pendente; o ponto laranja continua indicando a
posição atual do XY. Com a preferência de movimento reduzido do sistema
ativada, o indicador branco fica contínuo.

Segure e mova um XY durante a reprodução para sobrepor seu movimento manual. Ao soltar, ele volta à fase atual do loop, sem reiniciar nem regravar. A física pode fornecer o movimento capturado; durante reprodução, o loop controla ambos os eixos e substitui a inércia. Buffers/configurações dos dois XY são independentes; apenas uma captura/contagem ocorre de cada vez. Falha ao substituir preserva o loop completo anterior. Apagar pede confirmação.

Pontos completos e configurações persistem em projetos, presets, snapshots e armazenamento local. Estados de reprodução/contagem/gravação nunca persistem: recarregar, reconectar, substituir a sessão, perder papel de controlador ou ocultar a página para AUT; use Reproduzir explicitamente depois. Parar segue Safe loss de cada mapping e solta gates de Trigger Note. Esta função repete dados dos controles XY do RC Surface; não escreve automação nativa no Arrangement. Pads/toggles ainda não são gravados por AUT nesta versão. O gravador limitado mira 30 amostras/segundo, até 1.024 pares de coordenadas por XY. Intervalo de captura acima de 250ms cancela a tentativa. Fluidez real no navegador e saída no Live continuam exigindo aceite no dispositivo.
