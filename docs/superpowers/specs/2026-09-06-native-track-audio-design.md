# AUD — análise e modulação nativas por track

**2026-09-07 — teste adiado pelo proprietário (`PENDING_OWNER_DEFERRED`).**
Não há gravação quantitativa Remote/controle. Gate A permanece fechado e
Tasks 3–6 não devem começar. O trabalho atual passou à auditoria do lançamento:
`internal/RELEASE-READINESS-2026-09-07.pt-BR.md`. A arquitetura abaixo permanece
como projeto futuro, não como feature pronta ou autorização para retomar.

Data: 2026-09-06. Estado: contrato/timing implementados (Task 1); carga original da Task 2 falhou com crash fatal. Após reparo `6142b21` do envelope AMXD, o proprietário confirmou **carga dos dois arquivos de `gate-a-load-fix-r1`, reação do ganho e liberação manual por OFF**. Print confirma `target_prepared`. **Teste básico PASS; latência real, demais caminhos de liberação e pareamento ainda não validados; Gate A fechado.** Não iniciar Tasks 3–6. Evidência e próxima ação no plano vinculado; procedimento em `internal/NATIVE-AUDIO-VALIDATION.md`.

O proprietário aprovou a direção e autorizou implementar: no modo Track, o dispositivo dentro do Live analisa o áudio e modula parâmetros; o celular apenas mostra resultados e altera configurações. Instalação e operação de apps continuam fora do escopo. As escolhas de engenharia abaixo estão sujeitas aos gates do [plano de execução](../plans/2026-09-06-native-track-audio.md).

## 1. Resultado e limites

- Seletor de entrada `Browser` (padrão) / `Live track` na barra Audio input.
- Browser conserva captura, DSP, preferências e mappings existentes.
- Track usa um novo **RC-Audio-Descriptors.amxd**, colocado manualmente pelo usuário. Não é o antigo RC-Audio-Sender.amxd, que envia notas MIDI.
- Os doze descritores permanecem disponíveis: transient, kick, snare, brightness, centroid, rolloff, flux, flatness, spread, low, mid, high. RMS/envelope alimentam a vista Amplitude.
- Áudio e valores de modulação não fazem o caminho track → celular → Live. A modulação contínua também não passa por `SDK.setValue` ou pelo actuator do host.
- A página controla configurações do dispositivo selecionado; não mantém uma segunda análise em paralelo nesse modo. Nenhuma permissão de microfone deve ser solicitada no modo Track.
- Sem dispositivo compatível, orientar colocação manual e detectar sua chegada. Em track de instrumento, explicar que o analisador deve vir depois do instrumento. O ponto de captura é sua posição real na cadeia, não um pre/post-fader fictício.
- Não criar detector de BPM. O dispositivo usa o tempo do Live para SYNC.
- Não reviver Follow Detected Note, pitch-to-MIDI, Audio Lab ou controles aposentados. Não alterar o protocolo dos mappings Browser.
- Este projeto não inclui MIX 8+8 ou redesign geral; pendências independentes estão no fim do plano.

## 2. Dois caminhos independentes

```text
Track L/R ──┬──────────────────────────────► saída L/R intacta
            ├─ ataques curtos em MSP ──┐
            └─ análise espectral MSP ─┴─► shaping ─► slots nativos ─► parâmetro
                                             │
                                      amostragem visual limitada
                                             ▼
                                     Node for Max ⇄ host ⇄ página
                                         configurações / ACK / telemetria
```

O ramo audível é `plugin~` → `plugout~`, estéreo e sem processamento adicional. FFT, rede, JavaScript, SDK e pintura de gráficos não podem bloquear o ramo rápido. Não usar `send~/receive~` entre dispositivos Max for Live. Não presumir que sample-accurate significa latência total zero.

A ponte Node for Max é **somente controle/telemetria**. Não processa buffers de áudio, não calcula descritores e não fornece amostras ao modulador. O dispositivo continua musicalmente útil com o processo Node parado ou o telefone desconectado.

## 3. Gate de latência, antes da integração completa

Primeiro construir um protótipo de transient → slot nativo → parâmetro de ganho de um dispositivo de teste. Medir uma gravação real; testes Node não provam agendamento MSP/Live.

Referência: 48 kHz, buffer de áudio 128 samples, Max editor fechado, sem plugins com lookahead/oversampling, Smooth OFF, ao menos 200 ataques. Registrar versões Live/Max/SDK, driver, buffer, vetor MSP, PDC e roteamento. Medir separadamente:

1. início do áudio na entrada do analisador → mudança do detector;
2. início do áudio → mudança audível no alvo;
3. detector → valor desenhado na página (não faz parte da latência musical).

**Meta inicial de aceitação, não promessa:** transient amplo com P95 ≤ 10 ms no caminho 2 dessa referência, sem perda de ataques isolados nem fila crescente. Publicar mediana, P95 e máximo, não apenas média. Repetir com buffer 64/256/512, 44,1/96 kHz e carga; os 10 ms não são uma garantia para todas essas configurações. Para kick/snare e FFT publicar seus próprios resultados: filtragem de graves e janelas maiores impõem outros limites.

Usar gravação simultânea de referência e alvo, limiar de início declarado e teste de offsets conhecidos do medidor. Registrar também um roteamento de controle sem modulação para revelar deslocamento introduzido por gravação/PDC. Não subtrair uma latência estimada silenciosamente. Só usuário opera Live/grava; agente prepara arquivos e analisa evidências fornecidas.

Se a meta falhar, localizar detector, filtro, smoothing, parâmetro, vetor ou PDC; repetir o protótipo limitado. Se `live.modulate~`/`live.remote~` ou a correspondência de IDs não funcionarem no runtime real, registrar bloqueio e pedir decisão. **Não substituir por SDK por frame como se fosse a mesma arquitetura.**

Contexto medido por inspeção/cálculo do Browser atual a 48 kHz: x1 = N512/10,67 ms de cadência e janela espectral 1024/21,33 ms; x2 = N1024/21,33 ms e janela 2048/42,67 ms; x4 = N2048/42,67 ms e janela 4096/85,33 ms. São cadências/extensões de janela, não medições ponta a ponta.

## 4. DSP nativo e equivalência

### 4.1 Ataques: perfil explicitamente diferente

Perfil `native-fast-v1`: detector amplo no domínio do tempo, sem aguardar FFT. Primeira implementação de referência usa energia estéreo `(L² + R²)/2`, envelopes exponenciais de energia fast 1 ms e slow 30 ms, e contraste positivo entre suas raízes. Kick usa a mesma família após HP 35 Hz + LP 100 Hz; snare após HP 1500 Hz + LP 8000 Hz, cada filtro de segunda ordem Butterworth, coeficientes dependentes da sample rate. Testar e registrar o atraso desses filtros; nomes significam ataque na banda, **não classificação infalível de instrumento**.

Núcleo de referência por sample, inicializado em zero:

```text
a(tau) = exp(-1 / (Fs * tau / 1000))
Ef = a(1)*Ef + (1-a(1))*energy
Es = a(30)*Es + (1-a(30))*energy
F = sqrt(max(0, Ef)); S = sqrt(max(0, Es))
contrast = max(0, (F-S) / (F+S+1e-8))
knee = 0.6 - 0.57*sensitivity
u = F < 1e-4 ? 0 : clamp((contrast-knee)/(1-knee), 0, 1)
shaped = pow(u, curve)
ar = exp(-1/(Fs*releaseMs/1000))
out = shaped >= previousOut ? shaped : shaped + (previousOut-shaped)*ar
```

Esses números são parâmetros iniciais do protótipo, não resultado de calibração. Ef/Es podem usar polos MSP com coeficientes equivalentes; a última etapa corresponde a `slide~` com subida 1 sample e descida `1/(1-ar)`, não a um feedback JavaScript. Se a validação exigir ajuste, alterar referência, patch e evidências juntos antes de fixar a versão. Transient deve responder a ataques sem esperar confirmação de kick/snare. Não aplicar debounce MIDI de 70 ms. Não prometer equivalência numérica com ataques espectrais antigos nem modificar o Browser para forçá-la.

### 4.2 Espectro

Reutilizar as definições de `audio-spectral-descriptors.js` e a fórmula de brightness de `audio-descriptors.js`, não bibliotecas com nomes iguais e fórmulas diferentes. Implementar FFT e reduções em `pfft~`/MSP, sem loop JavaScript por frame no caminho musical. Nenhuma dependência externa de DSP; não exigir licença de autoria Gen para construir o projeto.

- Janela Hann; tamanho espectral 1024/2048/4096 em 48 kHz (x1/x2/x4), escala pela mesma regra de N do Browser; hop de metade da janela. Informar tamanho e hop reais, inclusive após mudar sample rate.
- Calcular espectros L/R separadamente e combinar potências por média; obter magnitude da raiz dessa potência. Não somar L+R antes de medir: antiphase não pode virar silêncio.
- Bins de 20 Hz a min(20 kHz, Nyquist). Centroid/spread ponderados por magnitude, rolloff 95% e flatness por potência, flux pela distância L1/2 de magnitudes normalizadas entre frames.
- Centroid/rolloff normalizados por 20000, spread por 10000; clamp 0..1 no transporte. Cartões Hz mostram conversão dessas medidas, não valores alterados por GAIN.
- Low 20–250 Hz; Mid 250–2000 Hz; High 2–20 kHz. RMS linear corrigido pela janela, não loudness perceptual e sem boost oculto de High.
- Silence, DC, não finitos, primeira FFT, mudança de janela/rate e parada de DSP têm reset definido: nenhum NaN, Infinity ou valor antigo apresentado como atual. Primeiro flux após reset = 0.
- Resultados espectrais são sample-and-hold até o próximo frame; smoothing opcional é posterior à extração. WINDOW não muda o caminho dos ataques.

Comparar a saída nativa sem shaping com fixtures/reference Browser mono em tolerância absoluta normalizada ≤ 0,01 (incluindo flatness/flux), RMS com erro ≤ 2% acima do piso 1e-4, Hz com erro ≤ max(um bin, 2% do esperado). Comparar frames alinhados após aquecimento, não frames adjacentes de timestamps diferentes. Uma discrepância de normalização/Hann não pode ser escondida aumentando a tolerância. Testes estéreo têm referência própria.

### 4.3 Controles e SYNC

Mesmos grupos e limites: sensitivity 0..1; curve 0,3..3; gains 0,25..8; FREE release 10..500 ms; FREE smooth 0..200 ms, OFF = 0. Defaults novos: dispositivo OFF, syncMode FREE, sensitivity 0,65, curve/gains 1, release 45 ms, smooth OFF, window x2; preferência musical releaseBeats 0,125 (1/32), toneBeats/textureBeats/bandsBeats 0. Isso não sobrescreve preferências Browser existentes. Shaping exclui ganho de centroid/rolloff/spread.

SYNC oferece denominadores 128,64,32,16,8,4,2,1, cada um reto, T (2/3) e D (3/2); ordenar pela duração. Release não oferece OFF; Smooth oferece. `1/128 T` é 10,4167 ms a 120 BPM. Tempos DSP são float; só o rótulo arredonda. Não reaplicar o mínimo FREE de 10 ms ao tempo SYNC. Maior opção `1/1 D` a 1 BPM requer 360000 ms, não o teto antigo de 240000 ms. BPM válido 1..1000, fallback 120 somente antes da primeira leitura válida, com estado explícito de tempo indisponível.

Persistir duração musical separadamente de FREE ms; manter compatibilidade dos valores antigos .25,.5,1,2,4 beats. A chave canônica continua em quarter-note beats, com uma tabela de labels explícitos para T/D. RELEASE/SMOOTH mantêm semântica de constante de tempo exponencial: SYNC escolhe essa constante, não quantiza o ataque ao próximo beat nem garante término exato de uma cauda. 1/1 é nota inteira (4 quarter beats), não necessariamente um compasso em toda assinatura. O dispositivo observa tempo do próprio Live, sem depender de atualizações da página. Mudança de tempo recalcula coeficientes sem zerar envelopes nem retomar configurações antigas do Browser.

Ao visualizar Track, SYNC da barra reflete o modo confirmado do dispositivo. Ação explícita de controller altera esse modo; abrir a página não sobrescreve o modo salvo. Preferência Browser continua independente. Dois celulares recebem o mesmo estado confirmado.

## 5. Slots nativos e propriedade de parâmetros

V1 oferece 12 slots independentes por dispositivo, cada um podendo escolher qualquer descritor; reutilizar um descritor em slots distintos é permitido. O limite é de slots, não de descritores disponíveis. No máximo um slot RC ativo por parâmetro físico, inclusive entre dispositivos/Browser.

- **Modulate**, candidato preferido apenas para alvos com semântica bipolar comprovada: `live.modulate~`, quantidade assinada -1..1; entrada = descriptor * amount, com sinal 0 neutro nesse caso. Para parâmetros unipolares a documentação descreve outra transformação: sinal 0 pode levar a metade do intervalo entre mínimo e base. V1 não presume polaridade pelos limites min/max, nem pelo nome: se não puder provar bipolaridade, Modulate fica indisponível com `modulation_kind_unsupported`. Remote continua uma escolha explícita, nunca fallback silencioso. Não converter implicitamente 0..1 em -1..1. Exibir base/amount e validar o comportamento real no gate A.
- **Remote**, opção explícita: `live.remote~` normalizado, saída `min + descriptor*(max-min)`, limites 0..1. Toma controle absoluto; informar interferência com automação e controle manual. Desligar/desmapear deve enviar id 0, liberando propriedade, sem escrever zero arbitrário no parâmetro.
- Nenhuma conversão automática de mappings antigos. Apenas parâmetros contínuos elegíveis v1 (parâmetros de device, volume/pan/sends expostos pelo Live); cada modo ainda exige sua capacidade específica. Rejeitar quantizados, alvos inválidos, próprios controles do analisador e duplicados com mensagens claras. Desmapear/OFF envia id 0 aos dois tipos de objeto; não depender de um suposto valor neutro universal.
- Descoberta/mapa LOM em mensagens de baixa prioridade; aplicação contínua é sinal MSP. ID SDK não é ID LOM. Não mapear pelo nome sozinho.
- Phone MAP deve mostrar modo nativo, fonte track/dispositivo e slots; não criar também um mapping Browser para a mesma ação.

Identidade inicial: host resolve track/device via SDK; desafio curto exclusivo escrito no parâmetro reservado `_RC PairNonce` prova qual instância responde pela ponte autenticada. Protótipo deve confirmar parâmetro inteiro 0..16777215 exposto pelo SDK e round-trip exato; sem isso, parar esse desenho de pareamento. Runtime UUID novo a cada carga; nome/posição só são metadados. Nonce é descartável, não senha; expira em 5 s, é consumido uma vez e zerado após confirmação. Registrar renomeação/movimento/duplicação e colisões de UUID persistente.

Para alvo: localizar por caminho estruturado de índices + fingerprint de track/device/param/min/max/quantização sobre uma geração do catálogo. Preparar resolve sem engajar; confirmar revalida catálogo e fingerprint antes de commit. Corrida de reorder/remoção retorna `target_changed`, não escolhe candidato parecido. Após mapear, conservar referência LOM/persistência nativa e atualizar apresentação após movimentos.

Somente restaurar slots automaticamente no mesmo Live Set se o runtime provar persistência inequívoca. Em cópia de dispositivo, Set diferente ou referência ambígua, carregar slots desarmados com `needs_relink`. Não escolher o primeiro parâmetro de mesmo nome. No gate real verificar que os próprios objetos Max não retomam propriedade antes dessa validação.

## 6. Ponte local: controle, nunca áudio

Escolha proposta: Node for Max (`node.script`, baixa prioridade) com `node:http`, `node:fs`, `node:os` e `max-api`, sem npm install. Consumir uma rota dedicada do HTTP loopback já existente no host. Não abrir UDP de controle no Max nem listener LAN. Usar `actualPort`, nunca presumir 8730. Node embutido no Max não é o Node 24 da ferramenta de build: provar compatibilidade no gate de plataforma.

Descoberta local: `<os.homedir()>/.ableton-rc-surface/native-audio/bridge.json`, criado pelo host por troca atômica, contendo versão, hostEpoch, porta real, pid e bearer aleatório de 32 bytes exclusivo da ponte. Não incluir tokens admin/controller. POSIX 0600/0700; Windows validar ACL herdada restrita ao usuário/SYSTEM/administradores antes de publicar. Falhar fechado com `bridge_permissions` se não puder restringir; não afirmar que chmod resolve ACL Windows. Esse arquivo é estado privado do mesmo usuário, nunca asset/download ou parte do Set.

Rotacionar segredo/epoch ao iniciar host. Dispositivo recarrega rendezvous em falha de autenticação, sem aceitar redirecionamento HTTP. Host parado pode deixar arquivo obsoleto: não confiar apenas em pid; validar endpoint/epoch/handshake. Ao parar remover apenas o arquivo cuja epoch ainda é sua. V1 suporta um host RC nativo por usuário; detectar segunda instância viva e informar conflito, não roubar rendezvous. Convivência de múltiplos Live Sets/hosts exige evolução explícita.

Rota `POST /api/native-audio/v1/exchange`: exclusivamente socket HTTP local, peer loopback, Host `127.0.0.1:<actualPort>`, sem Origin, Bearer válido em comparação constante. Rejeitar também quando a mesma rota for alcançada via HTTPS LAN, mesmo de peer local. Limite 16 KiB JSON, profundidade/tipos/arrays limitados, timeout 2 s, versão exata, taxa máxima 60 requests/s por instância autenticada. Nada de segredo em URL/log/erro. Localmente outro processo do mesmo usuário com acesso ao arquivo está no mesmo perímetro de confiança; não alegar isolamento contra ele.

Telemetria 30 Hz no máximo, 1 request em voo + 1 snapshot mais recente. Sem assinantes, manter um exchange long-poll pendente por até 1 s; configuração ou subscription acorda essa resposta imediatamente. Essa espera é da ponte, nunca do DSP. Após subscriber novo, exigir frame novo antes de ready. Sem ACK, descartar frames substituídos; nunca fazer replay após reconectar. Até 16 dispositivos vivos por host v1, rejeitar excedente claramente. Frame inclui sequência, contador de samples e geometria DSP; freshness usa relógio monotônico de recepção do host, não compara relógios de máquinas diferentes.

Ataques recebem também pico por intervalo visual (acumulador limitado a 100 ms) para não sumirem entre pixels. Esses picos só alimentam gráfico/cartões marcados como visualização de ataques; nunca voltam a modular. Os demais descritores e valores instantâneos continuam no frame. Regressão obrigatória: trânsito de frame não invoca `applyMapping`, `handleControl` nem `setValue`.

Configurações são transações com commandId, hostEpoch e expectedRevision. Estado completo confirmado pertence ao dispositivo, salvo no Set; revisão incrementa também em ajuste local Max. Rejeitar escrita concorrente com `revision_conflict` e retornar snapshot atual. No máximo 1 transação pendente por dispositivo; arrastar knob coalesce intenção mais recente, sem fila ilimitada. ACK em até 2 s ou `config_timeout`; reconexão lê snapshot antes de nova intenção, não repete comando antigo.

## 7. Ciclo de vida e estados da página

Estados: `browser-off`, `browser-active`, `track-missing`, `track-connecting`, `track-ready`, `track-stale`, `track-off`, `track-error`. Erro sempre tem código estável e texto EN/PT, nunca mensagem genérica de viewer tentando comando privilegiado.

- Trocar entrada/track cancela subscription anterior, incrementa generation e rejeita callbacks/frames antigos. Trocar visualização não desliga outros dispositivos; isso é informado na UI.
- Track-missing oferece instrução manual; track-connecting só vira ready após vínculo SDK ↔ instância + heartbeat/DSP válido, não só nome encontrado.
- Switch Audio input em Track envia ON/OFF ao **dispositivo selecionado**, com estado pendente até ACK. OFF envia id 0 aos slots Modulate e Remote; pass-through permanece. ON é ação explícita, não efeito de entrar na aba.
- Viewer pode escolher o que observar e ler dados; não altera estado de dispositivo, pareia ou mapeia. Mostrar controles indisponíveis e `Controller access required` / `É necessário acesso controller`. Não escalar role silenciosamente.
- Sem frame fresco por 250 ms quando ativo, limpar hold visual e mostrar stale. Sem heartbeat por 3 s, mostrar indisponível. Não simular zeros como novas medições. Parada de transporte com DSP ainda ativo não é desconexão; silêncio é dado válido.
- Queda de Wi-Fi/fechar aba/parar ponte Node **não desarma música nativa**. Host não remove propriedade só porque cliente saiu. Mostrar último estado como desconhecido, não garantir que parou.
- Remover/desligar o dispositivo ou invalidar alvo libera referências nativas. Bridge perdida não autoriza host Browser a disputar alvos de um dispositivo ainda vivo; manter reservas até confirmação de liberação/remoção. Após restart host, bloquear novas aquisições conflitantes até reconciliação do catálogo e dos dispositivos, falhando fechado se ambíguo.
- No retorno, carregar snapshot confirmado e frames novos; não reproduzir comandos antigos nem habilitar microfone automaticamente. Fechar aba não muda configurações salvas do Live.

## 8. Compatibilidade, entrega e evidências

- Ferramentas do repositório: Node >=24.16.0 <25; SDK vendorizado 1.0.0-beta.0. Manter o requisito Live da versão atual do README (Live 12.4.5+ Suite Beta para esta extensão); registrar a versão Max real, não inferi-la do major do Live.
- Device novo de tipo audio (`aaaa`) com L/R pass-through. `scripts/amxd.js` só escreve container JSON: **não congela dependências**. Distribuição v1 é uma pasta autocontida `RC-Audio-Descriptors/` com .amxd e companions explícitos no manifesto/checksums. Provar carregamento após mover a pasta para uma máquina/usuário sem o repo e sem Max Package Manager adicional.
- Windows/macOS são os gates reais de Live/Max. CI Linux valida TypeScript/JS/docs/empacotamento, não alegar Live nativo em Linux.
- Sem abrir aplicativos pelo agente; usuário executa os testes Live. Até existir gravação e prova de instalação limpa, status continua experimental, não release-ready.
- No navegador: sete viewports já cobertos por `tests/ui/audio-spectral-workspace.spec.mjs`, stage on/off, touch/teclado, foco preservado durante BPM/telemetria, todos os doze cartões e legendas.
- Guias EN/PT, landing, catálogo compartilhado, segurança/privacidade e tester kit devem explicar microfone vs track, posicionamento, modulate vs remote, permissões, queda de rede e latência real. Não escrever claims de desempenho antes da medição.

## 9. Fontes primárias consultadas em 2026-09-06

- [live.remote~](https://docs.cycling74.com/reference/live.remote~/): aplicação no audio thread, latência de um buffer para controle, smoothing e propriedade/automação. Esse buffer não inclui detecção/FFT/driver.
- [live.modulate~](https://docs.cycling74.com/reference/live.modulate~/): modulação relativa, sinal/amount e comportamento em relação à base do parâmetro; validar semântica no runtime usado.
- [Dispositivos de áudio Max for Live](https://docs.cycling74.com/userguide/m4l/live_audiodevices/): entrada/saída no ponto da cadeia e limites de roteamento entre devices.
- [pfft~](https://docs.cycling74.com/reference/pfft~/): tamanho/hop/overlap. Latência de ressíntese não é automaticamente latência do descritor.
- [slide~](https://docs.cycling74.com/reference/slide~/): suavização de sinal/envelope. O coeficiente exponencial desta proposta deve ser calculado para sua própria fórmula, não confundido com o parâmetro slide.
- [node.script](https://docs.cycling74.com/reference/node.script/): Node separado e assíncrono; serve à ponte não crítica, não ao DSP de baixa latência.
- [Limitações Max for Live](https://docs.cycling74.com/userguide/m4l/live_limitations/): distinguir execução e licença de autoria Gen.
- [Delay Compensation FAQ](https://help.ableton.com/hc/en-us/articles/209072409-Delay-Compensation-FAQ): compensação alinha caminhos, não prevê um transiente futuro.
- [Latência com editor Max aberto](https://help.ableton.com/hc/en-us/articles/115001595950-Increased-latency-when-Max-for-Live-editor-is-open): fechar editor para medir.
- [Release notes Live 12](https://www.ableton.com/en/release-notes/live-12/): disponibilidade/correções das APIs Max e necessidade de registrar versão real.

Evidência local: `src/live/mappings.ts`, `src/live/continuous-target-actuator.ts`, `src/server/{state,http,command-dispatch}.ts`, `node_modules/@ableton-extensions/sdk/dist/index.d.mts`, `static/phone-v3/audio-{processor,descriptor-stream,descriptors,spectral-descriptors,detector-timing,workspace,timeline}.js`, `scripts/build-audio-sender.js`, `scripts/amxd.js`, `scripts/package-tester-kit.mjs`. Esses arquivos descrevem o estado existente, não implementam a proposta acima.
