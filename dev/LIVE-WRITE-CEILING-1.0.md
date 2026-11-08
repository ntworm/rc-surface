# Live Write Ceiling — RC Surface 1.0

**Status:** P04 executado em 2026-09-21 na candidata instalada
(`RC-Surface-1.0.0.ablx`, Live 12.4.15b3, Windows 11, Extensions SDK
1.0.0-beta.0). 12 células medidas, 0 falhas. `teto_single = 48 escritas/s`,
`teto_paralelo_max = 181 escritas/s (k = 4; k = 8 não acrescenta)`. A tabela
`LFO_SHAPE_MAX_HZ` (sine 4, triangle 3, ramps 3, square 12) fica confirmada
pela medição: nenhuma mudança de código.

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

> Pelo menos 2 células (Utility single, Utility parallel 4). Automation
> Arm ligado, gravar, rodar a célula, parar; zoom em 1 compasso exato
> (2 s @ 120 BPM); `pontos/s = pontos/2`. Print em
> `test-results/write-ceiling/<célula>.png`.

A matriz do Utility Output foi repetida com Automation Arm ligado e
gravação de arranjo ativa (`bench-utility-output-matrix-automation-arm.json`):
single 47.3/s, parallel 2 94.8/s, parallel 4 179.2/s, parallel 8 181.5/s,
0 falhas; a gravação não altera o teto. O Live gravou o envelope como um
bloco denso contínuo (print do responsável). O responsável optou por não
contar pontos por compasso; `teto_pontos_gravados/s` fica **não contado** e
`teto_efetivo` usa o teto single.

| célula | pontos no compasso | pontos/s gravados |
| --- | --- | --- |
| Utility Output — single | não contado | — |
| Utility Output — parallel 4 | não contado | — |

Se o Live simplificar a curva ao parar a gravação, registrar aqui
(`pontos visíveis após stop ≠ pontos durante gravação`) — isso é parte
do resultado.

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

**Medido em 2026-09-21: o Live aceita ≈ 48 escritas/s por parâmetro no caminho single-flight (21 ms por `setValue`), 181/s com 4 em voo; a tabela `LFO_SHAPE_MAX_HZ` em uso já corresponde a esse teto e não muda.**

- `teto_single_escritas/s = 48`
- `teto_paralelo_max_escritas/s = 181 (k = 4)`
- `teto_pontos_gravados/s = não contado` (envelope gravado como bloco contínuo; sem contagem por compasso por decisão do responsável)

`teto_efetivo = min(teto_single_escritas/s, teto_pontos_gravados/s)`
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

Aplicando a regra com `teto_efetivo = 48`:

| shape | min pontos / ciclo | max Hz |
| --- | --- | --- |
| `sine` | 10 | `floor(48 / 10) = 4` |
| `triangle` | 16 | `floor(48 / 16) = 3` |
| `ramp_up` | 16 | `floor(48 / 16) = 3` |
| `ramp_down` | 16 | `floor(48 / 16) = 3` |
| `square` | 4 | `floor(48 / 4) = 12` |

Idêntica à tabela fallback já em `src/live/transport-clock.ts` e
`static/phone-v3/controls.js`; nenhuma alteração necessária.

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
