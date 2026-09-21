# Conferência de áudio — Browser

Teste manual pendente do responsável. O laboratório tonal antigo foi removido.
Esta conferência não mede latência ponta a ponta nem aprova Native Track.

1. Use um Set de teste e a ABLX revisada. Abra AUD e selecione a entrada correta.
   Recarregar a página deve manter a escolha, mas deixar a captura desligada.
2. Habilite áudio. Verifique RMS/envelope e os doze cartões; nenhuma interface
   de nota, clareza tonal ou BPM detectado deve aparecer.
3. Use loopback/cabo virtual para evitar a acústica da sala. Compare silêncio,
   tom grave, médio, agudo, ruído e transientes isolados. Salve qual arquivo e
   trecho usou, navegador, entrada, sample rate e WINDOW.
4. Em MAP, associe um descritor a um parâmetro seguro. Comece com SMOOTH OFF,
   GAIN ×1 e WINDOW x1. Observe ataques, cauda e perda de sinal.
   Kick/Snare são heurísticas; não espere classificação perfeita em música mista.
5. Em SYNC, confira RELEASE/SMOOTH até 1/128, T e D; altere BPM no Live.
   Em FREE, os valores próprios em ms devem voltar. OFF continua disponível.
6. Confira Amplitude, Ataques, Timbre, Textura, Bandas e Tudo; curvas/legendas
   devem concordar com cartões e com o teto vertical indicado no gráfico.
7. Desligue captura, troque entrada e desconecte o cabo. Confirme liberação de
   modulação conforme Safe loss, erro explícito para dispositivo ausente e
   ausência de captura automática após recarregar.

Registre resultados observados e falhas separadamente. Gravar áudio de referência
e resposta no mesmo relógio é necessário para medir atraso; sensação auditiva
e tamanho de janela DSP não são essa medição. A bancada Native Track continua
adiada, fora desta versão. Consulte o [guia atual](./USER-GUIDE.pt-BR.md).
