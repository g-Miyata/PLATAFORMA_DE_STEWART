# 🔌 Detecção Automática de ESP32-S3

## Visão Geral

O sistema agora identifica automaticamente portas ESP32-S3 conectadas, facilitando a seleção correta e evitando erros de conexão.

## Recursos Implementados

### Backend (`app.py`)

A função `SerialManager.list_ports()` foi melhorada para retornar informações detalhadas:

```python
{
    "device": "COM3",
    "description": "USB-SERIAL CH340",
    "hwid": "USB VID:PID=1A86:7523",
    "vid": 0x1A86,
    "pid": 0x7523,
    "manufacturer": "wch.cn",
    "is_esp32": true,
    "confidence": 70
}
```

#### Identificadores ESP32 Reconhecidos

| VID    | PID    | Chip/Adaptador      | Confiança |
| ------ | ------ | ------------------- | --------- |
| 0x303A | -      | Espressif (nativo)  | 90%       |
| 0x10C4 | 0xEA60 | Silicon Labs CP210x | 70%       |
| 0x1A86 | 0x7523 | WCH CH340           | 70%       |
| 0x0403 | 0x6001 | FTDI FT232          | 70%       |

#### Detecção por Descrição/Fabricante

- **Alta confiança (85%)**: descrição contém "esp32" ou "espressif"
- **Boa confiança (80%)**: fabricante contém "espressif" ou "esp"
- **Média confiança (50%)**: descrição contém "usb-serial", "ch340", "cp210", "ftdi"

### Frontend (`common.js`)

A função `loadSerialPorts()` agora:

1. **Exibe indicadores visuais**:

   - 🟢 Verde: ESP32 com alta confiança (≥80%)
   - 🟡 Amarelo: ESP32 com boa confiança (≥60%)
   - 🟠 Laranja: ESP32 com confiança média (≥50%)
   - ⚪ Branco: Outras portas

2. **Destaca visualmente**:

   - Portas ESP32 com confiança ≥70% aparecem em **negrito e verde**
   - Outras portas aparecem em cinza

3. **Tooltip informativo**:

   - Mostra fabricante, VID e PID ao passar o mouse

4. **Seleção automática**:
   - Se houver **apenas uma** porta ESP32 com confiança ≥80%, seleciona automaticamente
   - Exibe toast de confirmação

## Exemplos de Uso

### Exemplo 1: ESP32-S3 Oficial (USB Nativo)

```
🟢 COM5 - USB Serial Device (Espressif)
   Fabricante: Espressif Systems
   VID: 0x303a, PID: 0x1001
   Confiança: 90%
```

### Exemplo 2: ESP32 com CH340

```
🟡 COM3 - USB-SERIAL CH340
   Fabricante: wch.cn
   VID: 0x1a86, PID: 0x7523
   Confiança: 70%
```

### Exemplo 3: Porta Genérica

```
⚪ COM1 - Porta de comunicação (COM1)
   Fabricante: (Tipos de porta padrão)
   VID: N/A, PID: N/A
   Confiança: 0%
```

## Testando

Execute o script de teste:

```bash
cd interface/backend
python test_port_detection.py
```

Saída esperada quando ESP32 está conectado:

```
🔍 Testando detecção de portas ESP32-S3...

📋 Total de portas encontradas: 2

🟢 Porta 1: COM5
   Descrição: USB Serial Device
   Fabricante: Espressif Systems
   VID: 0x303a, PID: 0x1001
   ESP32: SIM (confiança: 90%)

⚪ Porta 2: COM1
   Descrição: Porta de comunicação (COM1)
   Fabricante: (Tipos de porta padrão)
   VID: N/A, PID: N/A
   ESP32: NÃO (confiança: 0%)

✅ Portas ESP32-S3 recomendadas:
   • COM5 (confiança: 90%)
```

## Benefícios

1. ✅ **Previne erros**: usuário vê claramente qual porta é o ESP32
2. ✅ **Seleção automática**: em casos óbvios, seleciona sozinho
3. ✅ **Informação detalhada**: tooltip mostra VID/PID/fabricante
4. ✅ **Ordenação inteligente**: ESP32 sempre aparece no topo
5. ✅ **Compatibilidade**: funciona com clones e adaptadores diversos

## Compatibilidade

- ✅ Windows (testado)
- ✅ Linux (suportado via pyserial)
- ✅ macOS (suportado via pyserial)

## Troubleshooting

### ESP32 não detectado

1. Verifique se o driver USB está instalado:

   - **CH340**: [driver WCH](http://www.wch.cn/downloads/CH341SER_ZIP.html)
   - **CP210x**: [driver Silicon Labs](https://www.silabs.com/developers/usb-to-uart-bridge-vcp-drivers)

2. Reconecte o cabo USB

3. Execute `test_port_detection.py` para ver detalhes

### Múltiplos ESP32 conectados

O sistema não seleciona automaticamente, deixando a escolha para o usuário. Todos aparecem com indicadores visuais.
