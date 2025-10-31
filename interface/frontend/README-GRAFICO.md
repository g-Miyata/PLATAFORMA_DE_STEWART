# 📈 Gráfico de Telemetria em Tempo Real

## Funcionalidades

O gráfico de telemetria permite visualizar e gravar dados dos 6 pistões da plataforma Stewart em tempo real.

### Características Principais

1. **Visualização em Tempo Real**

   - 12 linhas no total: 6 para posição atual (Y) e 6 para setpoints (SP)
   - Cores distintas para cada pistão (azul, roxo, rosa, laranja, teal, índigo)
   - Setpoints com linha tracejada mais forte
   - Grid para facilitar leitura dos valores

2. **Performance Otimizada**

   - Máximo de 500 pontos exibidos no gráfico (evita lag)
   - Animações desabilitadas para melhor performance
   - Armazenamento em IndexedDB para dados ilimitados

3. **Controles Disponíveis**
   - **▶ Começar**: Inicia a gravação dos dados
   - **⏸ Pausar**: Pausa a gravação (mantém dados)
   - **🗑️ Limpar**: Apaga todos os dados e reseta o gráfico
   - **💾 Exportar CSV**: Salva todos os dados gravados em arquivo CSV

## Como Usar

### 1. Conectar ao ESP32

- Conecte-se ao ESP32 através da interface serial
- Aguarde a confirmação de conexão

### 2. Iniciar Gravação

- Clique em **"▶ Começar"**
- O status mudará para "🔴 Gravando..."
- Os dados começarão a aparecer no gráfico em tempo real

### 3. Durante a Gravação

- O gráfico mostra até 500 pontos mais recentes
- Todos os dados são salvos no IndexedDB (sem limite)
- O contador mostra quantos pontos estão em memória

### 4. Pausar/Retomar

- Clique em **"⏸ Pausar"** para interromper temporariamente
- Clique em **"▶ Começar"** novamente para retomar

### 5. Exportar Dados

- Clique em **"💾 Exportar CSV"** a qualquer momento
- Um arquivo CSV será baixado com todos os dados gravados
- Formato: `telemetria_[timestamp].csv`

### 6. Limpar e Reiniciar

- Clique em **"🗑️ Limpar"** para apagar tudo
- O banco de dados será limpo automaticamente
- Pronto para uma nova gravação

## Formato do CSV Exportado

```csv
Timestamp,SP_Global,SP1,SP2,SP3,SP4,SP5,SP6,Y1,Y2,Y3,Y4,Y5,Y6
2025-10-31T12:00:00.000Z,100.5,100.5,100.5,100.5,100.5,100.5,100.5,99.8,100.2,99.9,100.1,100.0,99.7
2025-10-31T12:00:00.100Z,100.5,100.5,100.5,50.0,100.5,100.5,100.5,100.0,100.3,100.1,100.2,100.1,99.9
...
```

- **Timestamp**: Data/hora em formato ISO 8601
- **SP_Global**: Último setpoint global enviado em milímetros
- **SP1-SP6**: Setpoint individual de cada pistão em milímetros
- **Y1-Y6**: Posição atual de cada pistão em milímetros

### Como Funcionam os Setpoints no Gráfico

- Quando você envia um **setpoint global**, todas as 6 linhas de setpoint são atualizadas para o mesmo valor
- Quando você envia um **setpoint individual** para um pistão específico, apenas aquela linha de setpoint é atualizada
- O gráfico mostra sempre o **último setpoint** enviado para cada pistão
- Exemplo: Se você enviar SP global de 100mm e depois SP individual de 50mm para o pistão 3, o gráfico mostrará:
  - Pistões 1, 2, 4, 5, 6: linha de setpoint em 100mm
  - Pistão 3: linha de setpoint em 50mm

## Armazenamento

### IndexedDB

- Banco de dados local do navegador
- Persiste mesmo após fechar a página
- Limpo automaticamente ao clicar em "Começar" ou "Limpar"
- Não tem limite de tamanho (até quota do navegador)

### Memória RAM

- Buffer circular de 500 pontos para o gráfico
- Garante performance mesmo em gravações longas
- Pontos antigos são removidos automaticamente

## Dicas de Uso

1. **Para testes curtos**: Use o gráfico diretamente sem se preocupar
2. **Para coleta de dados**: Sempre exporte o CSV ao final
3. **Para análise posterior**: Os dados no IndexedDB persistem até você limpar
4. **Performance**: Se o navegador ficar lento, exporte e limpe os dados

## Cores dos Pistões

- 🔵 **Pistão 1**: Azul
- 🟣 **Pistão 2**: Roxo
- 🩷 **Pistão 3**: Rosa
- 🟠 **Pistão 4**: Laranja
- 🟦 **Pistão 5**: Teal
- 🟪 **Pistão 6**: Índigo

Setpoints aparecem com a mesma cor, mas linha tracejada e mais forte.

## Limitações

- Gráfico limitado a 500 pontos visíveis (performance)
- IndexedDB limitado pela quota do navegador (~50MB+)
- Exportação CSV pode demorar com muitos dados (>100k pontos)

## Solução de Problemas

### Gráfico não atualiza

- Verifique se clicou em "Começar"
- Confirme que está recebendo telemetria (veja console RX/TX)
- Recarregue a página se necessário

### Exportação falha

- Verifique se há dados gravados
- Tente limpar o cache do navegador
- Reduza a quantidade de dados (grave menos tempo)

### Performance ruim

- Exporte e limpe dados antigos
- Feche outras abas do navegador
- Considere usar um computador mais potente
