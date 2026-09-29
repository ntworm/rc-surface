# Contratos — RC Surface

Este documento registra os contratos que o host e o celular compartilham. Cada
seção é coberta por testes que falham quando um lado se afasta do contrato. A
fonte da verdade é a implementação; este documento só a descreve, para quem
revisa não precisar vasculhar as duas árvores de código.

---

## Política rítmica (LFO e Stutter)

As formas rítmicas são calculadas em dois lugares que precisam concordar
byte a byte:

- **Host:** `src/live/transport-clock.ts`
  — `getLfoSubdivision`, `getLfoMaxHz`, `getStutterTiming`
- **Celular:** `static/phone-v3/controls.js`
  — `LFO_SHAPE_MAX_HZ`, `LFO_SUBDIVISIONS`, `STUTTER_SUBDIVISIONS`,
    `getLfoSubdivision`, `getLfoMaxHz`, `getStutterSubdivisions`,
    `getStutterTiming`, `advanceStutterPhase`

**Teste de paridade:** `tests/modulator-policy-parity.test.mjs` avalia host
e navegador em todas as combinações de forma, andamento, Auto/free e pin legado,
e exige que as duas implementações concordem.

### Tetos por forma (`LFO_SHAPE_MAX_HZ`)

| Forma     | Hz máx |
| --------- | ------ |
| sine      | 4      |
| triangle  | 3      |
| ramp_up   | 3      |
| ramp_down | 3      |
| square    | 12     |

Esses tetos são o contrato. Uma mudança feita só no navegador ou só no host
faria um lado aceitar um gesto que o outro recusa, e o usuário veria o controle
parar de seguir o dedo sem nenhum erro na tela.

Origem: `internal/LIVE-WRITE-CEILING-1.0.md`, regra
`maxHz(forma) = floor(teto_efetivo / minPontosPorCiclo(forma))`. A tabela
acima é o **fallback** para `teto_efetivo ≈ 50 escritas/s` (a task P04 de
write-ceiling ainda estava pendente em 2026-09-17). Quando `teto_efetivo` for
medido, gere a tabela de novo e atualize este documento, os dois arquivos-fonte
(`src/live/transport-clock.ts:11`, `static/phone-v3/controls.js:17`) e o
teste de contrato congelado (`tests/contracts-freeze.test.mjs`).

### Velocidades de sincronia

`getLfoSubdivision(rate, bpm, pin)` encaixa a posição do dedo nas divisões
que mantêm o Hz resultante igual ou abaixo do teto de cada forma, em
andamentos de 30 a 300 BPM e nos pins legados (3, 2/3, 1/8, 1/32).

### Distribuição do Stutter Auto

Com `syncMode === "sync"`, `getStutterTiming(rate, beat, bpm, auto)` percorre
o gesto de rate 0 a rate 1 e só emite velocidades que cabem no teto do modo
sync. A 120 BPM, o conjunto clássico é:

| rate | frequência |
| ---- | ---------- |
| 0    | 2          |
| 0.4  | 4          |
| 0.8  | 8          |
| 1    | 8          |

### Stutter FREE

`auto === false` lê o gesto em toda a extensão, sem zona morta limitada; o
limite audível é o teto de reprodução do próprio host, não um corte feito no
celular.

### Por que duas implementações

O celular precisa dos números para desenhar o dial, o rótulo e o gate dentro
do tempo de cada frame. O host precisa dos mesmos números para
agendar a escrita dos parâmetros LFO/Stutter que voltam ao Live. Qualquer
lado que trate a tabela como só sua é um bug: o mostrador desenharia uma
posição que o host se recusa a honrar, e o usuário acharia o controlador
quebrado. O teste de paridade é a única coisa que mantém os dois honestos —
trate qualquer deriva ali como impeditivo de release, não como oportunidade
de refatorar.

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
- **Cancelamento seguro:** Parada de transporte, seek, loop, relógio OSC desatualizado, exclusão de track, troca de dispositivo, desconexão ou remoção de bind cancelam imediatamente todos os disparos pendentes e desligam vozes ativas nas tracks afetadas.

### Safe loss de visão

Quadros sem mão ou com landmarks incompletos seguram a última saída real e a pose aprendida, inclusive notas immediate/hold. Uma mudança ou soltura real reconcilia a borda uma vez. Camera OFF, pagehide, Panic, remoção de bind e desconexão encerram notas e agendamentos. Novos mapeamentos de visão usam `neutralPolicy: 'hold'`; o antigo padrão `release` migra uma vez para hold com `visionSafeLossVersion: 2`, preservando `zero`/`center`/`custom`, um `release` escolhido depois e controles sem visão.

### Autorização de comandos (`testTriggerNote`)

- `testTriggerNote({ control, targetIndex })`: Comando de escrita ao vivo executado exclusivamente em mapeamentos já salvos.
- Avaliado dentro de um `CommandExecutionContext` confiável (`clientId`, `isCurrent()`) montado pelo servidor a partir do socket da conexão (nunca de argumentos enviados pelo cliente).
- Autorizado apenas para papéis `controller` ou `admin`; sessões não autorizadas ou desatualizadas são rejeitadas.
