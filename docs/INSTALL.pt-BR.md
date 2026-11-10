# Guia de instalação e primeira execução

RC Surface é uma extensão do Ableton Live que serve uma superfície de controle
no navegador do celular. Este guia cobre a instalação no Windows ou no macOS,
a conexão do celular e o primeiro mapeamento.

> [!WARNING]
> **Aviso de segurança**: esta extensão sobe um servidor WebSocket na sua rede local. Ações de controlador e de administração exigem tokens de sessão, mas o bridge ainda assim só deve ser usado em redes confiáveis. Não compartilhe URLs de QR nem de administração. Veja o [SECURITY.pt-BR.md](./SECURITY.pt-BR.md) para o modelo de ameaças.

Para a versão curta, veja o [início rápido](../README.md#quick-start) no README.

## Pré-requisitos

Você precisa de:

- **Ableton Live 12.4.5+ Suite (Beta)** com o host do SDK de Extensions habilitado.
- Um computador e um celular na **mesma rede Wi-Fi**.
- Um navegador atual no celular: Chrome 90+, Safari 15.4+, Edge 90+, ou qualquer navegador Chromium no Android.
- **Obrigatório para REC, Launch Clip, TRN, `AUT` em `SYNC` e Deep Sync; opcional para controle básico**: [AbletonOSC](https://github.com/ideoforms/AbletonOSC) instalado e configurado no Live.
- **Opcional (para trigger notes MIDI)**: `RC-Midi-Receiver.amxd` salvo na sua User Library do Ableton.
- Opcional, para os recursos avançados: um celular com giroscópio, acelerômetro, microfone e câmera funcionando.
- O rastreio de mãos por câmera funciona na rede local; o runtime e os arquivos de modelo do MediaPipe vêm junto com a extensão.

A extensão em si é construída sobre o
[SDK de Extensions do Ableton](https://github.com/ableton-extensions/sdk)
1.0.0-beta. Nenhum runtime adicional é necessário no computador.

## Instalação

### Versão publicada ou candidata de teste

A versão atual, 2.1.0, está na página da
[versão mais recente](https://github.com/ntworm/rc-surface/releases/latest).

1. Baixe o `RC-Surface-X.Y.Z.ablx` mais recente na página de Releases
   do projeto, ou use o pacote de teste enviado pelo mantenedor. Ter uma
   versão candidata local não significa que já existe a release pública
   correspondente. Siga a versão e as instruções de verificação do pacote
   recebido.
2. Dê dois cliques no arquivo. O instalador de extensões do Live abre.
3. Clique em *Install*. O Live coloca o arquivo em
   `User Library / Extensions`.
4. Reinicie o Live se ele já estava aberto.

Antes de uma apresentação, confira Start/Close e o QR no painel nativo do
Live; depois grave e reproduza um take numa cópia do Set no Mac de destino.
O CI automatizado não substitui esse aceite.

### Do código-fonte

Se você clonou o repositório e rodou `npm ci` seguido de
`npm run build:prod-ablx`, terá o mesmo arquivo `.ablx` na raiz do projeto.
Instale do mesmo jeito, com dois cliques.

### AbletonOSC

O AbletonOSC habilita a sincronia travada no beat para LFO e square, o
metrônomo que pisca no header, e o overlay de transporte em tela cheia (botão
`TRN`). Instale-o em Remote Scripts dentro da User Library configurada, em
vez de dentro do aplicativo Live, para que a instalação sobreviva às
atualizações do Live.

1. Baixe o **AbletonOSC** no repositório: [AbletonOSC no GitHub](https://github.com/ideoforms/AbletonOSC). Clique em **Code** → **Download ZIP**.
2. Extraia o ZIP e coloque a pasta `AbletonOSC` no diretório **MIDI Remote Scripts** do seu Ableton Live:
   - **Windows**: `C:\Users\<user>\Documents\Ableton\User Library\Remote Scripts\AbletonOSC\`
   - **macOS**: `~/Music/Ableton/User Library/Remote Scripts/AbletonOSC/`.
3. Abra as preferências **Link/Tempo/MIDI** do Ableton Live.
4. Adicione o **AbletonOSC** como Control Surface na lista. Em **Input** e **Output**, deixe **None**.
5. Feito isso, a extensão detecta o AbletonOSC sozinha e sincroniza pelas portas `11000` (saída) e `11001` (entrada). O AbletonOSC original só responde na `11001`: se outra extensão RC estiver com ela quando o Live abre, a superfície escuta numa porta reserva e volta para a `11001` assim que ela libera.

### RC-Midi-Receiver.amxd

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

### RC-Audio-Sender.amxd

A extensão não consegue ouvir uma track do Live. O SDK de Extensions não expõe
áudio nenhum, então escutar uma é trabalho de um device Max dentro do caminho
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

## Armazenamento dos dados

Mappings, presets e projetos ficam em `storageDirectory/surface-v2/`, com
schema 2. Arquivos da linha 1.x não são apagados nem importados
automaticamente. Não copie dados 1.x para essa pasta.

## Iniciar o bridge

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
vem ligada por padrão.

Desligue quando outra extensão RC dividir a máquina e você quiser escolher qual
delas fica com as portas na sessão, em vez de deixar as duas disputarem no
carregamento. Só o início automático é afetado: o botão **Start** do painel
continua funcionando, e o painel abre direto do disco mesmo com o servidor
parado, então a chave fica sempre acessível, inclusive quando foi ela que
deixou o servidor desligado. A escolha persiste entre sessões.

O painel com o servidor parado inclui todos os scripts e a fonte, então o
**Start** e a preferência de início automático funcionam offline.

## Conectar o celular

> [!IMPORTANT]
> **Política de controlador único**: o RC Surface suporta um controlador por vez. Opere a performance pelo celular ou desktop, nunca ambos simultaneamente. Embora várias janelas de navegador possam conectar na rede local, entradas simultâneas não são suportadas e entrarão em conflito.

Escolha um caminho:

- **Escaneie o QR code** com o app de câmera do celular. Ele abre no seu
  navegador padrão.
- Ou **digite a URL do celular à mão** na barra de endereços do navegador.

Por padrão, a URL se parece com `https://192.168.x.y:8731/`. Se a porta
preferida foi trocada ou estava indisponível, use a URL real mostrada no
painel.

### O aviso "Sua conexão não é particular"

O celular ainda não confia no certificado do bridge, então o navegador avisa
na primeira vez. Isso é esperado. Para seguir:

- **Chrome no Android**: toque em *Avançado* → *Ir para o site*.
- **Safari no iOS**: toque em *Mostrar detalhes* → *visitar este site* → *Visitar*.
  O iOS só oferece essa saída no 15.4+; versões anteriores bloqueiam a conexão
  por completo, e você não consegue usar câmera nem microfone.

O navegador guarda a decisão pelo tempo de vida do certificado (cerca de um
ano. Veja [Ciclo de vida do certificado](#ciclo-de-vida-do-certificado)
abaixo).

A seção **Certificado** da aba **Rede** leva a uma página de instalação na
porta HTTPS + 1, onde o celular instala a autoridade certificadora deste
computador. Com a autoridade instalada, o navegador abre as páginas sem aviso.

### O que você vê

O controlador é usado na horizontal, com os dois polegares na tela; na vertical
aparece um aviso pedindo para girar o aparelho.

Os sensores começam automaticamente quando o navegador permite. Se o acesso
precisar de um toque, abra **SNS**, toque no **⚙** da barra de cima e depois
em **Ativar sensores**. Você pode repetir depois de uma recusa ou de um erro.
Câmera e microfone exigem permissões próprias.

## Primeiro mapeamento

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

O Follow Detected Note e a análise tonal dele não estão disponíveis. Modos de
mapeamento não suportados são descartados ao carregar; vínculos válidos permanecem. Os doze
descritores analisam a entrada selecionada no navegador (microfone, interface
ou loopback quando disponível). O Max Audio Sender não alimenta esses controles.

## Notas por sistema

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
  `~/Music/Ableton/User Library/Preferences/Extensions/<id>/certs\`.
- Na primeira vez que você der dois cliques no `.ablx`, o macOS pode mostrar um
  diálogo de *não pode ser aberto porque o desenvolvedor não pode ser
  verificado*. Clique com o botão direito no arquivo, escolha *Abrir*, e
  *Abrir* de novo no aviso de confirmação.

## Fronteira de rede

O cenário suportado é uma rede local confiável, de estúdio ou de casa, com o
celular e o computador na mesma rede. Não exponha o bridge com
redirecionamento de porta, túnel público ou proxy reverso público. Esses
cenários estão fora do modelo de ameaças testado, mesmo quando o endpoint
público fornece um certificado confiável.

Um IP público nunca entra no QR sozinho, porque o QR leva o token de controle.
Se o computador só tem endereço público, o painel avisa e só mostra o QR depois
que você clica em **USAR** nesse endereço.

O QR usa o endereço que alcança a sua rede: primeiro o que tem saída, depois o
que tem gateway, e por último adaptadores virtuais e VPNs. A aba **Rede** do
painel mostra o motivo e deixa fixar um endereço. **Endereço de rede**, na aba
Principal, oferece a mesma escolha, e o servidor guarda essa escolha.

## Ciclo de vida do certificado

O bridge gera um certificado novo na primeira execução. Uma autoridade
certificadora deste computador assina o certificado para `localhost` e para os
endereços privados da rede; um endereço público escolhido com **USAR** mantém
um certificado autoassinado, feito com o pacote npm `selfsigned`. O certificado:

- É RSA de 2048 bits, assinado com SHA-256.
- Vale um ano (`notAfterDate` assume, por padrão, um ano a partir da geração).
- Inclui entradas `subjectAltName` para `localhost`, `127.0.0.1` e os
  endereços dos adaptadores físicos, guardando os anteriores até 32 entradas.
  Endereço novo em adaptador virtual não mexe no certificado. Quando o
  computador vai para uma rede que o certificado não cobre, a extensão gera um
  novo sem reiniciar, e o celular pede para aceitar o aviso uma vez.
- É guardado com permissão `0600` no diretório de armazenamento do Live.

Para forçar um certificado novo, feche o Live, apague a pasta `certs/` em
`Preferences/Extensions/<id>/`, e reinicie.

## Diagnóstico

### A página abre no computador, mas não no celular

O computador abre a página em qualquer endereço dele mesmo, então isso não prova
nada sobre a rede. Abra a aba **Rede** do painel:

- Veja qual endereço o QR usa e por quê. O celular não alcança endereço de
  adaptador virtual.
- Clique em **ACHAR CONFIGURAÇÃO**. O painel mostra um QR por endereço, 25
  segundos cada. Aponte o celular. Quando ele conectar, esse endereço fica
  guardado nessa rede por 30 dias.
- Leia **Diagnóstico**. Ele lê o certificado e o firewall sem alterar nada. Se
  faltar regra no firewall, ele dá o comando para copiar. Rode você mesmo no
  PowerShell como administrador.
- Se nenhum endereço alcançar o celular, confira se ele está fora dos dados
  móveis e na mesma rede, depois procure isolamento de clientes ou rede de
  convidados no roteador. O computador não detecta isso daqui.

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

### O celular mostra "ERR_LOCAL_NETWORK_PERMISSION_MISSING"

- Esse erro indica que o navegador bloqueou o acesso desse site à rede local.
- **Chrome no Android**: abra as informações do site (o ícone à esquerda da
  barra de endereços) → *Permissões* → *Acesso à rede local* → *Permitir* para o
  endereço atual do Surface, e recarregue a mesma URL do QR code.
- Se a opção por site não aparecer, abra *Configurações do Chrome* →
  *Configurações do site* → *Acesso à rede local*, permita o site e recarregue.
- Se a página ainda não abrir, continue pelas verificações de conexão abaixo.
  O aviso de certificado é separado.
  Referência do Chrome: <https://support.google.com/chrome/answer/114662?co=GENIE.Platform%3DAndroid&hl=en>

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

## Desinstalar

No Live: menu *Extensions* → *Manage Extensions* → remova a entrada.
Depois apague a pasta de certificados em
`Preferences/Extensions/<extension-id>/` se quiser começar do zero.

## Marcas registradas

Ableton e Live são marcas registradas da Ableton AG. RC Surface é um projeto
independente, não afiliado, endossado ou patrocinado pela Ableton AG.
