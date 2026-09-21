# Perguntas frequentes

> Respostas para as dúvidas mais comuns sobre o **RC Surface**.
> Última atualização: julho de 2026.

## Índice

- [Compatibilidade](#compatibilidade)
- [Instalação e primeiro uso](#instalação-e-primeiro-uso)
- [Recursos e funcionamento](#recursos-e-funcionamento)
- [Privacidade e segurança](#privacidade-e-segurança)
- [Comunidade e contribuição](#comunidade-e-contribuição)

---

## Compatibilidade

### Funciona no Live 11?

Não. O alvo documentado é o Ableton Live 12.4.5+ Suite (Beta), porque o projeto
usa o host do SDK de Extensions do Ableton.

### Funciona com FL Studio / Logic / Bitwig / Reaper?

Não. O código da extensão é específico do Live. A interface do celular poderia
ser reaproveitada por quem escrevesse outro host, mas este projeto não fornece
esse host.

### Quais versões do Ableton Live são suportadas?

O alvo documentado é o **Ableton Live 12.4.5+ Suite (Beta)**, com suporte ao
SDK de Extensions.

### Funciona no Windows e no Mac?

O suporte previsto é Windows 10/11 e macOS, em Intel ou Apple Silicon. Linux
não é suportado porque o Ableton Live não roda em Linux.

### Funciona no iPhone e no Android?

O suporte previsto é Safari no iOS 15.4+ e navegadores Chromium atuais no
Android. Toque, sensores, microfone e câmera exigem permissão do navegador. O
iOS 14.5 e anteriores não conseguem aceitar o certificado HTTPS autoassinado,
então a conexão falha.

Rode a checklist de teste em aparelhos iOS e Android reais antes de considerar
um build validado para publicação.

### Qual é a latência? Dá para usar ao vivo?

Na candidata atual, gestos e áudio compartilham um caminho rápido: primeiro envio
imediato, lotes seguintes espaçados por pelo menos 8 ms. Os snapshots visuais do MAP
não seguram esses comandos. Smooth 0 não acrescenta rampa ao mapping. Isso não é
latência total medida; hosts antigos usam o caminho legado. O cliente foi feito
para Wi-Fi local de baixa latência. A latência real depende da máquina, do
celular, do navegador, do roteador e do congestionamento da rede. Use Wi-Fi de
5 GHz para o resultado mais consistente, e teste exatamente a sua montagem
antes do show.

---

## Instalação e primeiro uso

### Como eu começo?

1. Instale o Ableton Live 12.4.5+ Suite/Beta com suporte ao SDK de Extensions.
2. Use o `.ablx` do kit de teste ou do pacote de release que você recebeu.
3. Dê dois cliques no `.ablx`; o Live oferece instalar.
4. Abra o RC Surface pelo menu Extensions do Live.
5. Escaneie o QR code com o celular.
6. Aceite o aviso de certificado autoassinado, uma vez.

### Preciso de internet?

Para os controles principais, não. O bridge roda na sua rede local, e o celular
e o computador com o Live só precisam estar no mesmo Wi-Fi. Nenhuma telemetria
nem dado de projeto é enviado para serviço na nuvem.

O rastreio de mãos por câmera também funciona offline. O build traz junto o
runtime e os arquivos de modelo do MediaPipe Hands, e o processamento fica no
navegador do celular.

### Preciso saber programar para usar?

Não. Instale a extensão, escaneie o QR e toque. Programar só é necessário para
customizar a interface do celular ou contribuir com código.

### Meu antivírus está acusando o `.ablx`. É malware?

Não. WebSocket local, HTTPS e certificados gerados na hora podem parecer
estranhos para software de segurança. O projeto tem código aberto para consulta,
e o `.ablx` contém o código da extensão mais os arquivos estáticos do
navegador — não chaves privadas nem certificados embutidos.

---

## Recursos e funcionamento

### Os pads e knobs funcionam com qualquer dispositivo MIDI no Live?

Funcionam com os alvos do Live expostos à extensão: valores de mixer, estado de
track, parâmetros de device e as ações suportadas de nota e clip. Para
controlar um device, toque **MAP** no celular e use **Bind** para escolher um
parâmetro do Live. Os editores de mapeamento do painel e da janela
administrativa continuam úteis para inspeção e diagnóstico.

### Dá para criar mapeamentos pelo celular?

Dá. Toque **MAP** perto do indicador de BPM, escolha um controle destacado e
selecione a ação correspondente à fonte:

- **Bind** mapeia o controle escolhido para andamento da música, main/master,
  track normal, return track, mixer, device ou parâmetro.
- **Trigger Note** mapeia o controle escolhido para uma nota MIDI numa track
  MIDI escolhida, através do `RC-Midi-Receiver.amxd`.

Seguir a Nota Detectada foi removido. Modos de mapping não suportados são
descartados ao carregar; os vínculos válidos, incluindo Trigger Note fixo, ficam.

Use o Receiver v2 (**SDK / LOCAL MAX — NO UDP**) e troque instâncias antigas
nos Sets; só um Receiver compatível é aceito por track de destino.
O SDK de Extensions não consegue adicionar um receiver Max for Live sozinho.
Se ele ainda não estiver na track, coloque o `RC-Midi-Receiver.amxd` da sua User
Library na track MIDI no Live e tente de novo.

### Quantos celulares podem conectar ao mesmo tempo?

O RC Surface 1.0 suporta um controlador por vez. Opere a performance pelo
celular ou desktop, nunca ambos simultaneamente. Embora várias janelas de
navegador possam abrir a página na rede local e receber IDs de cliente isolados,
o controle simultâneo por múltiplos dispositivos não é suportado e causará conflitos
de estado.

### O celular vibra quando eu bato num pad?

Não. Vibração e resposta tátil foram aposentadas na v1.0.0, para manter a
interface previsível entre iOS e Android.

### Dá para transformar o que eu toco em notas MIDI?

Não. **Seguir a Nota Detectada** e sua análise tonal foram removidos porque os
testes musicais repetidos não deram resultados confiáveis. **Trigger Note** fixo
continua; ele não estima a nota que você está tocando.

### O que posso mapear a partir do áudio?

A aba AUD tem doze descritores em Ataques, Timbre, Textura e Bandas:
Transiente, Kick, Snare, Brilho, Centroide, Fluxo, Flatness, Dispersão, Rolloff 95%
e RMS de graves/médios/agudos. O seletor do gráfico e a legenda isolam as curvas. Toque **MAP**,
escolha o cartão de um detector e use **Bind** para um parâmetro do Live.
Para modular um synth pelo kick, comece com uma faixa pequena e Smooth em zero.

Transiente mede ataques; Kick e Snare ponderam esses ataques pela energia
espectral grave e média/aguda. Brilho descreve o espectro do escuro ao brilhante.
Os doze valores de mapeamento são normalizados de 0 a 1. Kick/Snare são heurísticas: uma
mix completa, ruído ou outro instrumento podem ativá-los. Não separam bateria.

Os descritores usam a entrada de áudio do navegador. O `RC-Audio-Sender.amxd`
mantém sua análise da track; ele não fornece estes descritores do navegador.

### O navegador processa o áudio antes de eu receber?

A aplicação solicita cancelamento de eco, supressão de ruído e ganho automático
desligados, para preservar amplitude e descritores espectrais. Isso não garante
captura bit-perfect: navegador, sistema ou driver ainda podem reamostrar/processar
áudio. Selecione o loopback/interface desejado na AUD.

### Dá para ele não iniciar junto com o Live?

Dá, na chave **Iniciar automaticamente com o Live**, no rodapé do painel. Útil
quando outra extensão RC divide a máquina. O botão Start do painel não é
afetado, e o painel abre mesmo sem nada escutando.

### Dá para customizar a interface do controlador no celular?

Dá. O código do celular é HTML, CSS e JavaScript comuns, em `static/phone-v3/`.
Veja o [`CUSTOMIZATION.pt-BR.md`](./CUSTOMIZATION.pt-BR.md).

### Dá para salvar e compartilhar mapeamentos?

Salvar e carregar presets locais de mapeamento, sim. A v1.0.0 não inclui
exportação e importação de pacotes de mapeamento compartilháveis; os presets
ficam locais ao armazenamento da extensão.

### Como eu atualizo para uma versão nova?

Baixe o `.ablx` mais recente na página de Releases do projeto, dê dois cliques
e deixe o Live substituir a extensão instalada. Reinicie o Live se ele estava
aberto durante a atualização.

---

## Privacidade e segurança

### Os dados vão para a nuvem?

Nenhuma telemetria, analytics ou dado de projeto é enviado para serviço na
nuvem. O tráfego suportado do bridge fica entre a máquina e os clientes de
navegador, na sua rede local confiável. Os fluxos de câmera e microfone são
processados no navegador e não são enviados como mídia bruta para a extensão.
Os arquivos de runtime e modelo do MediaPipe são servidos pela extensão na
mesma conexão local; o rastreio de mãos por câmera não precisa de CDN público.

### Existe política de privacidade?

Existe: [`PRIVACY.pt-BR.md`](./PRIVACY.pt-BR.md).

### Tem algum risco de segurança em deixar isso rodando?

Tem, do mesmo jeito que qualquer superfície de controle local tem. O bridge
abre uma porta alcançável pela rede local e aceita os comandos WebSocket
suportados de clientes de navegador que consigam chegar na URL do bridge. Rode
só em Wi-Fi confiável, de casa ou do estúdio, e feche quando terminar. Não
exponha por túneis, proxies reversos ou redirecionamento de porta; esses
cenários estão fora do modelo de ameaças da v1.0. O modelo de ameaças completo
está no [`SECURITY.pt-BR.md`](./SECURITY.pt-BR.md).

### Preciso pagar? Existe versão Pro?

Não. O projeto tem código aberto para consulta sob a licença PolyForm
Noncommercial 1.0.0, e não tem versão Pro nem recursos trancados. A página do
Gumroad é **pague quanto quiser** (sugestão R$25, mínimo R$0). R$0 é o padrão,
para o custo nunca ser barreira. Veja o [`FUNDING.md`](../FUNDING.md) para os
detalhes. Confie apenas nos links publicados no README deste repositório e nas
notas de release.

---

## Comunidade e contribuição

### Existe Discord ou comunidade para conversar sobre isso?

Não existe comunidade dedicada. Use o issue tracker do projeto para bugs
reproduzíveis. O canal `#extensions` do Discord oficial da Ableton é
independente deste projeto; siga as regras de lá se for discutir a extensão
naquele espaço.

### Como eu contribuo?

Abra uma issue ou um pull request focado no repositório do projeto. Leia o
[`CONTRIBUTING.md`](../CONTRIBUTING.md) antes de mexer no código, e relate
problemas de segurança pelo canal privado descrito no
[`SECURITY.pt-BR.md`](./SECURITY.pt-BR.md), não numa issue pública.

## Veja também

- [`INSTALL.pt-BR.md`](./INSTALL.pt-BR.md) — guia de instalação detalhado
- [`PRIVACY.pt-BR.md`](./PRIVACY.pt-BR.md) — política de privacidade completa
- [`SECURITY.pt-BR.md`](./SECURITY.pt-BR.md) — modelo de ameaças e desenho de segurança
- [README](../README.md) — visão geral do projeto
