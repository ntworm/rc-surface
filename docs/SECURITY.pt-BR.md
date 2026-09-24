# Política de Segurança

## Versões suportadas

| Versão | Suportada |
|--------|-----------|
| 1.0.x | sim |
| 0.7.x e anteriores | não |

## Como relatar uma vulnerabilidade

Não relate problemas de segurança em canal público.
Use o canal privado **Report a vulnerability** do GitHub, neste repositório.
Se esse canal estiver indisponível, procure o mantenedor em particular, em vez
de abrir uma issue pública.

A meta é confirmar o recebimento em até 48 horas e publicar correções críticas
em até 7 dias.

## Escopo

HTTP simples escuta em `127.0.0.1`, normalmente na porta `8730`. HTTPS/WSS do
celular escuta na rede local, normalmente na `8731`. Se estiverem ocupadas,
o servidor usa portas disponíveis e mostra os valores reais no painel.

Superfície de ataque:

- Certificados TLS autoassinados, gerados por instalação e guardados em `storageDirectory/certs/` do Ableton.
- O handler de comandos WebSocket, dentro do runtime do SDK de Extensions do Ableton.
- O servidor de arquivos estáticos, que serve apenas `dist/static/`, com proteção contra path traversal.
- As APIs do navegador do celular: câmera, microfone e sensores de movimento e orientação.
- Cópias antigas do Receiver abrem UDP `9000` sem autenticação. O Receiver v2 deste código não abre socket; atualizar só a extensão não troca devices já salvos em um Live Set.

O desenho atual pressupõe uma rede local confiável, de estúdio ou de casa. O
HTTPS protege o transporte do navegador e é o que libera as APIs de câmera e
microfone. Ações de controlador e de administração também exigem tokens de
sessão criptograficamente aleatórios, gerados de novo a cada início do servidor,
inclusive Stop/Start no painel sem reiniciar o Live. As
requisições são classificadas como viewer, controller ou admin, e os comandos
são autorizados por papel.

O token de controlador é entregue pela URL do QR gerado e depois passa para um
cookie de sessão HttpOnly com SameSite. Trate imagens de QR, URLs de
controlador, URLs de administração e sessões de navegador ativas **como
credenciais**. Quem obtiver um desses tokens recebe o papel associado a ele até
o servidor ser reiniciado. Escaneie o novo QR depois de reiniciar; páginas antigas
ficam somente para leitura.

## HTTPS e certificados

- Os clientes de celular, painel e administração devem usar HTTPS/WSS.
- Câmera e microfone exigem contexto seguro no celular.
- As URLs do QR usam um endereço da rede local, para o celular conseguir chegar na máquina.
- O certificado inclui, na lista SAN, `localhost`, `127.0.0.1` e os IPs atuais da rede local.
- Se os IPs da rede local mudarem, a extensão consegue gerar o certificado de novo.
- Os navegadores ainda avisam, porque o certificado é autoassinado. O usuário precisa aceitar o aviso uma vez em cada aparelho e navegador.

Chaves privadas nunca vão dentro dos pacotes `.ablx`.

## Devices Max — migração para v2

O Receiver v2 recebe Trigger Note pelo parâmetro inteiro versionado do SDK na
track escolhida. A extensão valida esse contrato, recusa Receivers antigos ou
ambíguos e nunca volta ao UDP. Escritas ON/OFF são serializadas por Receiver;
o OFF mantém a identidade do device original mesmo após reordenar tracks.
O Audio Sender opcional usa `send/receive` interno do Max. Sua entrada começa
OFF no Receiver; habilite apenas nos destinos desejados. Vários Receivers
habilitados recebem intencionalmente o mesmo barramento local. Ambos são
patchers comuns, sem objetos de rede, scripts externos ou externals compilados.

Isso elimina a entrada MIDI de rede sem autenticação, mas não autentica outros
patchers locais. Carregue apenas devices confiáveis. Os comandos do celular
continuam exigindo papel/token no WSS. O MIDI v2 não exige nova regra de firewall.

Troque **ambos** os devices e todas as instâncias antigas do Receiver nos Sets.
Atualizar só a extensão ou copiar um arquivo para a biblioteca não substitui
devices já carregados. Faça backup do Set antes. O painel novo mostra
**RC MIDI RECEIVER v2 / SDK / LOCAL MAX — NO UDP**. Não remova uma regra de
firewall existente enquanto houver Receiver antigo carregado. Antes de liberar,
confira a versão efetivamente carregada, ausência de listener UDP 9000 atribuível
a ela, notas em duas tracks e OFF/limpeza. Testes de fonte/patcher não comprovam
isso no Live nem medem latência. Aceitação em campo do v2 continua pendente.

O Receiver v2.2 mantém o parâmetro de comando visível à API (automatizável/
armazenável) da v2.1 atrás do toggle comum (não parâmetro) **SDK Notes**. O
bloqueio nasce fechado, então um comando restaurado é descartado; após a
notificação de pós-inicialização do Live o device arma sozinho, limpando antes o
valor anterior sem saída. Desativar o device desarma e reativar arma de novo;
Panic desarma até o clique. Isso não autentica automações/Undo enquanto armado.
Nunca automatize nem mapeie por MIDI o pacote interno. Desarme o device antes de
carregar um preset dele numa instância em execução: a notificação de inicialização chega depois,
não antes da restauração dos valores do preset.

### Proteção obrigatória de UDP no firewall (somente devices antigos)

No Windows, abra **PowerShell como Administrador** e execute uma vez:

```powershell
New-NetFirewallRule -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' -DisplayName 'RC Surface - block network MIDI UDP 9000' -Direction Inbound -Action Block -Enabled True -Profile Any -Protocol UDP -LocalPort 9000 -RemoteAddress '0.0.0.0-126.255.255.255','128.0.0.0-255.255.255.255','::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff'
```

A regra bloqueia UDP `9000` de entrada de endereços não loopback, para todos
os programas e perfis. O emissor local IPv4 e o HTTPS/WSS TCP ficam fora da
regra. Outros aplicativos usando UDP `9000` também serão afetados; reserve
essa porta para o bridge. Mantenha o Firewall do Windows ativo em todos os
perfis. O comando usa as
[faixas de endereço suportadas pela Microsoft](https://learn.microsoft.com/en-us/powershell/module/netsecurity/new-netfirewallrule).
Se a regra com esse nome já existir, confira-a em vez de criar outra.

Confira a regra efetiva e seus filtros:

```powershell
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Format-List Name,Enabled,Profile,Direction,Action
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Get-NetFirewallPortFilter
Get-NetFirewallRule -PolicyStore ActiveStore -Name 'RC-Surface-MIDI-UDP9000-LAN-Block' | Get-NetFirewallAddressFilter
```

Antes do lançamento, confirme que as notas locais continuam chegando, que o
celular continua conectando e que pacotes UDP enviados de **outro computador
da rede** não geram atividade no Receiver nem eventos MIDI. Listar a regra
ou fazer apenas um port scan UDP não comprova o bloqueio. Teste com as caixas
mutadas e um MIDI Monitor, sem instrumento audível.

No macOS, use uma política equivalente no firewall do host para bloquear
UDP `9000` de entrada nas interfaces não loopback e repita a prova. Não
bloqueie toda a rede do Live: isso também interrompe a conexão do celular.
Até configurar e verificar a proteção, mantenha o Receiver descarregado em
máquinas conectadas à rede. A extensão não instala regras silenciosamente
nem promete isolamento estrito em loopback. Para os devices antigos, essa validação por sistema
operacional continua necessária; o v2, em vez disso, precisa passar na verificação de migração (nenhum listener aberto).

Para desfazer **apenas essa regra**, descarregue o Receiver primeiro e execute
como administrador:

```powershell
Remove-NetFirewallRule -Name 'RC-Surface-MIDI-UDP9000-LAN-Block'
```

## Exposição na rede

- Não rode o bridge em Wi-Fi público, de visitante ou não confiável.
- Prefira uso na mesma sala ou na rede do estúdio.
- Não publique nem repasse URLs de QR, de controlador ou de administração.
- Não exponha o bridge por túneis públicos, proxies reversos públicos ou redirecionamento de porta no roteador. Esses cenários estão fora do modelo de ameaças da v1.0.
- Pare e inicie o servidor para invalidar todos os tokens de sessão já emitidos.

## Segurança dos comandos

Os comandos são mensagens JSON tratadas por código do projeto. Operações de
leitura ficam disponíveis para viewers; escritas no Live e em mapeamentos
exigem controller ou admin; configuração de projeto inteiro e administração do
servidor exigem admin. Eles não podem chamar comandos de shell nem escrever
fora do armazenamento de extensões do Ableton. Comandos novos precisam ser
classificados, retornar diagnóstico e ter testes.
