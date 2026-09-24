# Guia de instalação e primeira execução

Este documento leva você pela instalação do **RC Surface** no Windows
ou no macOS, pela leitura do QR code no celular, e até o primeiro mapeamento de
pad para o Live funcionando.

> [!WARNING]
> **Aviso de segurança**: esta extensão sobe um servidor WebSocket na sua rede local. Ações de controlador e de administração exigem tokens de sessão, mas o bridge ainda assim só deve ser usado em redes confiáveis. Não compartilhe URLs de QR nem de administração. Veja o [SECURITY.pt-BR.md](./SECURITY.pt-BR.md) para o modelo de ameaças.

Se você só quer a versão curta, veja o [início rápido](../README.md#quick-start)
no README.

## Atualizando do Ableton-RC-Surface (1.0.0)

O produto era distribuído como "Ableton-RC-Surface". O Live deriva a identidade
da pasta de dados a partir do campo `name` do manifest, então instalar o
`RC-Surface-1.0.0.ablx` renomeado cria uma pasta de dados nova em
`%LOCALAPPDATA%\Ableton\Extensions Data\worm.rc-surface\` (Windows) ou
`~/Library/Application Support/Ableton/Extensions Data/worm.rc-surface/` (macOS).
Seus mapeamentos, presets, certificados, locale, autostart e projetos continuam
em `worm.ableton-rc-surface`.

Para mover esses dados para a pasta nova sem sobrescrever nada, rode o migrador
do kit de teste **antes** de instalar o novo `.ablx`:

- Windows: clique duas vezes em `Migrate-RC-Surface-Data.cmd` (ou rode `Migrate-RC-Surface-Data.ps1`)
- macOS: clique duas vezes em `Migrate RC Surface Data.command`

O script copia cada arquivo e pula o que já existe no destino. Nunca move nem
apaga a origem. Se a pasta de origem não existir (instalação nova), ele só
mostra uma mensagem e termina sem erro.

## 1. Pré-requisitos

Você precisa de:

- **Ableton Live 12.4.5+ Suite (Beta)** com o host do SDK de Extensions habilitado.
- Um computador e um celular na **mesma rede Wi-Fi**.
- Um navegador atual no celular: Chrome 90+, Safari 15.4+, Edge 90+, ou qualquer navegador Chromium no Android.
- **Opcional (para o Deep Sync)**: [AbletonOSC](https://github.com/ideoforms/AbletonOSC) instalado e configurado no Live.
- **Opcional (para trigger notes MIDI)**: `RC-Midi-Receiver.amxd` salvo na sua User Library do Ableton.
- Opcional, para os recursos avançados: um celular com giroscópio, acelerômetro, microfone e câmera funcionando.
- O rastreio de mãos por câmera funciona na rede local; o runtime e os arquivos de modelo do MediaPipe vêm junto com a extensão.

A extensão em si é construída sobre o
[SDK de Extensions do Ableton](https://github.com/ableton-extensions/sdk)
1.0.0-beta. Nenhum runtime adicional é necessário no computador.

## 2. Baixar e instalar

### A partir de uma versão candidata de teste ou de uma release publicada

1. Baixe o `RC-Surface-X.Y.Z.ablx` mais recente na página de Releases
   do projeto, ou use o pacote de teste enviado pelo mantenedor. A versão do
   código é **1.0.0**; ter uma versão candidata local não significa que já existe
   uma release pública. Siga a versão e as instruções de verificação do pacote recebido.
2. Dê dois cliques no arquivo. O instalador de extensões do Live abre.
3. Clique em *Install*. O Live coloca o arquivo em
   `User Library / Extensions`.
4. Reinicie o Live se ele já estava aberto.

### A partir do código-fonte

Se você clonou o repositório e rodou `npm ci` seguido de
`npm run build:prod-ablx`, terá o mesmo arquivo `.ablx` na raiz do projeto.
Instale do mesmo jeito, com dois cliques.

### Opcional: instalar o AbletonOSC (para o Deep Sync)

Para habilitar sincronia travada no beat para LFO e stutter, o metrônomo que
pisca no header, e o overlay de transporte em tela cheia (botão `TRN`), você
precisa instalar e configurar o **AbletonOSC**:

1. Baixe o **AbletonOSC** no repositório: [AbletonOSC no GitHub](https://github.com/ideoforms/AbletonOSC). Clique em **Code** → **Download ZIP**.
2. Extraia o ZIP e coloque a pasta `AbletonOSC` no diretório **MIDI Remote Scripts** do seu Ableton Live:
   - **Windows**: `C:\ProgramData\Ableton\Live 12 Suite\Resources\MIDI Remote Scripts\`
   - **macOS**: clique com o botão direito no Ableton Live, na pasta Aplicativos, escolha **Mostrar Conteúdo do Pacote** (*Show Package Contents*) e vá até `Contents/App-Resources/MIDI Remote Scripts/`.
3. Abra as preferências **Link/Tempo/MIDI** do Ableton Live.
4. Adicione o **AbletonOSC** como Control Surface na lista. Em **Input** e **Output**, deixe **None**.
5. Feito isso, a extensão detecta o AbletonOSC sozinha e sincroniza pelas portas `11000` (saída) e `11001` (entrada).

### Opcional: instalar o RC-Midi-Receiver.amxd (para trigger notes MIDI)

Para os pads e outros controles dispararem notas MIDI numa track MIDI escolhida:

Use o **Receiver v2**, identificado por **SDK / LOCAL MAX — NO UDP**. Faça
backup do Set e troque as instâncias antigas; copiar para a biblioteca não
substitui devices carregados. Deixe só um Receiver v2 por track de destino.
Veja a [migração v2](./SECURITY.pt-BR.md#devices-max--migração-para-v2).
Receivers UDP antigos são recusados, sem fallback inseguro.

1. Localize o arquivo `RC-Midi-Receiver.amxd` (vem na raiz do kit ZIP da release, ou no diretório `static/` do código-fonte).
2. Copie o arquivo para a sua **User Library** do Ableton, para o Live conseguir encontrá-lo:
   - Coloque em `User Library/Presets/MIDI Effects/Max MIDI Effect/` (ou em qualquer outro lugar indexado da sua User Library).
3. Arraste o Receiver da User Library para cada track MIDI de destino. A
   extensão reaproveita o device quando ele já está presente, mas o SDK de
   Extensions do Live não consegue inserir um device Max for Live
   automaticamente. O Trigger Note orienta usar a cópia da User Library.

### Opcional: RC-Audio-Sender.amxd (para escutar uma track do Live)

A extensão não consegue ouvir uma track do Live — o SDK de Extensions não expõe
áudio nenhum — então escutar uma é trabalho de um device Max dentro do caminho
de áudio do Live.

1. Ache o `RC-Audio-Sender.amxd` no kit da release, ou em `static/` no código.
2. Arraste-o para a **track de áudio que você quer escutar**.
3. Coloque o `RC-Midi-Receiver.amxd` na **track MIDI que vai tocar**.

4. Ative **Audio Sender input** no Receiver v2 de destino. Ele começa em OFF.
Os dois devices precisam ser v2: eles usam um barramento interno do Max, sem UDP. Todos os
Receivers com essa entrada habilitada recebem o Sender; deixe os demais OFF.
Trigger Note do celular usa o SDK e não exige habilitar essa entrada.

Exige Max for Live, que vem com o Live Suite.

> **O transporte v2 aguarda novo teste no Live.** Os resultados anteriores
> eram da versão UDP, não desta substituta. Confira o carregamento, a
> passagem do estéreo, as notas/OFF e a latência medida antes de usar ao vivo.

## 3. Iniciar o bridge

1. No Live, abra o menu **Extensions** (ou `Cmd-Shift-A` / `Ctrl-Shift-A`).
2. Procure **RC Surface** e clique em *Show panel* (ou *Open*,
   dependendo da sua versão do Live).
3. Aparece uma janela modal com o **QR de performance** para o cliente do
   celular (o controlador de pads, knobs, sensores e aba **MIX** em `/`).
   A visão de macros do MIX fica dentro do cliente de performance, como aba
   dedicada; não existe QR separado do Mix no painel.
   Uma URL de administração também aparece, como um link pequeno `admin ↗`
   abaixo do QR de performance; o painel administrativo em `/static/admin/`
   mostra os mapeamentos ao vivo.

O servidor mantém HTTP simples em loopback na **8730** e expõe o celular por
HTTPS/WSS na rede local, normalmente na **8731**. Portas estáveis permitem
reencontrar o servidor após reiniciar, mas a sessão antiga fica somente para
leitura até você escanear o novo QR. Isso também vale para Stop/Start no painel.
Se uma porta já estiver ocupada, o Surface cai para uma porta
atribuída pelo sistema, e o painel mostra a que está realmente em uso. Defina
`RC_SURFACE_PORT` para trocar a porta HTTP preferida. O acesso pela rede local
existe apenas pela URL HTTPS gerada, então use uma rede confiável, de estúdio
ou de casa.
A URL do QR gerado concede o papel de controlador através de um token de sessão
rotativo, então trate o QR code e as URLs copiadas de controlador e de
administração como credenciais.

### Iniciar automaticamente com o Live

No rodapé do painel existe a chave **Iniciar automaticamente com o Live**. Ela
vem ligada, que é como toda instalação se comportava antes de ela existir.

Desligue quando outra extensão RC dividir a máquina e você quiser escolher qual
delas fica com as portas na sessão, em vez de deixar as duas disputarem no
carregamento. Só o início automático é afetado: o botão **Start** do painel
continua funcionando, e o painel abre direto do disco mesmo com o servidor
parado — então a chave fica sempre acessível, inclusive quando foi ela que
deixou o servidor desligado. A escolha persiste entre sessões.

## 4. Conectar o celular

> [!IMPORTANT]
> **Política de controlador único**: o RC Surface 1.0 suporta um controlador por vez. Opere a performance pelo celular ou desktop, nunca ambos simultaneamente. Embora várias janelas de navegador possam conectar na rede local, entradas simultâneas não são suportadas e entrarão em conflito.

Escolha um caminho:

- **Escaneie o QR code** com o app de câmera do celular. Ele abre no seu
  navegador padrão.
- Ou **digite a URL do celular à mão** na barra de endereços do navegador.

Por padrão, a URL se parece com `https://192.168.x.y:8731/`. Se a porta
preferida foi trocada ou estava indisponível, use a URL real mostrada no
painel.

### O aviso "Sua conexão não é particular"

Como o bridge usa um certificado autoassinado, único da sua instalação, o
navegador do celular avisa na primeira vez. Isso é esperado. Para seguir:

- **Chrome no Android**: toque em *Avançado* → *Ir para o site*.
- **Safari no iOS**: toque em *Mostrar detalhes* → *visitar este site* → *Visitar*.
  O iOS só oferece essa saída no 15.4+; versões anteriores bloqueiam a conexão
  por completo, e você não consegue usar câmera nem microfone.

O navegador guarda a decisão pelo tempo de vida do certificado (cerca de um
ano — veja [Ciclo de vida do certificado](#8-ciclo-de-vida-do-certificado)
abaixo).

### O que você vê

Um controlador feito só para a horizontal. O ideal é segurar o celular deitado,
com os dois polegares na tela; na vertical aparece um aviso pedindo para girar
o aparelho.

Na primeira vez que você abre o app, o navegador pede permissão para acessar os
sensores de movimento e orientação. Toque em *Permitir* — eles são necessários
para o painel de sensores e para a bolha de nível.

## 5. Teste rápido: seu primeiro mapeamento pelo celular

Com o celular conectado:

1. No Live, crie ou selecione uma track com um parâmetro bem visível, como a
   frequência do Auto Filter ou o fader de volume da track.
2. No celular, toque **MAP** perto do indicador de BPM.
3. Toque num controle destacado, por exemplo o **knob 1** na aba MIX ou o
   **pad 1** na aba PERF.
4. Toque **Bind**.
5. Navegue por **Song / Main / Master**, **Tracks** ou **Return Tracks**,
   depois abra a track ou o device de destino e escolha o parâmetro.
6. Saia do modo MAP e mova o controle escolhido no celular. O parâmetro do Live
   tem que acompanhar.

Para testar o disparo de nota MIDI:

1. Adicione ou selecione uma track MIDI no Live.
2. No celular, entre em **MAP**, escolha um controle e toque **Trigger Note**.
3. Escolha a track MIDI.
4. Se o `RC-Midi-Receiver.amxd` ainda não estiver na track, coloque a cópia da
   sua User Library nessa track MIDI e tente de novo.
5. Escolha a nota nos seletores de Pitch e Oitava, ajuste a Velocity, saia do
   modo MAP e dispare o controle escolhido no celular.

Se o parâmetro do Live ou a nota MIDI responderem, o bridge e o motor de
mapeamento estão funcionando. O painel administrativo em `/static/admin/`
continua útil para inspeção e diagnóstico, mas os mapeamentos do dia a dia
podem ser criados pelo celular.

Para testar modulação por áudio, ligue **Audio input** na **AUD**. Entre em
**MAP**, escolha o cartão do detector **Kick** e use Bind num parâmetro de synth,
com uma faixa pequena de saída e **Smooth = 0**. Saia do MAP e toque kicks
isolados, depois snares e silêncio. Compare o som com o parâmetro real do Live,
não só com o medidor. Repita com Transient, Snare e Brightness. Kick/snare são
heurísticas espectrais; a latência do microfone, da rede e do Live ainda exige
teste físico.

O Follow Detected Note e a análise tonal dele foram removidos. Modos de
mapeamento não suportados são descartados ao carregar; vínculos válidos permanecem. Os doze
descritores analisam a entrada selecionada no navegador (microfone, interface
ou loopback quando disponível). O Max Audio Sender não alimenta esses controles.

## 6. Notas por sistema

### Windows

- O armazenamento persistente do Live fica em
  `%USERPROFILE%\Documents\Ableton\User Library\`.
- Os certificados gerados pelo bridge ficam em
  `…\User Library\Preferences\Extensions\<extension-id>\certs\`.
- O SmartScreen do Windows Defender pode bloquear a instalação do `.ablx` na
  primeira vez. Clique em *Mais informações* → *Executar assim mesmo*.

### macOS

- O armazenamento persistente do Live fica em
  `~/Music/Ableton/User Library/`.
- Os certificados ficam em
  `~/Music/Ableton/User Library/Preferences/Extensions/<id>/certs/`.
- Na primeira vez que você der dois cliques no `.ablx`, o macOS pode mostrar um
  diálogo de *não pode ser aberto porque o desenvolvedor não pode ser
  verificado*. Clique com o botão direito no arquivo, escolha *Abrir*, e
  *Abrir* de novo no aviso de confirmação.

## 7. Fronteira de rede

O cenário suportado na v1.0 é uma rede local confiável, de estúdio ou de casa,
com o celular e o computador na mesma rede. Não exponha o bridge com
redirecionamento de porta, túnel público ou proxy reverso público. Esses
cenários estão fora do modelo de ameaças testado, mesmo quando o endpoint
público fornece um certificado confiável.

## 8. Ciclo de vida do certificado

O bridge gera um certificado autoassinado novo na primeira execução, usando o
pacote npm `selfsigned`. O certificado:

- É RSA de 2048 bits, assinado com SHA-256.
- Vale um ano (`notAfterDate` assume, por padrão, um ano a partir da geração).
- Inclui entradas `subjectAltName` para `localhost`, `127.0.0.1` e os IPs
  atuais da rede local. Se o IP da rede local mudar e o certificado guardado
  não cobrir mais a URL do celular, a extensão gera um certificado novo.
- É guardado com permissão `0600` no diretório de armazenamento do Live.

Para forçar um certificado novo, feche o Live, apague a pasta `certs/` em
`Preferences/Extensions/<id>/`, e reinicie.

## 9. Diagnóstico

### O celular mostra "ERR_CONNECTION_REFUSED"

- O celular e o computador estão em redes Wi-Fi diferentes. Ponha os dois na
  mesma.
- Alguns roteadores, principalmente em redes de visitante, isolam os clientes.
  Use a rede principal, não a de visitante.

### O celular mostra "Sua conexão não é particular" e não tem como seguir

- O iOS 14.5 e anteriores não conseguem aceitar certificados autoassinados em
  sites HTTPS. Atualize o celular ou use outro aparelho ou navegador suportado
  na mesma rede.
- Alguns celulares gerenciados por empresa têm políticas de administração que
  bloqueiam a exceção de certificado. Use um celular pessoal.

### Câmera e microfone não funcionam

- Confira que a URL do celular é **HTTPS**, não HTTP. As APIs de câmera e
  microfone dependem de contexto seguro.
- O rastreio de mãos por câmera usa o runtime e os arquivos de modelo do
  MediaPipe Hands que vêm junto com a extensão. Não precisa de internet pública
  nem de CDN depois que a extensão está instalada.

### A latência está ruim

- Os dois aparelhos devem estar em Wi-Fi de 5 GHz, não de 2,4 GHz.
- O bridge manda os eventos de controle e sensor do celular na cadência do
  `requestAnimationFrame` do navegador, mais atualizações de estado do Live em
  taxa baixa. Numa rede local lenta isso pode cair bastante. O painel
  administrativo mostra a taxa real de mensagens.
- Alguns celulares limitam conexões WebSocket em segundo plano; mantenha o
  celular desbloqueado e o navegador em primeiro plano durante a performance.

### O Live trava quando a extensão carrega

- Confira o log do Live: `Help` → *Show Log*.
- Causa mais comum: um certificado antigo, em formato errado, no diretório de
  armazenamento. Apague `certs/` e deixe a extensão gerar um novo.

## 10. Desinstalar

No Live: menu *Extensions* → *Manage Extensions* → remova a entrada.
Depois apague a pasta de certificados em
`Preferences/Extensions/<extension-id>/` se quiser começar do zero.

## Marcas registradas

Ableton e Live são marcas registradas da Ableton AG. RC Surface é um projeto
independente, não afiliado, endossado ou patrocinado pela Ableton AG.
