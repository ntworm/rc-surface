# Live Write Ceiling — RC Surface 1.0

**Status:** P04 executado em 2026-09-21 na candidata instalada
(`RC-Surface-1.0.0.ablx`, Live 12.4.15b3, Windows 11, Extensions SDK
1.0.0-beta.0). 12 células medidas, 0 falhas. `teto_single = 48 escritas/s`,
`teto_paralelo_max = 181 escritas/s (k = 4; k = 8 não acrescenta)`. Em
2026-11-17 a contagem física de pontos no `.als` salvo mediu
`teto_pontos_gravados/s = 45` (single) e `teto_efetivo = 45`. A tabela
`LFO_SHAPE_MAX_HZ` em uso (sine 4, triangle 3, ramps 3, square 15) **não** é
confirmada por essa medição: a regra derivada com `teto_efetivo = 45` daria
triangle e rampas 2 e square 11. A decisão é do item 18 da lista de mudanças de 2026-11-16; o código não muda.

## 1. Setup

| Item | Valor |
| --- | --- |
| Máquina | estação do responsável |
| OS / build | Windows 11 Pro 10.0.26200 |
| Ableton Live | 12.4.15b3 (Beta) |
| Extensions SDK | `1.0.0-beta.0` (instalado em `node_modules/@ableton-extensions/sdk`) |
| Node | 24.16.0+ (worktree) |
| Branch / commit | `plan/rc-surface-release-prep-2026-09-21` (candidata instalada a partir de `0b1a77b`; bancada corrigida em `af28c2e`) |
| Worktree | `C:\Users\Usuario\repos\ableton-extensions\source-repos\.worktrees\rc-surface-release-prep-2026-09-21` |
| Comando do bench | `node scripts/bench-live-write-rate.mjs --matrix --port 8730 --insecure --token <admin> --track T --device 0 --param P --seconds 10` |
| BPM do Set | 120 (4/4) |

## 2. Método

A bancada `benchDeviceParamWrites` (admin-only, comando registrado em
`src/live/mappings.ts` ao lado de `setDeviceParam`) escreve em uma
`DeviceParameter` real do Set durante N segundos com cadência escolhida e
devolve `{started, completed, failed, skipped, meanMs, p50Ms, p95Ms,
maxMs, ratePerSecond, param: {name, min, max}}`. O caminho de produção
(actuador + SDK) tem limitador real = latência de conclusão de
`param.setValue` (single-flight em `pumpLane`), portanto medir a latência
natural de conclusão **sem sleep** entre escritas é o que reproduz a taxa
do caminho real.

Modos:

- **`single` (sem sleep)**: `while elapsed < seconds { t0 = perf.now();
  await param.setValue(v); latência = perf.now() - t0 }`. Reproduz o
  caminho do atuador em produção.
- **`parallel`**: `setInterval(intervalMs)` dispara `setValue` sem
  esperar, mantendo no máximo `parallel` promessas em voo (se atingir o
  teto, conta `skipped`). Mede se paralelismo aumenta a taxa efetiva.
- **Pattern `stairs`**: alterna entre 4 níveis (`min+0.2r`, `+0.4r`,
  `+0.6r`, `+0.8r`, `r=max-min`) — cada escrita é diferente da anterior,
  então cada ponto gravado corresponde a uma escrita aceita (permite
  contar). Pattern `sine`: `mid + 0.4r·sin(2π·hz·t)`.

Guardas: `seconds` obrigatório (1..30); parâmetro `isQuantized`
rejeitado (bench só em contínuo); um bench por vez (flag de módulo;
segundo pedido concorrente → erro `bench already running`); valor
inicial restaurado ao fim.

Matriz mínima (10 s cada, `stairs`):

| alvo | single | parallel 2 | parallel 4 | parallel 8 |
| --- | --- | --- | --- | --- |
| Utility Gain | — | — | — | — |
| Rack macro 1 | — | — | — | — |
| terceiro alvo | — | — | — | — |

Terceiro alvo = mixer volume da faixa (se `getDeviceParams` expor
volume de mixer); senão `não medido` no doc.

## 3. Resultados

### 3.1 Matriz — escritas iniciadas / completadas / latência / taxa

**Como rodar a matriz (P04)**:
1. Em um terminal: `cd <worktree> && npm start`. A extensão sobe admin
   WS e imprime a URL `?token=...` (copiar o token para `--token`).
2. Em outro terminal:
   `node scripts/bench-live-write-rate.mjs --list --port <port> --token <hex> --track 0 --device 0`
   para descobrir os `--param` dos 3 alvos.
3. Para cada célula da matriz (3 alvos × {single, parallel 2/4/8} =
   11 células; usar `--matrix` para automatizar), rodar
   `node scripts/bench-live-write-rate.mjs --matrix --port <port> --token <hex> --track T --device D --param P --seconds 10 --json test-results/write-ceiling/bench-<alvo>-<modo>.json`.
4. Preencher 3.1 a partir dos JSON. Em paralelo, gravar 2 células com
   Automation Arm ligado e contar pontos (3.2). Por fim, deixar um LFO
   real do phone (triângulo, 1/16, 120 BPM) rodar 10 s e coletar
   `getActuatorStats` antes/depois (3.3).

Alvos reais em 2026-09-21: Utility **Output** (track 0, device 0, param 9;
o "Gain" do Utility no Live 12 chama-se Output) e Rack **Macro 1** (track 1,
device 0, param 1). Volume do mixer não é exposto por `getDeviceParams`:
**não medido**. `stairs`, 10 s por célula. JSON em
`test-results/write-ceiling/bench-utility-output-matrix.json` e
`bench-rack-macro1-matrix.json` (worktree acima; não versionados).

| alvo | modo | started | completed | failed | skipped | meanMs | p95Ms | maxMs | rate/s |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Utility Output | single | 478 | 478 | 0 | 0 | 20.93 | 22 | 40 | 47.7 |
| Utility Output | parallel 2 | 965 | 965 | 0 | 861 | 18.68 | 22 | 23 | 96.2 |
| Utility Output | parallel 4 | 1822 | 1822 | 0 | 0 | 16.65 | 22 | 24 | 181.6 |
| Utility Output | parallel 8 | 1818 | 1818 | 0 | 0 | 16.58 | 22 | 24 | 181.3 |
| Rack Macro 1 | single | 482 | 482 | 0 | 0 | 20.78 | 22 | 23 | 48.0 |
| Rack Macro 1 | parallel 2 | 955 | 955 | 0 | 864 | 19.32 | 22 | 24 | 95.2 |
| Rack Macro 1 | parallel 4 | 1821 | 1821 | 0 | 0 | 16.74 | 22 | 24 | 181.5 |
| Rack Macro 1 | parallel 8 | 1819 | 1819 | 0 | 0 | 16.68 | 22 | 24 | 181.2 |
| mixer volume | — | não medido (não exposto por `getDeviceParams`) | | | | | | | |

Leitura: o caminho de produção é single-flight por lane (`pumpLane`), logo
o limite real é a latência de conclusão de `setValue` ≈ 21 ms → **48
escritas/s**. Paralelismo até 4 em voo quadruplica a taxa (181/s); 8 não
acrescenta (mesmo teto: o host serializa em ~5,5 ms por escrita). `skipped`
em parallel 2 é o intervalo de 5 ms batendo no limite de 2 em voo, esperado.

### 3.2 Contagem física de pontos de automação

> A contagem é feita no arquivo salvo (`.als`), não na tela: o envelope
> gravado é o registro do que o Live gravou.

Método (2026-11-17), um Set novo a 120 BPM com o Utility na track 0, gravando a
matriz inteira do Utility Output de uma vez:

1. Comando do bench na forma de :21, com Automation Arm ligado e gravação de
   arranjo ativa:
   `node scripts/bench-live-write-rate.mjs --matrix --port 8730 --insecure --token <admin> --track 0 --device 0 --param 9 --seconds 10`.
2. Ao fim da matriz, parar e salvar o Set como cópia para contar o envelope
   gravado.
3. Contagem no `.als` salvo:
   `node scripts/count-automation-points.mjs <cópia>.als --device-class StereoGain --param Gain --bpm 120 --window 34.66:54.66 --window 54.66:74.66 --window 74.66:94.66 --window 94.66:114.66`
   — o primeiro ponto gravado está no beat 34,66; cada janela de 20 beats
   (10 s) cobre uma célula, na ordem single, parallel 2, parallel 4 e
   parallel 8. As bordas variam ±2 pontos; os 37 eventos depois do beat
   114,66 (fim da última célula) ficam fora das janelas e só entram no total.
   O envelope do Output do Utility nesse set é o `PointeeId 22207`
   (`--pointee 22207` dá o mesmo resultado). O script mostra também
   `distinct per event` (pontos distintos por evento), que não é a coluna
   "pontos por escrita" da tabela.

| célula | escritas (janela) | escritas/s (bench) | pontos distintos | pontos/s (contagem) | pontos por escrita | eventos (envelope) |
| --- | --- | --- | --- | --- | --- | --- |
| Utility Output — single | 473 | 47.1 | 452 | 45.2 | 0.96 | 688 |
| Utility Output — parallel 2 | 916 | 91.3 | 879 | 87.9 | 0.96 | 1701 |
| Utility Output — parallel 4 | 1721 | 171.5 | 1258 | 125.8 | 0.73 | 2004 |
| Utility Output — parallel 8 | 1772 | 176.5 | 1344 | 134.4 | 0.76 | 2131 |

Leitura: o gargalo do caminho de produção (single-flight, uma escrita por
vez) é o do single — 452 pontos distintos na janela de 10 s, ou seja
`teto_pontos_gravados/s = 45`. Com 4 escritas em voo o Live grava 1258
pontos distintos na mesma janela (125,8 pontos/s) para 1721 escritas: a razão
(pontos distintos por escrita) cai para 0.73, e o gravador do Live satura em ≈ 125–135 pontos/s. Até ≈ 90
escritas/s quase toda escrita vira ponto. O padrão em degraus faz o Live
gravar duas vezes o mesmo instante em muitas mudanças, por isso a coluna de
eventos é maior que a de pontos distintos.
A contagem é do `.als` salvo, não da tela. A tabela `LFO_SHAPE_MAX_HZ` em
uso não é confirmada por esta medição; a decisão é do item 18 da lista de mudanças de 2026-11-16.

### 3.3 Caminho de produção (actuador real)

> Rodar um LFO do phone (triângulo, 1/16, 120 BPM) durante 10 s; coletar
> `getActuatorStats` antes e depois; reportar `ratePerSecond`,
> `writesCompleted`, `meanMs`, `writesFailed` da janela.

Não coletado em 2026-09-21: o token admin rotacionou entre a instalação
final e a leitura, e o responsável encerrou a bancada. A taxa do caminho
real é limitada pela mesma lane single-flight medida em 3.1 (≈ 48/s); os LFOs
sine/triangle/ramps/square foram aceitos visualmente na automação gravada
pelo responsável nas cinco formas.

| métrica | valor |
| --- | --- |
| ratePerSecond | não coletado |
| writesCompleted | não coletado |
| writesFailed | — |
| meanMs | — |
| p95Ms | — |

## 4. Conclusão (uma frase)

**Medido em 2026-09-21: o Live aceita ≈ 48 escritas/s por parâmetro no caminho single-flight (21 ms por `setValue`), 181/s com 4 em voo; medido em 2026-11-17 no `.als` salvo, o Live grava ≈ 45 pontos/s no single — a tabela `LFO_SHAPE_MAX_HZ` em uso não é a que a regra derivada produz, e o código não muda (decisão no item 18 da lista de mudanças de 2026-11-16).**

- `teto_single_escritas/s = 48`
- `teto_paralelo_max_escritas/s = 181 (k = 4)`
- `teto_pontos_gravados/s = 45` (contagem no `.als` salvo, célula single: 452 pontos distintos em 10 s)

`teto_efetivo = min(teto_single_escritas/s, teto_pontos_gravados/s) = 45`
(o menor — o gargalo real é o que o Live grava, não o que o SDK aceita).

## 5. Regra derivada para `LFO_SHAPE_MAX_HZ`

A regra é `maxHz(shape) = floor(teto_efetivo / minPointsPerCycle(shape))`,
onde `minPointsPerCycle(shape)` é o mínimo de pontos para o ciclo de uma
forma ser distinguível na automação gravada:

| shape | min pontos / ciclo | motivo |
| --- | --- | --- |
| `sine` | 10 | meio período visível + bordas |
| `triangle` | 16 | precisa das 4 arestas + curvatura |
| `ramp_up` | 16 | subida precisa de segmentos distintos |
| `ramp_down` | 16 | descida precisa de segmentos distintos |
| `square` | 4 | só precisa de 2 transições por ciclo |

Ao lado da tabela em uso no código (`src/live/transport-clock.ts` e
`static/phone-v3/controls.js`), com a regra aplicada a `teto_efetivo = 45`
(contagem de 2026-11-17):

| shape | min pontos / ciclo | em uso | derivada com 48 | derivada com 45 |
| --- | --- | --- | --- | --- |
| `sine` | 10 | 4 | 4 | `floor(45 / 10) = 4` |
| `triangle` | 16 | 3 | 3 | `floor(45 / 16) = 2` |
| `ramp_up` | 16 | 3 | 3 | `floor(45 / 16) = 2` |
| `ramp_down` | 16 | 3 | 3 | `floor(45 / 16) = 2` |
| `square` | 4 | 15 | 12 | `floor(45 / 4) = 11` |

O `square` já diferia antes desta medição: 15 no código contra 12 derivado
de `teto_efetivo = 48`. Com o teto de 45 a diferença passa a valer também
para `triangle` e para as rampas. O código **não** muda com esta medição; a
decisão é do item 18 da lista de mudanças de 2026-11-16.

Esta tabela alimenta `LFO_SHAPE_MAX_HZ` na task
`rc-surface-modulator-quality-2026-09-16` (atualmente bloqueada por esta).

## 6. O que não foi medido

- macOS — apenas Windows; outras plataformas documentadas como não
  medidas.
- Outros parâmetros além dos 3 alvos da matriz.
- Live sob carga alta de CPU / múltiplos tracks com plugins pesados.
- Diferença entre o SDK `1.0.0-beta.0` e uma versão estável (quando
  existir); comportamento pode mudar.

---

# pt-BR (resumo)

A bancada `benchDeviceParamWrites` (admin) mede `setValue` por segundo
em `DeviceParameter` real. A taxa single é limitada pela latência de
conclusão do SDK (single-flight no atuador). Paralelismo testa se
aumenta a taxa efetiva; a taxa real do caminho de produção é medida
via `getActuatorStats` com um LFO do phone rodando. A contagem física
de pontos de automação no Live pode ser menor que as escritas
completadas (coalescing/simplificação na UI). A regra derivada é
`maxHz(shape) = floor(teto_efetivo / minPointsPorCiclo(shape))` e
alimenta `LFO_SHAPE_MAX_HZ` da task de qualidade do modulador.
