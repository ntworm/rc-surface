// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Operator sheet copy, in English and Brazilian Portuguese.
 *
 * Same policy as the application catalog: not a literal translation. The terms
 * a Brazilian musician says in English stay in English — pad, knob, fader,
 * LFO, stutter, snapshot, clip, track, loop, preset, clutch, morph, gate,
 * pitch, BPM, bind, trigger, bar, beat. Product and protocol names stay too:
 * Ableton Live, Suite, AbletonOSC, MediaPipe, HTTPS, WSS, OSC, MIDI.
 *
 * Values that are data rather than language — port numbers, channel names,
 * version strings, the tab abbreviations printed on the surface — carry no
 * handle at all, so they are simply not in here.
 *
 * Prose that contains inline markup is one entry with the tags inside, applied
 * through data-i18n-html. Splitting a sentence at its <b> and translating the
 * pieces gives Portuguese that is correct fragment by fragment and wrong as a
 * sentence, because word order does not survive the cut.
 */
(function rcSurfaceSiteI18n(globalScope) {
  'use strict';

  const catalog = {
    'lp.top.trademarks': {
      en: 'Ableton and Live are trademarks of Ableton AG.',
      'pt-BR': 'Ableton e Live são marcas comerciais da Ableton AG.',
    },
    // ── chrome, navigation, colophon ─────────────────────────────────────
    'lp.top.001': {
      en: '<b>RC Surface</b>',
      'pt-BR': '<b>RC Surface</b>',
    },
    'lp.top.002': {
      en: 'Any browser becomes a controller',
      'pt-BR': 'Qualquer navegador vira controlador',
    },
    'lp.top.004': { en: 'About', 'pt-BR': 'Sobre' },
    'lp.top.005': { en: 'Chain', 'pt-BR': 'Cadeia' },
    'lp.top.006': { en: 'Surface map', 'pt-BR': 'Mapa da superfície' },
    'lp.top.007': { en: 'Controls', 'pt-BR': 'Controles' },
    'lp.top.008': { en: 'Situations', 'pt-BR': 'Situações' },
    'lp.top.009': { en: 'Install', 'pt-BR': 'Instalação' },
    'lp.top.010': { en: 'When it fails', 'pt-BR': 'Quando não funciona' },
    'lp.top.011': { en: 'Docs', 'pt-BR': 'Documentação' },
    'lp.top.012': { en: 'Live 12.4.5+ Suite', 'pt-BR': 'Live 12.4.5+ Suite' },
    'lp.top.013': { en: 'Made by <b>Gabriel Worm</b>', 'pt-BR': 'Feito por <b>Gabriel Worm</b>' },
    'lp.top.014': { en: 'PolyForm Noncommercial 1.0.0', 'pt-BR': 'PolyForm Noncommercial 1.0.0' },
    'lp.top.015': { en: 'No telemetry', 'pt-BR': 'Sem telemetria' },
    'lp.top.016': { en: 'No tracking', 'pt-BR': 'Sem rastreamento' },
    'lp.top.017': {
      en: '<a href="https://github.com/ntworm/rc-surface/blob/main/NOTICE">Credits and licences</a>',
      'pt-BR': '<a href="https://github.com/ntworm/rc-surface/blob/main/NOTICE">Créditos e licenças</a>',
    },
    'lp.top.018': {
      en: 'Independent project · not affiliated with Ableton AG',
      'pt-BR': 'Projeto independente · sem vínculo com a Ableton AG',
    },

    // ── 1.0 what it is ───────────────────────────────────────────────────
    'lp.surface.001': {
      en: '<span class="rc">RC</span> Surface',
      'pt-BR': '<span class="rc">RC</span> Surface',
    },
    'lp.surface.002': {
      en: 'Any device with a browser becomes a performance controller for Ableton Live. Your own machine serves the surface over the local network and the phone just opens a link — nothing to install on it, no account, no internet.',
      'pt-BR': 'Qualquer aparelho com navegador vira um controlador de performance para o Ableton Live. Sua máquina serve a superfície pela rede local e o celular só abre um link — nada para instalar nele, sem conta, sem internet.',
    },
    'lp.surface.003': {
      en: 'Works in <b>landscape</b>. Six performance tabs plus the MAP overlay: twelve pads, eight knobs, eight faders, two XY pads and three sensor inputs. This sheet is the operator’s reference for build <span class="hot">1.0.0</span>.',
      'pt-BR': 'Na <b>horizontal</b>. Seis abas de performance mais o overlay MAP: doze pads, oito knobs, oito faders, dois XY pads e três entradas de sensor. Esta folha é a referência de operação do build <span class="hot">1.0.0</span>.',
    },
    'lp.surface.004': {
      en: "Published releases",
      'pt-BR': "Versões publicadas",
    },
    'lp.surface.005': {
      en: 'Source & licence',
      'pt-BR': 'Código e licença',
    },
    'lp.surface.006': { en: 'Version', 'pt-BR': 'Versão' },
    'lp.surface.007': { en: 'Requires', 'pt-BR': 'Requer' },
    'lp.surface.008': {
      en: 'Ableton Live 12.4.5 or later, Suite edition',
      'pt-BR': 'Ableton Live 12.4.5 ou mais recente, edição Suite',
    },
    'lp.surface.009': { en: 'Phone', 'pt-BR': 'Celular' },
    'lp.surface.010': {
      en: 'iOS 15.4+ Safari, or a modern Chromium browser on Android',
      'pt-BR': 'Safari no iOS 15.4+, ou um navegador Chromium atual no Android',
    },
    'lp.surface.011': { en: 'Held', 'pt-BR': 'Posição' },
    'lp.surface.012': {
      en: "Landscape. Portrait is refused by the surface.",
      'pt-BR': "Horizontal. Em retrato a superfície não abre.",
    },
    'lp.surface.013': { en: 'Network', 'pt-BR': 'Rede' },
    'lp.surface.014': {
      en: "Local HTTPS. LAN only. No internet needed.",
      'pt-BR': "HTTPS na rede local. Não precisa de internet.",
    },
    'lp.surface.015': { en: 'Licence', 'pt-BR': 'Licença' },
    'lp.surface.016': {
      en: 'PolyForm Noncommercial 1.0.0, source-available',
      'pt-BR': 'PolyForm Noncommercial 1.0.0, com código aberto para consulta',
    },
    'lp.surface.017': { en: 'Source', 'pt-BR': 'Código' },
    'lp.surface.019': { en: 'Notice', 'pt-BR': 'Aviso' },
    'lp.surface.020': {
      en: 'Independent project. Not affiliated with Ableton AG.',
      'pt-BR': 'Projeto independente. Sem vínculo com a Ableton AG.',
    },
    'lp.surface.021': { en: 'Host', 'pt-BR': 'Host' },
    'lp.surface.022': { en: 'Ableton Live 12.4.5 Suite', 'pt-BR': 'Ableton Live 12.4.5 Suite' },
    'lp.surface.023': { en: 'Bridge', 'pt-BR': 'Bridge' },
    'lp.surface.024': {
      en: 'RC Surface 1.0.0, running inside Live',
      'pt-BR': 'RC Surface 1.0.0, rodando dentro do Live',
    },
    'lp.surface.025': {
      en: "Served",
      'pt-BR': "Servidor",
    },
    'lp.surface.026': {
      en: "HTTPS, normally on 8731; the panel shows any override or fallback",
      'pt-BR': "HTTPS, normalmente na 8731. Se a porta mudar, o painel mostra a real",
    },
    'lp.surface.027': { en: 'Socket', 'pt-BR': 'Socket' },
    'lp.surface.028': { en: 'WSS, same port', 'pt-BR': 'WSS, na mesma porta' },
    'lp.surface.029': { en: 'Certificate', 'pt-BR': 'Certificado' },
    'lp.surface.030': {
      en: "Self-signed, generated on first launch, current LAN IPs in the SAN list",
      'pt-BR': "Autoassinado, gerado na primeira execução, com os IPs atuais da rede local na lista SAN",
    },
    'lp.surface.031': { en: 'OSC out', 'pt-BR': 'OSC saída' },
    'lp.surface.032': { en: 'OSC in', 'pt-BR': 'OSC entrada' },
    'lp.surface.033': { en: 'Sync', 'pt-BR': 'Sync' },
    'lp.surface.034': {
      en: "AbletonOSC, deep — optional, see <a href=\"#clock\">2.1</a>",
      'pt-BR': "AbletonOSC, para o Deep Sync — opcional, veja <a href=\"#clock\">2.1</a>",
    },
    'lp.surface.035': { en: 'Reach', 'pt-BR': 'Alcance' },
    'lp.surface.036': {
      en: "One local network. No outbound connections.",
      'pt-BR': "Só a rede local. Nada sai para fora.",
    },
    'lp.surface.037': { en: 'Requirements', 'pt-BR': 'Requisitos' },
    'lp.surface.038': {
      en: '<span>Ableton Live 12.4.5 or later</span>',
      'pt-BR': '<span>Ableton Live 12.4.5 ou mais recente</span>',
    },
    'lp.surface.039': { en: '<span>Suite edition</span>', 'pt-BR': '<span>Edição Suite</span>' },
    'lp.surface.040': {
      en: '<span>A phone with a browser, held landscape</span>',
      'pt-BR': '<span>Um celular com navegador, na horizontal</span>',
    },
    'lp.surface.041': {
      en: '<span>Both machines on one network</span>',
      'pt-BR': '<span>As duas máquinas na mesma rede</span>',
    },
    'lp.surface.042': {
      en: "<span>The local HTTPS certificate accepted once</span>",
      'pt-BR': "<span>Aceitar o certificado HTTPS local, uma vez</span>",
    },
    'lp.surface.043': {
      en: '<span>AbletonOSC, only for Deep Sync</span>',
      'pt-BR': '<span>AbletonOSC, só para o Deep Sync</span>',
    },
    'lp.surface.044': {
      en: 'Control inventory is in <a href="#controls">4.0</a>. This section covers the connection only.',
      'pt-BR': 'O inventário de controles está em <a href="#controls">4.0</a>. Esta seção trata só da conexão.',
    },
    'lp.surface.045': {
      en: 'Intended for a local, auditable Live Extension workflow.',
      'pt-BR': 'Pensado para um fluxo de Live Extension local e auditável.',
    },
    'lp.surface.046': { en: 'Feature', 'pt-BR': 'Característica' },
    'lp.surface.047': { en: 'RC Surface', 'pt-BR': 'RC Surface' },
    'lp.surface.048': { en: 'Other controller options', 'pt-BR': 'Outras opções de controlador' },
    'lp.surface.049': { en: 'Install on phone', 'pt-BR': 'Instalação no celular' },
    'lp.surface.050': {
      en: 'Browser page served by the extension',
      'pt-BR': 'Página no navegador, servida pela extensão',
    },
    'lp.surface.051': {
      en: 'Usually a native app or web app',
      'pt-BR': 'Em geral um app nativo ou web app',
    },
    'lp.surface.052': { en: 'Cost', 'pt-BR': 'Custo' },
    'lp.surface.053': {
      en: 'Source-available for noncommercial use',
      'pt-BR': 'Código aberto para consulta, uso não comercial',
    },
    'lp.surface.054': { en: 'Varies by app', 'pt-BR': 'Varia conforme o app' },
    'lp.surface.055': { en: 'Protocol', 'pt-BR': 'Protocolo' },
    'lp.surface.056': { en: 'Live\'s Extensions SDK', 'pt-BR': 'SDK de Extensions do Live' },
    'lp.surface.057': {
      en: 'Often OSC, MIDI, or a bridge app',
      'pt-BR': 'Normalmente OSC, MIDI ou um app de bridge',
    },
    'lp.surface.058': { en: 'Mapping workflow', 'pt-BR': 'Fluxo de mapeamento' },
    'lp.surface.059': {
      en: "Binds parameters and trigger notes from the phone",
      'pt-BR': "Mapeia parâmetros e trigger notes pelo próprio celular",
    },
    'lp.surface.060': { en: 'Depends on each app', 'pt-BR': 'Depende de cada app' },
    'lp.surface.061': { en: 'DAW support', 'pt-BR': 'Suporte a DAWs' },
    'lp.surface.062': { en: 'Live 12.4.5+ Suite only', 'pt-BR': 'Só Live 12.4.5+ Suite' },
    'lp.surface.063': { en: 'Often broader DAW support', 'pt-BR': 'Costuma cobrir mais DAWs' },
    'lp.surface.064': { en: 'Phone sensors', 'pt-BR': 'Sensores do celular' },
    'lp.surface.065': {
      en: 'Motion, mic analysis, optional camera tracking',
      'pt-BR': 'Movimento, análise de microfone e rastreio opcional por câmera',
    },
    'lp.surface.066': {
      en: 'Depends on the app and platform',
      'pt-BR': 'Depende do app e da plataforma',
    },
    'lp.surface.067': { en: 'Updates', 'pt-BR': 'Atualizações' },
    'lp.surface.068': {
      en: 'Manual <code>.ablx</code> releases',
      'pt-BR': 'Releases manuais de <code>.ablx</code>',
    },
    'lp.surface.069': {
      en: 'Depends on each release process',
      'pt-BR': 'Depende do processo de release de cada um',
    },
    'lp.surface.070': { en: 'Source code', 'pt-BR': 'Código-fonte' },
    'lp.surface.071': {
      en: 'Available, PolyForm Noncommercial 1.0.0',
      'pt-BR': 'Disponível, PolyForm Noncommercial 1.0.0',
    },
    'lp.surface.072': { en: 'Varies by project', 'pt-BR': 'Varia conforme o projeto' },

    // ── 1.0 highlights (CFG, LFO preview, desktop keyboard, K-weighted) ──
    'lp.highlights.title': {
      en: 'New in 1.0',
      'pt-BR': 'Novidades do 1.0',
    },
    'lp.highlights.cfg.title': {
      en: 'Config Mode (CFG)',
      'pt-BR': 'Modo CFG',
    },
    'lp.highlights.cfg.body': {
      en: 'Every pad, knob, fader, toggle, stutter and XY pad keeps its own mode, shape, subdivision, swing and physics overrides. Open <code>CFG</code> from the phone header or right-click a control on the desktop mapping panel to open a per-instance menu. Settings persist per control in <code>localStorage</code> under <code>ableton-rc:control_config</code>.',
      'pt-BR': 'Cada pad, knob, fader, toggle, stutter e XY guarda seus próprios mode, shape, subdivision, swing e physics. Abra <code>CFG</code> no header do celular ou clique com o botão direito num controle no painel de mapping do desktop para abrir um menu por instância. As configurações persistem por controle em <code>localStorage</code> sob <code>ableton-rc:control_config</code>.',
    },
    'lp.highlights.lfo.title': {
      en: 'LFO waveform preview',
      'pt-BR': 'Preview da onda do LFO',
    },
    'lp.highlights.lfo.body': {
      en: 'The SYNC settings modal draws the active LFO shape (sine, triangle, ramp up, ramp down, square) so you can see the curve you are about to push to Live, including the locked 32-beat subdivision and the per-control ceiling (sine tops at 4 Hz, square at 12 Hz).',
      'pt-BR': 'O modal de SYNC desenha a forma ativa do LFO (sine, triangle, ramp up, ramp down, square) para você ver a curva antes de mandar para o Live, incluindo a subdivisão fixa de 32 beats e o teto por controle (sine até 4 Hz, square até 12 Hz).',
    },
    'lp.highlights.kb.title': {
      en: 'Desktop keyboard control',
      'pt-BR': 'Controle por teclado no desktop',
    },
    'lp.highlights.kb.body': {
      en: 'Every continuous control (knob, fader, XY pad, toggle, stutter) accepts keyboard nudges while the phone client has focus, so the desktop mapping panel and the phone UI share the same gesture model.',
      'pt-BR': 'Todo controle contínuo (knob, fader, XY pad, toggle, stutter) aceita nudge por teclado com o cliente do celular em foco, então o painel de mapping do desktop e a UI do celular compartilham o mesmo modelo de gestos.',
    },
    'lp.highlights.lufs.title': {
      en: 'K-weighted loudness',
      'pt-BR': 'Loudness K-weighted',
    },
    'lp.highlights.lufs.body': {
      en: 'The AUD tab reports ITU-R BS.1770 K-weighted momentary, short-term and integrated loudness alongside the existing twelve descriptors.',
      'pt-BR': 'A aba AUD reporta loudness ITU-R BS.1770 K-weighted momentary, short-term e integrated junto com os doze descritores já existentes.',
    },


    'lp.chain.001': {
      en: "Signal chain <span class=\"tail\">— SDK control, optional OSC clock</span>",
      'pt-BR': "Cadeia de sinal <span class=\"tail\">— controle SDK, clock OSC opcional</span>",
    },
    'lp.chain.002': {
      en: "The browser sends numeric controls over WSS. The host maps them through the Extensions SDK. AbletonOSC is an optional clock/transport service, not a required hop for parameter mapping.",
      'pt-BR': "O navegador envia controles numéricos por WSS. O host os mapeia pelo Extensions SDK. AbletonOSC é um serviço opcional de clock/transporte, não uma etapa obrigatória para mapear parâmetros.",
    },
    'lp.chain.003': {
      en: "       HOP 1  ▼  HTTPS · LOCAL CA · WSS     ",
      'pt-BR': "     SALTO 1  ▼  HTTPS · CA LOCAL · WSS     ",
    },
    'lp.chain.004': {
      en: "       HOP 2  ▼  EXTENSIONS SDK · LOCAL     ",
      'pt-BR': "     SALTO 2  ▼  EXTENSIONS SDK · LOCAL     ",
    },
    'lp.chain.005': {
      en: "       HOP 3  ▼  LIVE OBJECT MODEL · IN PROC",
      'pt-BR': "     SALTO 3  ▼  LIVE OBJECT MODEL · NO PROC",
    },
    'lp.chain.006': {
      en: "▼ CONTROL, OUTBOUND      ◀ STATE, INBOUND",
      'pt-BR': "▼ CONTROLE, SAÍDA        ◀ ESTADO, ENTRADA",
    },
    'lp.chain.007': {
      en: "The general snapshot runs at <b>30 Hz</b>; audio descriptors have a separate immediate, bounded path. Mapping writes go through the SDK, while optional Deep Sync uses OSC UDP 11000/11001. Camera/audio media stays in the browser; numeric values cross the LAN. Browser buffers, Wi-Fi and Live scheduling add latency: measure your setup, with no universal or zero-delay guarantee.",
      'pt-BR': "O snapshot geral roda a <b>30 Hz</b>; descritores de áudio têm um caminho imediato separado e limitado. Mapeamentos usam o SDK; Deep Sync opcional usa OSC UDP 11000/11001. Imagem/áudio ficam no navegador; valores numéricos cruzam a LAN. Buffers, Wi-Fi e agendamento do Live acrescentam latência: meça seu setup, sem promessa universal ou atraso zero.",
    },
    'lp.chain.008': {
      en: 'Mode',
      'pt-BR': 'Modo',
    },
    'lp.chain.009': {
      en: 'Needs',
      'pt-BR': 'Precisa de',
    },
    'lp.chain.010': {
      en: 'What you get',
      'pt-BR': 'O que você ganha',
    },
    'lp.chain.013': {
      en: "Beat-accurate. Transport metronome, subdivisions, swing, phase.",
      'pt-BR': "Alinhado ao beat. Metrônomo do transporte, subdivisões, swing e fase.",
    },
    'lp.chain.014': {
      en: 'nothing',
      'pt-BR': 'nada',
    },
    'lp.chain.015': {
      en: "BPM simulator off Live's tempo. No beat phase.",
      'pt-BR': "Simulador de BPM a partir do andamento do Live. Sem alinhamento de fase.",
    },
    'lp.chain.016': {
      en: 'Free',
      'pt-BR': 'Free',
    },
    'lp.chain.018': {
      en: "Internal clock. LFOs and stutters are not locked to Live’s tempo.",
      'pt-BR': "Clock interno. LFOs e stutters não ficam presos ao andamento do Live.",
    },
    'lp.chain.019': {
      en: "AbletonOSC is needed <b>only</b> for Deep Sync. Without it the surface still works — pads, knobs, faders, sensors, mapping and snapshots are unaffected. It installs separately, is added in Live as a Control Surface, and requires UDP <code>11000</code> out and <code>11001</code> in to be free.",
      'pt-BR': "O AbletonOSC é necessário <b>só</b> para o Deep Sync. Sem ele a superfície continua funcionando — pads, knobs, faders, sensores, mapeamento e snapshots não são afetados. É instalado à parte, é adicionado no Live como Control Surface, e exige a UDP <code>11000</code> livre na saída e a <code>11001</code> na entrada.",
    },
    'lp.chain.020': {
      en: "Long-press <code>SYNC</code> on the phone for Deep Sync Settings: clock source, subdivisions, phase offsets, swing, the shape used by LFOs and stutters, and the length of the pad mode D burst. The header button itself only toggles <span class=\"c1\">SYNC</span> and <span class=\"c1\">FREE</span>; the three-state <span class=\"c1\">SYNCED</span> / <span class=\"c1\">SDK</span> / <span class=\"c1\">FREE</span> readout lives inside the transport overlay behind <code>TRN</code>.",
      'pt-BR': "Pressione e segure <code>SYNC</code> no celular para abrir os Ajustes de Deep Sync: fonte de clock, subdivisões, deslocamentos de fase, swing, a forma de onda usada por LFOs e stutters, e a duração do burst do pad modo D. O botão do header só alterna entre <span class=\"c1\">SYNC</span> e <span class=\"c1\">FREE</span>; o indicador de três estados <span class=\"c1\">SINCRONIZADO</span> / <span class=\"c1\">SDK</span> / <span class=\"c1\">FREE</span> fica dentro do overlay de transporte, atrás do <code>TRN</code>.",
    },
    'lp.scenarios.001': {
      en: 'Situations that make sense <span class="tail">— who, what, and the mapping</span>',
      'pt-BR': 'Situações que fazem sentido <span class="tail">— quem, o quê, e o mapeamento</span>',
    },
    'lp.scenarios.002': {
      en: 'These are complete starting points, not promises of a preset. In every case the source is named so the same result can be rebuilt in <code>MAP</code>.',
      'pt-BR': 'São pontos de partida completos, não promessas de preset. Em todos os casos a fonte está nomeada, para você reconstruir o mesmo resultado no <code>MAP</code>.',
    },
    'lp.scenarios.003': {
      en: 'A second pair of hands over one Live set',
      'pt-BR': 'Um segundo par de mãos sobre o mesmo set',
    },
    'lp.scenarios.004': {
      en: 'A soloist keeps playing while a colleague opens the phone. One finger moves an XY pad to shape the return effects without taking a controller away from the player.',
      'pt-BR': 'O solista continua tocando enquanto um colega abre o celular. Um dedo move um XY pad e molda os efeitos de return, sem tirar nenhum controlador de quem está tocando.',
    },
    'lp.scenarios.007': {
      en: 'The phone is a second pair of hands on the same session: two continuous parameters, one gesture, no pause in the solo.',
      'pt-BR': 'O celular vira um segundo par de mãos na mesma sessão: dois parâmetros contínuos, um gesto, e o solo não para.',
    },
    'lp.scenarios.008': {
      en: 'A pose becomes a sequencer cue',
      'pt-BR': 'Uma pose vira deixa para o sequenciador',
    },
    'lp.scenarios.009': {
      en: 'A pianist has both hands on the keys and cannot reach a pad. They capture three examples in G1 of a small, repeatable pose that can be made above the keyboard.',
      'pt-BR': 'O pianista está com as duas mãos no teclado e não alcança um pad. Ele captura três exemplos em G1 de uma pose pequena e repetível, que dá para fazer por cima das teclas.',
    },
    'lp.scenarios.010': {
      en: 'MIDI trigger note',
      'pt-BR': 'trigger note MIDI',
    },
    'lp.scenarios.011': {
      en: 'Each recognized pose sends a momentary 0→1 pulse to the mapped note, changing the accompanying pattern without asking the pianist to stop.',
      'pt-BR': 'Cada pose reconhecida manda um pulso momentâneo 0→1 para a nota mapeada, trocando o padrão do acompanhamento sem pedir para o pianista parar.',
    },
    'lp.scenarios.012': {
      en: 'Four corners for four sections',
      'pt-BR': 'Quatro cantos para quatro partes',
    },
    'lp.scenarios.013': {
      en: 'A producer captures a sparse intro, verse, chorus, and outro into SNP slots 1–4. They switch to Vector XY and drag between the corners as the arrangement opens up.',
      'pt-BR': 'O produtor captura intro, verso, refrão e final nos slots 1–4 da SNP. Depois muda para o Vetor XY e arrasta entre os cantos conforme o arranjo abre.',
    },
    'lp.scenarios.016': {
      en: "The whole mapped surface follows the four-corner blend, with the transition time set to <code>2.0 s</code> for a deliberate cross-section move.",
      'pt-BR': "A superfície mapeada inteira acompanha a mistura dos quatro cantos, com o tempo de transição em <code>2.0 s</code> para uma passagem de parte deliberada.",
    },
    'lp.scenarios.017': {
      en: 'Push a filter in the air',
      'pt-BR': 'Empurrar um filtro no ar',
    },
    'lp.scenarios.018': {
      en: 'A performer is standing with no table for a controller. They pinch with the palm facing the camera, wait for the clutch to engage, move their hand, and open the fingers to let go.',
      'pt-BR': 'O músico está de pé, sem mesa para apoiar controlador. Ele faz a pinça com a palma virada para a câmera, espera o clutch engatar, move a mão, e abre os dedos para soltar.',
    },
    'lp.scenarios.020': {
      en: "The cutoff moves from its current value by relative hand travel. Releasing the pinch freezes it there; a lost hand does not invent a new position.",
      'pt-BR': "O cutoff parte do valor atual e anda conforme o deslocamento da mão. Soltar a pinça congela ali; e se a mão se perde, nada inventa uma posição nova.",
    },
    'lp.scenarios.021': {
      en: 'The body supplies the modulation',
      'pt-BR': 'O corpo é que modula',
    },
    'lp.scenarios.022': {
      en: 'A phone is secured to a guitar strap. The player\'s turn during a swell creates a repeatable rotation-rate gesture without adding a cable or a foot controller.',
      'pt-BR': 'O celular é preso à correia da guitarra. O giro do corpo durante um crescendo cria um gesto de rotação repetível, sem acrescentar cabo nem pedaleira.',
    },
    'lp.scenarios.023': {
      en: 'Echo feedback',
      'pt-BR': 'feedback do Echo',
    },
    'lp.scenarios.024': {
      en: "The angular-motion channel becomes a live modulation source; CALIBRATE first establishes the instrument's neutral orientation.",
      'pt-BR': "O canal de movimento angular vira fonte de modulação ao vivo; o CALIBRAR define antes a orientação neutra do instrumento.",
    },
    'lp.scenarios.025': {
      en: 'Volume opens the effect',
      'pt-BR': 'O volume abre o efeito',
    },
    'lp.scenarios.026': {
      en: 'A singer or acoustic player leaves the phone near the microphone. Louder phrases should open a filter, while silence should close it, with no audio cable into Live.',
      'pt-BR': 'Um cantor ou instrumentista acústico deixa o celular perto do microfone. Frases mais fortes abrem um filtro, o silêncio fecha, e nenhum cabo de áudio entra no Live.',
    },
    'lp.scenarios.028': {
      en: 'The smoothed loudness envelope follows the performance. Gate can be mapped separately when an on/off response is more useful than a continuous one.',
      'pt-BR': 'O envelope suavizado de intensidade acompanha a performance. O gate pode ser mapeado à parte, quando uma resposta liga/desliga serve melhor que uma contínua.',
    },

    'lp.install.001': {
      en: 'Installation <span class="tail">— from download to a mapped parameter</span>',
      'pt-BR': 'Instalação <span class="tail">— do download até um parâmetro mapeado</span>',
    },
    'lp.install.002': {
      en: "Steps 01 to 03 establish the link shown in <a href=\"#chain\">2.0</a>. Nothing responds until the phone is connected.",
      'pt-BR': "Os passos 01 a 03 estabelecem a conexão mostrada em <a href=\"#chain\">2.0</a>. Nada responde antes de o celular estar conectado.",
    },
    'lp.install.003': {
      en: 'Clip 1',
      'pt-BR': 'Clipe 1',
    },
    'lp.install.004': {
      en: 'Install and first pairing, narrated',
      'pt-BR': 'Instalação e primeiro pareamento, narrado',
    },
    'lp.install.006': {
      en: 'Install the extension',
      'pt-BR': 'Instale a extensão',
    },
    'lp.install.007': {
      en: "Use the <code>.ablx</code> supplied with this local candidate, or a versioned asset from Published releases. Double-click it to request installation in Live. Source version 1.0.0 alone does not mean a public v1.0.0 release exists.",
      'pt-BR': "Use o <code>.ablx</code> entregue com este candidato local ou um arquivo versionado de Versões publicadas. Abra-o para solicitar instalação no Live. Código em versão 1.0.0 não significa, sozinho, que já existe release pública v1.0.0.",
    },
    'lp.install.008': {
      en: 'If the Extensions menu does not appear, check that the Live 12.4.5+ Suite Extensions host is enabled, then restart Live.',
      'pt-BR': 'Se o menu Extensions não aparecer, confira se o host de Extensions do Live 12.4.5+ Suite está habilitado e reinicie o Live.',
    },
    'lp.install.009': {
      en: 'Open the panel',
      'pt-BR': 'Abra o painel',
    },
    'lp.install.010': {
      en: "Inside Live, open <span class=\"path\">Extensions → RC Surface → Show panel</span>. The panel shows a Performance QR code and the local connection status. The bridge normally reuses loopback HTTP 8730 and LAN HTTPS/WSS 8731; the panel shows the real URL if an override or occupied port forces a fallback.",
      'pt-BR': "Dentro do Live, abra <span class=\"path\">Extensions → RC Surface → Show panel</span>. O painel mostra o QR de performance e o status da conexão local. O bridge normalmente reutiliza a HTTP 8730 em loopback e a HTTPS/WSS 8731 na rede local; se uma configuração manual ou uma porta ocupada forçar um fallback, o painel mostra a URL real.",
    },
    'lp.install.011': {
      en: 'Connect the phone',
      'pt-BR': 'Conecte o celular',
    },
    'lp.install.012': {
      en: "Scan the Performance QR code. Accept the self-signed HTTPS certificate warning once. The QR encodes the current URL. Hold the phone in landscape; portrait shows an orientation notice instead of the surface.",
      'pt-BR': "Escaneie o QR de performance. Aceite uma vez o aviso do certificado HTTPS autoassinado. O QR contém a URL atual. Segure o celular na horizontal; na vertical aparece um aviso de orientação no lugar da superfície.",
    },
    'lp.install.013': {
      en: 'Pick a pad mode',
      'pt-BR': 'Escolha o modo dos pads',
    },
    'lp.install.014': {
      en: "The twelve pads take their behaviour from the mode bar: <code>A</code> momentary, <code>B</code> hold, <code>C</code> toggle, <code>D</code> burst. Move between <code>PERF</code>, <code>MIX</code>, <code>SNP</code>, <code>SNS</code>, <code>AUD</code> and <code>VID</code> to reach performance controls, knobs and faders, snapshots, sensors, audio and vision.",
      'pt-BR': "Os doze pads tiram o comportamento da barra de modos: <code>A</code> momentâneo, <code>B</code> hold, <code>C</code> toggle, <code>D</code> burst. Alterne entre <code>PERF</code>, <code>MIX</code>, <code>SNP</code>, <code>SNS</code>, <code>AUD</code> e <code>VID</code> para chegar aos controles de performance, knobs e faders, snapshots, sensores, áudio e visão.",
    },
    'lp.install.015': {
      en: 'Arm the sensors',
      'pt-BR': 'Arme os sensores',
    },
    'lp.install.016': {
      en: 'Enable <b>Motion</b> and orientation, <b>Audio</b> microphone analysis, or <b>Vision</b> single-hand tracking as needed. The browser asks for permission locally. Raw camera and microphone streams are never sent anywhere — only numeric control values leave the phone.',
      'pt-BR': 'Ligue <b>Movimento</b> e orientação, análise de microfone em <b>Áudio</b>, ou rastreio de uma mão em <b>Visão</b>, conforme a necessidade. O navegador pede permissão localmente. Os fluxos brutos de câmera e microfone não vão para lugar nenhum — só valores numéricos de controle saem do celular.',
    },
    'lp.install.017': {
      en: 'Map a control to Live',
      'pt-BR': 'Mapeie um controle no Live',
    },
    'lp.install.018': {
      en: 'Tap <code>MAP</code> on the phone, select a highlighted control, then bind it to a Live parameter or to a MIDI trigger note. The picker groups Song, Main and Master, normal tracks, return tracks, devices and parameters, so the target context stays visible. Trigger notes use the bundled <code>RC-Midi-Receiver.amxd</code>.',
      'pt-BR': 'Toque <code>MAP</code> no celular, escolha um controle destacado e faça o bind num parâmetro do Live ou numa trigger note MIDI. O seletor agrupa Song, Main e Master, tracks normais, tracks de return, devices e parâmetros, então o contexto do alvo fica sempre à vista. As trigger notes usam o <code>RC-Midi-Receiver.amxd</code> que vem junto.',
    },
    'lp.install.019': {
      en: 'Optional: Deep Sync',
      'pt-BR': 'Opcional: Deep Sync',
    },
    'lp.install.020': {
      en: "Install AbletonOSC separately and add it in Live as a Control Surface, keeping UDP <code>11000</code> and <code>11001</code> free. Long-press <code>SYNC</code> on the phone to pick the clock source. Without it the surface runs on the SDK BPM simulator or its own internal clock — see <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Instale o AbletonOSC à parte e adicione no Live como Control Surface, deixando as UDP <code>11000</code> e <code>11001</code> livres. Pressione e segure <code>SYNC</code> no celular para escolher a fonte de clock. Sem ele a superfície roda com o simulador de BPM do SDK ou com o próprio clock interno — veja <a href=\"#clock\">2.1</a>.",
    },
    'lp.trouble.001': {
      en: 'When it does not work',
      'pt-BR': 'Quando não funciona',
    },
    'lp.trouble.002': {
      en: 'The failure modes are few and each has a single cause. Every entry names the condition that produced it, so the fix is <b>a check, not a guess</b>.',
      'pt-BR': 'As formas de falhar são poucas e cada uma tem uma causa só. Cada item nomeia a condição que a produziu, então a correção é <b>uma conferida, não um chute</b>.',
    },
    'lp.trouble.003': {
      en: 'Troubleshooting',
      'pt-BR': 'Diagnóstico',
    },
    'lp.trouble.004': {
      en: 'Phone cannot find the host',
      'pt-BR': 'O celular não acha a máquina',
    },
    'lp.trouble.005': {
      en: 'Same Wi-Fi. Live allowed through the firewall. Rescan the current QR.',
      'pt-BR': 'Mesmo Wi-Fi. Live liberado no firewall. Escaneie o QR atual de novo.',
    },
    'lp.trouble.006': {
      en: "The server prefers HTTP 8730 / HTTPS 8731 and falls back when busy. Tokens rotate on server Start; use the current QR after restart even if the port is unchanged.",
      'pt-BR': "O servidor prefere HTTP 8730 / HTTPS 8731 e usa alternativa se ocupadas. Tokens mudam ao iniciar o servidor; use o QR atual após reiniciar, mesmo com a mesma porta.",
    },
    'lp.trouble.007': {
      en: 'AbletonOSC not detected',
      'pt-BR': 'AbletonOSC não detectado',
    },
    'lp.trouble.008': {
      en: 'Install it separately as a Live Control Surface.',
      'pt-BR': 'Instale à parte, como Control Surface do Live.',
    },
    'lp.trouble.009': {
      en: 'Keep UDP <code>11000</code> and <code>11001</code> free. Only Deep Sync needs it.',
      'pt-BR': 'Deixe as UDP <code>11000</code> e <code>11001</code> livres. Só o Deep Sync precisa disso.',
    },
    'lp.trouble.010': {
      en: 'Vision will not start',
      'pt-BR': 'A visão não inicia',
    },
    'lp.trouble.011': {
      en: 'Accept the certificate, grant camera, reload.',
      'pt-BR': 'Aceite o certificado, libere a câmera, recarregue.',
    },
    'lp.trouble.012': {
      en: 'All three are required, in that order.',
      'pt-BR': 'Os três são obrigatórios, nessa ordem.',
    },
    'lp.trouble.013': {
      en: 'Audio is silent',
      'pt-BR': 'O áudio fica mudo',
    },
    'lp.trouble.014': {
      en: 'Grant microphone, then tap the audio control again.',
      'pt-BR': 'Libere o microfone e toque de novo no controle de áudio.',
    },
    'lp.trouble.015': {
      en: 'Browsers require a user gesture before capture starts.',
      'pt-BR': 'Os navegadores exigem um gesto do usuário antes de começar a captura.',
    },
    'lp.trouble.016': {
      en: 'No Extensions menu in Live',
      'pt-BR': 'Sem menu Extensions no Live',
    },
    'lp.trouble.017': {
      en: 'Check the Live 12.4.5+ Suite Extensions host is enabled, then restart Live.',
      'pt-BR': 'Confira se o host de Extensions do Live 12.4.5+ Suite está habilitado e reinicie o Live.',
    },
    'lp.trouble.018': {
      en: 'Frequently asked <span class="tail">— setup, limits, privacy</span>',
      'pt-BR': 'Perguntas frequentes <span class="tail">— instalação, limites, privacidade</span>',
    },
    'lp.trouble.019': {
      en: 'Which Live versions?',
      'pt-BR': 'Quais versões do Live?',
    },
    'lp.trouble.020': {
      en: 'It is built on Live\'s native Extensions SDK. Live 11 and standard editions have no Extensions host.',
      'pt-BR': 'É construído sobre o SDK nativo de Extensions do Live. O Live 11 e as edições standard não têm host de Extensions.',
    },
    'lp.trouble.021': {
      en: 'Android and iOS?',
      'pt-BR': 'Android e iOS?',
    },
    'lp.trouble.022': {
      en: 'iOS 15.4+ Safari, or Chromium on Android.',
      'pt-BR': 'Safari no iOS 15.4+, ou Chromium no Android.',
    },
    'lp.trouble.023': {
      en: 'iOS 14.5 and below cannot get past local self-signed certificate warnings.',
      'pt-BR': 'iOS 14.5 e anteriores não conseguem passar do aviso de certificado autoassinado local.',
    },
    'lp.trouble.024': {
      en: 'Does it need internet?',
      'pt-BR': 'Precisa de internet?',
    },
    'lp.trouble.025': {
      en: 'No. Everything runs on your local network.',
      'pt-BR': 'Não. Tudo roda na sua rede local.',
    },
    'lp.trouble.026': {
      en: 'The MediaPipe hand-tracking runtime ships with the extension and is served locally.',
      'pt-BR': 'O runtime de rastreio de mãos do MediaPipe vem junto com a extensão e é servido localmente.',
    },
    'lp.trouble.027': {
      en: 'Can I map from the phone?',
      'pt-BR': 'Dá para mapear pelo celular?',
    },
    'lp.trouble.028': {
      en: "Yes. <code>MAP</code>, pick a control, then Bind or Trigger Note. Twelve AUD descriptor cards can modulate parameters.",
      'pt-BR': "Sim. <code>MAP</code>, escolha um controle e depois Bind ou Trigger Note. Doze cartões de descritores da AUD podem modular parâmetros.",
    },
    'lp.trouble.029': {
      en: 'The picker groups Song, Main and Master, tracks, returns, devices and parameters.',
      'pt-BR': 'O seletor agrupa Song, Main e Master, tracks, returns, devices e parâmetros.',
    },
    'lp.trouble.030': {
      en: 'What about latency?',
      'pt-BR': 'E a latência?',
    },
    'lp.trouble.031': {
      en: "Router, distance, interference and host load all affect it. Measure on the target network.",
      'pt-BR': "Roteador, distância, interferência e carga da máquina influenciam. Meça na rede onde você vai tocar.",
    },
    'lp.trouble.032': {
      en: 'Camera and microphone?',
      'pt-BR': 'Câmera e microfone?',
    },
    'lp.trouble.033': {
      en: 'Processed inside the phone\'s browser. Never uploaded.',
      'pt-BR': 'Processados dentro do navegador do celular. Nunca são enviados.',
    },
    'lp.trouble.034': {
      en: 'Only numeric control values reach Live, over the local WebSocket.',
      'pt-BR': 'Só valores numéricos de controle chegam ao Live, pelo WebSocket local.',
    },
    'lp.trouble.035': {
      en: 'Official Ableton product?',
      'pt-BR': 'É produto oficial da Ableton?',
    },
    'lp.trouble.036': {
      en: 'No. Independent and source-available.',
      'pt-BR': 'Não. Independente, com código aberto para consulta.',
    },
    'lp.trouble.037': {
      en: 'Not affiliated with, sponsored by, or endorsed by Ableton AG.',
      'pt-BR': 'Sem vínculo, patrocínio ou aval da Ableton AG.',
    },
    'lp.trouble.038': {
      en: 'Is AbletonOSC required?',
      'pt-BR': 'O AbletonOSC é obrigatório?',
    },
    'lp.trouble.039': {
      en: 'Only for Deep Sync.',
      'pt-BR': 'Só para o Deep Sync.',
    },
    'lp.trouble.040': {
      en: 'Without it the controller runs on the SDK BPM simulator or its own internal clock.',
      'pt-BR': 'Sem ele o controlador roda com o simulador de BPM do SDK ou com o próprio clock interno.',
    },
    'lp.trouble.041': {
      en: 'How mature is it?',
      'pt-BR': 'Qual o estágio do projeto?',
    },
    'lp.trouble.042': {
      en: 'v1.0.0. <code>tsc --noEmit</code> clean; the production build produces a working <code>.ablx</code>.',
      'pt-BR': 'v1.0.0. <code>tsc --noEmit</code> limpo; o build de produção gera um <code>.ablx</code> funcional.',
    },
    'lp.trouble.043': {
      en: 'Smoke-tested in Live 12.4.5+ Suite (Beta) with a physical phone. The compatibility checklist remains published for additional OS, browser, and device combinations.',
      'pt-BR': 'Testado na prática no Live 12.4.5+ Suite (Beta) com um celular real. A lista de compatibilidade segue publicada para outras combinações de sistema, navegador e aparelho.',
    },
    'lp.docs.001': {
      en: 'Reference documents',
      'pt-BR': 'Documentos de referência',
    },
    'lp.docs.002': {
      en: "This sheet is the overview. When you need the long answer — a full install walkthrough, every mapping target, the threat model — these are <b>the files that hold it</b>.",
      'pt-BR': "Esta folha é a visão geral. Quando você precisar da resposta longa — o passo a passo completo da instalação, todos os alvos de mapeamento, o modelo de ameaças — é <b>nestes arquivos que ela está</b>.",
    },
    'lp.docs.003': {
      en: 'Read INSTALL.md',
      'pt-BR': 'Ler INSTALL.md',
    },
    'lp.docs.004': {
      en: 'Read USER-GUIDE.md',
      'pt-BR': 'Ler USER-GUIDE.md',
    },
    'lp.docs.005': {
      en: 'Read CUSTOMIZATION.md',
      'pt-BR': 'Ler CUSTOMIZATION.md',
    },
    'lp.docs.006': {
      en: 'Read FAQ.md',
      'pt-BR': 'Ler FAQ.md',
    },
    'lp.docs.007': {
      en: 'Read SECURITY.md',
      'pt-BR': 'Ler SECURITY.md',
    },
    'lp.docs.008': {
      en: 'Read PRIVACY.md',
      'pt-BR': 'Ler PRIVACY.md',
    },

    'lp.map.001': {
      en: 'Surface map <span class="tail">— figs. 1 to 7</span>',
      'pt-BR': 'Mapa da superfície <span class="tail">— figs. 1 a 7</span>',
    },
    'lp.map.002': {
      en: "What the phone actually shows, one tab at a time. These are drawings rather than screenshots so every cell can be named and numbered: read it to know <b>what you are touching</b> before installing anything.",
      'pt-BR': "O que o celular realmente mostra, uma aba por vez. São desenhos, não capturas de tela, para cada célula poder ter nome e número: leia para saber <b>no que você está tocando</b> antes de instalar qualquer coisa.",
    },
    'lp.map.003': {
      en: 'Six real tabs plus the MAP overlay: <b>PERF</b> Performance, rows <code>00–05</code>; <b>MIX</b> Mixer, <code>06–07</code>; <b>SNP</b> Snapshots, <code>08–0A</code>; <b>SNS</b> Sensors, <code>0B–0C</code>; <b>AUD</b> Audio, <code>0D</code>; <b>VID</b> Vision, <code>0E</code>; and <b>MAP</b> Mapping, <code>0F</code>.',
      'pt-BR': 'Seis abas reais mais o overlay MAP: <b>PERF</b> Performance, linhas <code>00–05</code>; <b>MIX</b> Mixer, <code>06–07</code>; <b>SNP</b> Snapshots, <code>08–0A</code>; <b>SNS</b> Sensores, <code>0B–0C</code>; <b>AUD</b> Áudio, <code>0D</code>; <b>VID</b> Visão, <code>0E</code>; e <b>MAP</b> Mapeamento, <code>0F</code>.',
    },
    'lp.map.004': {
      en: 'Fig. 1',
      'pt-BR': 'Fig. 1',
    },
    'lp.map.005': {
      en: 'Handset in landscape — PERF page, the layout as built',
      'pt-BR': 'Celular na horizontal — página PERF, o layout como foi construído',
    },
    'lp.map.006': {
      en: 'Scale none',
      'pt-BR': 'Sem escala',
    },
    'lp.map.007': {
      en: 'Proj. plan',
      'pt-BR': 'Proj. planta',
    },
    'lp.map.008': {
      en: 'Region',
      'pt-BR': 'Região',
    },
    'lp.map.009': {
      en: 'Qty',
      'pt-BR': 'Qtd',
    },
    'lp.map.010': {
      en: 'What it is',
      'pt-BR': 'O que é',
    },
    'lp.map.011': {
      en: 'Page tabs',
      'pt-BR': 'Abas de página',
    },
    'lp.map.012': {
      en: 'PERF, MIX, SNP, SNS, AUD, VID. MAP is the seventh page and opens over the current one.',
      'pt-BR': 'PERF, MIX, SNP, SNS, AUD, VID. O MAP é a sétima página e abre por cima da atual.',
    },
    'lp.map.013': {
      en: 'Pad grid',
      'pt-BR': 'Grade de pads',
    },
    'lp.map.014': {
      en: 'Four across, three down. Behaviour comes from the pad mode, not from the pad.',
      'pt-BR': 'Quatro na largura, três na altura. O comportamento vem do modo do pad, não do pad.',
    },
    'lp.map.015': {
      en: 'Pad mode',
      'pt-BR': 'Modo do pad',
    },
    'lp.map.016': {
      en: 'A momentary, B hold, C toggle, D burst. Applies to all twelve pads at once. Carries no heading on screen.',
      'pt-BR': 'A momentâneo, B hold, C toggle, D burst. Vale para os doze pads de uma vez. Não tem título na tela.',
    },
    'lp.map.017': {
      en: 'XY pads',
      'pt-BR': 'XY pads',
    },
    'lp.map.018': {
      en: 'Captioned <code>XY 1</code> and <code>XY 2 (Physics)</code>, each with a live <code>0.50 / 0.50</code> readout. Each axis maps on its own.',
      'pt-BR': 'Rotulados <code>XY 1</code> e <code>XY 2 (Física)</code>, cada um com leitura ao vivo <code>0.50 / 0.50</code>. Cada eixo é mapeado por conta própria.',
    },
    'lp.map.019': {
      en: 'LFOs',
      'pt-BR': 'LFOs',
    },
    'lp.map.020': {
      en: 'L1 to L4. Experimental shape ceilings: sine 5 Hz, triangle 8 Hz, ramps 6 Hz, square 15 Hz. Continuous FREE and rhythmic SYNC; Shift+drag for fine adjustment. Rate changes preserve phase. Only rate appears on controls: Hz in FREE, musical notes in SYNC. Shapes are in settings; fidelity in Live still needs testing.',
      'pt-BR': 'L1 a L4. Tetos experimentais por forma: senoide 5 Hz, triângulo 8 Hz, rampas 6 Hz, quadrada 15 Hz. FREE contínuo e SYNC rítmico; Shift+arrasto para ajuste fino. Mudar a velocidade preserva a fase. Só a velocidade aparece nos controles: Hz em FREE, duração musical em SYNC. Formas ficam nos ajustes; fidelidade no Live ainda precisa de teste.',
    },
    'lp.map.021': {
      en: 'Stutters',
      'pt-BR': 'Stutters',
    },
    'lp.map.022': {
      en: 'S1 to S4. Horizontal speed, vertical amplitude. Only rate is shown: Hz in FREE, musical notes in SYNC; up to 15 Hz including ratchet. Flashing follows the local gate. Horizontal drag releases a fixed division; unavailable rhythmic choices are disabled for the current tempo and swing.',
      'pt-BR': 'S1 a S4. Velocidade horizontal, amplitude vertical. Só a velocidade: Hz em FREE, duração musical em SYNC; até 15 Hz incluindo ratchet. O piscar segue o gate local. Arrastar na horizontal libera a divisão fixa; ritmos indisponíveis ficam desativados conforme andamento e swing.',
    },
    'lp.map.023': {
      en: "CAP captures, slots 1 to 4 recall, OFF exits. Six cells, two across.",
      'pt-BR': "CAP captura, os slots 1 a 4 recuperam, OFF sai. Seis células, duas na largura.",
    },
    'lp.map.024': {
      en: 'Live panel',
      'pt-BR': 'Painel do Live',
    },
    'lp.map.025': {
      en: 'BPM readout plus five buttons: previous locator, play and pause, next locator, <code>TRN</code>, <code>MAP</code>. Header, on every page.',
      'pt-BR': 'Leitura de BPM mais cinco botões: locator anterior, play e pause, próximo locator, <code>TRN</code>, <code>MAP</code>. Header, em todas as páginas.',
    },
    'lp.map.026': {
      en: 'Sync block',
      'pt-BR': 'Bloco de sync',
    },
    'lp.map.027': {
      en: "<code>SYNC</code>, settings and <code>STAGE</code>. CALIBRATE appears only on SNS/AUD/VID.",
      'pt-BR': "<code>SYNC</code>, ajustes e <code>STAGE</code>. CALIBRAR aparece só em SNS/AUD/VID.",
    },
    'lp.map.028': {
      en: "Plan view of the PERF tab only. The other five tabs and the MAP overlay are the remaining figures in this viewer. Drawn for this sheet: it is not a screenshot and carries no dimensional information. The surface refuses portrait: held upright it shows an orientation notice instead. All drawings here are landscape.",
      'pt-BR': "Planta só da aba PERF. As outras cinco abas e o overlay MAP são as figuras seguintes deste visualizador. Desenhado para esta folha: não é captura de tela e não traz informação de dimensões. A superfície não abre em retrato: na vertical aparece um aviso de orientação. Todos os desenhos aqui estão na horizontal.",
    },
    'lp.map.029': {
      en: 'Fig. 2',
      'pt-BR': 'Fig. 2',
    },
    'lp.map.030': {
      en: "Handset in landscape — MIX page, eight knobs and eight faders",
      'pt-BR': "Celular na horizontal — MIX, oito knobs e oito faders",
    },
    'lp.map.037': {
      en: 'PERF, MIX, SNP, SNS, AUD, VID. MIX is active in this plan.',
      'pt-BR': 'PERF, MIX, SNP, SNS, AUD, VID. O MIX está ativo nesta planta.',
    },
    'lp.map.038': {
      en: 'Knobs',
      'pt-BR': 'Knobs',
    },
    'lp.map.039': {
      en: "<code>knob-1..8</code>, four across by two down, with flat arcs. Vertical relative drag, keyboard arrows and Home/End use the same normalized range.",
      'pt-BR': "<code>knob-1..8</code>, quatro por dois, com arcos planos. Arrasto vertical relativo, setas e Home/End usam a mesma faixa normalizada.",
    },
    'lp.map.040': {
      en: 'Faders',
      'pt-BR': 'Faders',
    },
    'lp.map.041': {
      en: "<code>fader-1..8</code>, in one row, with 150 px relative vertical drag. IDs 1–6 and old mappings remain compatible; 7–8 are additional controls.",
      'pt-BR': "<code>fader-1..8</code>, em uma linha, com arrasto vertical relativo de 150 px. IDs 1–6 e mapeamentos antigos continuam compatíveis; 7–8 são adicionais.",
    },
    'lp.map.043': {
      en: 'BPM, previous locator, play and pause, next locator, <code>TRN</code>, and <code>MAP</code>. Shared by every page.',
      'pt-BR': 'BPM, locator anterior, play e pause, próximo locator, <code>TRN</code> e <code>MAP</code>. Compartilhado por todas as páginas.',
    },
    'lp.map.045': {
      en: "<code>SYNC</code>, settings and <code>STAGE</code>. CALIBRATE appears only on SNS/AUD/VID.",
      'pt-BR': "<code>SYNC</code>, ajustes e <code>STAGE</code>. CALIBRAR aparece só em SNS/AUD/VID.",
    },
    'lp.map.046': {
      en: 'The two banks use the same gesture: touch, then drag vertically from the control\'s current value. A knob turns its dial and a fader moves its thumb along an absolute scale, but neither jumps to the point first touched. The difference between them is visual, not gestural.',
      'pt-BR': 'Os dois bancos usam o mesmo gesto: tocar e arrastar na vertical a partir do valor atual do controle. O knob gira o disco e o fader move o cursor numa escala absoluta, mas nenhum dos dois pula para o ponto tocado. A diferença entre eles é visual, não de gesto.',
    },
    'lp.map.047': {
      en: 'Fig. 3',
      'pt-BR': 'Fig. 3',
    },
    'lp.map.048': {
      en: 'Handset in landscape — SNP page, eight stored states and four-corner vector morph',
      'pt-BR': 'Celular na horizontal — página SNP, oito estados guardados e morph vetorial de quatro cantos',
    },
    'lp.map.055': {
      en: "SNP is active; the shared header remains reachable.",
      'pt-BR': "O SNP está ativo; o header compartilhado continua acessível.",
    },
    'lp.map.056': {
      en: 'Morph slots',
      'pt-BR': 'Slots de morph',
    },
    'lp.map.057': {
      en: "Stores whole controller states in a four-by-two grid, then recalls or morphs to one slot.",
      'pt-BR': "Guarda estados inteiros do controlador numa grade de quatro por dois, e depois recupera ou faz morph para um slot.",
    },
    'lp.map.058': {
      en: 'Performance controls',
      'pt-BR': 'Controles de performance',
    },
    'lp.map.059': {
      en: "<code>CAPTURE</code> and <code>CLEAR SLOTS</code>, transition time free from 0.1 s to 5.0 s or synced to a subdivision (default 1.0 s), and Grid/Vector mode selection.",
      'pt-BR': "<code>CAPTURAR</code> e <code>LIMPAR SLOTS</code>, tempo de transição livre de 0.1 s a 5.0 s ou sincado numa subdivisão (padrão 1.0 s), e a escolha entre modo Grade e Vetor.",
    },
    'lp.map.060': {
      en: 'Vector morph pad',
      'pt-BR': 'Pad de morph vetorial',
    },
    'lp.map.061': {
      en: 'Blends four stored states at once: slot 1 TL, 2 TR, 3 BL, and 4 BR. The point sets the weighted mix between all corners.',
      'pt-BR': 'Mistura quatro estados guardados ao mesmo tempo: slot 1 superior esquerdo, 2 superior direito, 3 inferior esquerdo e 4 inferior direito. O ponto define a mistura ponderada entre todos os cantos.',
    },
    'lp.map.063': {
      en: 'BPM, locator and transport controls, <code>TRN</code>, and <code>MAP</code>.',
      'pt-BR': 'BPM, controles de locator e transporte, <code>TRN</code> e <code>MAP</code>.',
    },
    'lp.map.065': {
      en: "<code>SYNC</code>, settings and <code>STAGE</code>; contextual <code>CALIBRATE</code> on SNS/AUD/VID.",
      'pt-BR': "<code>SYNC</code>, ajustes e <code>STAGE</code>; <code>CALIBRAR</code> contextual em SNS/AUD/VID.",
    },
    'lp.map.066': {
      en: 'Vector mode keeps the eight stored states visible and adds a four-corner XY pad. Moving the point does not crossfade only two snapshots: it interpolates slots 1–4 simultaneously, with each corner contributing according to distance.',
      'pt-BR': 'O modo vetor mantém os oito estados guardados à vista e acrescenta um XY pad de quatro cantos. Mover o ponto não faz crossfade entre dois snapshots: ele interpola os slots 1–4 ao mesmo tempo, com cada canto contribuindo conforme a distância.',
    },
    'lp.map.067': {
      en: 'Fig. 4',
      'pt-BR': 'Fig. 4',
    },
    'lp.map.068': {
      en: 'Handset in landscape — SNS page, motion and orientation axes annotated on the device',
      'pt-BR': 'Celular na horizontal — página SNS, eixos de movimento e orientação anotados sobre o aparelho',
    },
    'lp.map.075': {
      en: 'SNS is active; the sensor page keeps the shared Live and sync header.',
      'pt-BR': 'O SNS está ativo; a página de sensores mantém o header compartilhado de Live e sync.',
    },
    'lp.map.076': {
      en: 'Motion',
      'pt-BR': 'Movimento',
    },
    'lp.map.077': {
      en: '<code>GX GY GZ</code> are angular-rate channels; <code>AX AY AZ</code> are acceleration channels. The live bars show signed magnitude around a centre line.',
      'pt-BR': '<code>GX GY GZ</code> são canais de velocidade angular; <code>AX AY AZ</code> são canais de aceleração. As barras ao vivo mostram a magnitude com sinal em torno de uma linha central.',
    },
    'lp.map.078': {
      en: 'Orientation',
      'pt-BR': 'Orientação',
    },
    'lp.map.079': {
      en: 'Yaw, pitch, and roll are shown as numeric angles with an orbit marker.',
      'pt-BR': 'Yaw, pitch e roll aparecem como ângulos numéricos, com um marcador de órbita.',
    },
    'lp.map.080': {
      en: 'Local view',
      'pt-BR': 'Visão local',
    },
    'lp.map.081': {
      en: 'Shows or hides Motion and Orientation on this phone only; it does not disable the sensor source.',
      'pt-BR': 'Mostra ou esconde Movimento e Orientação só neste celular; não desliga a fonte do sensor.',
    },
    'lp.map.082': {
      en: 'Axis key',
      'pt-BR': 'Legenda dos eixos',
    },
    'lp.map.083': {
      en: "The handset annotation relates AX/AY/AZ acceleration and GX/GY/GZ rotation rate to the physical phone, so tilting it becomes a readable control gesture.",
      'pt-BR': "A anotação sobre o aparelho liga a aceleração AX/AY/AZ e a rotação GX/GY/GZ ao celular físico, para que inclinar o aparelho vire um gesto de controle legível.",
    },
    'lp.map.088': {
      en: 'The page separates movement from orientation. Motion exposes six signed channels; orientation exposes three angles. The small phone diagram is an annotation drawn for this sheet, placed on the handset plan so the axis names are not left abstract.',
      'pt-BR': 'A página separa movimento de orientação. Movimento expõe seis canais com sinal; orientação expõe três ângulos. O desenho pequeno do celular é uma anotação feita para esta folha, colocada sobre a planta do aparelho para os nomes dos eixos não ficarem abstratos.',
    },
    'lp.map.089': {
      en: 'Fig. 5',
      'pt-BR': 'Fig. 5',
    },
    'lp.map.090': {
      en: 'Handset in landscape — AUD page, audio input and twelve descriptors',
      'pt-BR': 'Celular na horizontal — página AUD, entrada de áudio e doze descritores',
    },
    'lp.map.097': {
      en: 'AUD is active; the shared header remains available while the selected audio input is analysed.',
      'pt-BR': 'O AUD está ativo; o header compartilhado continua disponível durante a análise da entrada de áudio selecionada.',
    },
    'lp.map.098': {
      en: 'Audio input',
      'pt-BR': 'Entrada de áudio',
    },
    'lp.map.099': {
      en: "Select Browser default or a permitted microphone/interface/loopback input, then enable capture. The browser remembers the choice but never starts automatically. Unplug or denied access shows an error without silently choosing another microphone. Native Ableton Track mode is not part of this candidate.",
      'pt-BR': "Escolha Padrão do navegador ou uma entrada permitida de microfone/interface/loopback e habilite a captura. A escolha fica salva, mas nunca liga sozinha. Remoção ou permissão negada geram aviso, sem trocar de microfone silenciosamente. O modo Track nativo do Ableton não entra neste candidato.",
    },
    'lp.map.100': {
      en: "Input level",
      'pt-BR': "Nível de entrada",
    },
    'lp.map.101': {
      en: "Input RMS amplitude, normalized to 0..1; not perceived loudness.",
      'pt-BR': "Amplitude RMS da entrada, normalizada em 0..1; não é loudness percebido.",
    },
    'lp.map.102': {
      en: 'Signal history',
      'pt-BR': 'Histórico do sinal',
    },
    'lp.map.103': {
      en: "Live 2.5-second history: Amplitude, Attacks, Tone, Texture, Bands or All. The top-right readout shows the vertical range; legend buttons toggle curves. Descriptor mappings use 0–1.",
      'pt-BR': "Histórico ao vivo de 2.5 segundos: Amplitude, Ataques, Timbre, Textura, Bandas ou Todos. O canto superior direito indica a escala vertical; a legenda liga e desliga curvas. Descritores mapeiam em 0–1.",
    },
    'lp.map.104': {
      en: 'Detector knobs',
      'pt-BR': 'Knobs dos detectores',
    },
    'lp.map.105': {
      en: "Flat arc knobs grouped as Attacks, Tone, Texture and Bands: SENS, RELEASE, CURVE, group GAIN and SMOOTH. WINDOW is separate. RELEASE/SMOOTH follow Live note divisions down to 1/128, including triplets and dotted values, in SYNC; FREE uses saved milliseconds. Double-tap restores defaults.",
      'pt-BR': "Knobs planos com arco em Ataques, Timbre, Textura e Bandas: SENS, RELEASE, CURVA, GANHO e SUAVE do grupo. JANELA fica separada. RELEASE/SUAVE seguem divisões até 1/128, incluindo tercinas e pontuadas, em SYNC; FREE usa milissegundos salvos. Dois toques restauram os padrões.",
    },
    'lp.map.106': {
      en: "Analysis window",
      'pt-BR': "Janela de análise",
    },
    'lp.map.107': {
      en: "WINDOW x1/x2/x4 changes analysis resolution. Longer windows trade spectral detail for response time. This is not a measurement of microphone-to-Live latency.",
      'pt-BR': "JANELA x1/x2/x4 altera a resolução da análise. Janelas maiores trocam resposta temporal por detalhe espectral. Isso não mede a latência do microfone até o Live.",
    },
    'lp.audio.detectors': {
      en: "Built-in audio detectors",
      'pt-BR': "Detectores de áudio integrados",
    },
    'lp.audio.timing': {
      en: 'Audio timing: SYNC uses Live BPM with 1/128 through 1/1 notes, including triplets (T) and dotted notes (D); SMOOTH also offers OFF. FREE keeps independent millisecond settings (illustrated here). Bands measure linear RMS, not perceived loudness.',
      'pt-BR': 'Tempos do áudio: SYNC usa o BPM do Live com notas de 1/128 até 1/1, incluindo tercinas (T) e pontuadas (D); SUAVE também oferece OFF. FREE mantém milissegundos independentes (ilustrados aqui). Bandas medem RMS linear, não loudness percebido.',
    },
    'lp.audio.detector-note': {
      en: "Twelve 0..1 mapping sources in Attacks, Tone, Texture and Bands: Transient, Kick, Snare, Brightness, Centroid, Flux, Flatness, Spread, Rolloff 95%, Low, Mid and High RMS. All twelve cards remain available; compact screens scroll the bank. Graph views select families and the legend toggles individual curves.",
      'pt-BR': "Doze fontes 0..1 em Ataques, Timbre, Textura e Bandas: Transiente, Kick, Snare, Brilho, Centroide, Fluxo, Flatness, Dispersão, Rolloff 95% e RMS de Graves, Médios e Agudos. Os doze cartões ficam disponíveis; telas compactas rolam a lista. As vistas do gráfico selecionam famílias e a legenda alterna curvas individuais.",
    },
    'lp.map.112': {
      en: "The live 2.5-second graph selects RMS/envelope, attacks, bands or normalized spectral history. Twelve controls replace the retired Follow panel: sensor.audio.transient, sensor.audio.kick, sensor.audio.snare, sensor.audio.brightness, sensor.audio.centroid, sensor.audio.flux, sensor.audio.flatness, sensor.audio.spread, sensor.audio.rolloff, sensor.audio.low, sensor.audio.mid, sensor.audio.high. Centroid/Spread/Rolloff readouts show Hz but map in 0..1. Kick/snare are spectral heuristics, not instrument classification. Overlapping Hann timbre windows do not add an extra wait to attacks; microphone-to-Live timing still needs a physical test.",
      'pt-BR': "O gráfico ao vivo de 2.5 s alterna RMS/envelope, ataques, bandas ou histórico espectral normalizado. Doze controles substituem o Follow: sensor.audio.transient, sensor.audio.kick, sensor.audio.snare, sensor.audio.brightness, sensor.audio.centroid, sensor.audio.flux, sensor.audio.flatness, sensor.audio.spread, sensor.audio.rolloff, sensor.audio.low, sensor.audio.mid, sensor.audio.high. Centroide/Dispersão/Rolloff mostram Hz, mas mapeiam em 0..1. Kick/snare são heurísticas, não classificação de instrumentos. Janelas Hann sobrepostas de timbre não acrescentam uma janela de espera aos ataques; a latência até o Live exige teste físico.",
    },
    'lp.map.113': {
      en: 'Fig. 6',
      'pt-BR': 'Fig. 6',
    },
    'lp.map.114': {
      en: 'Handset in landscape — VID page, camera, learned poses, built-in detectors, and live readouts',
      'pt-BR': 'Celular na horizontal — página VID, câmera, poses aprendidas, detectores nativos e leituras ao vivo',
    },
    'lp.map.121': {
      en: 'VID is active; the camera console sits below the shared header.',
      'pt-BR': 'O VID está ativo; o console da câmera fica abaixo do header compartilhado.',
    },
    'lp.map.122': {
      en: 'Camera',
      'pt-BR': 'Câmera',
    },
    'lp.map.123': {
      en: 'Camera on/off, confidence Low / Medium / High, recognition Precision / Balanced / Flexible, and the live preview/status stage.',
      'pt-BR': 'Câmera liga/desliga, confiança Baixa / Média / Alta, reconhecimento Precisão / Equilibrado / Flexível, e o palco de prévia e status ao vivo.',
    },
    'lp.map.124': {
      en: 'Learned poses',
      'pt-BR': 'Poses aprendidas',
    },
    'lp.map.125': {
      en: 'G1, G2, and G3 each store three examples. Every card has <code>CAP</code>, <code>TEST</code>, <code>DEL LAST</code>, and <code>CLR</code>; recognition emits a momentary 0→1 channel.',
      'pt-BR': 'G1, G2 e G3 guardam três exemplos cada. Todo cartão tem <code>CAP</code>, <code>TESTE</code>, <code>APAGAR ÚLT</code> e <code>LIMPAR</code>; o reconhecimento emite um canal momentâneo 0→1.',
    },
    'lp.map.126': {
      en: 'Built-in detectors',
      'pt-BR': 'Detectores nativos',
    },
    'lp.map.127': {
      en: 'Open, Fist, Pinch, and Victory are opt-in outputs that need no training. Rotation belongs to Victory rather than adding a fifth detector button.',
      'pt-BR': 'Aberta, Punho, Pinça e Victory são saídas opcionais que não precisam de treino. A rotação pertence ao Victory, em vez de virar um quinto botão de detector.',
    },
    'lp.map.128': {
      en: 'Direct MAP / CLUTCH',
      'pt-BR': 'MAP direto / CLUTCH',
    },
    'lp.map.129': {
      en: 'MAP X/Y/Z follows direct hand position. CLUTCH shows its held state and relative X/Y/Z; releasing the pinch freezes those three values.',
      'pt-BR': 'O MAP X/Y/Z segue a posição direta da mão. O CLUTCH mostra o estado engatado e o X/Y/Z relativo; soltar a pinça congela esses três valores.',
    },
    'lp.map.130': {
      en: 'Camera diagnostics',
      'pt-BR': 'Diagnósticos da câmera',
    },
    'lp.map.131': {
      en: 'PALM size checks the depth window and signed FACE distinguishes palm from back of hand. Both stay local to the camera preview and are not mapping controls.',
      'pt-BR': 'O tamanho de PALM confere a janela de profundidade e o FACE com sinal distingue palma de dorso da mão. Os dois ficam locais à prévia da câmera e não são controles de mapeamento.',
    },
    'lp.map.136': {
      en: 'This plan follows the focused performance console: three learned-pose cards, four opt-in built-in detectors, and one two-card MAP / CLUTCH deck. PALM and FACE remain visible only as camera diagnostics; passive finger and whole-frame color readings do not enter mapping traffic.',
      'pt-BR': 'Esta planta segue o console de performance enxuto: três cartões de pose aprendida, quatro detectores nativos opcionais, e um deck de dois cartões MAP / CLUTCH. PALM e FACE seguem visíveis só como diagnóstico da câmera; leituras passivas de dedos e de cor do quadro inteiro não entram no tráfego de mapeamento.',
    },
    'lp.map.137': {
      en: 'Fig. 7',
      'pt-BR': 'Fig. 7',
    },
    'lp.map.138': {
      en: 'Handset in landscape — MAP overlay, from armed strip to hierarchical target picker',
      'pt-BR': 'Celular na horizontal — overlay MAP, da faixa armada até o seletor hierárquico de alvos',
    },
    'lp.map.144': {
      en: 'Underlying page',
      'pt-BR': 'Página por baixo',
    },
    'lp.map.145': {
      en: 'MAP is an overlay, not a seventh tab. The active page and its tab remain visible and tappable underneath until a control is selected.',
      'pt-BR': 'O MAP é um overlay, não uma sétima aba. A página ativa e a aba dela seguem visíveis e tocáveis por baixo até você escolher um controle.',
    },
    'lp.map.146': {
      en: 'Armed strip',
      'pt-BR': 'Faixa armada',
    },
    'lp.map.147': {
      en: 'The entry state shows only <code>MAP ARMED / TAP A CONTROL / DONE</code>. It disappears after a control is tapped.',
      'pt-BR': 'O estado de entrada mostra só <code>MAP ARMADO / TOQUE UM CONTROLE / PRONTO</code>. Ela some assim que um controle é tocado.',
    },
    'lp.map.148': {
      en: 'Editing overlay',
      'pt-BR': 'Overlay de edição',
    },
    'lp.map.149': {
      en: 'After selection, a 400 px right-side pane covers part of the current page and owns the mapping editor or target picker.',
      'pt-BR': 'Depois da escolha, um painel de 400 px na direita cobre parte da página atual e assume o editor de mapeamento ou o seletor de alvos.',
    },
    'lp.map.150': {
      en: 'Target filter',
      'pt-BR': 'Filtro de alvos',
    },
    'lp.map.151': {
      en: "Searches target names; <code>Selected in Live</code> narrows the tree to Ableton Live's selected track and device when that state is available.",
      'pt-BR': "Busca por nome de alvo; <code>Selecionado no Live</code> reduz a árvore para a track e o device selecionados no Ableton Live, quando esse estado está disponível.",
    },
    'lp.map.152': {
      en: 'Hierarchy',
      'pt-BR': 'Hierarquia',
    },
    'lp.map.153': {
      en: 'Expandable Track → Device → Parameter tree, with separate Song/Main/Master and Return Track groups.',
      'pt-BR': 'Árvore expansível Track → Device → Parâmetro, com grupos separados de Song/Main/Master e de Return Tracks.',
    },
    'lp.map.154': {
      en: 'Live selection shortcut',
      'pt-BR': 'Atalho da seleção do Live',
    },
    'lp.map.155': {
      en: 'Reads the selected track and device from Live and uses their names as a target filter; it does not invent a parameter choice.',
      'pt-BR': 'Lê a track e o device selecionados no Live e usa os nomes deles como filtro de alvo; não inventa uma escolha de parâmetro.',
    },
    'lp.map.157': {
      en: 'The header remains visible; <code>MAP</code> is blue while overlay mode is active.',
      'pt-BR': 'O header segue visível; o <code>MAP</code> fica azul enquanto o modo overlay está ativo.',
    },
    'lp.map.159': {
      en: "<code>SYNC</code>, settings and <code>STAGE</code> remain in the header. <code>CALIBRATE</code> depends on the underlying page.",
      'pt-BR': "<code>SYNC</code>, ajustes e <code>STAGE</code> seguem no header. <code>CALIBRAR</code> depende da página de fundo.",
    },
    'lp.map.160': {
      en: 'The dashed strip and the right pane are two sequential MAP states shown in one plan, not controls visible at the same time. First MAP arms the existing page; tapping a control replaces the strip with the right-side editor, where targets are chosen through the real Track → Device → Parameter hierarchy.',
      'pt-BR': 'A faixa tracejada e o painel da direita são dois estados sequenciais do MAP mostrados numa planta só, não controles visíveis ao mesmo tempo. Primeiro o MAP arma a página existente; tocar um controle troca a faixa pelo editor da direita, onde os alvos são escolhidos pela hierarquia real Track → Device → Parâmetro.',
    },

    'lp.controls.001': {
      en: 'Controls <span class="tail">— inventory, shared header, and families</span>',
      'pt-BR': 'Controles <span class="tail">— inventário, header compartilhado e famílias</span>',
    },
    'lp.controls.002': {
      en: 'Eighteen kinds of control, each with a behaviour you pick deliberately — a pad that latches is not a pad that retriggers. This is where you decide <b>which control a parameter deserves</b>.',
      'pt-BR': 'Dezoito tipos de controle, cada um com um comportamento que você escolhe de propósito — um pad que trava não é um pad que redispara. É aqui que você decide <b>qual controle um parâmetro merece</b>.',
    },
    'lp.controls.003': {
      en: 'Control inventory <span class="tail">— 18 rows</span>',
      'pt-BR': 'Inventário de controles <span class="tail">— 18 linhas</span>',
    },
    'lp.controls.004': {
      en: 'local',
      'pt-BR': 'local',
    },
    'lp.controls.005': {
      en: 'Module',
      'pt-BR': 'Módulo',
    },
    'lp.controls.006': {
      en: 'Qty',
      'pt-BR': 'Qtd',
    },
    'lp.controls.007': {
      en: 'Page',
      'pt-BR': 'Página',
    },
    'lp.controls.008': {
      en: 'Sends',
      'pt-BR': 'Envia por',
    },
    'lp.controls.009': {
      en: 'Target in Live',
      'pt-BR': 'Alvo no Live',
    },
    'lp.controls.010': {
      en: 'Performance pads',
      'pt-BR': 'Pads de performance',
    },
    'lp.controls.011': {
      en: 'Clip, scene, or a trigger note',
      'pt-BR': 'Clip, cena, ou uma trigger note',
    },
    'lp.controls.012': {
      en: 'Pad modes A–D',
      'pt-BR': 'Modos de pad A–D',
    },
    'lp.controls.014': {
      en: 'Pad behaviour only',
      'pt-BR': 'Só o comportamento do pad',
    },
    'lp.controls.015': {
      en: 'XY pads',
      'pt-BR': 'XY pads',
    },
    'lp.controls.016': {
      en: 'Two parameters per pad',
      'pt-BR': 'Dois parâmetros por pad',
    },
    'lp.controls.017': {
      en: 'LFOs L1–L4',
      'pt-BR': 'LFOs L1–L4',
    },
    'lp.controls.018': {
      en: 'Any mapped parameter',
      'pt-BR': 'Qualquer parâmetro mapeado',
    },
    'lp.controls.019': {
      en: 'Stutters S1–S4',
      'pt-BR': 'Stutters S1–S4',
    },
    'lp.controls.021': {
      en: 'PERF UTIL column',
      'pt-BR': 'Coluna PERF UTIL',
    },
    'lp.controls.023': {
      en: 'CAP, slots 1–4, OFF',
      'pt-BR': 'CAP, slots 1–4, OFF',
    },
    'lp.controls.024': {
      en: 'Knobs',
      'pt-BR': 'Knobs',
    },
    'lp.controls.025': {
      en: 'Device parameter',
      'pt-BR': 'Parâmetro de device',
    },
    'lp.controls.026': {
      en: 'Faders',
      'pt-BR': 'Faders',
    },
    'lp.controls.027': {
      en: 'Track volume',
      'pt-BR': 'Volume da track',
    },
    'lp.controls.028': {
      en: 'Morph slots',
      'pt-BR': 'Slots de morph',
    },
    'lp.controls.029': {
      en: 'A whole controller state',
      'pt-BR': 'Um estado inteiro do controlador',
    },
    'lp.controls.030': {
      en: 'Transition time',
      'pt-BR': 'Tempo de transição',
    },
    'lp.controls.032': {
      en: "Free 0.1 s to 5.0 s, or Sync from 16 quarter-note beats to 1/16 beat",
      'pt-BR': "Free de 0.1 s a 5.0 s, ou Sync de 16 tempos de semínima a 1/16 tempo",
    },
    'lp.controls.033': {
      en: 'Vector morph pad',
      'pt-BR': 'Pad de morph vetorial',
    },
    'lp.controls.034': {
      en: 'Blends slots 1–4 by corner: TL TR BL BR',
      'pt-BR': 'Mistura os slots 1–4 por canto: SE SD IE ID',
    },
    'lp.controls.035': {
      en: 'Motion',
      'pt-BR': 'Movimento',
    },
    'lp.controls.036': {
      en: 'GX GY GZ, AX AY AZ',
      'pt-BR': 'GX GY GZ, AX AY AZ',
    },
    'lp.controls.037': {
      en: 'Orientation',
      'pt-BR': 'Orientação',
    },
    'lp.controls.038': {
      en: 'Yaw, pitch, roll',
      'pt-BR': 'Yaw, pitch, roll',
    },
    'lp.controls.039': {
      en: 'Audio input',
      'pt-BR': 'Entrada de áudio',
    },
    'lp.controls.040': {
      en: "RMS, envelope, gate, attack; Transient, Kick, Snare, Brightness, Centroid, Rolloff95, Flux, Flatness, Spread, Low, Mid, High",
      'pt-BR': "RMS, envelope, gate, ataque; Transiente, Kick, Snare, Brilho, Centroide, Rolloff95, Fluxo, Flatness, Dispersão, Graves, Médios, Agudos",
    },
    'lp.controls.041': {
      en: 'Single-hand vision',
      'pt-BR': 'Visão de uma mão',
    },
    'lp.controls.042': {
      en: 'Hand <code>sensor.vision.x</code>, <code>.y</code>, <code>.z</code>; Pinch Clutch <code>sensor.vision.pinch_x</code>, <code>_y</code>, <code>_z</code>; Open / Fist / Pinch / Victory plus Victory rotation; learned G1–G3. PALM, FACE, finger diagnostics, and whole-frame color stay local and do not enter mapping traffic.',
      'pt-BR': 'Mão <code>sensor.vision.x</code>, <code>.y</code>, <code>.z</code>; Pinch Clutch <code>sensor.vision.pinch_x</code>, <code>_y</code>, <code>_z</code>; Aberta / Punho / Pinça / Victory mais a rotação do Victory; e as aprendidas G1–G3. PALM, FACE, diagnósticos de dedos e cor do quadro inteiro ficam locais e não entram no tráfego de mapeamento.',
    },
    'lp.controls.043': {
      en: 'Map picker',
      'pt-BR': 'Seletor de mapeamento',
    },
    'lp.controls.045': {
      en: 'Phone overlay, panel Mapping tab, and the separate administrative window; each stores bindings, but only emitted phone channels can drive them',
      'pt-BR': 'Overlay no celular, aba de Mapeamentos no painel, e a janela administrativa à parte; cada um guarda binds, mas só canais que o celular realmente emite conseguem acioná-los',
    },
    'lp.controls.046': {
      en: 'Header live panel',
      'pt-BR': 'Painel do Live no header',
    },
    'lp.controls.047': {
      en: 'header',
      'pt-BR': 'header',
    },
    'lp.controls.048': {
      en: 'BPM, prev locator, play and pause, next locator, TRN, MAP',
      'pt-BR': 'BPM, locator anterior, play e pause, próximo locator, TRN, MAP',
    },
    'lp.controls.049': {
      en: 'Header sync block',
      'pt-BR': 'Bloco de sync no header',
    },
    'lp.controls.051': {
      en: "SYNC, settings, STAGE; CALIBRATE on SNS/AUD/VID",
      'pt-BR': "SYNC, ajustes, STAGE; CALIBRAR em SNS/AUD/VID",
    },
    'lp.controls.052': {
      en: "<b>SDK</b> rows map numeric controls to Live parameters. MIDI targets require the optional Receiver; local controls do not leave the browser. The header is shared by every page. Deep Sync clock/transport may use optional OSC independently of parameter mappings.",
      'pt-BR': "Linhas <b>SDK</b> mapeiam controles numéricos a parâmetros do Live. Alvos MIDI precisam do Receiver opcional; controles locais não saem do navegador. O cabeçalho é comum às páginas. Clock/transporte Deep Sync podem usar OSC opcional independentemente dos mapeamentos.",
    },
    'lp.controls.053': {
      en: 'The header <span class="tail">— present on every page</span>',
      'pt-BR': 'O header <span class="tail">— presente em todas as páginas</span>',
    },
    'lp.controls.054': {
      en: "Live's tempo, mirrored. Read-only.",
      'pt-BR': "O andamento do Live, espelhado. Só leitura.",
    },
    'lp.controls.055': {
      en: 'Transport',
      'pt-BR': 'Transporte',
    },
    'lp.controls.056': {
      en: 'Previous locator, play and pause, next locator. Controls Live\'s transport from the phone.',
      'pt-BR': 'Locator anterior, play e pause, próximo locator. Controla o transporte do Live pelo celular.',
    },
    'lp.controls.057': {
      en: "Full-screen overlay: <b>PLAY</b>, <b>STOP</b>, <b>PREV</b>, <b>NEXT</b>, <b>REFRESH</b>, a locator list and a search. Carries the SYNCED / SDK / FREE readout. Flashes green on beat 1, blue on the others.",
      'pt-BR': "Overlay em tela cheia: <b>PLAY</b>, <b>STOP</b>, <b>ANT</b>, <b>PRÓX</b>, <b>ATUALIZAR</b>, uma lista de locators e uma busca. Traz o indicador SINCRONIZADO / SDK / FREE. Pisca verde no beat 1 e azul nos outros.",
    },
    'lp.controls.058': {
      en: 'Opens the mapping picker as an overlay on the current page. It has no tab of its own.',
      'pt-BR': 'Abre o seletor de mapeamento como overlay sobre a página atual. Não tem aba própria.',
    },
    'lp.controls.059': {
      en: "A two-state toggle: the button itself reads <b>SYNC</b> or <b>FREE</b>. Long-press for Deep Sync Settings. See <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Um toggle de dois estados: o próprio botão diz <b>SYNC</b> ou <b>FREE</b>. Pressione e segure para abrir os Ajustes de Deep Sync. Veja <a href=\"#clock\">2.1</a>.",
    },
    'lp.controls.060': {
      en: 'Settings',
      'pt-BR': 'Ajustes',
    },
    'lp.controls.061': {
      en: 'Opens Deep Sync Settings directly, without the long-press.',
      'pt-BR': 'Abre os Ajustes de Deep Sync direto, sem precisar segurar.',
    },
    'lp.controls.062': {
      en: "Per page: SNS sets a stable neutral posture; AUD adjusts RMS/envelope response from five seconds of playing sound; VID checks lighting and hand tracking, using supported automatic camera settings. Separate states, cancel and reset.",
      'pt-BR': "Por página: SNS define a postura neutra estável; AUD ajusta RMS/envelope com cinco segundos de som tocando; VID verifica luz e rastreio, usando ajustes automáticos suportados pela câmera. Estados separados, cancelar e restaurar.",
    },
    'lp.controls.063': {
      en: "Locks the surface to the current page, preventing accidental page changes during performance.",
      'pt-BR': "Trava a superfície na página atual, evitando troca acidental de página durante a performance.",
    },
    'lp.controls.064': {
      en: 'Status',
      'pt-BR': 'Status',
    },
    'lp.controls.065': {
      en: "Link state and the phone's name. Tap to rename.",
      'pt-BR': "Estado da conexão e o nome do celular. Toque para renomear.",
    },
    'lp.controls.066': {
      en: 'What each one does <span class="tail">— from touch to Live</span>',
      'pt-BR': 'O que cada um faz <span class="tail">— do toque até o Live</span>',
    },
    'lp.controls.067': {
      en: 'The inventory above names the controls. These small drawings show the gesture that makes each family musical.',
      'pt-BR': 'O inventário acima nomeia os controles. Estes desenhos mostram o gesto que torna cada família musical.',
    },
    'lp.controls.068': {
      en: 'Performance',
      'pt-BR': 'Performance',
    },
    'lp.controls.069': {
      en: 'Continuous controls',
      'pt-BR': 'Controles contínuos',
    },
    'lp.controls.070': {
      en: 'Snapshots',
      'pt-BR': 'Snapshots',
    },
    'lp.controls.071': {
      en: 'Motion & audio',
      'pt-BR': 'Movimento e áudio',
    },
    'lp.controls.072': {
      en: 'Vision',
      'pt-BR': 'Visão',
    },
    'lp.controls.073': {
      en: 'Mapping & MIDI',
      'pt-BR': 'Mapeamento e MIDI',
    },
    'lp.controls.074': {
      en: 'Pads, LFOs, stutters',
      'pt-BR': 'Pads, LFOs, stutters',
    },
    'lp.controls.075': {
      en: '<code>A</code> starts at zero and returns there on release; <code>B</code> starts from the saved value and holds; <code>C</code> toggles and can still be edited while held; <code>D</code> is a short attack–release burst. The same modes shape LFOs and stutters: AbletonOSC follows Live\'s beat subdivisions, while SDK/FREE runs without beat-phase lock. PERF UTIL recalls bypass the SNP transition.',
      'pt-BR': '<code>A</code> começa em zero e volta para lá ao soltar; <code>B</code> parte do valor guardado e segura; <code>C</code> alterna e ainda pode ser editado enquanto segurado; <code>D</code> é um burst curto de attack e release. Os mesmos modos moldam LFOs e stutters: o AbletonOSC segue as subdivisões de beat do Live, enquanto SDK/FREE roda sem travar na fase do beat. Os recalls do PERF UTIL ignoram a transição do SNP.',
    },
    'lp.controls.076': {
      en: 'VALUE ↑',
      'pt-BR': 'VALOR ↑',
    },
    'lp.controls.077': {
      en: 'TIME →',
      'pt-BR': 'TEMPO →',
    },
    'lp.controls.078': {
      en: 'TOUCH = ▼ · UP = △',
      'pt-BR': 'TOQUE = ▼ · SOLTA = △',
    },
    'lp.controls.079': {
      en: 'touch',
      'pt-BR': 'toque',
    },
    'lp.controls.080': {
      en: 'drag sets level',
      'pt-BR': 'o arrasto define o nível',
    },
    'lp.controls.081': {
      en: 'UP → immediate zero',
      'pt-BR': 'SOLTA → zero na hora',
    },
    'lp.controls.082': {
      en: 'drag edits level',
      'pt-BR': 'o arrasto edita o nível',
    },
    'lp.controls.083': {
      en: 'UP → hold new value',
      'pt-BR': 'SOLTA → segura o valor novo',
    },
    'lp.controls.084': {
      en: 'two-touch latch',
      'pt-BR': 'trava em dois toques',
    },
    'lp.controls.085': {
      en: "hold + drag edits ON",
      'pt-BR': "segurar + arrastar edita com ele ligado",
    },
    'lp.controls.086': {
      en: 'one-shot A–R',
      'pt-BR': 'one-shot A–R',
    },
    'lp.controls.087': {
      en: 'drag peak .15–1 · length follows the grid in SYNC',
      'pt-BR': 'arrasto define o pico .15–1 · a duração segue a grade em SYNC',
    },
    'lp.controls.088': {
      en: 'repeat at beat division',
      'pt-BR': 'repete na divisão do beat',
    },
    'lp.controls.089': {
      en: 'Every panel uses the same value-over-time grammar; only the post-touch state changes.',
      'pt-BR': 'Todos os painéis usam a mesma gramática de valor no tempo; só muda o estado depois do toque.',
    },
    'lp.controls.090': {
      en: 'XY, knobs, faders',
      'pt-BR': 'XY, knobs, faders',
    },
    'lp.controls.091': {
      en: 'XY 2 records drag position and velocity, then coasts, rebounds and keeps emitting after release. Knobs and faders are two visual forms of the same vertical relative drag: they start from the current value and never jump to the touch point. They share one bank and the mapping surfaces, but their control keys and mappings remain independent.',
      'pt-BR': 'O XY 2 registra posição e velocidade do arrasto, e depois desliza, ricocheteia e continua emitindo mesmo depois de soltar. Knobs e faders são duas formas visuais do mesmo arrasto vertical relativo: partem do valor atual e nunca pulam para o ponto tocado. Dividem um banco e as superfícies de mapeamento, mas as chaves de controle e os mapeamentos seguem independentes.',
    },
    'lp.controls.092': {
      en: 'The touch point is never the value',
      'pt-BR': 'O ponto do toque nunca é o valor',
    },
    'lp.controls.093': {
      en: 'value',
      'pt-BR': 'valor',
    },
    'lp.controls.094': {
      en: 'same<br>length',
      'pt-BR': 'mesmo<br>tamanho',
    },
    'lp.controls.095': {
      en: 'finger',
      'pt-BR': 'dedo',
    },
    'lp.controls.096': {
      en: 'Touch anywhere — at touch-down <b>dy is 0</b>, so nothing moves. Move 150&nbsp;px and the value crosses its whole range.',
      'pt-BR': 'Toque em qualquer lugar — no instante do toque <b>dy é 0</b>, então nada se move. Percorra 150&nbsp;px e o valor atravessa a faixa inteira.',
    },
    'lp.controls.097': {
      en: 'value = start + dy / rangePx',
      'pt-BR': 'valor = inicial + dy / rangePx',
    },
    'lp.controls.098': {
      en: 'Release does not stop it',
      'pt-BR': 'Soltar não faz parar',
    },
    'lp.controls.099': {
      en: '<i></i>travelled',
      'pt-BR': '<i></i>percorrido',
    },
    'lp.controls.100': {
      en: '<i class="dot"></i>where it keeps going',
      'pt-BR': '<i class="dot"></i>para onde ele segue',
    },
    'lp.controls.101': {
      en: 'pad edge · rebounds at ×0.75',
      'pt-BR': 'borda do pad · ricocheteia a ×0.75',
    },
    'lp.controls.102': {
      en: 'v ×= 0.988 each frame · stops under 0.01',
      'pt-BR': 'v ×= 0.988 a cada frame · para abaixo de 0.01',
    },
    'lp.controls.103': {
      en: 'Snapshots and vector morph',
      'pt-BR': 'Snapshots e morph vetorial',
    },
    'lp.controls.104': {
      en: 'A recall moves the mapped state across the chosen transition interval. Vector XY bilinearly blends the four corner states instead of crossfading only two.',
      'pt-BR': 'Um recall move o estado mapeado ao longo do intervalo de transição escolhido. O Vetor XY mistura de forma bilinear os quatro estados dos cantos, em vez de fazer crossfade entre dois.',
    },
    'lp.controls.105': {
      en: "RECALL = timed interpolation · 0.1–5.0 s",
      'pt-BR': "RECALL = interpolação cronometrada · 0.1–5.0 s",
    },
    'lp.controls.106': {
      en: 'four corner states → weighted blend',
      'pt-BR': 'quatro estados de canto → mistura ponderada',
    },
    'lp.controls.107': {
      en: 'A snapshot is a complete mapped state, not a screenshot and not a two-point crossfade.',
      'pt-BR': 'Um snapshot é um estado mapeado completo, não uma captura de tela nem um crossfade entre dois pontos.',
    },
    'lp.controls.108': {
      en: 'Motion, orientation, audio',
      'pt-BR': 'Movimento, orientação, áudio',
    },
    'lp.controls.109': {
      en: 'CALIBRATE makes the phone\'s current position the reference; every motion axis maps independently. AUD provides RMS, envelope and twelve descriptors for amplitude, attacks and spectral changes; its graph shows selectable curves over time.',
      'pt-BR': 'CALIBRAR usa a posição atual do celular como referência; cada eixo de movimento pode ser mapeado. AUD oferece RMS, envelope e doze descritores de amplitude, ataques e mudanças espectrais; o gráfico mostra curvas selecionáveis ao longo do tempo.',
    },
    'lp.controls.110': {
      en: "SIGNAL / 2.5s",
      'pt-BR': "SINAL / 2.5s",
    },
    'lp.controls.111': {
      en: 'band rise',
      'pt-BR': 'subida da banda',
    },
    'lp.controls.112': {
      en: 'drag ↑↓',
      'pt-BR': 'arraste ↑↓',
    },
    'lp.controls.113': {
      en: 'pulse tail',
      'pt-BR': 'cauda do pulso',
    },
    'lp.controls.114': {
      en: "analysis size",
      'pt-BR': "tamanho da análise",
    },
    'lp.controls.115': {
      en: 'cyan = instantaneous RMS · green = smoothed envelope',
      'pt-BR': 'ciano = RMS instantâneo · verde = envelope suavizado',
    },
    'lp.controls.116': {
      en: 'Vision: hand, poses, clutch',
      'pt-BR': 'Visão: mão, poses, clutch',
    },
    'lp.controls.117': {
      en: 'Direct hand X/Y/Z stays available for continuous control. A held, camera-facing pinch engages the clutch; hand displacement then drives its relative axes, and release freezes them. G1–G3 and the four built-in detectors are intentional outputs. PALM and FACE remain local camera diagnostics, not mapping traffic.',
      'pt-BR': 'O X/Y/Z direto da mão segue disponível para controle contínuo. Uma pinça segurada, com a palma virada para a câmera, engata o clutch; o deslocamento da mão passa a acionar os eixos relativos, e soltar congela tudo. G1–G3 e os quatro detectores nativos são saídas intencionais. PALM e FACE seguem como diagnóstico local da câmera, não como tráfego de mapeamento.',
    },
    'lp.controls.118': {
      en: 'the two tips touch',
      'pt-BR': 'as duas pontas se tocam',
    },
    'lp.controls.119': {
      en: 'contact rises past .75',
      'pt-BR': 'o contato passa de .75',
    },
    'lp.controls.120': {
      en: 'the clutch takes hold',
      'pt-BR': 'o clutch engata',
    },
    'lp.controls.121': {
      en: 'the hand travels in space',
      'pt-BR': 'a mão percorre o espaço',
    },
    'lp.controls.122': {
      en: 'X, Y and Z follow it',
      'pt-BR': 'X, Y e Z acompanham',
    },
    'lp.controls.123': {
      en: 'from where you started',
      'pt-BR': 'a partir de onde você começou',
    },
    'lp.controls.124': {
      en: 'the fingers part',
      'pt-BR': 'os dedos se separam',
    },
    'lp.controls.125': {
      en: 'contact drops below .55',
      'pt-BR': 'o contato cai abaixo de .55',
    },
    'lp.controls.126': {
      en: 'the value stays put',
      'pt-BR': 'o valor fica onde estava',
    },
    'lp.controls.127': {
      en: 'PINCH AGAIN, ANY TIME, ANYWHERE — IT RESUMES FROM THE SAVED VALUE',
      'pt-BR': 'REPITA A PINÇA, QUANDO E ONDE QUISER — ELE RETOMA DO VALOR GUARDADO',
    },
    'lp.controls.128': {
      en: 'CONTACT = gap between landmark 4 and landmark 8, divided by palm size',
      'pt-BR': 'CONTATO = distância entre o landmark 4 e o 8, dividida pelo tamanho da palma',
    },
    'lp.controls.129': {
      en: 'ARM ≥ .75 · RELEASE < .55 · between the two it stays latched, so a wobbling hand does not let go',
      'pt-BR': 'ENGATA ≥ .75 · SOLTA < .55 · entre os dois ele fica travado, então uma mão trêmula não solta',
    },
    'lp.controls.130': {
      en: 'sensor.vision.pinch_x · _y · _z',
      'pt-BR': 'sensor.vision.pinch_x · _y · _z',
    },
    'lp.controls.131': {
      en: 'relative, never absolute',
      'pt-BR': 'relativo, nunca absoluto',
    },
    'lp.controls.132': {
      en: 'MAP, MIDI, and mapping surfaces',
      'pt-BR': 'MAP, MIDI e superfícies de mapeamento',
    },
    'lp.controls.133': {
      en: 'Phone MAP and panel Mappings bind live controls to Live parameters or trigger notes with curve, range, takeover, safe-loss, and idle settings. The administrative window mirrors emitted phone channels; dead individual finger readings stay excluded. Its 2D response canvas plots live input against output. Selector, phone producer, and server consumer together define the mappable set.',
      'pt-BR': 'O MAP do celular e os Mapeamentos do painel ligam controles ao vivo a parâmetros do Live ou a trigger notes, com ajustes de curva, faixa, takeover, perda segura e ociosidade. A janela administrativa espelha os canais que o celular realmente emite; leituras mortas de dedos individuais seguem de fora. O canvas de resposta 2D dela plota a entrada ao vivo contra a saída. Seletor, produtor no celular e consumidor no servidor definem juntos o conjunto mapeável.',
    },
    'lp.controls.134': {
      en: 'INPUT → OUTPUT',
      'pt-BR': 'ENTRADA → SAÍDA',
    },
    'lp.controls.135': {
      en: 'Phone MAP and panel Mappings edit the same source → transform → destination contract.',
      'pt-BR': 'O MAP do celular e os Mapeamentos do painel editam o mesmo contrato fonte → transformação → destino.',
    },
    'lp.controls.136': {
      en: 'MIDI trigger notes',
      'pt-BR': 'Trigger notes MIDI',
    },
    'lp.controls.137': {
      en: 'Map a phone control to a note on a MIDI track. The bundled <code>RC-Midi-Receiver.amxd</code> is reused when already on the track; otherwise place it manually because Live cannot insert Max for Live devices through its Extensions SDK. Pads, LFOs, stutters, XY axes, knobs, faders, detectors, and learned poses support trigger-note targets.',
      'pt-BR': 'Mapeie um controle do celular numa nota de uma track MIDI. O <code>RC-Midi-Receiver.amxd</code> incluído é reaproveitado quando já está na track; senão coloque-o manualmente, pois o Live não insere devices Max for Live pelo SDK de Extensions. Pads, LFOs, stutters, eixos de XY, knobs, faders, detectores e poses aprendidas aceitam alvo de trigger note.',
    },
    'lp.controls.138': {
      en: "Audio descriptors",
      'pt-BR': "Descritores de áudio",
    },
    'lp.controls.139': {
      en: "AUD offers twelve descriptors plus amplitude controls. Kick/Snare are heuristics, bands are linear RMS, not perceptual loudness. Native Track and measured end-to-end latency remain pending; the independent Max Audio Sender does not feed browser descriptors.",
      'pt-BR': "AUD oferece doze descritores e amplitude. Kick/Snare são heurísticas; bandas são RMS linear, não loudness perceptual. Track nativo e medição ponta a ponta seguem pendentes; o Max Audio Sender independente não alimenta os descritores do navegador.",
    },
    'lp.controls.140': {
      en: 'TRN transport',
      'pt-BR': 'Transporte TRN',
    },
    'lp.controls.141': {
      en: "A full-screen transport overlay reached from the header: play, stop, previous and next locator, refresh, locator search, and the SYNCED / SDK / FREE clock readout.",
      'pt-BR': "Um overlay de transporte em tela cheia, alcançado pelo header: play, stop, locator anterior e próximo, atualizar, busca de locator, e o indicador de clock SINCRONIZADO / SDK / FREE.",
    },
    'lp.controls.142': {
      en: 'Deep Sync',
      'pt-BR': 'Deep Sync',
    },
    'lp.controls.143': {
      en: "Long-press <code>SYNC</code> for clock source, subdivisions, phase offsets, swing, the shapes used by LFOs and stutters, and the burst length for pad mode D. See <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Pressione e segure <code>SYNC</code> para fonte de clock, subdivisões, deslocamentos de fase, swing, as formas de onda usadas por LFOs e stutters, e a duração do burst do pad modo D. Veja <a href=\"#clock\">2.1</a>.",
    },
    'lp.controls.144': {
      en: 'Local HTTPS',
      'pt-BR': 'HTTPS local',
    },
    'lp.controls.145': {
      en: "A self-signed certificate is generated on first launch so the phone browser will grant camera and microphone permissions. Current LAN IPs are written into the certificate's SAN list.",
      'pt-BR': "Um certificado autoassinado é gerado na primeira execução para o navegador do celular liberar as permissões de câmera e microfone. Os IPs atuais da rede local são escritos na lista SAN do certificado.",
    },
    'lp.a11y.001': {
      en: 'Choose a surface page plan',
      'pt-BR': 'Escolha um plano de página da superfície',
    },
    'lp.a11y.002': {
      en: 'Choose a control family',
      'pt-BR': 'Escolha uma família de controles',
    },
    'lp.top.003': {
      en: 'Local network · nothing installed on the phone',
      'pt-BR': 'Rede local · nada instalado no celular',
    },
    'lp.map.161': {
      en: "6 ax",
      'pt-BR': "6 eixos",
    },
    'lp.map.162': {
      en: "3 ax",
      'pt-BR': "3 eixos",
    },
    'lp.map.163': {
      en: "3 levels",
      'pt-BR': "3 níveis",
    },
    'lp.controls.146': {
      en: "3 surfaces",
      'pt-BR': "3 superfícies",
    },
    'lp.docs.009': {
      en: "Installation Guide",
      'pt-BR': "Guia de instalação",
    },
    'lp.docs.010': {
      en: "Setup for Windows and macOS, the local HTTPS warning, and first-run mapping checks.",
      'pt-BR': "Instalação no Windows e no macOS, o aviso de HTTPS local, e as conferidas de mapeamento na primeira execução.",
    },
    'lp.docs.011': {
      en: "User Manual",
      'pt-BR': "Manual do usuário",
    },
    'lp.docs.012': {
      en: "Pad modes, MAP mode, LFO and stutter controls, mixer pages, sensors, snapshot behaviour.",
      'pt-BR': "Modos de pad, modo MAP, controles de LFO e stutter, páginas de mixer, sensores e comportamento dos snapshots.",
    },
    'lp.docs.013': {
      en: "Customization &amp; Dev",
      'pt-BR': "Customização e desenvolvimento",
    },
    'lp.docs.014': {
      en: "Mobile mapping, target routing, trigger notes, extending scripts, adjusting the web interface.",
      'pt-BR': "Mapeamento pelo celular, roteamento de alvos, trigger notes, como estender os scripts e ajustar a interface web.",
    },
    'lp.docs.015': {
      en: "FAQ",
      'pt-BR': "FAQ",
    },
    'lp.docs.016': {
      en: "Compatibility notes, diagnostics, and setup troubleshooting.",
      'pt-BR': "Notas de compatibilidade, diagnóstico e solução de problemas na instalação.",
    },
    'lp.docs.017': {
      en: "Security Threat Model",
      'pt-BR': "Modelo de ameaças",
    },
    'lp.docs.018': {
      en: "Local network behaviour, HTTPS setup, WebSocket endpoints, current security assumptions.",
      'pt-BR': "Comportamento na rede local, configuração de HTTPS, endpoints de WebSocket e as premissas de segurança atuais.",
    },
    'lp.docs.019': {
      en: "Privacy Policy",
      'pt-BR': "Política de privacidade",
    },
    'lp.docs.020': {
      en: "Local media processing, where the hand-tracking runtime comes from, and zero telemetry.",
      'pt-BR': "Processamento local de mídia, de onde vem o runtime de rastreio de mãos, e telemetria zero.",
    },
    'lp.chain.021': {
      en: "2.1 · Clock source",
      'pt-BR': "2.1 · Fonte de clock",
    },
    'lp.install.021': {
      en: "Your browser does not support the video tag.",
      'pt-BR': "Seu navegador não suporta a tag de vídeo.",
    },
    'lp.fig.001': {
      en: "CALIBRATE",
      'pt-BR': "CALIBRAR",
    },
    'lp.fig.002': {
      en: "MOTION",
      'pt-BR': "MOVIMENTO",
    },
    'lp.fig.003': {
      en: "ORIENTATION",
      'pt-BR': "ORIENTAÇÃO",
    },
    'lp.fig.004': {
      en: "AUDIO",
      'pt-BR': "ÁUDIO",
    },
    'lp.fig.005': {
      en: "AUDIO INPUT",
      'pt-BR': "ENTRADA DE ÁUDIO",
    },
    'lp.fig.006': {
      en: "VISION",
      'pt-BR': "VISÃO",
    },
    'lp.fig.007': {
      en: "TEST",
      'pt-BR': "TESTE",
    },
    'lp.fig.008': {
      en: "DEL LAST",
      'pt-BR': "APAGAR ÚLT",
    },
    'lp.fig.009': {
      en: "CLR",
      'pt-BR': "LIMPAR",
    },
    'lp.fig.010': {
      en: "MAP ARMED",
      'pt-BR': "MAP ARMADO",
    },
    'lp.fig.011': {
      en: "TAP A CONTROL",
      'pt-BR': "TOQUE UM CONTROLE",
    },
    'lp.fig.012': {
      en: "DONE",
      'pt-BR': "PRONTO",
    },
    'lp.fig.013': {
      en: "CAPTURE",
      'pt-BR': "CAPTURAR",
    },
    'lp.fig.014': {
      en: "CLEAR SLOTS",
      'pt-BR': "LIMPAR SLOTS",
    },
    'lp.fig.015': {
      en: "SELECTED IN LIVE",
      'pt-BR': "SELECIONADO NO LIVE",
    },
    'lp.fig.016': {
      en: "XY 2 (Physics)",
      'pt-BR': "XY 2 (Física)",
    },
    'lp.fig.017': {
      en: "CAMERA",
      'pt-BR': "CÂMERA",
    },
    'lp.fig.018': {
      en: "CAMERA OFF",
      'pt-BR': "CÂMERA DESLIGADA",
    },
    'lp.fig.019': {
      en: "LEARNED POSES",
      'pt-BR': "POSES APRENDIDAS",
    },
    'lp.fig.020': {
      en: "BUILT-IN DETECTORS",
      'pt-BR': "DETECTORES NATIVOS",
    },
    'lp.fig.021': {
      en: "OPEN",
      'pt-BR': "ABERTA",
    },
    'lp.fig.022': {
      en: "FIST",
      'pt-BR': "PUNHO",
    },
    'lp.fig.023': {
      en: "PINCH",
      'pt-BR': "PINÇA",
    },
    'lp.fig.024': {
      en: "TRANSITION TIME",
      'pt-BR': "TEMPO DE TRANSIÇÃO",
    },
    'lp.fig.025': {
      en: "MORPH MODE",
      'pt-BR': "MODO DE MORPH",
    },
    'lp.fig.026': {
      en: "MOTION VISIBLE",
      'pt-BR': "MOVIMENTO VISÍVEL",
    },
    'lp.fig.027': {
      en: "ORIENTATION VISIBLE",
      'pt-BR': "ORIENTAÇÃO VISÍVEL",
    },
    'lp.fig.028': {
      en: "RELEASE",
      'pt-BR': "RELEASE",
    },
    'lp.fig.029': {
      en: "WINDOW",
      'pt-BR': "JANELA",
    },
    'lp.fig.030': {
      en: "NOTE",
      'pt-BR': "NOTA",
    },
    'lp.fig.031': {
      en: "MEDIUM",
      'pt-BR': "MÉDIA",
    },
    'lp.fig.032': {
      en: "BALANCED",
      'pt-BR': "EQUILIBRADO",
    },
    'lp.fig.033': {
      en: "BACK",
      'pt-BR': "VOLTAR",
    },
    'lp.fig.034': {
      en: "PICK TARGET",
      'pt-BR': "ESCOLHER ALVO",
    },
    'lp.fig.035': {
      en: "Enable Camera to begin",
      'pt-BR': "Ligue a câmera para começar",
    },
    'lp.fig.036': {
      en: "Visibility changes this phone UI only.",
      'pt-BR': "A visibilidade muda só a interface deste celular.",
    },
    'lp.fig.037': {
      en: "VECTOR XY",
      'pt-BR': "VETOR XY",
    },
    'lp.fig.038': {
      en: "GRID (1–8)",
      'pt-BR': "GRADE (1–8)",
    },
    'lp.fig.039': {
      en: "FILTER TARGETS...",
      'pt-BR': "FILTRAR ALVOS...",
    },
    'lp.fig.100': {
      en: "PLAN VIEW — DRAWN FOR THIS SHEET — NOT A SCREENSHOT — NOT TO SCALE",
      'pt-BR': "PLANTA — DESENHADA PARA ESTA FOLHA — NÃO É CAPTURA DE TELA — FORA DE ESCALA",
    },
    'lp.fig.101': {
      en: "RELATIVE DRAG",
      'pt-BR': "ARRASTO RELATIVO",
    },
    'lp.fig.102': {
      en: "PERFORMANCE CONTROLS",
      'pt-BR': "CONTROLES DE PERFORMANCE",
    },
    'lp.fig.103': {
      en: "VECTOR MORPH PAD",
      'pt-BR': "PAD DE MORPH VETORIAL",
    },
    'lp.fig.104': {
      en: "MECHANISM",
      'pt-BR': "MECANISMO",
    },
    'lp.fig.105': {
      en: "1 TL",
      'pt-BR': "1 SE",
    },
    'lp.fig.106': {
      en: "2 TR",
      'pt-BR': "2 SD",
    },
    'lp.fig.107': {
      en: "3 BL",
      'pt-BR': "3 IE",
    },
    'lp.fig.108': {
      en: "4 BR",
      'pt-BR': "4 ID",
    },
    'lp.fig.109': {
      en: "LOCAL VIEW",
      'pt-BR': "VISÃO LOCAL",
    },
    'lp.fig.110': {
      en: "UI ONLY",
      'pt-BR': "SÓ NA INTERFACE",
    },
    'lp.fig.111': {
      en: "hand / intent",
      'pt-BR': "mão / intenção",
    },
    'lp.fig.112': {
      en: "CAMERA DIAGNOSTICS",
      'pt-BR': "DIAGNÓSTICO DA CÂMERA",
    },
    'lp.fig.113': {
      en: "3 examples each · momentary 0 → 1",
      'pt-BR': "3 exemplos cada · momentâneo 0 → 1",
    },
    'lp.fig.114': {
      en: "LIVE CHECK",
      'pt-BR': "TESTE AO VIVO",
    },
    'lp.fig.115': {
      en: "CURRENT PAGE REMAINS VISIBLE",
      'pt-BR': "A PÁGINA ATUAL CONTINUA VISÍVEL",
    },
    'lp.fig.116': {
      en: "ENTRY STATE",
      'pt-BR': "ESTADO INICIAL",
    },
    'lp.fig.117': {
      en: "AFTER TAP",
      'pt-BR': "DEPOIS DO TOQUE",
    },
    'lp.fig.118': {
      en: "LOADED",
      'pt-BR': "CARREGADO",
    },
    'lp.fig.119': {
      en: "A · RELEASE",
      'pt-BR': "A · SOLTA",
    },
    'lp.fig.120': {
      en: "B · HOLD",
      'pt-BR': "B · SEGURA",
    },
    'lp.fig.121': {
      en: "C · TOGGLE",
      'pt-BR': "C · ALTERNA",
    },
    'lp.fig.122': {
      en: "SAVED",
      'pt-BR': "GUARDADO",
    },
    'lp.fig.123': {
      en: "KEEP",
      'pt-BR': "MANTÉM",
    },
    'lp.fig.124': {
      en: "TAP ON",
      'pt-BR': "TOCA LIGA",
    },
    'lp.fig.125': {
      en: "TAP OFF",
      'pt-BR': "TOCA DESLIGA",
    },
    'lp.fig.126': {
      en: "70 ms attack",
      'pt-BR': "70 ms de attack",
    },
    'lp.fig.127': {
      en: "450 ms release",
      'pt-BR': "450 ms de release",
    },
    'lp.fig.128': {
      en: "1 · RELATIVE VERTICAL DRAG",
      'pt-BR': "1 · ARRASTO VERTICAL RELATIVO",
    },
    'lp.fig.129': {
      en: "2 · PHYSICS",
      'pt-BR': "2 · FÍSICA",
    },
    'lp.fig.130': {
      en: "15-POINT TRAIL",
      'pt-BR': "RASTRO DE 15 PONTOS",
    },
    'lp.fig.131': {
      en: "STORE A STATE · RETURN OVER TIME · BLEND BETWEEN FOUR STATES",
      'pt-BR': "GUARDA UM ESTADO · VOLTA AO LONGO DO TEMPO · MISTURA QUATRO ESTADOS",
    },
    'lp.fig.132': {
      en: "CAPTURE / RECALL",
      'pt-BR': "CAPTURA / RECALL",
    },
    'lp.fig.133': {
      en: "LIVE STATE",
      'pt-BR': "ESTADO AO VIVO",
    },
    'lp.fig.134': {
      en: "EIGHT SLOTS",
      'pt-BR': "OITO SLOTS",
    },
    'lp.fig.135': {
      en: "CURRENT",
      'pt-BR': "ATUAL",
    },
    'lp.fig.136': {
      en: "VECTOR MORPH",
      'pt-BR': "MORPH VETORIAL",
    },
    'lp.fig.137': {
      en: "BLENDED OUTPUT",
      'pt-BR': "SAÍDA MISTURADA",
    },
    'lp.fig.138': {
      en: "MOTION SETS A REFERENCE · AUDIO TURNS SOUND INTO STABLE CONTROL",
      'pt-BR': "MOVIMENTO DEFINE UMA REFERÊNCIA · ÁUDIO VIRA CONTROLE ESTÁVEL",
    },
    'lp.fig.139': {
      en: "512 / 1024 / 2048",
      'pt-BR': "512 / 1024 / 2048",
    },
    'lp.fig.140': {
      en: "PINCH CLUTCH — A LOOP YOU CAN LEAVE AND COME BACK TO",
      'pt-BR': "PINCH CLUTCH — UM CICLO QUE VOCÊ PODE LARGAR E RETOMAR",
    },
    'lp.fig.141': {
      en: "1 · ENGAGE",
      'pt-BR': "1 · ENGATA",
    },
    'lp.fig.142': {
      en: "2 · MOVE",
      'pt-BR': "2 · MOVE",
    },
    'lp.fig.143': {
      en: "3 · RELEASE",
      'pt-BR': "3 · SOLTA",
    },
    'lp.fig.144': {
      en: "ONE SIGNAL PATH · SOURCE DOMAIN → 0..1 SHAPE → TARGET DOMAIN",
      'pt-BR': "UM CAMINHO DE SINAL · DOMÍNIO DA FONTE → FORMA 0..1 → DOMÍNIO DO ALVO",
    },
    'lp.fig.145': {
      en: "SOURCE",
      'pt-BR': "FONTE",
    },
    'lp.fig.146': {
      en: "range you set",
      'pt-BR': "faixa que você define",
    },
    'lp.fig.147': {
      en: "MEASURED SENSOR DOMAIN",
      'pt-BR': "DOMÍNIO MEDIDO DO SENSOR",
    },
    'lp.fig.148': {
      en: "TRANSFORM DESK",
      'pt-BR': "MESA DE TRANSFORMAÇÃO",
    },
    'lp.fig.149': {
      en: "NORMALIZE",
      'pt-BR': "NORMALIZA",
    },
    'lp.fig.150': {
      en: "SOURCE RANGE",
      'pt-BR': "FAIXA DA FONTE",
    },
    'lp.fig.151': {
      en: "RESPONSE CURVE",
      'pt-BR': "CURVA DE RESPOSTA",
    },
    'lp.fig.152': {
      en: "LINEAR · EXPONENTIAL · LOGARITHMIC · S-CURVE",
      'pt-BR': "LINEAR · EXPONENCIAL · LOGARÍTMICA · CURVA S",
    },
    'lp.fig.153': {
      en: "TARGET RANGE",
      'pt-BR': "FAIXA DO ALVO",
    },
    'lp.fig.154': {
      en: "SCALED LIVE PARAMETER",
      'pt-BR': "PARÂMETRO DO LIVE ESCALADO",
    },
    'lp.fig.155': {
      en: "POLICY",
      'pt-BR': "POLÍTICA",
    },
    'lp.fig.156': {
      en: "SCALE",
      'pt-BR': "ESCALA",
    },
    'lp.fig.157': {
      en: "SAFE LOSS",
      'pt-BR': "PERDA SEGURA",
    },
    'lp.fig.158': {
      en: "SMOOTHING",
      'pt-BR': "SUAVIZAÇÃO",
    },
    'lp.fig.159': {
      en: "ACTION",
      'pt-BR': "AÇÃO",
    },
    'lp.fig.160': {
      en: "LIVE PARAMETER / MIDI",
      'pt-BR': "PARÂMETRO DO LIVE / MIDI",
    },

    'lp.controls.147': {
      en: "<span class=\"cap\">CONTROL ROW ON PHONE</span>\n    │\n    ├─ <span class=\"ann\">SDK</span> ─── WSS ─── RC SURFACE SERVER ─── EXTENSIONS SDK ─── LIVE PARAMETER\n    │\n    ├─ <span class=\"ann\">MIDI</span> ── WSS ─── RC SURFACE SERVER ─── NOTE ────────── LIVE MIDI HOST\n    │\n    └─ <span class=\"ann\" data-i18n=\"lp.controls.004\">local</span> ─────── PHONE STATE ONLY\n                      └─ never leaves the phone · cannot map to Live",
      'pt-BR': "<span class=\"cap\">LINHA DE CONTROLE NO CELULAR</span>\n    │\n    ├─ <span class=\"ann\">SDK</span> ─── WSS ─── RC SURFACE SERVER ─── EXTENSIONS SDK ─── PARÂMETRO DO LIVE\n    │\n    ├─ <span class=\"ann\">MIDI</span> ── WSS ─── RC SURFACE SERVER ─── NOTA ───────── HOST MIDI DO LIVE\n    │\n    └─ <span class=\"ann\">local</span> ─────── SÓ ESTADO DO CELULAR\n                      └─ nunca sai do celular · não dá para mapear no Live",
    },
    'lp.trouble.044': {
      en: "Local Wi-Fi and device processing both matter. General controls are coalesced at 30 Hz; audio has a separate bounded immediate path. End-to-end latency still needs measurement.",
      'pt-BR': "Wi-Fi local e processamento do dispositivo influenciam. Controles gerais são agrupados a 30 Hz; áudio tem envio imediato limitado separado. A latência ponta a ponta ainda precisa ser medida.",
    },
    'lp.docs.021': {
      en: "./INSTALL.md",
      'pt-BR': "./INSTALL.pt-BR.md",
    },
    'lp.docs.022': {
      en: "./USER-GUIDE.md",
      'pt-BR': "./USER-GUIDE.pt-BR.md",
    },
    'lp.docs.023': {
      en: "./CUSTOMIZATION.md",
      'pt-BR': "./CUSTOMIZATION.pt-BR.md",
    },
    'lp.docs.024': {
      en: "./FAQ.md",
      'pt-BR': "./FAQ.pt-BR.md",
    },
    'lp.docs.025': {
      en: "./SECURITY.md",
      'pt-BR': "./SECURITY.pt-BR.md",
    },
    'lp.docs.026': {
      en: "./PRIVACY.md",
      'pt-BR': "./PRIVACY.pt-BR.md",
    },
    'lp.fig.localDisplay': {
      en: 'LOCAL DISPLAY ONLY',
      'pt-BR': 'EXIBIÇÃO LOCAL',
    },
  };

  globalScope.RcSurfaceSiteCatalog = catalog;
  globalScope.RcSurfaceI18n?.registerCatalog?.(catalog);
})(typeof globalThis !== 'undefined' ? globalThis : this);
