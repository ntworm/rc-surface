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
      'pt-BR': "Qualquer aparelho com navegador vira um controlador de performance para o Ableton Live. A sua máquina serve a surface na rede local e o celular só abre um link.",
    },
    'lp.surface.003': {
      en: "Live 12.4.5+ Suite · iOS 15.4+ Safari or Chromium on Android · held in <b>landscape</b> · local network, nothing installed on the phone.",
      'pt-BR': "Live 12.4.5+ Suite · iOS 15.4+ Safari ou Chromium no Android · segurado na <b>horizontal</b> · rede local, nada instalado no celular.",
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
      'pt-BR': "     SALTO 3  ▼  LIVE OBJECT MODEL · NO PROC",
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
      'pt-BR': "Simulador de BPM a partir do tempo do Live. Sem fase de beat.",
    },
    'lp.chain.016': {
      en: 'Free',
      'pt-BR': 'Free',
    },
    'lp.chain.018': {
      en: "Internal clock. Not locked to Live's tempo.",
      'pt-BR': "Clock interno. Não travado no tempo do Live.",
    },
    'lp.chain.019': {
      en: "AbletonOSC is needed <b>only</b> for Deep Sync, and installs separately as a Control Surface with UDP <code>11000</code>/<code>11001</code> free. Without it everything else works. Long-press <code>SYNC</code> for clock source, subdivisions, phase, swing and shapes.",
      'pt-BR': "AbletonOSC só é necessário para o Deep Sync, e se instala à parte como Control Surface com UDP <code>11000</code>/<code>11001</code> livres. Sem ele o resto funciona igual. Segure <code>SYNC</code> para clock, subdivisões, fase, swing e formas de onda.",
    },
    'lp.scenarios.030': {
      en: "Scenario A · two performers",
      'pt-BR': "Cenário A · dois performers",
    },
    'lp.scenarios.031': {
      en: "Scenario B · arrangement change",
      'pt-BR': "Cenário B · virada de arranjo",
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
      'pt-BR': "Intro, verso, refrão e outro nos slots 1–4 do SNP, arrastados entre os cantos no Vector XY.",
    },
    'lp.scenarios.017': {
      en: 'Push a filter in the air',
      'pt-BR': 'Empurrar um filtro no ar',
    },
    'lp.scenarios.018': {
      en: "Standing, no table. Pinch with the palm to the camera, move the hand, open the fingers.",
      'pt-BR': "Em pé, sem mesa. Pinch com a palma para a câmera, move a mão, abre os dedos.",
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
      'pt-BR': 'Clipe 1',
    },
    'lp.install.004': {
      en: "Install and first pairing, narrated",
      'pt-BR': "Instalação e primeiro pareamento, narrado",
    },
    'lp.install.006': {
      en: 'Install the extension',
      'pt-BR': 'Instale a extensão',
    },
    'lp.install.007': {
      en: "Double-click the <code>.ablx</code> from Published releases to request installation in Live.",
      'pt-BR': "Dê dois cliques no <code>.ablx</code> de Published releases para pedir a instalação no Live.",
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
      'pt-BR': 'Arme os sensores',
    },
    'lp.install.016': {
      en: "Enable <b data-i18n=\"lp.map.076\">Motion</b>, <b>Audio</b> or <b>Vision</b> as needed. Raw camera and microphone never leave the phone — only numeric values do.",
      'pt-BR': "Habilite <b data-i18n=\"lp.map.076\">Motion</b>, <b>Audio</b> ou <b>Vision</b> conforme precisar. Câmera e microfone crus nunca saem do celular — só valores numéricos saem.",
    },
    'lp.install.017': {
      en: 'Map a control to Live',
      'pt-BR': 'Mapeie um controle no Live',
    },
    'lp.install.018': {
      en: "Tap <code>MAP</code>, pick a highlighted control, then bind it to a Live parameter or a trigger note. Notes need the bundled <code>RC-Midi-Receiver.amxd</code> on the target MIDI track: Live cannot insert Max for Live devices through the SDK.",
      'pt-BR': "Toque <code>MAP</code>, escolha um controle destacado e ligue a um parâmetro do Live ou a uma nota de trigger. As notas precisam do <code>RC-Midi-Receiver.amxd</code> que vem junto na MIDI track de destino: o Live não insere devices do Max for Live pelo SDK.",
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
      en: "v1.0.0, smoke-tested in Live 12.4.5+ Suite (Beta) with a physical phone.",
      'pt-BR': "v1.0.0, testado em Live 12.4.5+ Suite (Beta) com celular físico.",
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
      en: "Every control on these plans is listed in <a href=\"#controls\">4.0</a>.",
      'pt-BR': "Todo controle destas plantas está listado em <a href=\"#controls\">4.0</a>.",
    },
    'lp.map.001': {
      en: 'Surface map <span class="tail">— figs. 1 to 7</span>',
      'pt-BR': 'Mapa da superfície <span class="tail">— figs. 1 a 7</span>',
    },
    'lp.map.004': {
      en: 'Fig. 1',
      'pt-BR': 'Fig. 1',
    },
    'lp.map.005': {
      en: "PERF — the layout as built",
      'pt-BR': "PERF — o layout como foi construído",
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
      en: "PERF, MIX, SNP, SNS, AUD, VID. MAP overlays the current page; CFG shows on PERF and MIX.",
      'pt-BR': "PERF, MIX, SNP, SNS, AUD, VID. MAP se sobrepõe à página atual; CFG aparece em PERF e MIX.",
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
      en: "Captioned <code>XY 1</code> and <code data-i18n=\"lp.fig.016\">XY 2 (Physics)</code>. Each axis maps on its own.",
      'pt-BR': "Marcados <code>XY 1</code> e <code data-i18n=\"lp.fig.016\">XY 2 (Physics)</code>. Cada eixo mapeia sozinho.",
    },
    'lp.map.019': {
      en: 'LFOs',
      'pt-BR': 'LFOs',
    },
    'lp.map.020': {
      en: "L1 to L4. Hz in FREE, note values in SYNC. Ceilings: sine 4 Hz, square 12 Hz. Shape in CFG.",
      'pt-BR': "L1 a L4. Hz em FREE, figuras em SYNC. Tetos: senoide 4 Hz, quadrada 12 Hz. Forma no CFG.",
    },
    'lp.map.021': {
      en: 'Stutters',
      'pt-BR': 'Stutters',
    },
    'lp.map.022': {
      en: "S1 to S4. Horizontal speed, vertical amplitude. Up to 15 Hz including ratchet.",
      'pt-BR': "S1 a S4. Horizontal é velocidade, vertical é amplitude. Até 15 Hz, ratchet incluso.",
    },
    'lp.map.023': {
      en: "CAP captures, slots 1 to 4 recall, OFF exits.",
      'pt-BR': "CAP captura, os slots 1 a 4 chamam de volta, OFF sai.",
    },
    'lp.map.024': {
      en: "Live panel",
      'pt-BR': "Painel do Live",
    },
    'lp.map.025': {
      en: "BPM, transport, TRN, MAP, CFG.",
      'pt-BR': "BPM, transporte, TRN, MAP, CFG.",
    },
    'lp.map.026': {
      en: "Sync block",
      'pt-BR': "Bloco de sync",
    },
    'lp.map.027': {
      en: "SYNC, settings, STAGE; CALIBRATE on SNS/AUD/VID.",
      'pt-BR': "SYNC, ajustes, STAGE; CALIBRAR em SNS/AUD/VID.",
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
      'pt-BR': "<code>knob-1..8</code>, quatro por duas. Arrasto vertical relativo.",
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
      'pt-BR': "<code data-i18n=\"lp.fig.013\">CAPTURE</code>, <code data-i18n=\"lp.fig.014\">CLEAR SLOTS</code>, transição de 0.1 a 5.0 s ou sincronizada, e Grid/Vector.",
    },
    'lp.map.060': {
      en: 'Vector morph pad',
      'pt-BR': 'Pad de morph vetorial',
    },
    'lp.map.061': {
      en: "Blends slots 1 TL, 2 TR, 3 BL and 4 BR at once, weighted by the point.",
      'pt-BR': "Mistura os slots 1 TL, 2 TR, 3 BL e 4 BR de uma vez, com peso pela posição do ponto.",
    },
    'lp.map.067': {
      en: 'Fig. 4',
      'pt-BR': 'Fig. 4',
    },
    'lp.map.068': {
      en: "SNS — motion and orientation axes",
      'pt-BR': "SNS — eixos de motion e orientação",
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
      'pt-BR': "Histórico ao vivo de 2.5 s: Amplitude, Attacks, Tone, Texture, Bands ou All.",
    },
    'lp.map.104': {
      en: 'Detector knobs',
      'pt-BR': 'Knobs dos detectores',
    },
    'lp.map.105': {
      en: "SENS, RELEASE, CURVE, group GAIN and SMOOTH. Note divisions in SYNC, milliseconds in FREE.",
      'pt-BR': "SENS, RELEASE, CURVE, GAIN e SMOOTH do grupo. Figuras em SYNC, milissegundos em FREE.",
    },
    'lp.map.106': {
      en: "Analysis window",
      'pt-BR': "Janela de análise",
    },
    'lp.map.107': {
      en: "WINDOW x1/x2/x4 trades spectral detail for response time.",
      'pt-BR': "WINDOW x1/x2/x4 troca detalhe espectral por tempo de resposta.",
    },
    'lp.audio.detectors': {
      en: "Built-in audio detectors",
      'pt-BR': "Detectores de áudio integrados",
    },
    'lp.audio.timing': {
      en: "SYNC follows Live BPM from 1/128 to 1/1, triplets and dotted included; FREE keeps its own milliseconds. Low, mid and high are K-weighted loudness (ITU-R BS.1770), in LU.",
      'pt-BR': "SYNC segue o BPM do Live de 1/128 a 1/1, com quiálteras e pontuadas; FREE guarda os próprios milissegundos. Low, mid e high são loudness K-weighted (ITU-R BS.1770), em LU.",
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
      'pt-BR': "Liga/desliga, confiança, modo de reconhecimento e o preview ao vivo.",
    },
    'lp.map.124': {
      en: 'Learned poses',
      'pt-BR': 'Poses aprendidas',
    },
    'lp.map.125': {
      en: "G1, G2 and G3, three examples each: <code>CAP</code>, <code data-i18n=\"lp.fig.007\">TEST</code>, <code data-i18n=\"lp.fig.008\">DEL LAST</code>, <code data-i18n=\"lp.fig.009\">CLR</code>. Recognition emits a momentary 0→1.",
      'pt-BR': "G1, G2 e G3, três exemplos cada: <code>CAP</code>, <code data-i18n=\"lp.fig.007\">TEST</code>, <code data-i18n=\"lp.fig.008\">DEL LAST</code>, <code data-i18n=\"lp.fig.009\">CLR</code>. O reconhecimento emite um 0→1 momentâneo.",
    },
    'lp.map.126': {
      en: 'Built-in detectors',
      'pt-BR': 'Detectores nativos',
    },
    'lp.map.127': {
      en: "Open, Fist, Pinch and Victory, opt-in and untrained. Rotation belongs to Victory.",
      'pt-BR': "Open, Fist, Pinch e Victory, opcionais e sem treino. A rotação pertence ao Victory.",
    },
    'lp.map.128': {
      en: 'Direct MAP / CLUTCH',
      'pt-BR': 'MAP direto / CLUTCH',
    },
    'lp.map.129': {
      en: "MAP X/Y/Z follows the hand; CLUTCH X/Y/Z is relative and freezes when the pinch opens.",
      'pt-BR': "MAP X/Y/Z segue a mão; CLUTCH X/Y/Z é relativo e congela quando o pinch abre.",
    },
    'lp.map.130': {
      en: 'Camera diagnostics',
      'pt-BR': 'Diagnósticos da câmera',
    },
    'lp.map.131': {
      en: "PALM size and signed FACE stay local to the preview; they are not mapping controls.",
      'pt-BR': "Tamanho de PALM e FACE com sinal ficam locais no preview; não são controles mapeáveis.",
    },
    'lp.map.137': {
      en: 'Fig. 7',
      'pt-BR': 'Fig. 7',
    },
    'lp.map.138': {
      en: "MAP — armed strip, then target picker",
      'pt-BR': "MAP — barra armada e depois o seletor de destino",
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
      'pt-BR': "Mostra só <code>MAP ARMED / TAP A CONTROL / DONE</code>, e some quando um controle é tocado.",
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
      'pt-BR': "Busca nomes de destino; <code>Selected in Live</code> restringe à track e ao device atuais.",
    },
    'lp.map.152': {
      en: 'Hierarchy',
      'pt-BR': 'Hierarquia',
    },
    'lp.map.153': {
      en: "Track → Device → Parameter, plus Song/Main/Master and Return groups.",
      'pt-BR': "Track → Device → Parameter, mais os grupos Song/Main/Master e Return.",
    },
    'lp.map.154': {
      en: 'Live selection shortcut',
      'pt-BR': 'Atalho da seleção do Live',
    },
    'lp.map.155': {
      en: "Uses Live's selected track and device as a filter; it picks no parameter for you.",
      'pt-BR': "Usa a track e o device selecionados no Live como filtro; não escolhe parâmetro por você.",
    },

    'lp.controls.001': {
      en: "Controls <span class=\"tail\">— inventory, header, families</span>",
      'pt-BR': "Controles <span class=\"tail\">— inventário, header, famílias</span>",
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
      en: 'LFOs L1–L4',
      'pt-BR': 'LFOs L1–L4',
    },
    'lp.controls.018': {
      en: "Any mapped parameter",
      'pt-BR': "Qualquer parâmetro mapeado",
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
      en: "<code>sensor.vision.x</code>, <code>.y</code>, <code>.z</code>; Pinch Clutch <code>sensor.vision.pinch_x</code>, <code>_y</code>, <code>_z</code>; Open / Fist / Pinch / Victory; learned G1–G3",
      'pt-BR': "<code>sensor.vision.x</code>, <code>.y</code>, <code>.z</code>; Pinch Clutch <code>sensor.vision.pinch_x</code>, <code>_y</code>, <code>_z</code>; Open / Fist / Pinch / Victory; G1–G3 aprendidos",
    },
    'lp.controls.043': {
      en: 'Map picker',
      'pt-BR': 'Seletor de mapeamento',
    },
    'lp.controls.045': {
      en: "Phone overlay, panel Mapping tab and the admin window",
      'pt-BR': "Overlay do celular, aba Mapping do painel e a janela administrativa",
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
      'pt-BR': "As linhas <b>SDK</b> mapeiam números para parâmetros do Live. MIDI precisa do Receiver opcional. Controles local nunca saem do navegador.",
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
      en: "Per-control settings: pad mode, LFO shape, stutter mode, XY 2 physics. PERF and MIX only.",
      'pt-BR': "Ajustes por controle: modo do pad, forma do LFO, modo do stutter, física do XY 2. Só PERF e MIX.",
    },
    'lp.controls.059': {
      en: "Toggles <b>SYNC</b> / <b>FREE</b>. Long-press for Deep Sync Settings, <a href=\"#clock\">2.1</a>.",
      'pt-BR': "Alterna <b>SYNC</b> / <b>FREE</b>. Segure para Deep Sync Settings, <a href=\"#clock\">2.1</a>.",
    },
    'lp.controls.062': {
      en: "Sets the neutral reference for the page: posture on SNS, level on AUD, lighting on VID.",
      'pt-BR': "Define a referência neutra da página: postura em SNS, nível em AUD, iluminação em VID.",
    },
    'lp.controls.063': {
      en: "Locks the surface to the current page.",
      'pt-BR': "Trava a surface na página atual.",
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
      en: 'Pads, LFOs, stutters',
      'pt-BR': 'Pads, LFOs, stutters',
    },
    'lp.controls.075': {
      en: "<code>A</code> returns to zero, <code>B</code> keeps what you leave, <code>C</code> latches, <code>D</code> fires one burst — set per pad in CFG. LFOs and stutters share the clock: locked to Live's beat in SYNC, free-running in FREE.",
      'pt-BR': "<code>A</code> volta a zero, <code>B</code> mantém o que você deixa, <code>C</code> trava, <code>D</code> dispara um burst — ajustável por pad no CFG. LFOs e stutters usam o mesmo clock: travado no beat do Live em SYNC, livre em FREE.",
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
      en: "XY 2 coasts and rebounds after release; XY 1 stays where you leave it. Knobs and faders track the finger from the current value and never jump to the touch point.",
      'pt-BR': "O XY 2 continua e quica depois que você solta; o XY 1 fica onde ficou. Knobs e faders seguem o dedo a partir do valor atual e nunca pulam para o ponto tocado.",
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
      'pt-BR': "O capture guarda todos os controles mapeados num dos oito slots. O recall interpola até ele no tempo definido. O Vector XY mistura os slots 1–4 pela posição do dedo.",
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
      'pt-BR': "CALIBRAR faz da postura atual a referência. AUD transforma som em controle: nível, envelope, gate, attacks e doze descritores, no gráfico dos últimos 2.5 segundos.",
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
      en: "Hand X/Y/Z is continuous. A held pinch engages the clutch and releasing it freezes the value. G1–G3 and the four built-in detectors are intentional outputs; PALM and FACE remain local camera diagnostics.",
      'pt-BR': "X/Y/Z da mão é contínuo. Um pinch mantido engata o clutch e soltar congela o valor. G1–G3 e os quatro detectores nativos são saídas intencionais; PALM e FACE continuam diagnósticos locais da câmera.",
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
      en: "Phone MAP and panel Mappings bind a control to a Live parameter or a trigger note, with curve, range, takeover and idle settings.",
      'pt-BR': "O MAP do celular e o Mappings do painel ligam um controle a um parâmetro do Live ou a uma nota de trigger, com curva, faixa, takeover e ajustes de ociosidade.",
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
      'pt-BR': 'EXIBIÇÃO LOCAL',
    },
  };

  globalScope.RcSurfaceSiteCatalog = catalog;
  globalScope.RcSurfaceI18n?.registerCatalog?.(catalog);
})(typeof globalThis !== 'undefined' ? globalThis : this);
