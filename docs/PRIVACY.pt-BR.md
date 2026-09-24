# Política de Privacidade

O RC Surface é uma extensão de rede local.
Ele não coleta, transmite nem armazena dados pessoais além da própria máquina do usuário e da rede local.

## Dados guardados localmente

| Dado | Onde | Por quanto tempo |
|------|------|------------------|
| Certificado TLS autoassinado + chave privada | `storageDirectory/certs/` do Ableton | Até o usuário apagar o armazenamento ou o certificado expirar ou ser gerado de novo |
| Mapeamentos de controle | Armazenamento do Ableton | Persistem entre sessões |
| Presets de mapeamento | Armazenamento do Ableton | Até serem apagados |
| Preferências do celular | Armazenamento do navegador do celular | Até os dados do navegador serem limpos |
| Ajustes da análise de áudio | Armazenamento do navegador do celular | Até os dados do navegador serem limpos |

## Dados de rede

- Na configuração suportada, a ponte entre o celular e o Live não sai da rede local confiável do usuário.
- Sem telemetria.
- Sem analytics.
- Sem envio de relatórios de erro (crash reports).
- Nenhum controle passa pela nuvem.
- Os QR codes são gerados localmente, na interface do painel.
- Os arquivos de runtime e modelo do MediaPipe Hands são servidos localmente pela extensão.

## Dados no navegador do celular

O cliente do celular roda no navegador. Não instala nenhum app nativo.

As permissões são pedidas apenas para as funções em uso:

- sensores de movimento e orientação;
- entrada de áudio selecionada, para amplitude e doze descritores de áudio;
- câmera, para o rastreio de mãos do MediaPipe.

Os dados de sensor são processados no navegador do celular e enviados como valores numéricos de controle por WebSocket.
Áudio bruto e quadros de vídeo brutos não são enviados ao RC Surface.

A captura pede ao navegador que desligue o cancelamento de eco, a supressão de
ruído e o controle automático de ganho; o que acontece de fato depende do
navegador e do driver. O ID da entrada
selecionada fica no armazenamento local do navegador. Abrir/recarregar AUD
nunca inicia a captura automaticamente.

Só medições numéricas passam pelo WebSocket: RMS, envelope, gate, ataque,
transiente, kick, snare, brilho, centroide, rolloff 95%, fluxo, flatness,
dispersão e energia de graves/médios/agudos. Nenhum áudio bruto é transmitido.

## Runtime de terceiros

O MediaPipe Hands vem junto com a extensão e é servido pela conexão local. O
modelo de rastreio de mãos roda no navegador do celular. Este projeto não envia
quadros de câmera para o Google.

Numa rede totalmente offline, os controles principais — toque, movimento,
áudio, mapeamento, mixer e rastreio de mãos por câmera — continuam funcionando,
porque o runtime e os arquivos de modelo do MediaPipe vêm junto com a extensão
e são servidos localmente.
