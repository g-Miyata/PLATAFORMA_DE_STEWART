"""
Script de teste para verificar a detecção de portas ESP32-S3
"""
import serial.tools.list_ports

def test_port_detection():
    """Testa a lógica de detecção de ESP32-S3"""
    print("🔍 Testando detecção de portas ESP32-S3...\n")
    
    ports = []
    for p in serial.tools.list_ports.comports():
        # Identificadores comuns do ESP32
        is_esp32 = False
        confidence = 0
        
        # Verifica VID/PID conhecidos do ESP32
        esp32_identifiers = [
            (0x303A, None),      # Espressif VID
            (0x10C4, 0xEA60),    # Silicon Labs CP210x (comum em ESP32)
            (0x1A86, 0x7523),    # CH340 (comum em clones ESP32)
            (0x0403, 0x6001),    # FTDI (alguns boards ESP32)
        ]
        
        for vid, pid in esp32_identifiers:
            if p.vid == vid and (pid is None or p.pid == pid):
                is_esp32 = True
                confidence = 90 if vid == 0x303A else 70
                break
        
        # Verifica descrição/manufacturer
        desc_lower = (p.description or "").lower()
        mfr_lower = (p.manufacturer or "").lower()
        
        if not is_esp32:
            if any(kw in desc_lower for kw in ["esp32", "espressif"]):
                is_esp32 = True
                confidence = 85
            elif any(kw in mfr_lower for kw in ["espressif", "esp"]):
                is_esp32 = True
                confidence = 80
            elif any(kw in desc_lower for kw in ["usb-serial", "ch340", "cp210", "ftdi"]):
                is_esp32 = True
                confidence = 50
        
        # Gera nome de exibição amigável
        display_name = p.description or "Desconhecido"
        if is_esp32:
            # Se for Espressif oficial (VID 0x303A), mostra ESP32-S3
            if p.vid == 0x303A:
                display_name = "ESP32-S3 (USB Nativo)"
            # Se detectou ESP32 por outras formas, melhora o nome
            elif "espressif" in desc_lower or "esp32" in desc_lower:
                display_name = "ESP32-S3"
            elif p.vid == 0x1A86:
                display_name = "ESP32-S3 (CH340)"
            elif p.vid == 0x10C4:
                display_name = "ESP32-S3 (CP210x)"
            elif p.vid == 0x0403:
                display_name = "ESP32-S3 (FTDI)"
        
        ports.append({
            "device": p.device,
            "description": p.description or "Desconhecido",
            "display_name": display_name,
            "hwid": p.hwid or "",
            "vid": p.vid,
            "pid": p.pid,
            "manufacturer": p.manufacturer or "",
            "is_esp32": is_esp32,
            "confidence": confidence
        })
    
    # Ordena: ESP32 primeiro (por confiança), depois outros
    ports.sort(key=lambda x: (-x["is_esp32"], -x["confidence"], x["device"]))
    
    print(f"📋 Total de portas encontradas: {len(ports)}\n")
    
    for i, port in enumerate(ports, 1):
        # Badge padronizado
        if port["confidence"] >= 80:
            badge = "[✓]"
            color = "\033[92m"  # verde
        elif port["confidence"] >= 60:
            badge = "[~]"
            color = "\033[93m"  # amarelo
        elif port["is_esp32"]:
            badge = "[?]"
            color = "\033[91m"  # vermelho/laranja
        else:
            badge = "[ ]"
            color = "\033[90m"  # cinza
        
        reset = "\033[0m"
        
        print(f"{color}{badge} Porta {i}: {port['device']} • {port['display_name']}{reset}")
        print(f"   Descrição original: {port['description']}")
        print(f"   Fabricante: {port['manufacturer'] or 'N/A'}")
        vid_str = hex(port['vid']) if port['vid'] else 'N/A'
        pid_str = hex(port['pid']) if port['pid'] else 'N/A'
        print(f"   VID:PID = {vid_str}:{pid_str}")
        print(f"   ESP32: {'SIM' if port['is_esp32'] else 'NÃO'} (confiança: {port['confidence']}%)")
        print(f"   HWID: {port['hwid'][:60]}..." if len(port['hwid']) > 60 else f"   HWID: {port['hwid']}")
        print()
    
    # Recomendação
    esp32_ports = [p for p in ports if p["is_esp32"] and p["confidence"] >= 70]
    if esp32_ports:
        print("✅ Portas ESP32-S3 recomendadas:")
        for p in esp32_ports:
            print(f"   [✓] {p['device']} • {p['display_name']} (confiança: {p['confidence']}%)")
    else:
        print("⚠️  Nenhuma porta ESP32-S3 identificada com alta confiança")
    
    return ports

if __name__ == "__main__":
    test_port_detection()
