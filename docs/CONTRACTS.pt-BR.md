# Contratos — RC Surface

Este documento registra os contratos entre o host e o telefone que valem nos
dois lados. Cada seção é exercida por testes que falham quando o contrato
deriva; a fonte da verdade está na implementação; este documento apenas
descreve para evitar que quem revisa precise vasculhar as duas árvores.

---

## Política rítmica (LFO e Stutter)

As formas rítmicas são calculadas em dois lugares que precisam concordar
byte a byte:

- **Host:** `src/live/transport-clock.ts`
  — `getLfoSubdivision`, `getLfoMaxHz`, `getStutterTiming`
- **Telefone:** `static/phone-v3/controls.js`
  — `LFO_SHAPE_MAX_HZ`, `LFO_SUBDIVISIONS`, `STUTTER_SUBDIVISIONS`,
    `getLfoSubdivision`, `getLfoMaxHz`, `getStutterSubdivisions`,
    `getStutterTiming`, `advanceStutterPhase`

**Teste de paridade:** `tests/modulator-policy-parity.test.mjs` avalia host
e navegador sobre cada forma, tempo, Auto/free e pino antigo e exige que as
duas implementações concordem.

### Tetos por forma (`LFO_SHAPE_MAX_HZ`)

| Forma     | Hz máx |
| --------- | ------ |
| sine      | 4      |
| triangle  | 3      |
| ramp_up   | 3      |
| ramp_down | 3      |
| square    | 12     |

Esses tetos são o contrato; uma mudança só de um lado faria a outra ponta
aceitar um gesto que a outra recusa, e o usuário veria o controle parar de
seguir o dedo sem erro visível.

Origem: `internal/LIVE-WRITE-CEILING-1.0.md`, regra
`maxHz(forma) = floor(teto_efetivo / minPontosPorCiclo(forma))`. A tabela
acima é o **fallback** para `teto_efetivo ≈ 50 escritas/s` (P04 da task
write-ceiling ainda pendente em 2026-09-17). Quando `teto_efetivo` for
medido, regenerar a tabela e atualizar este doc, os dois arquivos-fonte
(`src/live/transport-clock.ts:11`, `static/phone-v3/controls.js:17`) e o
teste de contrato congelado (`tests/contracts-freeze.test.mjs`).

### Velocidades de sincronia

`getLfoSubdivision(rate, bpm, pin)` encaixa a posição do dedo nas divisões
que mantêm o Hz renderizado no máximo do teto por forma acima, em tempos de
30–300 BPM e pinos legados (3, 2/3, 1/8, 1/32).

### Distribuição do Stutter Auto

Com `syncMode === "sync"`, `getStutterTiming(rate, beat, bpm, auto)` percorre
o gesto de rate 0 a rate 1 e só emite velocidades atingíveis sob o teto de
sincronia. Em 120 BPM o conjunto clássico é:

| rate | frequência |
| ---- | ---------- |
| 0    | 2          |
| 0.4  | 4          |
| 0.8  | 8          |
| 1    | 8          |

### Stutter FREE

`auto === false` lê o gesto por toda a barra sem zona morta cortada; o teto
audível é o teto de reprodução do host, não um corte do telefone.

### Por que duas implementações

O telefone precisa dos números para renderizar o dial, rótulo e gate dentro
do orçamento de quadro crítico. O host precisa dos mesmos números para
agendar a escrita dos parâmetros LFO/Stutter que voltam ao Live. Qualquer
lado que trate a tabela como sua esconde um bug: o mostrador desenharia uma
posição que o host se recusa a honrar, e o usuário acharia o controlador
quebrado. O teste de paridade é a única coisa que mantém os dois honestos —
trate qualquer deriva ali como impeditivo de release, não como oportunidade
de refatorar.

---

## Limites do protocolo de fio (ADR-004 / congelado)

O telefone e o servidor compartilham os mesmos limites numéricos para que
um payload que passa no telefone também passe no servidor.
`src/server/ws-bounds.ts` é a fonte da verdade; `tests/contracts-freeze.test.mjs`
verifica que cada valor desta tabela confere com o runtime. Mudar aqui é um
salto de versão de protocolo, não uma refatoração — incremente
`controlStreamVersion` no payload hello de `src/server/ws.ts` e envie os
dois lados juntos.

| Constante                            | Valor            | Propósito                                              |
| ------------------------------------ | ---------------- | ------------------------------------------------------ |
| `MAX_PAYLOAD_BYTES`                  | 100 KiB          | Rejeita quadros maiores que isso na camada `ws`        |
| `MAX_WS_CONNECTIONS`                 | 64               | Sockets abertos no total (telefone + admin)            |
| `MAX_WS_CONNECTIONS_PER_IP`          | 16               | Limite por IP para NAT não travar um cliente só         |
| `WS_HEARTBEAT_INTERVAL_MS`           | 15 000           | Cadência do probe de vivência                           |
| `MAX_CLIENT_NAME_LENGTH`            | 64 code-points   | Truncar via `Array.from`, não `length`                  |
| `MAX_CONTROL_NAME_LENGTH`           | 128 chars        | Rejeita nomes longos demais                             |
| `MAX_CONTROLS_PER_SNAPSHOT`         | 128              | Rejeição dura no gargalo do snapshot                    |
| `MAX_CONTROLS_PER_IMMEDIATE_BATCH`   | 12               | Caminho de alta taxa só para descritores                |
| `HISTORY_RING_SIZE`                  | 120              | Ring buffer por controle                                |
| `RATE_BURST`                         | 600 mensagens    | Tamanho do balde de tokens                              |
| `RATE_SUSTAINED_PER_SEC`             | 300              | Reposição sustentada                                    |
| `RATE_WINDOW_MS`                     | 1 000            | Janela de reposição                                      |
| `RATE_NOTICE_INTERVAL_MS`            | 1 000            | Intervalo mínimo entre avisos de rate-limit            |
| `CACHE_MAX_ENTRIES`                  | 2 048            | Limite de cache                                         |
| `BACKPRESSURE_DROP_THRESHOLD`        | 512 KiB          | Descarta telemetria não crítica acima disso            |
| `BACKPRESSURE_DISCONNECT_THRESHOLD`   | 2 MiB            | Fecha cliente lento com código 4008                     |
| `LISTENER_QUIET_MS` (osc-tokens)     | 1 500            | Silêncio do push-stream antes do polling assumir        |

---

## Registro de endereços OSC (congelado)

O servidor é o único lado que fala OSC; o telefone fala WebSocket e o
servidor traduz. Cada endereço OSC emitido pelo host é, portanto, um
contrato do host, centralizado em `src/osc-tokens.ts`. `osc-transport.ts`
importa do registro e nunca escreve um endereço na mão. O teste de freeze
verifica:

1. Cada endereço congelado existe em `src/osc-tokens.ts`.
2. `src/live/osc-transport.ts` importa de `../osc-tokens.ts` e referencia
   `LISTEN`, `GET`, `CMD` e `RESPONSE` (sem arrays paralelos, sem
   concatenação inline).
3. `LISTENER_QUIET_MS` exportado pelo transporte equivale ao do registro.

Deriva entre o registro e o runtime significa que um typo em qualquer um
dos lados vira silenciosamente um no-op contra o Live; o teste de freeze é
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

`srchello` em `src/server/ws.ts` é o único lugar que monta a mensagem de
boas-vindas. O teste de freeze verifica que cada campo abaixo continua
presente. Remover um é uma quebra para clientes antigos.

| Campo                  | Tipo               | Observação                                         |
| ---------------------- | ------------------ | -------------------------------------------------- |
| `type`                 | `"hello"`          | Discriminador                                      |
| `controlStreamVersion` | `1`                | Incrementa a cada mudança de protocolo             |
| `client_id`            | string             | Identidade atribuída pelo servidor                 |
| `role`                 | string             | Registro do servidor: admin / telefone             |
| `tokenStatus`          | string             | Estado do capability token                         |
| `path`                 | string             | Caminho da URL que o telefone carregou             |
| `commands`             | string[]           | Registro de comandos do servidor (panel/help)     |
| `tempo` / `signature` / `scale` | numbers / string | Snapshot do Live no momento da conexão      |
| `playheadActive` / `playheadTimeMs` | bool / number | Playhead do Live no momento da conexão      |
| `values`               | object             | Cache inicial de valores de controle               |
| `bipolarControls`      | string[]           | Controles que devem renderizar com ponto central   |
| `projectConfig`        | object             | Snapshot do painel ProjectConfig                  |

O telefone tolera campos opcionais ausentes (builds antigos não enviavam
alguns) e ignora campos desconhecidos. Os dois lados da história de upgrade
estão guardados por `tests/upgrade-regression.test.mjs`.

---

## Política de upgrade

O protocolo sustenta por construção uma faixa estreita de forward / backward:

- **Novo campo opcional do servidor**: o telefone não pode quebrar quando
  aparece um campo que ele não conhece. O teste de upgrade-regression
  afirma que o payload hello contém o conjunto conhecido sem exigir que o
  telefone o consuma.
- **Novo campo opcional do cliente**: o servidor deve ignorar chaves
  desconhecidas em snapshot, control e set-display-name; `boundControlFrame`
  em `ws-bounds.ts` é o gargalo.
- **Mudança dura de contrato** (limite, endereço, capability): incrementa
  `controlStreamVersion` em `src/server/ws.ts`, registra o novo valor neste
  documento e envia os dois lados juntos.

Remover um campo congelado ou alterar um limite sem registrar a mudança
aqui é exatamente o modo de falha que este documento existe para evitar.
