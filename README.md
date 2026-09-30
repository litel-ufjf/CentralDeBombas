# Central De Bombas

Painel da bancada de **bombas peristálticas**: o computador comunica com o ESP32 pelo cabo USB e controla até 6 bombas (ligar, sentido e velocidade).

A **versão 2** traz a programação de experimentos funcionando de ponta a ponta: o programa montado em blocos é enviado à placa, que o executa sozinha, na hora ou em um horário agendado, com acompanhamento, pausa e parada pelo app.

## Baixar e usar no Windows

O aplicativo já está disponível para baixar. Não precisa clonar o repositório nem instalar Node localmente.

Há um [guia do usuário em PDF](documentos/guia_usuario.pdf) na pasta `documentos/`, com instalação, firmware da placa, telas, calibração e gráficos.

1. Abra a [página de releases](https://github.com/litel-ufjf/CentralDeBombas/releases/latest) e baixe o instalador **Painel de Bombas** para Windows.
2. Instale e abra o app.
3. Grave no ESP32 o sketch **Arduino/interface_prog** (TB6612FNG, com programação de experimentos; recomendado a partir da versão 2), **Arduino/interface_TB** (TB6612FNG, só controle manual) ou **Arduino/interface** (L298N), só na primeira vez ou quando o firmware mudar.
4. Ligue a placa no PC pelo USB, escolha a porta COM e clique em **Conectar**.

Pronto: ligue, ajuste PWM, sentido e velocidade pelo painel.

Enquanto o cabo estiver desconectado, os valores na tela ficam em zero. Cada bomba tem uma página própria (**Abrir**), com calibração da vazão estimada: zero abaixo do limiar PWM₀ e `Q = a × (PWM − PWM₀)` acima dele, já que ainda não há sensor de fluxo.

### Programação de experimentos

Com o firmware **interface_prog**, o editor de blocos (**Programar experimento**) envia o programa para a placa, que o executa sozinha. No rodapé do editor, ou no cartão **Programação** da página da bomba, escolha **Agora** ou **Agendar** (data e hora) e acompanhe o andamento; **Pausar** e **Parar** pedem confirmação, que pode ser desligada na própria caixa e reativada em **Configurações**.

- Com um programa em execução, agendado ou pausado, fechar o editor (ou usar o botão **–**) o **minimiza**: um painel no canto inferior direito, visível em todas as telas, mostra cada programação com estado, tempo, vazão, progresso e contagem regressiva, além de **Pausar**, **Retomar**, **Parar** e **Abrir editor**. O botão ao lado expande o editor para a tela inteira. **Ctrl+Z** desfaz e **Ctrl+Y** (ou Ctrl+Shift+Z) refaz as edições dos blocos; os mesmos comandos ficam nos botões acima do zoom.
- A programação de cada bomba é salva automaticamente e tem um nome, que se edita clicando nele. **Salvar** guarda a programação na biblioteca interna do app; a partir daí as alterações vão para ela automaticamente. **Abrir** lista a biblioteca (abrir, renomear, excluir, salvar cópia, nova programação) e também abre arquivos `.json`; **Exportar** grava a programação em um arquivo `.json` para levar a outro computador.
- As variáveis (**Vazão Atual**, **Tempo Decorrido** desde o início do programa, **Volume Total** bombeado e **Sentido**) são blocos de valor: arraste-as para qualquer campo numérico, de um campo para outro, ou para a lixeira ou a paleta para removê-las. **Sentido** vale 1 no direto e 0 no reverso; sozinha no espaço de condição de **Enquanto** ou **Se**, vale verdadeiro no direto e falso no reverso.
- **Enquanto** e **Se** recebem um bloco de **Comparação** (`>`, `≥`, `<`, `≤`, `=`, `≠`) com números ou variáveis dos dois lados, por exemplo `Enquanto Tempo Decorrido < 600`, ou a variável Sentido. O botão **+ senão** no bloco Se (ou o bloco **Se / senão** da paleta) acrescenta o braço executado quando a condição é falsa; o **×** ao lado de “senão” o remove.
- **Escolha / caso** compara um valor (número ou variável) com cada **caso**, em ordem, e executa só o primeiro que for igual; se nenhum for, executa **caso contrário**. **+ caso** acrescenta um caso e o **×** remove.
- Comparações que não sejam `Vazão Atual > / ≥ valor` exigem firmware interface_prog recente: `<`, `≤` e tempo/volume pedem `PROG2`; `=`, `≠`, senão, Escolha/caso e Sentido pedem `PROG3`. Com firmware anterior, o app avisa antes de enviar.
- A tela inicial marca com um selo as bombas que têm programação (Executando, Agendado, Pausado, Concluído).
- Ao conectar, o app acerta o relógio da placa com o do computador e repete isso a cada minuto; o agendamento usa esse relógio.
- O programa continua se o app fechar ou o cabo for desconectado (só as bombas manuais são desligadas). **Parar tudo** interrompe inclusive os programas.
- Enquanto um programa está ativo, os controles manuais daquela bomba ficam bloqueados.
- O programa fica na memória RAM da placa: se ela reiniciar, é preciso enviá-lo de novo.

O protocolo serial (115200 baud, uma linha por comando) está descrito no início de `Arduino/interface_prog/interface_prog.ino`. Sem placa, `node scripts/programacao/testar_ui_simulada.mjs` testa o fluxo da UI com uma placa simulada (com `npm run dev` rodando).

## Como o projeto está organizado

- **Arduino/** — programas da placa
  - **interface/** — o programa diário com a ponte L298N.
  - **interface_TB/** — o mesmo protocolo serial, para a ponte TB6612FNG.
  - **interface_prog/** — o interface_TB com relógio sincronizado e execução autônoma de programas (imediata ou agendada, com pausa e parada).
  - **motor/**, **motor_teste/**, **2_motores/** e **2_motores_TB/** — testes de montagem e debug.
- **UI/** — código do aplicativo de computador.
- **scripts/** — ferramentas de apoio: notebooks e dados dos ensaios de calibração, comparação visual dos blocos (`referencia_blocos/`) e teste da programação com placa simulada (`programacao/`).
- **exemplo/** — cópia de referência do visual; não entra no Git e não é o programa que se usa.

## Desenvolvimento

Para abrir o painel a partir do código:

```bash
cd UI
npm install
npm run dev
```

Para gerar de novo o instalador Windows:

```bash
cd UI
npm run build
```

Os arquivos ficam em `UI/release/`. O instalador público continua na [página de releases](https://github.com/litel-ufjf/CentralDeBombas/releases/latest).
