# Contratos — RC Surface

Este documento registra os contratos que o host e o celular compartilham. Cada
seção é coberta por testes que falham quando um lado se afasta do contrato. A
fonte da verdade é a implementação; este documento só a descreve, para quem
revisa não precisar vasculhar as duas árvores de código.

---

## Política rítmica (T1–T8 / Square)

Oito slots `toggle-1` até `toggle-8` compartilham os modos Global A/B/C/D dos pads, salvo override explícito. Não há banco separado de botões ou Stutter: Square é a onda de pulso 0–depth em qualquer slot, com swing/ratchet em Avançado.

Host `src/live/transport-clock.ts` e celular `static/phone-v3/controls.js` mantêm paridade em `getLfoSubdivision` / `getLfoMaxHz` e na política de pulso. Ambos definem `getPulseTiming` / `getPulseSubdivisions`; o celular também avança a fase de pulso localmente. Os testes de paridade protegem esse limite.

| Forma | Hz máx |
| --- | --- |
| sine | 4 |
| triangle | 3 |
| ramp_up | 3 |
| ramp_down | 3 |
| square | 15 |

Esses tetos são limites de produto para controle, não uma garantia de throughput ou latência do SDK. Em SYNC, subdivisões são filtradas por BPM/forma; swing e ratchet consideram o menor meio-passo. Pins rápidos demais desaceleram por oitavas. Square FREE respeita até 15 Hz, incluindo ratchet. CFG não oferece subdivisões inviáveis nem edita rate/depth que pertencem ao toque.

A [medição histórica de teto](https://github.com/ntworm/rc-surface/blob/main/internal/LIVE-WRITE-CEILING-1.0.md) descreve seu ciclo 1.0; não prova uma medição nova da candidata 2.0.

---

## Limites do protocolo de comunicação (ADR-004 / congelado)

O celular e o servidor compartilham os mesmos limites numéricos, para que
um payload aceito no celular também seja aceito no servidor.
`src/server/ws-bounds.ts` é a fonte da verdade; `tests/contracts-freeze.test.mjs`
verifica que cada valor desta tabela confere com o runtime. Mudar algo aqui é
uma nova versão do protocolo, não uma refatoração — incremente
`controlStreamVersion` no payload hello de `src/server/ws.ts` e publique os
dois lados juntos.

| Constante                            | Valor            | Propósito                                              |
| ------------------------------------ | ---------------- | ------------------------------------------------------ |
| `MAX_PAYLOAD_BYTES`                  | 100 KiB          | Rejeita quadros maiores que isso na camada `ws`        |
| `MAX_WS_CONNECTIONS`                 | 64               | Sockets abertos no total (celular + admin)             |
| `MAX_WS_CONNECTIONS_PER_IP`          | 16               | Limite por IP, para uma rede atrás de NAT não ficar presa a um cliente só |
| `WS_HEARTBEAT_INTERVAL_MS`           | 15 000           | Intervalo do heartbeat que confirma a conexão viva      |
| `MAX_CLIENT_NAME_LENGTH`            | 64 code-points   | Truncar via `Array.from`, não `length`                  |
| `MAX_CONTROL_NAME_LENGTH`           | 128 chars        | Rejeita nomes longos demais                             |
| `MAX_CONTROLS_PER_SNAPSHOT`         | 128              | Rejeição direta no ponto único de validação do snapshot |
| `MAX_CONTROLS_PER_IMMEDIATE_BATCH`   | 12               | Caminho de alta taxa só para descritores                |
| `HISTORY_RING_SIZE`                  | 120              | Ring buffer por controle                                |
| `RATE_BURST`                         | 600 mensagens    | Tamanho do balde de tokens                              |
| `RATE_SUSTAINED_PER_SEC`             | 300              | Reposição sustentada                                    |
| `RATE_WINDOW_MS`                     | 1 000            | Janela de reposição                                      |
| `RATE_NOTICE_INTERVAL_MS`            | 1 000            | Intervalo mínimo entre avisos de rate-limit            |
| `CACHE_MAX_ENTRIES`                  | 2 048            | Limite de cache                                         |
| `BACKPRESSURE_DROP_THRESHOLD`        | 512 KiB          | Descarta telemetria não crítica acima disso            |
| `BACKPRESSURE_DISCONNECT_THRESHOLD`   | 2 MiB            | Fecha cliente lento com código 4008                     |
| `LISTENER_QUIET_MS` (osc-tokens)     | 1 500            | Silêncio no push-stream antes de o polling assumir      |

---

## Registro de endereços OSC (congelado)

O servidor é o único lado que fala OSC; o celular fala WebSocket e o
servidor traduz. Cada endereço OSC emitido pelo host é, portanto, um
contrato do host, centralizado em `src/osc-tokens.ts`. `osc-transport.ts`
importa do registro e nunca escreve um endereço na mão. O teste de freeze
verifica:

1. Cada endereço congelado existe em `src/osc-tokens.ts`.
2. `src/live/osc-transport.ts` importa de `../osc-tokens.ts` e referencia
   `LISTEN`, `GET`, `CMD` e `RESPONSE` (sem arrays paralelos, sem
   concatenação inline).
3. `LISTENER_QUIET_MS` exportado pelo transporte equivale ao do registro.

Se o registro e o runtime divergirem, um erro de digitação em qualquer um dos
dois vira, em silêncio, um comando que o Live ignora; o teste de freeze é
o único que pega isso.

### Registros de listener (push do Live)

```
/live/song/start_listen/is_playing
/live/song/start_listen/tempo
/live/song/start_listen/metronome
/live/song/start_listen/signature_numerator
/live/song/start_listen/signature_denominator
/live/song/start_listen/current_song_time
/live/song/start_listen/beat
/live/view/start_listen/selected_track
```

### Getters de poll / heartbeat

```
/live/song/get/cue_points
/live/view/get/selected_device
/live/song/get/tempo
/live/song/get/is_playing
/live/song/get/metronome
/live/view/get/selected_track
/live/song/get/current_song_time
```

### Comandos de transporte

```
/live/song/start_playing
/live/song/stop_playing
/live/song/jump_to_prev_cue
/live/song/jump_to_next_cue
/live/song/cue_point/jump
```

---

## Contrato hello (congelado)

`sendHello` em `src/server/ws.ts` é o único lugar que monta a mensagem de
boas-vindas. O teste de freeze verifica que cada campo abaixo continua
presente. Remover qualquer um deles quebra clientes antigos.

| Campo                  | Tipo               | Observação                                         |
| ---------------------- | ------------------ | -------------------------------------------------- |
| `type`                 | `"hello"`          | Discriminador                                      |
| `controlStreamVersion` | `1`                | Incrementa a cada mudança de protocolo             |
| `client_id`            | string             | Identidade atribuída pelo servidor                 |
| `role`                 | string             | Registro do servidor: admin / celular              |
| `tokenStatus`          | string             | Estado do capability token                         |
| `path`                 | string             | Caminho da URL que o celular carregou              |
| `commands`             | string[]           | Registro de comandos do servidor (panel/help)     |
| `tempo` / `signature` / `scale` | numbers / string | Snapshot do Live no momento da conexão      |
| `playheadActive` / `playheadTimeMs` | bool / number | Playhead do Live no momento da conexão      |
| `values`               | object             | Cache inicial de valores de controle               |
| `bipolarControls`      | string[]           | Controles que devem renderizar com ponto central   |
| `projectConfig`        | object             | Snapshot do painel ProjectConfig                  |

O celular tolera campos opcionais ausentes (builds antigos não enviavam
alguns) e ignora campos desconhecidos. Os dois sentidos da atualização são
cobertos por `tests/upgrade-regression.test.mjs`.

---

## Política de upgrade

Por construção, o protocolo tolera uma faixa estreita de compatibilidade, para
frente e para trás:

- **Novo campo opcional do servidor**: o celular não pode quebrar quando
  aparece um campo que ele não conhece. O teste de upgrade-regression
  verifica que o payload hello contém o conjunto conhecido de campos, sem
  exigir que o celular use todos.
- **Novo campo opcional do cliente**: o servidor deve ignorar chaves
  desconhecidas em snapshot, control e set-display-name; `boundControlFrame`
  em `ws-bounds.ts` é o ponto único de validação.
- **Mudança que quebra o contrato** (limite, endereço, capability): incremente
  `controlStreamVersion` em `src/server/ws.ts`, registre o novo valor neste
  documento e publique os dois lados juntos.

Remover um campo congelado ou alterar um limite sem registrar a mudança
aqui é exatamente o modo de falha que este documento existe para evitar.

---

## Agendamento e esquema de trigger note (`trigger_note`)

Destinos de trigger note permitem que controles e gestos aprendidos disparem notas MIDI com quantização sincronizada ao transporte e garantia de Note-Off seguro.

### Esquema do destino

Destinos com `mode: 'trigger_note'` obedecem às seguintes restrições de esquema:

| Campo | Tipo | Regras de validação |
| ----- | ---- | ------------------- |
| `mode` | `'trigger_note'` | Discriminador obrigatório. Controles de mapeamento contínuo ficam ocultos na interface. |
| `midiNote` | string | Nome de nota padrão (ex.: `'C2'`). Faixa: `C-2` (MIDI 0) a `G8` (MIDI 127). Notas acima de G8 (MIDI 128+) são rejeitadas. Padrão `'C2'`. |
| `midiVelocity` | number | Inteiro na faixa `1..127`. Padrão `100`. |
| `noteTiming` | string | `'immediate'`, `'beat'` ou `'bar'`. Padrão `'immediate'`. |
| `noteGate` | string | `'pulse'` ou `'hold'`. Padrão `'hold'`. |
| `noteDurationMs`| number | Inteiro na faixa `20..2000` ms. Padrão `80`. |
| `noteDurationMode` | string | `'ms'` (legado/padrão quando ausente) ou `'grid'` (pulso com disparo imediato, no tempo ou no compasso). |
| `noteDurationBars` | number | Em modo grid: exatamente `1/16`, `1/8`, `1/4`, `1/2`, `1`, `2` ou `4`. Novas seleções de sync usam `1/4`. |

**Invariante de tempo e gate (D04):** `hold + sync` é rejeitado. Se `noteTiming` for `'beat'` ou `'bar'`, `noteGate` deve ser `'pulse'`. Se `noteGate` for `'hold'`, `noteTiming` deve ser `'immediate'`.

### Contrato de relógio OSC

- A quantização calcula o próximo tempo (`beat`) ou início de compasso (`bar`) estritamente a partir da posição OSC fresca do host (`/live/song/get/current_song_time`) observada em `<=1000 ms`.
- Se o transporte estiver parado (`!isPlaying`), a posição estiver desatualizada (`>1000 ms`) ou o andamento for não-positivo, o agendamento reporta `unavailable` / `SEM SYNC` e descarta o trigger com segurança.
- Tempos de disparo quantizados são estritamente futuros (`nextTriggerBeat > currentBeat`).
- A duração grid usa o snapshot OSC fresco no Note-On real: `compassos × temposPorCompasso × 60000 / BPM`, congelado para a voz. Duração inválida ou excessiva não dispara. Perfis antigos em `noteDurationMs` conservam seu valor.
- Pulso imediato pode usar duração grid sem quantizar o ataque. Clock parado, conectado e observado conserva os metadados de BPM/compasso; posição estacionária não os expira. Clock tocando continua exigindo posição de até 1000 ms; metadados desconectados, desconhecidos ou inválidos não disparam. Grid com hold é inválido; ms legado permanece igual.

### Contrato do agendador

- **Faixas e concorrência:** A fila é indexada por objeto de track de destino, limitada a `MAX_TRACK_LANES = 64`.
- **Política de última intenção:** Quando chegam múltiplos disparos para a mesma faixa de track, o mais recente substitui qualquer disparo pendente não enviado naquela faixa.
- **Janela de atraso:** Temporizadores aguardam até o tempo calculado. Se o atraso real de execução exceder `20 ms`, o disparo é descartado como `missed` sem disparos atrasados de compensação.
- **Note-Off garantido:** Cada Note-On iniciado registra voz e timer de liberação. Ao repetir na mesma track, o timer antigo é cancelado e o OFF antigo conclui antes do ON novo; a nota nova recebe a duração inteira.
- **Cancelamento seguro:** Parada de transporte, seek, loop, mudança de fórmula, relógio OSC desatualizado ou desconectado, desconexão do cliente, remoção ou troca de bind cancelam os disparos pendentes afetados. Parada, relógio desatualizado ou desconectado (aplicado na próxima atualização OSC), desconexão do cliente e remoção ou troca de bind também desligam as vozes agendadas ativas. Seek, loop e mudança de fórmula só avançam o epoch do relógio; a voz que já está soando termina no próprio Note-Off.
- **Notas imediatas:** Notas `immediate` (Agora) não passam pelo agendador e não seguem o transporte. Um `pulse` termina no próprio Note-Off e um `hold` na soltura do controle; remoção ou troca de bind e desconexão do cliente as desligam antes.

### Safe loss de visão

O primeiro resultado de inferência sem landmarks utilizáveis reseta o reconhecimento e emite um único OFF normal antes do aviso de perda. Candidatura e tempos de liberação são limpos sem alterar exemplos; recuperar exige um novo holdMs completo. Erros explícitos de inferência fazem a mesma liberação e continuam visíveis; não há watchdog novo para ausência de callback. TESTE não emite ON LIVE nem OFF falso, mas não protege vozes LIVE anteriores da perda. sensor.vision.active=0 (inclusive lost=true) encerra vozes Receiver e pedidos Tempo/Compasso daquele cliente antes de buscar mapping. A liberação momentânea/de nota prevalece sobre neutralPolicy=hold legado; Safe loss contínuo do Bind e latches não mudam. OFF de Launch Clip só rearma a borda: não dispara, para nem cancela retorno/ledger. Recuperar respeita idempotência; Avançar lista avança uma vez após confirmação, nunca enquanto pendente. Câmera OFF, pagehide, Panic, remoção de bind e desconexão preservam a liberação existente. Padrão hold de visão e migração única permanecem intactos.

### Autorização de comandos (`testTriggerNote`)

- `testTriggerNote({ control, targetIndex })`: Comando de escrita ao vivo executado exclusivamente em mapeamentos já salvos.
- Avaliado dentro de um `CommandExecutionContext` confiável (`clientId`, `isCurrent()`) montado pelo servidor a partir do socket da conexão (nunca de argumentos enviados pelo cliente).
- Autorizado apenas para papéis `controller` ou `admin`; sessões não autorizadas ou desatualizadas são rejeitadas.

## Launch Clip (`clip_launch`)

Um controle pede ao Live um clip da Session pelo link AbletonOSC já existente.
O SDK de Extensions lista tracks, slots e clips (nomes, marcadores, handles da
sessão), mas não tem API de lançar, parar, quantização de lançamento nem
Follow Actions.

### Endereços OSC (`CLIP` / `CLIP_RESPONSE`, congelados)

Disparar, parar, escutar e ler, mais uma escrita global explícita do Set:
`Song.clip_trigger_quantization`. Launch Clip não permite setters de clip,
track ou outras propriedades da música. O lançamento leva só track e slot,
então o Live aplica a própria quantização efetiva de lançamento.

```
/live/clip_slot/fire                               track slot
/live/track/stop_all_clips                         track (padrão do Live: quantizado)
/live/track/start_listen|stop_listen/fired_slot_index     track
/live/track/start_listen|stop_listen/playing_slot_index   track
/live/clip/start_listen|stop_listen/playing_position      track slot
/live/clip/get/launch_quantization                 track slot
/live/clip/get/launch_mode                         track slot
/live/clip/get/legato                              track slot
/live/song/start_listen/clip_trigger_quantization
/live/song/get/clip_trigger_quantization
/live/song/set/clip_trigger_quantization           inteiro 0..13 (só ação explícita)
/live/song/get/track_names
```

Os listeners do Launch Clip só são registrados enquanto existe ao menos um
mapeamento de Launch Clip, e são registrados de novo junto com os listeners da
música. Respostas aos getters contam como respostas, não como push de listener.
Abrir um picker também pode observar/ler a quantização global antes de existir
um mapping; nunca escreve.

### Esquema do destino

| Campo | Tipo | Regras |
| ----- | ---- | ------ |
| `type` | `'clip_launch'` | Obrigatório. |
| `launchMode` | string | `'clip'`, `'list'` ou `'stop'`. |
| `track` | objeto | `{ trackIndex, trackName, trackSessionId? }`; só tracks comuns (`trackKind` ausente ou `'track'`). |
| `clip` | objeto | Só no modo `clip`: `{ slotIndex, clipName, clipSessionId? }`. |
| `clips` | array | Só no modo `list`: de 2 a 8 referências, sem slot repetido. |
| `then` | objeto | Só no modo `clip`: `{ action: 'none' \| 'clip' \| 'stop', passes: 1..8, clip? }`; `clip` é obrigatório na ação `clip` e diferente do clip lançado. |
| `threshold` | número | Opcional, `0.05..0.95`, padrão `0.5`. |

Nomes têm no máximo 128 caracteres; ids de sessão são strings decimais de
1–64 dígitos, mantidas como strings sem conversão para Number.
Campos desconhecidos são rejeitados; campos genéricos do editor (curva, faixas,
safe loss) são descartados. Destinos guardados (perfil, arquivo de
mapeamentos, preset, importação) passam pela mesma validação e são
reassociados ao Set aberto pelo nome da track e do clip: único → `loaded` ou
`relinked`, vários → `ambiguous`, nenhum → `missing`. Destinos ambíguos ou
ausentes nunca são disparados.

### Despacho

- Ativação: o valor real sobe pelo limiar; controles contínuos rearmam 0,1
  abaixo dele. Valores `lost` e desconexões não mudam nada. O estado de borda
  fica guardado por id estável de cliente.
- Antes de cada pedido o destino é resolvido pelo handle da sessão **e** pelo
  nome, ou então por um nome único; o slot precisa conter o clip esperado;
  tracks de grupo são recusadas; depois de qualquer mudança na lista de
  tracks, os nomes do SDK precisam ser iguais ao `track_names` do AbletonOSC,
  senão o pedido é bloqueado (`index_mismatch`).
- Idempotência pelo `fired_slot_index` / `playing_slot_index` do Live: um clip
  já aguardando, ou tocando sem outro aguardando, ou tocando com o próprio
  retorno do RC aguardando, não envia nada. Um pedido que o Live ainda não
  reconheceu bloqueia a duplicata por até 1,5 s e depois informa
  `no_confirmation`.
- Avançar lista: o item seguinte ao clip que toca; volta ao início; nenhum
  avanço novo enquanto o item pedido aguarda ou não foi reconhecido.
- Parar: `/live/track/stop_all_clips`, nada quando a track está parada ou um
  stop (`-2`) já aguarda.

### Mensagem de estado (`clip_launch_state`)

Enviada a todas as superfícies: `{ type, control, targetIndex, state,
reason?, listIndex?, quantization?: { source: 'clip'|'global'|'unknown',
label }, globalQuantization?: { value: number|null, label, pending, available,
connected }, warnings?, rule?: { state, reason?, refusal?, prediction? } }`.
`state` é um de `idle`, `requested`, `queued`, `playing`, `stopping`,
`stopped`, `no_confirmation`, `unavailable`, `missing`, `ambiguous`,
`index_mismatch`. `queued` e `playing` só vêm dos listeners do Live.

### Continuação ("Depois que entra")

Regras do RC Surface, não Follow Actions nativas. Com start marker S, início
do loop A, fim do loop E e end marker F: `P1 = E − S`, `L = E − A`,
`T(N) = P1 + (N − 1)L`; clip sem loop permite N = 1 com `T = F − S`. Q é o
quantum efetivo do pedido seguinte (quantização de lançamento do clip de
destino, Global → música; o ajuste da música para um stop) em tempos, com a
fórmula de compasso atual.

- A regra só arma depois que o Live confirma o clip lançado tocando.
- `T ≤ Q`: o pedido seguinte sai na confirmação. Senão, sai no primeiro push
  de `playing_position` com `T − Q + 0,25 ≤ e < T`.
- Cada par de pushes precisa provar no máximo uma volta a partir do tempo de
  música informado pelo Live (relógio × BPM do Live quando o tempo de música
  não está atualizado); senão a regra é cancelada (`insufficient_pushes`,
  `inconsistent_position`, `transport_jump`).
- Recusada: Q None, janela `Q − 0,25` menor que 250 ms no BPM atual, legato
  ligado, modo de lançamento diferente de Trigger, áudio sem warp, marcadores
  inválidos, loop menor que um tempo, clip sem loop com N > 1.
- Janela perdida com a regra válida: um pedido atrasado, `rule.state:
  'late'`.
- Cancelada e nunca reenviada: outra escolha na track (RC ou Live), stop da
  track ou do transporte, stop do usuário, mapeamento removido ou alterado,
  AbletonOSC perdido. Um clip sem loop que termina sozinho mantém a regra. Uma
  desconexão do celular não a cancela.
- Previsão: `entrada = ceil(T/Q)·Q` depois do início; `exact`, `repeat`
  (o clip em loop toca a diferença) ou `silence` (sem loop).
- A precisão é uma hipótese a validar no Live 12, não um contrato.

Mudanças globais confirmadas cancelam todas as regras waiting/armed ainda
não enviadas, inclusive com override de clip, com `global_quantization_changed`;
repetir o mesmo valor não cancela. Escrita local pendente bloqueia arming
(`quantization_pending`) e envios, mas a prova de posição continua. Falha,
offline ou timeout cancela regras suspensas com `quantization_unconfirmed`.
Global desconhecido bloqueia arming. Regras canceladas não voltam por callback
tardio ou reconexão. Regras já enviadas conservam ledger; fire/stop compensatório
não desfaz a fila do Live.

### Autorização de comandos

- `getClipTargets`: `read`. Tracks com clips, nomes reais, slots, ids de
  sessão, marcadores.
- `getClipLaunchStatus`: `read`. Estado atual de cada destino de Launch Clip e
  os 20 últimos diagnósticos de regra.
- `testClipLaunch({ control, targetIndex })`: `live-write`. Uma ativação de um
  destino de Launch Clip salvo, com as mesmas regras do gesto.
- `setGlobalClipQuantization({ quantization })`: `live-write`; viewer recusado.
  Objeto exato, inteiro 0..13; strings, frações, arrays e campos extras recusados
  antes do envio. Um setter por pedido explícito, sem escrita concorrente ou
  fila offline. Sucesso exige resposta válida do Live depois do envio, igual
  ao pedido em até 2000 ms; resposta divergente atualiza observação sem anunciar
  sucesso. Mesmo valor confirmado é no-op. Sem retry/replay nem persistência
  em mapping, preset ou `.rcsurface`. Resposta tardia só atualiza observação.
  OSC não tem request IDs: observação não prova autoria exclusiva/ordem.
- `getClipTargets` e `getClipLaunchStatus` acrescentam o mesmo objeto
  `globalQuantization`, preservando arrays existentes de tracks/status.

Enum Song: `0=None, 1=8 Bars, 2=4 Bars, 3=2 Bars, 4=1 Bar, 5=1/2,
6=1/2T, 7=1/4, 8=1/4T, 9=1/8, 10=1/8T, 11=1/16, 12=1/16T, 13=1/32`.
Quantização de clip tem enum separado (`0=Global`, `1=None`, `2..14`);
é só observada e nunca escrita por este comando.

## Persistência e transporte REC/AUT 2.0

### Gravação em Session vazia

Idle nativo distingue `playing_slot_index=-2` (Clip Stop concluído) de
`fired_slot_index=-2` (parada na fila). Exige fired=-1; playing=-1/-2 é concluído.
Com índice playing não negativo retido, exige has_clip concordante fresco,
is_triggered=false, Clip.is_recording=false e Clip.is_playing=false. O polling
retira tentativa parada confirmada sem nova escrita e limpa seu erro STOP pendente;
transporte false, flags desconhecidas ou tempo decorrido isolados não bastam.
Captura que termina em PLAY mantém posse. STOP não adota clip SDK sem identidade;
observação normal fresca de gravação pode vinculá-lo.

`recordingReturnToArrangement({})` é live-write explícito controller/admin. Exige
Session inteira ociosa com leituras frescas, record mode e Session Record off,
contexto e Song atuais; clips ativos/na fila/desconhecidos vetam. Envia Song
`back_to_arranger=0` uma vez e confirma getter nativo sem replay. Não pausa/toca
transporte, move posição, arm, Loop/Punch In ou clips. Transporte rodando pode
continuar o Arrangement conforme pedido pelo clique. O navegador seleciona
ARRANGEMENT só com sucesso confirmado; troca passiva de modo nunca retorna.

`getSessionRecordingState({offset})` é somente leitura, em janela de oito cenas
(offset múltiplo de 8). Identidades SDK de Song/track/cena/slot e nomes de clips
formam a grade; índices fired/playing da track e flags recording/playing do Clip
observados por OSC definem estado. Não usa ClipSlot `playing_status` em faixa
normal, nem consulta cada célula no polling. Limites: 256 tracks normais e 4096
cenas. A posse inclui todas as entradas armadas explicitamente enviadas, não
apenas a área horizontal visível.

`recordingSessionRecord` é `live-write` controller/admin, objeto exato
`{songId,scene:{index,id,name},targets:[{track:{index,id,name},slotId}],bars,quantization}`.
Alvos são não vazios, ordenados, únicos e iguais ao conjunto armado inteiro e
fresco. Token por Song, identidades únicas, slot vazio no SDK/OSC, armabilidade/
monitor observados, índices fired/playing ociosos e ausência de gravação são
verificados antes dos disparos. Compassos: 1/2/4/8/16, convertidos pela fórmula
fresca para beats. ClipSlot.fire recebe `(trackIndex,slotIndex,record_length)` em
Global; Nenhuma/1compasso/1beat acrescentam enum Song 0/4/7. Não usa o enum
separado de propriedade Clip, nem altera a preferência global. MAP Launch Clip
preserva seu comportamento anterior de dois argumentos.

O slot de operação REC existente serializa Arrangement/Session; STOP prioritário
cancela confirmação pendente. `recordingSessionStop({})` não envia transporte ou
record mode global, não altera ARM nem apaga clips. Track.stop_all_clips pode
afetar toda a faixa: antes de cada envio, fired/playing frescos precisam apontar
para a cena própria, com o mesmo slot/clip SDK e has_clip concordante. Alvo ainda
vazio e na fila também pode ser parado. Índices externos/substituições conhecidos
retiram posse, mesmo se o clip antigo voltar depois. STOP não adota clip novo sem
identidade. Quantização nativa pode deixar `SESSION_STOP_PENDING`; limite de dois
segundos para leituras encerra o comando e mantém posse segura para retry explícito,
sem repetir escritas no polling. Perda de contexto/Set/link retira posse sem replay.
Disparos multifaixa são sequenciais, com limpeza observada e limitada só dos alvos
próprios emitidos em falha parcial; OSC não garante ACK transacional nem autoria
exclusiva.

CFG de CLIP é local à página aberta (padrão 4 compassos/Global), sem novo formato
persistido. Abrir/trocar modo, selecionar cena ou CFG é passivo. Destino, ARM e
renomeação travam durante a posse; SOLO/MUTE explícitos continuam disponíveis.
Não usa pré-roll/Punch In/Arrangement Loop. Overdub de clip existente, navegação
de takes, audition e comp ficam fora deste comando. Estado observado não comprova
captura física de áudio/MIDI nem preservação de takes.

### Arrangement, AUT e contratos compartilhados de tracks

Marcadores usam cópia ordenada por cue.time, estável nos empates, preservando
nomes completos e ordem SDK. O salto nativo resolve o índice SDK original por
nome/tempo exatos. Posicionar marcador exige transporte parado/record off frescos
e nomes/monitor da faixa selecionada; não exige preflight de mixer sem relação.
Gravação mantém preflight completo. Último compasso confirmado pode permanecer
visivelmente desatualizado só nos labels, sem transformar null/stale em autorização
de gravação; compasso stale isolado não reconstrói DOM de marcadores.

AUT aceita FREE de 1–30 segundos inteiros e SYNC de 1–5 compassos. Os padrões
continuam 10 segundos/2 compassos; loops anteriores de 10 ou 20 segundos seguem
válidos. Navegador, persistência no host, presets e importação usam a mesma
validação; formato salvo e limite de 1024 pares não mudam. Abrir ajustes
passivamente não arma, toca nem emite valores XY.

`recordingRenameTrack` é um comando `live-write` para controller/admin, com
argumentos exatos `{track:{index,id,name},name}`. O nome na referência é o antigo
esperado; o novo é aparado, com 1–128 caracteres e sem controles C0/DEL/C1.
O setter SDK Track.name escreve uma vez após observar identidade/estado parado;
observação limitada do nome nativo confirma a alteração. Renomear é serializado
com outras escritas REC, bloqueia durante tentativa REC/pré-roll própria e cede ao
STOP prioritário. Só metadados antigos do conjunto não bloqueiam após STOP.
Mudanças de sessão/link/Set ou identidade aposentam a confirmação sem repetir.
Renomear não altera arm, solo, mute ou transporte. Enter salva, Escape cancela;
polling mantém rascunho/foco e sair do campo não salva.

`recordingTrackVolume` é um comando `live-write` para controller/admin, com
argumentos exatos `{track:{index,id,name},volume:number}`, com volume em `[0, 1]`.
Os métodos SDK `mixer.volume.getValue()` / `setValue()` leem e escrevem o parâmetro
nativo, normalizado pelo min/max declarado. A releitura confirma cada escrita;
valor ausente, vencido ou não confirmado permanece desconhecido. Volume serializa
com outras escritas de track REC, cede ao STOP prioritário e preserva ARM/SOLO/MUTE.
Duplo-clique usa o `defaultValue` nativo. Um arco de 270 graus mostra a magnitude
normalizada; o valor acessível permanece em porcentagem, sem legenda numérica
visível nem curva dB formatada. Troca de Set/sessão/identidade ou perda
cancela o gesto; apenas o último alvo do mesmo gesto atual pode seguir uma escrita em andamento.

Mappings, presets e projetos vivem em `storageDirectory/surface-v2/`, com schemas de projeto/preset/performance 2. Dados 1.x e overrides/snapshots do primeiro candidato 2.0 não são importados; arquivos antigos permanecem. AUT persiste pontos/ajustes XY, nunca playback/contagem/captura. Reconectar exige Play explícito; SYNC requer posição/tempo/compasso atuais do Live tocando, FREE usa tempo decorrido. Configuração dos pads XY abre por toque longo no celular ou clique direito no desktop sem reduzir as dimensões dos pads ou alterar loops de automação.

`recordingRecord` também aceita `passes: null | inteiro(1..10)`. INÍCIO pode ser
`{name,time}` exato ou ponto fixo `{source:'cursor',time}`. O cursor usa locator
temporário próprio do SDK para fixar a entrada nativa, com limpeza limitada e
identidades verificadas. FIM=null exige passes=null e Loop=false. Fim limitado
deve vir depois do início; Loop só liga para várias passagens ou repetição sem
limite. A página não tem outro botão Loop e não converte fim inválido em livre.

O plano confirma trecho/Punch Out nativo antes de começar. No computador,
conta voltas observadas, desliga Loop na última passagem finita e confirma STOP
após o limite nativo da captura. Plano aceito continua sem o socket do celular;
escritas pendentes mantêm a proteção da sessão original. STOP, perda de OSC,
troca de Set/conjunto de faixas ou edição externa do trecho aposentam sua posse.
Posição ambígua não permite inferir voltas nem confirmar conclusão. Punch Out
próprio só restaura após STOP confirmado e sem edição externa observada.
Pré-roll só antes da primeira passagem. Captura, ressonância e tempo exato
ainda dependem de aceite físico no Live.

REC envia `tracks` como conjunto ordenado não vazio de referências `{index,id,name}` (até 256); o backend confirma todas as identidades, armabilidade, ARM e ausência de ARM externo. Comandos legados de uma faixa são normalizados. ARM MULTI preserva outras entradas; EXCLUSIVE age somente no ARM explícito e confirma o conjunto inteiro. SOLO/MUTE usam confirmação GET serializada sem interromper o pré-roll. STOP nativo tem prioridade, para reprodução e gravação, e restaura pré-roll / Punch In temporário mantendo o estado de ARM das faixas intacto sem desarme automático.

ARM dos cartões usa nomes, transporte parado/record off, capacidades e vetor ARM armável inteiro confirmados recentemente, sem depender de Loop, compasso, posição, click ou flags do mixer. Grupo recém-confirmado como não armável fica fora desse vetor sem inventar observação ARM. Evidência necessária ausente veta escrita/confirmação; repetições limitadas enviam só GET. Escrita sem confirmação pode já ter sido aplicada: cartões mostram ARM desconhecido e reconciliam por nova leitura, sem replay nem sucesso otimista. Ao armar no modo MULTI, se a preferência de Exclusive Arm do Live fizer o host desarmar outra entrada, o backend rejeita o efeito colateral com ARM_COLLATERAL_DISARM em vez de falha genérica, explicando que a preferência do Live desarmou outra faixa. Leitura passiva completa que falha pode atualizar evidência dos cartões mantendo o erro; iniciar REC ainda exige preflight completo recente, inclusive observações ausentes no snapshot parcial. O Live lança erro em `Track.arm` de grupo, então o AbletonOSC responde nil ao GET ARM; leituras completas de REC aceitam `can_be_armed=false` recente como evidência ARM completa dessa track e nunca a contam como entrada armada externa, enquanto ARM nil de entrada armável continua desconhecido.

Punch In tem baseline/desired/expected e posse por Song/sessão/conexão: ON no pré-roll, OFF no início direto; restauração somente se ainda próprio e sem edição externa observada. Pré-roll usa compasso observado e locator existente exato ou SDK temporário, removido e confirmado antes de armar/tocar. `count_in_duration` é somente leitura. Perda de sessão/link/Set nunca repete cleanup. Captura de áudio e preservação de takes não são provadas pela observação de record mode.

VID expõe até quinze identidades de pose, três a seis exemplos cada. Avisos de captura são orientativos, sem hard veto novo; Note/Clip/Watchdog mantêm seus contratos existentes. PALM e FACE entram como controles 0–1; FACE vem de orientação palma/dorso, não de rastreamento facial. Ausência/não finito emite `lost:true` e usa Safe loss, sem inventar uma medição neutra.

O reconhecimento também verifica contradições locais nas articulações com apoio
da maioria do banco. Dobras intermediárias mantêm tolerância aprendida; juntas
colapsadas ou de perfil não fornecem nova evidência angular. Formato dos
descritores/banco, distância, calibração, presets e tempos de hold/release/perda
não mudam. Isso não recupera anatomia oculta ou incorreta nos landmarks da câmera.
