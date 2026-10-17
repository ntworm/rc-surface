// Copyright © 2026 Gabriel Worm
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Source: https://github.com/ntworm/rc-surface

/**
 * Operator sheet copy, in English and Brazilian Portuguese.
 *
 * Same policy as the application catalog: not a literal translation. The terms
 * a Brazilian musician says in English stay in English — pad, knob, fader,
 * LFO, square, snapshot, clip, track, loop, preset, clutch, morph, gate,
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
    // ── chrome, navigation, colophon ─────────────────────────────────────
    'lp.top.001': {
      en: '<b>RC Surface</b>',
      'pt-BR': '<b>RC Surface</b>',
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
    'lp.top.017': {
      en: '<a href="https://github.com/ntworm/rc-surface/blob/main/NOTICE">Credits and licences</a>',
      'pt-BR': '<a href="https://github.com/ntworm/rc-surface/blob/main/NOTICE">Créditos e licenças</a>',
    },
    'lp.top.018': {
      en: "Independent project · not affiliated with Ableton AG. Ableton and Live are trademarks of Ableton AG.",
      'pt-BR': "Projeto independente · sem vínculo com a Ableton AG. Ableton e Live são marcas comerciais da Ableton AG.",
    },

    // ── 1.0 what it is ───────────────────────────────────────────────────
    'lp.surface.001': {
      en: '<span class="rc">RC</span> Surface',
      'pt-BR': '<span class="rc">RC</span> Surface',
    },
    'lp.surface.002': {
      en: "Any device with a browser becomes a performance controller for Ableton Live. Your machine serves the surface on the local network and the phone just opens a link.",
      'pt-BR': "Qualquer aparelho com navegador vira um controlador de performance para o Ableton Live. O seu computador serve a superfície na rede local e o celular só precisa abrir um link.",
    },
    'lp.surface.003': {
      en: "Live 12.4.5+ Suite · iOS 15.4+ Safari or Chromium on Android · held in <b>landscape</b> · local network, nothing installed on the phone.",
      'pt-BR': "Live 12.4.5+ Suite · iOS 15.4+ Safari ou Chromium no Android · usado na <b>horizontal</b> · rede local, nada instalado no celular.",
    },
    'lp.surface.004': {
      en: "Published releases",
      'pt-BR': "Versões publicadas",
    },
    'lp.surface.005': {
      en: 'Source & licence',
      'pt-BR': 'Código e licença',
    },

    // ── 1.0 highlights (CFG, LFO preview, desktop keyboard, K-weighted) ──


    'lp.chain.001': {
      en: "Signal chain <span class=\"tail\">— SDK control, optional OSC clock</span>",
      'pt-BR': "Cadeia de sinal <span class=\"tail\">— controle pelo SDK, clock OSC opcional</span>",
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
      'pt-BR': "     SALTO 3  ▼  LIVE OBJECT MODEL · INTERNO",
    },
    'lp.chain.006': {
      en: "▼ CONTROL, OUTBOUND      ◀ STATE, INBOUND",
      'pt-BR': "▼ CONTROLE, SAÍDA        ◀ ESTADO, ENTRADA",
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
      en: "Beat-accurate: metronome, subdivisions, swing, phase.",
      'pt-BR': "Preciso no beat: metrônomo, subdivisões, swing, fase.",
    },
    'lp.chain.014': {
      en: 'nothing',
      'pt-BR': 'nada',
    },
    'lp.chain.015': {
      en: "BPM simulator off Live's tempo. No beat phase.",
      'pt-BR': "Simulador de BPM a partir do andamento do Live. Sem fase de beat.",
    },
    'lp.chain.016': {
      en: 'Free',
      'pt-BR': 'Free',
    },
    'lp.chain.018': {
      en: "Internal clock. Not locked to Live's tempo.",
      'pt-BR': "Clock interno. Não segue o andamento do Live.",
    },
    'lp.chain.019': {
      en: "AbletonOSC is needed <b>only</b> for Deep Sync, and installs separately as a Control Surface with UDP <code>11000</code>/<code>11001</code> free. Without it everything else works. Long-press <code>SYNC</code> for clock source, subdivisions, phase, swing and shapes.",
      'pt-BR': "O AbletonOSC só é necessário para o Deep Sync e é instalado à parte, como Control Surface, com as portas UDP <code>11000</code>/<code>11001</code> livres. Sem ele, todo o resto funciona. Segure <code>SYNC</code> para escolher a fonte de clock, as subdivisões, a fase, o swing e as formas de onda.",
    },
    'lp.scenarios.030': {
      en: "Scenario A · two performers",
      'pt-BR': "Cenário A · dois performers",
    },
    'lp.scenarios.031': {
      en: "Scenario B · arrangement change",
      'pt-BR': "Cenário B · mudança de arranjo",
    },
    'lp.scenarios.032': {
      en: "Scenario C · pinch clutch",
      'pt-BR': "Cenário C · pinch clutch",
    },
    'lp.scenarios.033': {
      en: "Scenario D · instrument motion",
      'pt-BR': "Cenário D · movimento do instrumento",
    },
    'lp.scenarios.034': {
      en: "Scenario E · acoustic input",
      'pt-BR': "Cenário E · entrada acústica",
    },
    'lp.scenarios.001': {
      en: "Situations that make sense <span class=\"tail\">— and the mapping</span>",
      'pt-BR': "Situações que fazem sentido <span class=\"tail\">— e o mapeamento</span>",
    },
    'lp.scenarios.003': {
      en: 'A second pair of hands over one Live set',
      'pt-BR': 'Um segundo par de mãos sobre o mesmo set',
    },
    'lp.scenarios.004': {
      en: "A colleague opens the phone and shapes the return effects while the soloist keeps playing.",
      'pt-BR': "Um colega abre o celular e molda os efeitos de return enquanto o solista continua tocando.",
    },
    'lp.scenarios.012': {
      en: 'Four corners for four sections',
      'pt-BR': 'Quatro cantos para quatro partes',
    },
    'lp.scenarios.013': {
      en: "Intro, verse, chorus and outro in SNP slots 1–4, dragged between corners in Vector XY.",
      'pt-BR': "Intro, verso, refrão e outro nos slots 1–4 do SNP, arrastados entre os cantos no Vetor XY.",
    },
    'lp.scenarios.017': {
      en: 'Push a filter in the air',
      'pt-BR': 'Empurrar um filtro no ar',
    },
    'lp.scenarios.018': {
      en: "Standing, no table. Pinch with the palm to the camera, move the hand, open the fingers.",
      'pt-BR': "Em pé, sem mesa. Faça a pinça com a palma virada para a câmera, mova a mão e abra os dedos.",
    },
    'lp.scenarios.021': {
      en: 'The body supplies the modulation',
      'pt-BR': 'O corpo é que modula',
    },
    'lp.scenarios.022': {
      en: "A phone strapped to a guitar: the turn during a swell becomes a rotation-rate gesture.",
      'pt-BR': "Um celular preso à guitarra: o giro durante um swell vira um gesto de taxa de rotação.",
    },
    'lp.scenarios.023': {
      en: 'Echo feedback',
      'pt-BR': 'feedback do Echo',
    },
    'lp.scenarios.025': {
      en: 'Volume opens the effect',
      'pt-BR': 'O volume abre o efeito',
    },
    'lp.scenarios.026': {
      en: "A phone near the microphone: louder phrases open the filter, silence closes it.",
      'pt-BR': "Um celular perto do microfone: frases mais altas abrem o filtro, o silêncio fecha.",
    },

    'lp.install.001': {
      en: "Installation <span class=\"tail\">— to a mapped parameter</span>",
      'pt-BR': "Instalação <span class=\"tail\">— até um parâmetro mapeado</span>",
    },
    'lp.install.003': {
      en: 'Clip 1',
      'pt-BR': 'Vídeo 1',
    },
    'lp.install.004': {
      en: "Install and first pairing, narrated",
      'pt-BR': "Instalação e primeira conexão, com narração",
    },
    'lp.install.006': {
      en: 'Install the extension',
      'pt-BR': 'Instale a extensão',
    },
    'lp.install.007': {
      en: "Double-click the <code>.ablx</code> from Published releases to request installation in Live.",
      'pt-BR': "Dê dois cliques no <code>.ablx</code> baixado em Versões publicadas para instalar no Live.",
    },
    'lp.install.009': {
      en: 'Open the panel',
      'pt-BR': 'Abra o painel',
    },
    'lp.install.010': {
      en: "In Live, open <span class=\"path\">Extensions → RC Surface → Show panel</span>. It shows the QR code, the connection status and the real URL if a port is taken — the link drawn in <a href=\"#chain\">2.0</a>.",
      'pt-BR': "No Live, abra <span class=\"path\">Extensions → RC Surface → Show panel</span>. Ele mostra o QR code, o status da conexão e a URL real se alguma porta estiver ocupada — o elo desenhado em <a href=\"#chain\">2.0</a>.",
    },
    'lp.install.011': {
      en: 'Connect the phone',
      'pt-BR': 'Conecte o celular',
    },
    'lp.install.012': {
      en: "Scan the QR code, accept the self-signed certificate once, and hold the phone in landscape.",
      'pt-BR': "Escaneie o QR code, aceite o certificado autoassinado uma vez e segure o celular na horizontal.",
    },
    'lp.install.015': {
      en: 'Arm the sensors',
      'pt-BR': 'Ative os sensores',
    },
    'lp.install.016': {
      en: "Enable <b data-i18n=\"lp.map.076\">Motion</b>, <b>Audio</b> or <b>Vision</b> as needed. Raw camera and microphone never leave the phone — only numeric values do.",
      'pt-BR': "Ative <b data-i18n=\"lp.map.076\">Movimento</b>, <b>Áudio</b> ou <b>Visão</b> conforme precisar. A imagem da câmera e o som do microfone nunca saem do celular — só valores numéricos.",
    },
    'lp.install.017': {
      en: 'Map a control to Live',
      'pt-BR': 'Mapeie um controle no Live',
    },
    'lp.install.018': {
      en: "Tap <code>MAP</code>, pick a highlighted control, then bind it to a Live parameter or a trigger note. Notes need the bundled <code>RC-Midi-Receiver.amxd</code> on the target MIDI track: Live cannot insert Max for Live devices through the SDK.",
      'pt-BR': "Toque em <code>MAP</code>, escolha um controle destacado e ligue-o a um parâmetro do Live ou a uma nota de trigger. As notas precisam do <code>RC-Midi-Receiver.amxd</code>, que vem junto, na track MIDI de destino: o SDK não consegue inserir devices do Max for Live no Live.",
    },
    'lp.install.019': {
      en: 'Optional: Deep Sync',
      'pt-BR': 'Opcional: Deep Sync',
    },
    'lp.install.020': {
      en: "Install AbletonOSC as a Control Surface with UDP <code>11000</code> and <code>11001</code> free, then long-press <code>SYNC</code> to pick the clock — see <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Instale o AbletonOSC como Control Surface com UDP <code>11000</code> e <code>11001</code> livres, e segure <code>SYNC</code> para escolher o clock — veja <a href=\"#clock\">2.1</a>.",
    },
    'lp.trouble.001': {
      en: 'When it does not work',
      'pt-BR': 'Quando não funciona',
    },
    'lp.trouble.003': {
      en: 'Troubleshooting',
      'pt-BR': 'Solução de problemas',
    },
    'lp.trouble.004': {
      en: 'Phone cannot find the host',
      'pt-BR': 'O celular não encontra o computador',
    },
    'lp.trouble.005': {
      en: 'Same Wi-Fi. Live allowed through the firewall. Rescan the current QR.',
      'pt-BR': 'Mesmo Wi-Fi. Live liberado no firewall. Escaneie o QR atual de novo.',
    },
    'lp.trouble.007': {
      en: 'AbletonOSC not detected',
      'pt-BR': 'AbletonOSC não detectado',
    },
    'lp.trouble.008': {
      en: 'Install it separately as a Live Control Surface.',
      'pt-BR': 'Instale à parte, como Control Surface do Live.',
    },
    'lp.trouble.010': {
      en: 'Vision will not start',
      'pt-BR': 'A visão não inicia',
    },
    'lp.trouble.011': {
      en: 'Accept the certificate, grant camera, reload.',
      'pt-BR': 'Aceite o certificado, libere a câmera, recarregue.',
    },
    'lp.trouble.013': {
      en: 'Audio is silent',
      'pt-BR': 'O áudio fica mudo',
    },
    'lp.trouble.014': {
      en: 'Grant microphone, then tap the audio control again.',
      'pt-BR': 'Libere o microfone e toque de novo no controle de áudio.',
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
      en: "Frequently asked",
      'pt-BR': "Perguntas frequentes",
    },
    'lp.trouble.019': {
      en: 'Which Live versions?',
      'pt-BR': 'Quais versões do Live?',
    },
    'lp.trouble.021': {
      en: 'Android and iOS?',
      'pt-BR': 'Android e iOS?',
    },
    'lp.trouble.022': {
      en: 'iOS 15.4+ Safari, or Chromium on Android.',
      'pt-BR': 'Safari no iOS 15.4+, ou Chromium no Android.',
    },
    'lp.trouble.027': {
      en: 'Can I map from the phone?',
      'pt-BR': 'Dá para mapear pelo celular?',
    },
    'lp.trouble.028': {
      en: "Yes. <code>MAP</code>, pick a control, then Bind or Trigger Note.",
      'pt-BR': "Sim. <code>MAP</code>, escolha um controle e use Bind ou Trigger Note.",
    },
    'lp.trouble.030': {
      en: 'What about latency?',
      'pt-BR': 'E a latência?',
    },
    'lp.trouble.032': {
      en: 'Camera and microphone?',
      'pt-BR': 'Câmera e microfone?',
    },
    'lp.trouble.033': {
      en: 'Processed inside the phone\'s browser. Never uploaded.',
      'pt-BR': 'Processados dentro do navegador do celular. Nunca são enviados.',
    },
    'lp.trouble.041': {
      en: 'How mature is it?',
      'pt-BR': 'Qual o estágio do projeto?',
    },
    'lp.trouble.042': {
      en: 'v2.0.0 is the current release. Seven pages, XY gesture loops and an expanded pose bank; configure it from a fresh state.',
      'pt-BR': 'v2.0.0 é a versão atual. Sete páginas, loops XY e banco ampliado de poses; configure a partir do zero.',
    },
    'lp.docs.001': {
      en: 'Reference documents',
      'pt-BR': 'Documentos de referência',
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

    'lp.map.165': {
      en: "What each family does, from touch to Live, is in <a href=\"#controls\">4.0</a>.",
      'pt-BR': "O que cada família faz, do toque ao Live, está em <a href=\"#controls\">4.0</a>.",
    },
    'lp.map.001': {
      en: "Surface map <span class=\"tail\">— figs. 1 to 11</span>",
      'pt-BR': "Mapa da superfície <span class=\"tail\">— figs. 1 a 11</span>",
    },
    'lp.map.004': {
      en: 'Fig. 1',
      'pt-BR': 'Fig. 1',
    },
    'lp.map.005': {
      en: "PERF — the layout as built",
      'pt-BR': "PERF — o layout real",
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
      en: "PERF, MIX, SNP, SNS, AUD, VID, REC. MAP overlays the current page; AUT selects XY loops in PERF; CFG configures controls.",
      'pt-BR': "PERF, MIX, SNP, SNS, AUD, VID, REC. MAP sobrepõe a página; AUT seleciona loops XY no PERF; CFG configura controles.",
    },
    'lp.map.013': {
      en: 'Pad grid',
      'pt-BR': 'Grade de pads',
    },
    'lp.map.014': {
      en: "Four across, three down. Behaviour comes from the pad mode, not the pad.",
      'pt-BR': "Quatro por linha, três linhas. O comportamento vem do modo, não do pad.",
    },
    'lp.map.015': {
      en: 'Pad mode',
      'pt-BR': 'Modo do pad',
    },
    'lp.map.016': {
      en: "A momentary, B hold, C toggle, D burst. Sets all twelve; CFG overrides one pad.",
      'pt-BR': "A momentâneo, B hold, C toggle, D burst. Vale para os doze; CFG sobrescreve um pad.",
    },
    'lp.map.018': {
      en: "Two independent <code>XY 1</code> / <code>XY 2</code> panels: Static or Physics, with friction, bounce, speed and trails. Each axis maps separately.",
      'pt-BR': "Dois painéis <code>XY 1</code> / <code>XY 2</code> independentes: Estático ou Física, com atrito, quique, velocidade e rastro. Cada eixo é mapeado separadamente.",
    },
    'lp.map.019': {
      en: 'Toggles T1–T8',
      'pt-BR': 'Toggles T1–T8',
    },
    'lp.map.020': {
      en: "Waveform (Sine, Triangle, Ramp Up, Ramp Down, Square) set in CFG. Horizontal drag sets rate, vertical sets depth. Square includes swing and ratchet. Hz in FREE, beat divisions in SYNC.",
      'pt-BR': "Onda (Sine, Triangle, Ramp Up, Ramp Down, Square) definida no CFG. Arrastar horizontal ajusta velocidade, vertical profundidade. Square inclui swing e ratchet. Hz em FREE, subdivisões em SYNC.",
    },
    'lp.map.021': {
      en: 'Squares',
      'pt-BR': 'Squares',
    },
    'lp.map.022': {
      en: "Square is a waveform available in any of the eight LFO slots.",
      'pt-BR': "Square é uma onda disponível em qualquer um dos oito slots LFO.",
    },
    'lp.map.perfUtilTitle': {
      en: 'PERF UTIL',
      'pt-BR': 'PERF UTIL',
    },
    'lp.map.perfUtilFlow': {
      en: "CAP arms capture; CAP+1–4 saves; 1–4 recalls; OFF stops morph, pads, LFOs and Squares and centers XY, without touching MIX, sensors, audio, vision or transport.",
      'pt-BR': "CAP arma captura; CAP+1–4 salva; 1–4 recupera; OFF para morph, pads, LFOs e Squares e centraliza os XY, sem mexer em MIX, sensores, áudio, visão ou transporte.",
    },
    'lp.map.023': {
      en: "CAP arms capture; CAP+1–4 saves; 1–4 recalls; OFF stops morph, pads, LFOs and Squares and centers XY, without touching MIX, sensors, audio, vision or transport.",
      'pt-BR': "CAP arma captura; CAP+1–4 salva; 1–4 recupera; OFF para morph, pads, LFOs e Squares e centraliza os XY, sem mexer em MIX, sensores, áudio, visão ou transporte.",
    },
    'lp.map.024': {
      en: "Live panel",
      'pt-BR': "Painel do Live",
    },
    'lp.map.025': {
      en: "BPM, transport (PREV/PLAY/NEXT), TRN, MAP, AUT, CFG. AUT is a header mode on PERF.",
      'pt-BR': "BPM, transporte (PREV/PLAY/NEXT), TRN, MAP, AUT, CFG. AUT é um modo do header no PERF.",
    },
    'lp.map.liveMix': {
      en: "BPM, transport (PREV/PLAY/NEXT), TRN, MAP, CFG. No AUT on MIX.",
      'pt-BR': "BPM, transporte (PREV/PLAY/NEXT), TRN, MAP, CFG. Sem AUT no MIX.",
    },
    'lp.map.liveSnp': {
      en: "BPM, transport (PREV/PLAY/NEXT), TRN, MAP. No AUT or CFG on SNP.",
      'pt-BR': "BPM, transporte (PREV/PLAY/NEXT), TRN, MAP. Sem AUT ou CFG no SNP.",
    },
    'lp.map.liveSensor': {
      en: "BPM, transport (PREV/PLAY/NEXT), TRN, MAP. No AUT or CFG.",
      'pt-BR': "BPM, transporte (PREV/PLAY/NEXT), TRN, MAP. Sem AUT ou CFG.",
    },
    'lp.map.liveRec': {
      en: "BPM, transport (PREV/PLAY/NEXT), TRN only. Entering REC closes MAP; no AUT or CFG.",
      'pt-BR': "BPM, transporte (PREV/PLAY/NEXT), só TRN. Entrar no REC fecha o MAP; sem AUT ou CFG.",
    },
    'lp.map.liveMap': {
      en: "BPM, transport, TRN, active MAP overlay, CFG over current page.",
      'pt-BR': "BPM, transporte, TRN, overlay MAP ativo, CFG sobre a página atual.",
    },
    'lp.map.liveTrn': {
      en: "BPM, transport, active TRN overlay, MAP, AUT, CFG.",
      'pt-BR': "BPM, transporte, overlay TRN ativo, MAP, AUT, CFG.",
    },
    'lp.map.liveAut': {
      en: "BPM, transport, TRN, MAP, active AUT mode, CFG.",
      'pt-BR': "BPM, transporte, TRN, MAP, modo AUT ativo, CFG.",
    },
    'lp.map.liveCfg': {
      en: "BPM, transport, TRN, MAP, AUT, active CFG mode.",
      'pt-BR': "BPM, transporte, TRN, MAP, AUT, modo CFG ativo.",
    },
    'lp.map.026': {
      en: "Sync block",
      'pt-BR': "Bloco de sync",
    },
    'lp.map.027': {
      en: "SYNC toggles SYNC/FREE (hold for Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ settings, STAGE locks surface to current page.",
      'pt-BR': "SYNC alterna SYNC/FREE (segurar para Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ ajustes, STAGE trava a superfície na página atual.",
    },
    'lp.map.syncStd': {
      en: "SYNC toggles SYNC/FREE (hold for Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ settings, STAGE locks surface to current page.",
      'pt-BR': "SYNC alterna SYNC/FREE (segurar para Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ ajustes, STAGE trava a superfície na página atual.",
    },
    'lp.map.syncCal': {
      en: "SYNC toggles SYNC/FREE (hold for Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ settings, CALIBRATE sets neutral reference (posture on SNS, level on AUD, lighting on VID), STAGE locks surface.",
      'pt-BR': "SYNC alterna SYNC/FREE (segurar para Deep Sync Settings, <a href=\"#clock\">2.1</a>), ⚙ ajustes, CALIBRATE define referência neutra (postura no SNS, nível no AUD, iluminação no VID), STAGE trava a superfície.",
    },
    'lp.map.029': {
      en: 'Fig. 2',
      'pt-BR': 'Fig. 2',
    },
    'lp.map.030': {
      en: "MIX — eight knobs and eight faders",
      'pt-BR': "MIX — oito knobs e oito faders",
    },
    'lp.map.039': {
      en: "<code>knob-1..8</code>, four across by two down. Relative vertical drag.",
      'pt-BR': "<code>knob-1..8</code>, quatro colunas por duas linhas. Arrasto vertical relativo.",
    },
    'lp.map.041': {
      en: "<code>fader-1..8</code>, one row. The thumb moves exactly as far as the finger.",
      'pt-BR': "<code>fader-1..8</code>, uma linha. O cursor anda exatamente o que o dedo anda.",
    },
    'lp.map.047': {
      en: 'Fig. 3',
      'pt-BR': 'Fig. 3',
    },
    'lp.map.048': {
      en: "SNP — eight stored states and vector morph",
      'pt-BR': "SNP — oito estados guardados e vector morph",
    },
    'lp.map.056': {
      en: 'Morph slots',
      'pt-BR': 'Slots de morph',
    },
    'lp.map.057': {
      en: "Whole controller states in a four-by-two grid; recall or morph to one slot.",
      'pt-BR': "Estados inteiros do controlador numa grade quatro por dois; recall ou morph para um slot.",
    },
    'lp.map.058': {
      en: 'Performance controls',
      'pt-BR': 'Controles de performance',
    },
    'lp.map.059': {
      en: "<code data-i18n=\"lp.fig.013\">CAPTURE</code>, <code data-i18n=\"lp.fig.014\">CLEAR SLOTS</code>, transition 0.1–5.0 s or synced, and Grid/Vector.",
      'pt-BR': "<code data-i18n=\"lp.fig.013\">CAPTURAR</code>, <code data-i18n=\"lp.fig.014\">LIMPAR SLOTS</code>, transição de 0.1 a 5.0 s ou sincronizada, e Grade/Vetor.",
    },
    'lp.map.060': {
      en: 'Vector morph pad',
      'pt-BR': 'Pad de morph vetorial',
    },
    'lp.map.061': {
      en: "Blends slots 1 TL, 2 TR, 3 BL and 4 BR at once, weighted by the point.",
      'pt-BR': "Mistura os slots 1 SE, 2 SD, 3 IE e 4 ID ao mesmo tempo, com peso pela posição do ponto.",
    },
    'lp.map.067': {
      en: 'Fig. 4',
      'pt-BR': 'Fig. 4',
    },
    'lp.map.068': {
      en: "SNS — motion and orientation axes",
      'pt-BR': "SNS — eixos de movimento e orientação",
    },
    'lp.map.076': {
      en: 'Motion',
      'pt-BR': 'Movimento',
    },
    'lp.map.077': {
      en: "<code>GX GY GZ</code> angular rate, <code>AX AY AZ</code> acceleration, signed around a centre line.",
      'pt-BR': "<code>GX GY GZ</code> taxa angular, <code>AX AY AZ</code> aceleração, com sinal em torno do centro.",
    },
    'lp.map.078': {
      en: 'Orientation',
      'pt-BR': 'Orientação',
    },
    'lp.map.079': {
      en: "Yaw, pitch and roll as numeric angles.",
      'pt-BR': "Yaw, pitch e roll como ângulos numéricos.",
    },
    'lp.map.080': {
      en: 'Local view',
      'pt-BR': 'Visão local',
    },
    'lp.map.081': {
      en: "Shows or hides the two banks on this phone only; the sensors keep running.",
      'pt-BR': "Mostra ou esconde os dois blocos só neste celular; os sensores continuam rodando.",
    },
    'lp.map.082': {
      en: 'Axis key',
      'pt-BR': 'Legenda dos eixos',
    },
    'lp.map.083': {
      en: "Ties the channel names to the physical phone, so tilting it becomes a readable gesture.",
      'pt-BR': "Liga os nomes dos canais ao celular físico, então inclinar vira um gesto legível.",
    },
    'lp.map.089': {
      en: 'Fig. 5',
      'pt-BR': 'Fig. 5',
    },
    'lp.map.090': {
      en: "AUD — audio input and twelve descriptors",
      'pt-BR': "AUD — entrada de áudio e doze descritores",
    },
    'lp.map.098': {
      en: 'Audio input',
      'pt-BR': 'Entrada de áudio',
    },
    'lp.map.099': {
      en: "Pick the browser default or a permitted input, then enable capture. It never starts by itself.",
      'pt-BR': "Escolha o padrão do navegador ou uma entrada permitida e habilite a captura. Nunca começa sozinho.",
    },
    'lp.map.100': {
      en: "Input level",
      'pt-BR': "Nível de entrada",
    },
    'lp.map.101': {
      en: "Input RMS, normalized 0..1. Not perceived loudness.",
      'pt-BR': "RMS de entrada, normalizado 0..1. Não é loudness percebido.",
    },
    'lp.map.102': {
      en: 'Signal history',
      'pt-BR': 'Histórico do sinal',
    },
    'lp.map.103': {
      en: "Live 2.5-second history: Amplitude, Attacks, Tone, Texture, Bands or All.",
      'pt-BR': "Histórico ao vivo de 2.5 s: Amplitude, Ataques, Timbre, Textura, Bandas ou Tudo.",
    },
    'lp.map.104': {
      en: 'Detector knobs',
      'pt-BR': 'Knobs dos detectores',
    },
    'lp.map.105': {
      en: "SENS, RELEASE, CURVE, group GAIN and SMOOTH. Note divisions in SYNC, milliseconds in FREE.",
      'pt-BR': "SENS, RELEASE, CURVA, GANHO e SUAVE do grupo. Figuras em SYNC, milissegundos em FREE.",
    },
    'lp.map.106': {
      en: "Analysis window",
      'pt-BR': "Janela de análise",
    },
    'lp.map.107': {
      en: "WINDOW x1/x2/x4 trades spectral detail for response time.",
      'pt-BR': "JANELA x1/x2/x4 troca detalhe espectral por tempo de resposta.",
    },
    'lp.audio.detectors': {
      en: "Built-in audio detectors",
      'pt-BR': "Detectores de áudio integrados",
    },
    'lp.audio.timing': {
      en: "SYNC follows Live BPM from 1/128 to 1/1, triplets and dotted included; FREE keeps its own milliseconds. Low, mid and high are K-weighted loudness (ITU-R BS.1770), in LU.",
      'pt-BR': "SYNC segue o BPM do Live de 1/128 a 1/1, com tercinas e pontuadas; FREE guarda os próprios milissegundos. Graves, médios e agudos são loudness ponderado K (ITU-R BS.1770), em LU.",
    },
    'lp.audio.detector-note': {
      en: "Twelve 0..1 mapping sources: sensor.audio.transient, sensor.audio.kick, sensor.audio.snare, sensor.audio.brightness, sensor.audio.centroid, sensor.audio.flux, sensor.audio.flatness, sensor.audio.spread, sensor.audio.rolloff, sensor.audio.low, sensor.audio.mid, sensor.audio.high.",
      'pt-BR': "Doze fontes 0..1 para mapear: sensor.audio.transient, sensor.audio.kick, sensor.audio.snare, sensor.audio.brightness, sensor.audio.centroid, sensor.audio.flux, sensor.audio.flatness, sensor.audio.spread, sensor.audio.rolloff, sensor.audio.low, sensor.audio.mid, sensor.audio.high.",
    },
    'lp.map.113': {
      en: 'Fig. 6',
      'pt-BR': 'Fig. 6',
    },
    'lp.map.114': {
      en: "VID — camera, learned poses, detectors",
      'pt-BR': "VID — câmera, poses aprendidas, detectores",
    },
    'lp.map.122': {
      en: 'Camera',
      'pt-BR': 'Câmera',
    },
    'lp.map.123': {
      en: "On/off, confidence, recognition mode, and the live preview.",
      'pt-BR': "Liga/desliga, confiança, modo de reconhecimento e a prévia ao vivo.",
    },
    'lp.map.124': {
      en: 'Learned poses',
      'pt-BR': 'Poses aprendidas',
    },
    'lp.map.125': {
      en: "Starts with G1–G3; + ADD POSE grows to fifteen cards. Capture 3–6 examples per pose; X removes a card, CLR keeps it. RETAKE/KEEP review isolated or conflicting captures without changing recognition.",
      'pt-BR': "Começa com G1–G3; + ADD POSE amplia até quinze cartões. Capture 3–6 exemplos por pose; X remove o cartão, CLR o mantém. RETAKE/KEEP revisam capturas isoladas ou discordantes sem alterar o reconhecimento.",
    },
    'lp.map.126': {
      en: 'Built-in detectors',
      'pt-BR': 'Detectores nativos',
    },
    'lp.map.127': {
      en: "Open, Fist, Pinch and Victory, opt-in and untrained. Rotation belongs to Victory.",
      'pt-BR': "Aberta, Punho, Pinça e Victory, opcionais e sem treino. A rotação pertence ao Victory.",
    },
    'lp.map.128': {
      en: 'Direct MAP / CLUTCH',
      'pt-BR': 'MAP direto / CLUTCH',
    },
    'lp.map.129': {
      en: "MAP X/Y/Z, PALM and FACE are continuous mapping inputs. CLUTCH X/Y/Z is relative and freezes when the pinch opens.",
      'pt-BR': "MAP X/Y/Z, PALM e FACE são entradas contínuas de mapeamento. CLUTCH X/Y/Z é relativo e congela ao abrir o pinch.",
    },
    'lp.map.130': {
      en: "Palm mapping inputs",
      'pt-BR': "Entradas de palma no MAP",
    },
    'lp.map.131': {
      en: "PALM size and signed FACE are shown raw; MAP uses normalized 0–1 values. FACE is palm/back orientation, not facial tracking. Missing/invalid samples follow Safe loss.",
      'pt-BR': "PALM e FACE com sinal aparecem em unidades brutas; MAP usa 0–1 normalizado. FACE é orientação palma/dorso, sem rastreamento facial. Amostras ausentes/inválidas seguem Safe loss.",
    },
    'lp.map.137': {
      en: "Fig. 8",
      'pt-BR': "Fig. 8",
    },
    'lp.map.138': {
      en: "MAP — armed strip, action mode, then target picker",
      'pt-BR': "MAP — barra armada, modo de ação e seletor de destino",
    },
    'lp.map.144': {
      en: 'Underlying page',
      'pt-BR': 'Página por baixo',
    },
    'lp.map.145': {
      en: "MAP is an overlay, not a tab. The page underneath stays visible until a control is picked.",
      'pt-BR': "MAP é sobreposição, não aba. A página de baixo continua visível até escolher um controle.",
    },
    'lp.map.146': {
      en: 'Armed strip',
      'pt-BR': 'Faixa armada',
    },
    'lp.map.147': {
      en: "Shows only <code>MAP ARMED / TAP A CONTROL / DONE</code>, and goes once a control is tapped.",
      'pt-BR': "Mostra só <code>MAP ARMADO / TOQUE UM CONTROLE / PRONTO</code>, e some quando um controle é tocado.",
    },
    'lp.map.148': {
      en: 'Editing overlay',
      'pt-BR': 'Overlay de edição',
    },
    'lp.map.149': {
      en: "A 400 px right-side pane owns the mapping editor.",
      'pt-BR': "Um painel de 400 px à direita assume o editor de mapeamento.",
    },
    'lp.map.150': {
      en: 'Target filter',
      'pt-BR': 'Filtro de alvos',
    },
    'lp.map.151': {
      en: "Searches target names; <code>Selected in Live</code> narrows to the current track and device.",
      'pt-BR': "Busca nomes de destino; <code>Selecionado no Live</code> restringe à track e ao device atuais.",
    },
    'lp.map.152': {
      en: 'Hierarchy',
      'pt-BR': 'Hierarquia',
    },
    'lp.map.153': {
      en: "Track → Device → Parameter, plus Song/Main/Master and Return groups.",
      'pt-BR': "Track → Device → Parâmetro, mais os grupos Song/Main/Master e Return.",
    },
    'lp.map.154': {
      en: 'Live selection shortcut',
      'pt-BR': 'Atalho da seleção do Live',
    },
    'lp.map.155': {
      en: "Uses Live's selected track and device as a filter; it picks no parameter for you.",
      'pt-BR': "Usa a track e o device selecionados no Live como filtro; não escolhe parâmetro por você.",
    },
    'lp.map.156': {
      en: 'Action modes',
      'pt-BR': 'Modos de ação',
    },
    'lp.map.157': {
      en: "<code>BIND</code> drives a Live parameter with curve and range; <code>TRIGGER NOTE</code> plays a MIDI note through <code>RC-Midi-Receiver.amxd</code>; <code>LAUNCH CLIP</code> fires Session clips through AbletonOSC.",
      'pt-BR': "<code>BIND</code> move um parâmetro do Live com curva e faixa; <code>TRIGGER NOTE</code> toca uma nota MIDI pelo <code>RC-Midi-Receiver.amxd</code>; <code>LAUNCH CLIP</code> dispara clips da Session pelo AbletonOSC.",
    },

    'lp.controls.001': {
      en: "Controls <span class=\"tail\">— from touch to Live</span>",
      'pt-BR': "Controles <span class=\"tail\">— do toque ao Live</span>",
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
      en: "Clip, scene or a trigger note",
      'pt-BR': "Clip, cena ou nota de trigger",
    },
    'lp.controls.012': {
      en: 'Pad modes A–D',
      'pt-BR': 'Modos de pad A–D',
    },
    'lp.controls.014': {
      en: "Pad behaviour; CFG overrides it per pad",
      'pt-BR': "Comportamento do pad; CFG sobrescreve por pad",
    },
    'lp.controls.016': {
      en: 'Two parameters per pad',
      'pt-BR': 'Dois parâmetros por pad',
    },
    'lp.controls.017': {
      en: 'LFOs T1–T8',
      'pt-BR': 'LFOs T1–T8',
    },
    'lp.controls.018': {
      en: "Any mapped parameter",
      'pt-BR': "Qualquer parâmetro mapeado",
    },
    'lp.controls.019': {
      en: 'Square waveform',
      'pt-BR': 'Onda Square',
    },
    'lp.controls.021': {
      en: 'PERF UTIL column',
      'pt-BR': 'Coluna PERF UTIL',
    },
    'lp.controls.023': {
      en: "CAP, slots 1–4, OFF",
      'pt-BR': "CAP, slots 1–4, OFF",
    },
    'lp.controls.025': {
      en: 'Device parameter',
      'pt-BR': 'Parâmetro de device',
    },
    'lp.controls.027': {
      en: 'Track volume',
      'pt-BR': 'Volume da track',
    },
    'lp.controls.029': {
      en: "A whole controller state",
      'pt-BR': "Um estado inteiro do controlador",
    },
    'lp.controls.030': {
      en: 'Transition time',
      'pt-BR': 'Tempo de transição',
    },
    'lp.controls.032': {
      en: "Free 0.1–5.0 s, or Sync 16 beats to 1/16",
      'pt-BR': "Free de 0.1 a 5.0 s, ou Sync de 16 beats a 1/16",
    },
    'lp.controls.033': {
      en: 'Vector morph pad',
      'pt-BR': 'Pad de morph vetorial',
    },
    'lp.controls.034': {
      en: "Blends slots 1–4 by corner",
      'pt-BR': "Mistura os slots 1–4 por canto",
    },
    'lp.controls.036': {
      en: 'GX GY GZ, AX AY AZ',
      'pt-BR': 'GX GY GZ, AX AY AZ',
    },
    'lp.controls.038': {
      en: 'Yaw, pitch, roll',
      'pt-BR': 'Yaw, pitch, roll',
    },
    'lp.controls.040': {
      en: "RMS, envelope, gate, attack, plus twelve descriptors",
      'pt-BR': "RMS, envelope, gate, attack e mais doze descritores",
    },
    'lp.controls.041': {
      en: 'Single-hand vision',
      'pt-BR': 'Visão de uma mão',
    },
    'lp.controls.042': {
      en: "<code>sensor.vision.x/y/z</code>, <code>.palm</code>, <code>.face</code>; Pinch Clutch <code>.pinch_x/y/z</code>; Open / Fist / Pinch / Victory; learned G1–G15",
      'pt-BR': "<code>sensor.vision.x/y/z</code>, <code>.palm</code>, <code>.face</code>; Pinch Clutch <code>.pinch_x/y/z</code>; Open / Fist / Pinch / Victory; G1–G15 aprendidos",
    },
    'lp.controls.043': {
      en: 'Map picker',
      'pt-BR': 'Seletor de mapeamento',
    },
    'lp.controls.045': {
      en: "Phone overlay, panel Mapping tab and the admin window",
      'pt-BR': "Overlay do celular, aba Mapeamentos do painel e a janela administrativa",
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
      en: "BPM, transport, TRN, MAP, CFG",
      'pt-BR': "BPM, transporte, TRN, MAP, CFG",
    },
    'lp.controls.049': {
      en: 'Header sync block',
      'pt-BR': 'Bloco de sync no header',
    },
    'lp.controls.051': {
      en: "SYNC, settings, STAGE, CALIBRATE",
      'pt-BR': "SYNC, ajustes, STAGE, CALIBRAR",
    },
    'lp.controls.052': {
      en: "<b>SDK</b> rows map numbers to Live parameters. MIDI needs the optional Receiver. Local controls never leave the browser.",
      'pt-BR': "As linhas <b>SDK</b> mapeiam números para parâmetros do Live. MIDI precisa do Receiver opcional. Controles locais nunca saem do navegador.",
    },
    'lp.controls.053': {
      en: "The header <span class=\"tail\">— on every page</span>",
      'pt-BR': "O header <span class=\"tail\">— em todas as páginas</span>",
    },
    'lp.controls.057': {
      en: "Full-screen transport overlay: locator list, search, and the SYNCED / SDK / FREE readout.",
      'pt-BR': "Overlay de transporte em tela cheia: lista de locators, busca e a leitura SINCRONIZADO / SDK / FREE.",
    },
    'lp.controls.058': {
      en: "Opens the mapping picker over the current page.",
      'pt-BR': "Abre o seletor de mapeamento sobre a página atual.",
    },
    'lp.controls.148': {
      en: "Per-control settings: pad mode, eight toggle slots, Static/Physics on either XY. PERF and MIX only.",
      'pt-BR': "Ajustes por controle: pads, oito slots toggle, Estático/Física nos dois XY. Só PERF e MIX.",
    },
    'lp.controls.059': {
      en: "Toggles <b>SYNC</b> / <b>FREE</b>. Long-press for Deep Sync Settings, <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Alterna <b>SYNC</b> / <b>FREE</b>. Segure para abrir os Ajustes de Deep Sync, <a href=\"#clock\">2.1</a>.",
    },
    'lp.controls.062': {
      en: "Sets the neutral reference for the page: posture on SNS, level on AUD, lighting on VID.",
      'pt-BR': "Define a referência neutra da página: postura em SNS, nível em AUD, iluminação em VID.",
    },
    'lp.controls.063': {
      en: "Locks the surface to the current page.",
      'pt-BR': "Trava a superfície na página atual.",
    },
    'lp.controls.066': {
      en: "What each one does <span class=\"tail\">— from touch to Live</span>",
      'pt-BR': "O que cada um faz <span class=\"tail\">— do toque até o Live</span>",
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
      en: 'Pads, LFOs, squares',
      'pt-BR': 'Pads, LFOs, squares',
    },
    'lp.controls.075': {
      en: "<code>A</code> returns to zero, <code>B</code> keeps what you leave, <code>C</code> latches, <code>D</code> fires one burst — set per pad in CFG. Each of the eight LFO slots can use Square; choose its own clock in CFG or follow the global SYNC/FREE setting.",
      'pt-BR': "<code>A</code> volta a zero, <code>B</code> mantém o que você deixa, <code>C</code> trava, <code>D</code> dispara um burst — ajustável por pad no CFG. Cada um dos oito slots LFO pode usar Square; escolha seu clock no CFG ou siga o ajuste global SYNC/FREE.",
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
    'lp.controls.090': {
      en: 'XY, knobs, faders',
      'pt-BR': 'XY, knobs, faders',
    },
    'lp.controls.091': {
      en: "Each XY panel independently selects Static or Physics, with its own friction, bounce and speed. Knobs and faders track the finger from the current value and never jump to the touch point.",
      'pt-BR': "Cada XY escolhe Estático ou Física, com atrito, ricochete e velocidade próprios. Knobs e faders seguem o dedo a partir do valor atual e nunca pulam para o ponto tocado.",
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
      en: "At touch-down <b>dy is 0</b>, so nothing moves. The knob crosses its range in 150&nbsp;px; a fader travels as far as the finger.",
      'pt-BR': "No toque <b>dy é 0</b>, então nada se move. O knob cruza a faixa inteira em 150&nbsp;px; o fader anda o mesmo que o dedo.",
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
      en: "Capture stores every mapped control into one of eight slots. Recall interpolates to it over a set time. Vector XY blends slots 1–4 by finger position.",
      'pt-BR': "CAPTURAR guarda todos os controles mapeados num dos oito slots. Chamar um slot interpola até ele no tempo definido. O Vetor XY mistura os slots 1–4 pela posição do dedo.",
    },
    'lp.controls.105': {
      en: 'RECALL = timed interpolation · Free 0.1–5.0 s or Sync in beats',
      'pt-BR': 'RECALL = interpolação cronometrada · Free 0.1–5.0 s ou Sync em beats',
    },
    'lp.controls.106': {
      en: 'four corner states → weighted blend',
      'pt-BR': 'quatro estados de canto → mistura ponderada',
    },
    'lp.controls.108': {
      en: 'Motion, orientation, audio',
      'pt-BR': 'Movimento, orientação, áudio',
    },
    'lp.controls.109': {
      en: "CALIBRATE makes the current posture the reference. AUD turns sound into control: level, envelope, gate, attacks and twelve descriptors, graphed over the last 2.5 seconds.",
      'pt-BR': "CALIBRAR faz da postura atual a referência. AUD transforma som em controle: nível, envelope, gate, ataques e doze descritores, no gráfico dos últimos 2.5 segundos.",
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
    'lp.controls.115': {
      en: 'cyan = instantaneous RMS · green = smoothed envelope',
      'pt-BR': 'ciano = RMS instantâneo · verde = envelope suavizado',
    },
    'lp.controls.116': {
      en: 'Vision: hand, poses, clutch',
      'pt-BR': 'Visão: mão, poses, clutch',
    },
    'lp.controls.117': {
      en: "Hand X/Y/Z, PALM size and FACE palm orientation map continuously. A held pinch engages the clutch; release freezes its axes. G1–G15 and the four built-in detectors provide intentional outputs. Missing/invalid samples follow Safe loss.",
      'pt-BR': "X/Y/Z da mão, tamanho PALM e orientação da palma FACE são mapeáveis continuamente. Pinch mantido engata o clutch; soltar congela os eixos. G1–G15 e os quatro detectores oferecem saídas intencionais. Amostras ausentes/inválidas seguem Safe loss.",
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
      en: "ARM at .75 · RELEASE below .55 · latched in between",
      'pt-BR': "ARM em .75 · RELEASE abaixo de .55 · travado entre os dois",
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
      en: "Phone MAP and panel Mappings give each control one of three actions: bind a Live parameter, trigger a MIDI note, or launch a Session clip, with curve, range, takeover and idle settings.",
      'pt-BR': "O MAP do celular e a aba Mapeamentos do painel dão a cada controle uma de três ações: bind num parâmetro do Live, trigger de nota MIDI ou disparo de clip da Session, com curva, faixa, takeover e ajustes de repouso.",
    },
    'lp.controls.134': {
      en: 'INPUT → OUTPUT',
      'pt-BR': 'ENTRADA → SAÍDA',
    },
    'lp.a11y.001': {
      en: 'Choose a surface page plan',
      'pt-BR': 'Escolha um plano de página da superfície',
    },
    'lp.a11y.002': {
      en: 'Choose a control family',
      'pt-BR': 'Escolha uma família de controles',
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
    'lp.docs.011': {
      en: "User Manual",
      'pt-BR': "Manual do usuário",
    },
    'lp.docs.013': {
      en: "Customization & Dev",
      'pt-BR': "Customização e desenvolvimento",
    },
    'lp.docs.015': {
      en: "FAQ",
      'pt-BR': "FAQ",
    },
    'lp.docs.017': {
      en: "Security Threat Model",
      'pt-BR': "Modelo de ameaças",
    },
    'lp.docs.019': {
      en: "Privacy Policy",
      'pt-BR': "Política de privacidade",
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
      en: "XY 2",
      'pt-BR': "XY 2",
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
      en: "3 to start · up to 6 · momentary 0 → 1",
      'pt-BR': "3 para começar · até 6 · momentâneo 0 → 1",
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
      'pt-BR': "TOQUE LIGA",
    },
    'lp.fig.125': {
      en: "TAP OFF",
      'pt-BR': "TOQUE DESLIGA",
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
      en: "CONFIGURABLE SPEED",
      'pt-BR': "VELOCIDADE CONFIGURÁVEL",
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
      en: "LIVE PARAMETER / MIDI / SESSION CLIP",
      'pt-BR': "PARÂMETRO DO LIVE / MIDI / CLIP DA SESSION",
    },

    'lp.controls.147': {
      en: "<span class=\"cap\">CONTROL ROW ON PHONE</span>\n    │\n    ├─ <span class=\"ann\">SDK</span> ─── WSS ─── RC SURFACE SERVER ─── EXTENSIONS SDK ─── LIVE PARAMETER\n    │\n    ├─ <span class=\"ann\">MIDI</span> ── WSS ─── RC SURFACE SERVER ─── NOTE ────────── LIVE MIDI HOST\n    │\n    └─ <span class=\"ann\" data-i18n=\"lp.controls.004\">local</span> ─────── PHONE STATE ONLY\n                      └─ never leaves the phone · cannot map to Live",
      'pt-BR': "<span class=\"cap\">LINHA DE CONTROLE NO CELULAR</span>\n    │\n    ├─ <span class=\"ann\">SDK</span> ─── WSS ─── RC SURFACE SERVER ─── EXTENSIONS SDK ─── PARÂMETRO DO LIVE\n    │\n    ├─ <span class=\"ann\">MIDI</span> ── WSS ─── RC SURFACE SERVER ─── NOTA ───────── HOST MIDI DO LIVE\n    │\n    └─ <span class=\"ann\">local</span> ─────── SÓ ESTADO DO CELULAR\n                      └─ nunca sai do celular · não dá para mapear no Live",
    },
    'lp.trouble.044': {
      en: "Controls are coalesced at 30 Hz; audio has its own bounded path. Measure end to end on your network.",
      'pt-BR': "Os controles são agrupados a 30 Hz; o áudio tem caminho próprio e limitado. Meça ponta a ponta na sua rede.",
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
      'pt-BR': 'SÓ EXIBIÇÃO LOCAL',
    },
    'lp.map.autTitle': {
      en: "AUT · XY gesture loops",
      'pt-BR': "AUT · loops de movimento XY",
    },
    'lp.map.autFlow': {
      en: "AUT selects XY1/XY2; their separate AUT buttons open settings without recording. SYNC captures 1–5 bars from Live’s fresh playing clock; FREE captures 1–30 seconds in steps of one second. Play/Stop are explicit; manual touch overrides a playing loop until release. Saved points never auto-play after reconnect. This loops control data, not native Arrangement automation.",
      'pt-BR': "AUT seleciona XY1/XY2; os botões AUT separados abrem ajustes sem gravar. SYNC captura 1–5 compassos pelo clock atual do Live tocando; FREE captura 1–30 segundos em passos de um segundo. Reproduzir/Parar são explícitos; o toque assume o loop até soltar. Pontos salvos não retomam após reconectar. São dados de controle, não automação nativa do Arrangement.",
    },
    'lp.rec.title': {
      en: "REC — Arrangement / CLIP",
      'pt-BR': "REC — Arrangement / CLIP",
    },
    'lp.rec.figure': {
      en: "Fig. 7",
      'pt-BR': "Fig. 7",
    },
    'lp.rec.aria': {
      en: "Plan view of REC: marker timeline with bar.beat labels, Zoom, start/end Loop, pre-roll choices, REC/STOP/click and armed input cards",
      'pt-BR': "Planta de REC: timeline de marcadores com compasso.beat, Zoom, início/fim do Loop, pré-roll, REC/STOP/click e cartões de entradas armadas",
    },
    'lp.rec.timeline': {
      en: "Markers / bar.beat / Zoom",
      'pt-BR': "Marcadores / compasso.beat / Zoom",
    },
    'lp.rec.timelineFlow': {
      en: "Create markers in Live. Tap a marker to position native playback, then use header Play to listen. Zoom and scroll preserve musical scale; both end cards have gutters.",
      'pt-BR': "Crie marcadores no Live. Toque para posicionar o playback nativo e use Play do topo para ouvir. Zoom e rolagem preservam a escala musical; as duas pontas têm margens.",
    },
    'lp.rec.dest': {
      en: "ARRANGEMENT / CLIP switch · CLICK",
      'pt-BR': "Seletor ARRANGEMENT / CLIP · CLICK",
    },
    'lp.rec.destFlow': {
      en: "Switches between timeline recording in Arrangement and scene recording in Session. CLICK top right is shared with TRN and is never locked.",
      'pt-BR': "Alterna entre gravação na timeline do Arrangement e gravação de cenas na Session. CLICK no topo direito é compartilhado com TRN e nunca é travado.",
    },
    'lp.rec.range': {
      en: "START / END markers",
      'pt-BR': "Marcadores START / END",
    },
    'lp.rec.rangeFlow': {
      en: "Choose a START marker; optionally choose a later END marker. Live confirms the region before REC. Without END, recording runs FREE until STOP.",
      'pt-BR': "Escolha um marcador START; opcionalmente escolha um END posterior. O Live confirma a região antes do REC. Sem END, a gravação roda LIVRE até STOP.",
    },
    'lp.rec.preRoll': {
      en: "PRE-ROLL OFF / 1 / 2 / 4",
      'pt-BR': "PRÉ-ROLL OFF / 1 / 2 / 4",
    },
    'lp.rec.preRollFlow': {
      en: "OFF starts at the marker. 1/2/4 play earlier bars with click before native Punch In opens at the marker. This browser preference does not set Live’s read-only native count-in.",
      'pt-BR': "OFF começa no marcador. 1/2/4 tocam compassos anteriores com click até Punch In abrir no marcador. Esta preferência do navegador não altera o count-in nativo, somente leitura.",
    },
    'lp.rec.passesTitle': {
      en: "PRE-ROLL and PASSES / FREE",
      'pt-BR': "PRÉ-ROLL e PASSES / LIVRE",
    },
    'lp.rec.passesFlow': {
      en: "PRE-ROLL (OFF/1/2/4) plays earlier bars before Punch In opens. With an END marker, PASSES sets 1–10 or infinite loops. Without END, FREE records continuously until STOP.",
      'pt-BR': "PRÉ-ROLL (OFF/1/2/4) toca compassos anteriores com click até o Punch In. Com marcador END, PASSES define 1–10 ou voltas infinitas. Sem END, o modo LIVRE grava continuamente até STOP.",
    },
    'lp.rec.tracks': {
      en: "Track cards / volume knob / ARM MULTI",
      'pt-BR': "Cartões de track / knob de volume / ARM MULTI",
    },
    'lp.rec.tracksFlow': {
      en: "ARM MULTI keeps inputs cumulative. EXCLUSIVE disarms others only when you press a track ARM. REC verifies exactly the visible armed set; STOP keeps armed inputs intact. Groups can SOLO/MUTE but cannot ARM.",
      'pt-BR': "ARM MULTI acumula entradas. EXCLUSIVE desarma outras somente ao apertar ARM de uma track. REC confirma o conjunto armado visível; STOP mantém as entradas armadas. Grupos têm SOLO/MUTE, sem ARM.",
    },
    'lp.rec.transport': {
      en: "REC / STOP / BACK TO ARR",
      'pt-BR': "REC / STOP / VOLTAR AO ARR",
    },
    'lp.rec.transportFlow': {
      en: "STOP has priority during preparation and pre-roll. REC temporarily sets Punch In OFF for direct starts or ON for pre-roll and restores only still-owned state. BACK TO ARR appears when Session overrode Arrangement.",
      'pt-BR': "STOP tem prioridade na preparação e no pré-roll. REC ajusta Punch In temporariamente para OFF no início direto ou ON no pré-roll e restaura só o estado ainda próprio. VOLTAR AO ARR aparece quando a Session sobrepôs o Arrangement.",
    },
    'lp.rec.clip': {
      en: 'CLIP / Session scene',
      'pt-BR': 'CLIP / cena da Session',
    },
    'lp.rec.clipFlow': {
      en: "CLIP replaces the timeline with a paged Session grid. Choose target scene; LENGTH (1/2/4/8/16 bars) and QUANTIZE (Global/None/1 bar/1 beat) set in the panel. REC observes queued/recording/playing; STOP affects only still-owned targets, keeps ARM/global transport and may remain pending until fresh stop confirmation releases it. BACK TO ARR explicitly returns after all Session clips are idle, without Pause/Play. No existing-clip overdub or take/comp browser.",
      'pt-BR': "CLIP substitui a timeline por uma grade de Session paginada. Escolha a cena alvo; LENGTH (1/2/4/8/16 compassos) e QUANTIZE (Global/None/1 bar/1 beat) ajustados no próprio painel. REC observa fila/gravação/playback; STOP afeta apenas alvos que ainda possui, mantém ARM/transporte global e pode ficar pendente até confirmação fresca liberar a tentativa. BACK TO ARR retorna explicitamente após Session inteira ociosa, sem Pause/Play. Sem overdub de clip existente nem navegador de takes/comp.",
    },
    'lp.rec.start': {
      en: "START",
      'pt-BR': "INÍCIO",
    },
    'lp.rec.end': {
      en: "END",
      'pt-BR': "FIM",
    },
    'lp.rec.tracksLabel': {
      en: "TRACKS",
      'pt-BR': "TRACKS",
    },
    'lp.rec.arrangementView': {
      en: "ARRANGEMENT",
      'pt-BR': "ARRANGEMENT",
    },
    'lp.rec.clipView': {
      en: "CLIP",
      'pt-BR': "CLIP",
    },

    /* TRN Fig. 9 */
    'lp.map.trnFig': {
      en: "Fig. 9",
      'pt-BR': "Fig. 9",
    },
    'lp.map.trnTitle': {
      en: "TRN — Transport Lite overlay",
      'pt-BR': "TRN — overlay Transport Lite",
    },
    'lp.map.trnRow1': {
      en: "Main transport row",
      'pt-BR': "Linha principal de transporte",
    },
    'lp.map.trnRow1Flow': {
      en: "PLAY, STOP, PREV, NEXT with large targets. Mirrors Live's native playback state.",
      'pt-BR': "PLAY, STOP, PREV, NEXT com alvos grandes de toque. Espelha o estado de playback nativo do Live.",
    },
    'lp.map.trnRow2': {
      en: "CLICK, Quantization, REFRESH",
      'pt-BR': "CLICK, Quantização, REFRESH",
    },
    'lp.map.trnRow2Flow': {
      en: "CLICK shared with REC and never locked; Global Quantization read from Live Set on open and writes clip_trigger_quantization; REFRESH resyncs transport state.",
      'pt-BR': "CLICK compartilhado com REC e nunca travado; Quantização global lida do Set do Live ao abrir e escreve clip_trigger_quantization; REFRESH ressincroniza o estado de transporte.",
    },
    'lp.map.trnRow3': {
      en: "Searchable locators",
      'pt-BR': "Localizadores com busca",
    },
    'lp.map.trnRow3Flow': {
      en: "List of Arrangement cue points with search filter. Tapping any locator executes transportJumpToLocator with native playback.",
      'pt-BR': "Lista de marcadores do Arrangement com filtro de busca. Tocar em qualquer localizador executa transportJumpToLocator com playback nativo.",
    },
    'lp.map.trnRow4': {
      en: "Status and sync badge",
      'pt-BR': "Badge de status e sincronização",
    },
    'lp.map.trnRow4Flow': {
      en: "Badge shows SYNCED, SDK or FREE timing. Notice line appears only when AbletonOSC is missing, a change is unconfirmed, or in viewer mode.",
      'pt-BR': "Badge exibe timing SINCRONIZADO, SDK ou FREE. Linha de aviso aparece apenas sem AbletonOSC, mudança não confirmada ou em modo visualizador.",
    },

    /* AUT Fig. 10 */
    'lp.map.autFig': {
      en: "Fig. 10",
      'pt-BR': "Fig. 10",
    },
    'lp.map.autPageTitle': {
      en: "AUT — XY gesture loop settings and capture",
      'pt-BR': "AUT — ajustes e captura de loops de gesto XY",
    },
    'lp.map.autRow1': {
      en: "Header mode activation",
      'pt-BR': "Ativação no header",
    },
    'lp.map.autRow1Flow': {
      en: "AUT is a contextual header mode available only on PERF. Tapping AUT arms gesture capture on either XY pad.",
      'pt-BR': "AUT é um modo contextual do header disponível apenas no PERF. Tocar em AUT arma a captura de gesto em qualquer um dos pads XY.",
    },
    'lp.map.autRow2': {
      en: "Gesture capture & loop",
      'pt-BR': "Captura de gesto e loop",
    },
    'lp.map.autRow2Flow': {
      en: "Tapping an XY initiates a 3–2–1 red pulse countdown; red border indicates active recording; captured movement loops immediately upon completion.",
      'pt-BR': "Tocar no XY inicia uma contagem regressiva 3–2–1 com pulsos vermelhos; borda vermelha indica gravação ativa; o movimento capturado entra em loop imediatamente ao terminar.",
    },
    'lp.map.autRow3': {
      en: "Hold for settings",
      'pt-BR': "Segurar para ajustes",
    },
    'lp.map.autRow3Flow': {
      en: "Holding an XY pad for 600 ms without moving (or right-clicking on desktop) opens its settings overlay without recording.",
      'pt-BR': "Segurar o pad XY por 600 ms sem mover (ou clicar com o botão direito no desktop) abre os ajustes sem gravar.",
    },
    'lp.map.autRow4': {
      en: "Duration and timing",
      'pt-BR': "Duração e timing",
    },
    'lp.map.autRow4Flow': {
      en: "SYNC offers 1–5 bars (default 2 bars); FREE offers 1–30 seconds in 1 s steps (default 10 s). Changing length or timing mode discards that XY's recording.",
      'pt-BR': "SYNC oferece 1–5 compassos (padrão 2 compassos); FREE oferece 1–30 segundos em passos de 1 s (padrão 10 s). Mudar duração ou modo de timing descarta a gravação daquele XY.",
    },
    'lp.map.autRow5': {
      en: "Playback, takeover & safety",
      'pt-BR': "Reprodução, takeover e segurança",
    },
    'lp.map.autRow5Flow': {
      en: "Record/replace, Play, Stop, and Clear (with confirmation). Manual touch overrides loop until release; white target square indicates takeover point. Does not write Live automation.",
      'pt-BR': "Record/replace, Play, Stop e Clear (com confirmação). Toque manual sobrepõe o loop até soltar; quadradinho branco indica o alvo de takeover. Não escreve automação no Live.",
    },

    /* CFG Fig. 11 */
    'lp.map.cfgFig': {
      en: "Fig. 11",
      'pt-BR': "Fig. 11",
    },
    'lp.map.cfgPageTitle': {
      en: "CFG — per-control configuration overlay",
      'pt-BR': "CFG — overlay de configuração por controle",
    },
    'lp.map.cfgRow1': {
      en: "Configuration mode (CFG)",
      'pt-BR': "Modo de configuração (CFG)",
    },
    'lp.map.cfgRow1Flow': {
      en: "Tap CFG then tap any control (desktop: right-click) to open its settings. Holding CFG lists all active overrides with Clear all. PERF and MIX only.",
      'pt-BR': "Toque em CFG e depois no controle (desktop: botão direito) para abrir ajustes. Segurar CFG lista todos os overrides ativos com Clear all. Apenas no PERF e MIX.",
    },
    'lp.map.cfgRow2': {
      en: "Pad mode overrides",
      'pt-BR': "Overrides de modo dos pads",
    },
    'lp.map.cfgRow2Flow': {
      en: "Overrides global A–D mode for a single pad: A, B and C set drag travel (Very short to Long) and response (Linear/Fine/Fast); A touch level; B tap without drag keeps or zeroes; C on level; D timing (40–10000 ms or musical beat, attack, peak).",
      'pt-BR': "Sobrescreve o modo global A–D em um pad individual: A, B e C ajustam curso do arrasto (Muito curto a Longo) e resposta (Linear/Fine/Fast); nível ao tocar no A; toque sem arrasto mantém ou zera no B; nível ligado no C; timing no D (40–10000 ms ou musical, ataque, pico).",
    },
    'lp.map.cfgRow3': {
      en: "Toggle & LFO parameters",
      'pt-BR': "Parâmetros de toggles e LFO",
    },
    'lp.map.cfgRow3Flow': {
      en: "Select waveform (Sine, Triangle, Ramp Up, Ramp Down, Square), timing mode and subdivision. Advanced settings expose phase and swing/ratchet for Square.",
      'pt-BR': "Escolha a forma de onda (Sine, Triangle, Ramp Up, Ramp Down, Square), modo de timing e subdivisão. Ajustes avançados expõem fase e swing/ratchet para Square.",
    },
    'lp.map.cfgRow4': {
      en: "XY Static & Physics",
      'pt-BR': "XY Static e Physics",
    },
    'lp.map.cfgRow4Flow': {
      en: "Toggle between Static and Physics per XY pad. Physics settings: friction (0.002–0.05), bounce (0–0.95), speed (0.1–4×). Reset removes override.",
      'pt-BR': "Alterne entre Static e Physics para cada pad XY. Parâmetros de Physics: atrito (0.002–0.05), quique (0–0.95), velocidade (0.1–4×). Reset remove o override.",
    },
    'lp.map.cfgRow5': {
      en: "Hold to edit points",
      'pt-BR': "Segurar para editar pontos",
    },
    'lp.map.cfgRow5Flow': {
      en: "MAP response curve points and Burst envelope points edit only after holding for ~0.6 s: indicator ring appears, drag to move, release to set. Quick taps and scrolls never shift points. Double tap resets.",
      'pt-BR': "Pontos da curva de resposta do MAP e do envelope Burst só editam após segurar por ~0.6 s: anel indicador aparece, arraste para mover, solte para fixar. Toques rápidos e rolagem nunca movem pontos. Duplo toque reseta.",
    },

    /* Vision card "Teach a pose" */
    'lp.vision.teachTitle': {
      en: "TEACH A POSE — STEP SEQUENCE",
      'pt-BR': "ENSINAR UMA POSE — SEQUÊNCIA DE PASSOS",
    },
    'lp.vision.step1Title': {
      en: "1 · ADD POSE",
      'pt-BR': "1 · ADD POSE",
    },
    'lp.vision.step1Desc': {
      en: "+ ADD POSE creates custom gesture slots up to G15 (starts with G1–G3). Each pose is specific to the active hand.",
      'pt-BR': "+ ADD POSE cria slots de gestos customizados até G15 (começa com G1–G3). Cada pose é específica para a mão ativa.",
    },
    'lp.vision.step2Title': {
      en: "2 · CAP EXAMPLES",
      'pt-BR': "2 · CAPTURAR EXEMPLOS",
    },
    'lp.vision.step2Desc': {
      en: "Press CAP 3–6 times with hand still, slightly varying angle and finger curvature. TEST unlocks at 3 takes.",
      'pt-BR': "Pressione CAP 3–6 vezes com a mão parada, variando levemente o ângulo e curvatura dos dedos. TEST desbloqueia a partir do 3º take.",
    },
    'lp.vision.step3Title': {
      en: "3 · SILENT TEST",
      'pt-BR': "3 · TESTE SILENCIOSO",
    },
    'lp.vision.step3Desc': {
      en: "TEST performs silent live matching, showing \"nearest take N · X% of radius\" without firing live MIDI or parameter outputs.",
      'pt-BR': "TEST faz checagem silenciosa ao vivo, exibindo \"nearest take N · X% of radius\" sem disparar saídas de MIDI ou parâmetros.",
    },
    'lp.vision.step4Title': {
      en: "4 · EDIT & REVIEW",
      'pt-BR': "4 · EDITAR E REVISAR",
    },
    'lp.vision.step4Desc': {
      en: "DEL LAST deletes the last take; CLR resets all takes to retrain; X removes the card. RETAKE/KEEP warnings are advisory and do not alter recognition.",
      'pt-BR': "DEL LAST remove o último take; CLR limpa todos os takes para retreinar; X remove o cartão. Avisos RETAKE/KEEP são consultivos e não mudam o reconhecimento.",
    },
    'lp.vision.detectorsTitle': {
      en: "5 · BUILT-IN DETECTORS & PRESETS",
      'pt-BR': "5 · DETECTORES NATIVOS E PRESETS",
    },
    'lp.vision.detectorsDesc': {
      en: "Built-in detectors Open, Fist, Pinch, and Victory are opt-in and require no training; Victory includes wrist rotation. CONF sets Low/Medium/High threshold; presets include Precision, Balanced (default), Performance, and Flexible.",
      'pt-BR': "Detectores integrados Open, Fist, Pinch e Victory são opcionais e não requerem treino; Victory inclui rotação do punho. CONF define limiar Low/Medium/High; presets incluem Precision, Balanced (padrão), Performance e Flexible.",
    },
    'lp.vision.lossTitle': {
      en: "6 · SAFE LOSS & MAPPING",
      'pt-BR': "6 · SAFE LOSS E MAPEAMENTO",
    },
    'lp.vision.lossDesc': {
      en: "Tracking loss settings (VID → ⚙): Hold indefinitely, Hold with timeout (0.1–30 s, default 10 s), or Release on loss. Map poses in MAP as sensor.vision.gesture.N (momentary 0/1 gate, re-arms on hand release).",
      'pt-BR': "Ajustes de perda de tracking (VID → ⚙): Hold indefinitely, Hold with timeout (0.1–30 s, padrão 10 s) ou Release on loss. Mapeie poses no MAP como sensor.vision.gesture.N (gate momentâneo 0/1, rearma ao soltar a mão).",
    },
    'lp.vision.builtinsNote': {
      en: "Built-in detectors: Open / Fist / Pinch / Victory",
      'pt-BR': "Detectores nativos: Open / Fist / Pinch / Victory",
    },
    'lp.vision.clutchNote': {
      en: "Pinch Clutch engages relative control on sensor.vision.pinch_x · _y · _z",
      'pt-BR': "Pinch Clutch ativa controle relativo em sensor.vision.pinch_x · _y · _z",
    },

    /* Mapping & MIDI 6-step sequence */
    'lp.mapdesk.stepSeqTitle': {
      en: "SIX-STEP MAPPING SEQUENCE — FROM TOUCH TO LIVE",
      'pt-BR': "SEQUÊNCIA DE MAPEAMENTO EM SEIS PASSOS — DO TOQUE AO LIVE",
    },
    'lp.mapdesk.step1Title': {
      en: "1 · PICK TARGET",
      'pt-BR': "1 · ESCOLHER ALVO",
    },
    'lp.mapdesk.step1Desc': {
      en: "Open MAP, tap any control, then choose target via Track → Device → Parameter picker (+ Song/Main/Master & Returns; search filter; \"Selected in Live\").",
      'pt-BR': "Abra o MAP, toque no controle e selecione o alvo no seletor Track → Device → Parameter (+ Song/Main/Master e Returns; filtro de busca; \"Selected in Live\").",
    },
    'lp.mapdesk.step2Title': {
      en: "2 · NORMALIZE SOURCE",
      'pt-BR': "2 · NORMALIZAR FONTE",
    },
    'lp.mapdesk.step2Desc': {
      en: "Set input range In min / In max to map to 0..1. CLAMP bounds values outside the range to prevent jumps.",
      'pt-BR': "Ajuste a faixa de entrada In min / In max para mapear para 0..1. CLAMP limita valores fora da faixa para evitar saltos.",
    },
    'lp.mapdesk.step3Title': {
      en: "3 · RESPONSE CURVE",
      'pt-BR': "3 · CURVA DE RESPOSTA",
    },
    'lp.mapdesk.step3Desc': {
      en: "Choose Linear, Exponential, Logarithmic, or S-Curve shape, with Drive, Comp, and Smooth. Hold points for ~0.6 s to edit; double tap resets.",
      'pt-BR': "Escolha forma Linear, Exponencial, Logarítmica ou Curva S, com Drive, Comp e Smooth. Segure pontos por ~0.6 s para editar; duplo toque reseta.",
    },
    'lp.mapdesk.step4Title': {
      en: "4 · TARGET RANGE",
      'pt-BR': "4 · FAIXA DO ALVO",
    },
    'lp.mapdesk.step4Desc': {
      en: "Set target Out min and Out max in native Live units. Scaling modes: Auto, Linear, or Geometric for frequency/pitch controls.",
      'pt-BR': "Defina Out min e Out max do alvo em unidades nativas do Live. Modos de escala: Auto, Linear ou Geometric para frequência/pitch.",
    },
    'lp.mapdesk.step5Title': {
      en: "5 · POLICIES",
      'pt-BR': "5 · POLÍTICAS",
    },
    'lp.mapdesk.step5Desc': {
      en: "Takeover / pickup policies prevent jumps on reconnection; Safe loss defines Hold vs Release behavior on signal drop; idle timeout restores baseline.",
      'pt-BR': "Políticas de takeover / pickup previnem saltos na reconexão; Safe loss define comportamento de Hold vs Release na perda de sinal; timeout ocioso restaura referência.",
    },
    'lp.mapdesk.step6Title': {
      en: "6 · BIND · TRIGGER NOTE · LAUNCH CLIP",
      'pt-BR': "6 · BIND · TRIGGER NOTE · LAUNCH CLIP",
    },
    'lp.mapdesk.step6Desc': {
      en: "BIND writes Live parameters via the Extensions SDK. TRIGGER NOTE sends MIDI notes through RC-Midi-Receiver.amxd manually placed on the MIDI track (pitch/octave/velocity, timing Now/Next Beat/Bar, gate Short/While Held; keyboard MIDI passes through directly). LAUNCH CLIP fires Session clips through AbletonOSC: launch one clip, advance a list or stop the track, at the quantization Live reports.",
      'pt-BR': "BIND escreve parâmetros do Live via Extensions SDK. TRIGGER NOTE envia notas MIDI pelo RC-Midi-Receiver.amxd inserido manualmente na track MIDI (pitch/oitava/velocity, timing Now/Next Beat/Bar, gate Short/While Held; MIDI do teclado passa direto via thru). LAUNCH CLIP dispara clips da Session pelo AbletonOSC: lança um clip, avança uma lista ou para a track, na quantização informada pelo Live.",
    },
  };

  globalScope.RcSurfaceSiteCatalog = catalog;
  globalScope.RcSurfaceI18n?.registerCatalog?.(catalog);
})(typeof globalThis !== 'undefined' ? globalThis : this);
