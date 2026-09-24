# Conferência de áudio — Browser

Teste manual a ser feito pelo responsável; ainda pendente. O antigo laboratório
tonal foi removido. Esta conferência não mede latência ponta a ponta nem aprova
o Native Track.

1. Use um Live Set de teste e o ABLX revisado. Abra AUD e selecione a entrada correta.
   Recarregar a página deve manter a escolha, mas deixar a captura desligada.
2. Ative a captura. Confira RMS/envelope e os doze cartões; não deve aparecer
   nenhuma interface de nota detectada, clareza tonal ou BPM por áudio.
3. Use loopback/cabo virtual para evitar a acústica da sala. Compare silêncio,
   tom grave, médio, agudo, ruído e transientes isolados. Salve qual arquivo e
   trecho usou, navegador, entrada, sample rate e JANELA.
4. Em MAP, associe um descritor a um parâmetro seguro. Comece com SUAVE OFF,
   GANHO ×1 e JANELA x1. Observe ataques, decaimento e perda de sinal.
   Kick/Snare são heurísticas; não espere classificação perfeita em música mista.
5. Em SYNC, confira RELEASE/SUAVE até 1/128, T e D; depois mude o BPM no Live.
   Em FREE, os valores próprios em ms devem voltar. OFF continua disponível.
6. Confira Amplitude, Ataques, Timbre, Textura, Bandas e Tudo; curvas/legendas
   devem concordar com cartões e com o teto vertical indicado no gráfico.
7. Desligue a captura, troque a entrada e desconecte o cabo. Confirme liberação de
   modulação conforme Safe loss, erro explícito para dispositivo ausente e
   ausência de captura automática após recarregar.

Registre resultados observados e falhas separadamente. Gravar áudio de referência
e resposta no mesmo relógio é necessário para medir atraso; sensação auditiva
e tamanho de janela DSP não são essa medição. A bancada Native Track continua
adiada, fora desta versão. Consulte o [guia atual](./USER-GUIDE.pt-BR.md).
