# LIMITES CORRETOS - Configuração Final

## 📏 CONCEITOS IMPORTANTES

### Stroke (L) - Comprimento do Pistão

- **L_min = 500mm**: Pistão totalmente retraído (posição mínima)
- **L_max = 680mm**: Pistão estendido ao máximo (+180mm de curso)
- **Curso útil = 180mm** (de 500mm a 680mm)

### Z - Altura da Plataforma Móvel

- **Z_min = 433mm**: Altura mínima (quando pistões ≈ 500mm)
- **Z_max = 631mm**: Altura máxima (quando pistões ≈ 680mm)
- **Range Z = 198mm** (de 433mm a 631mm)

## ✅ LIMITES CONFIGURADOS

### Backend (app.py)

```python
platform = StewartPlatform(h0=432, stroke_min=500, stroke_max=680)
```

### Frontend (kinematics.html e index.html)

```html
<input type="number" id="z-pos" value="500" min="433" max="631" step="1" />
<input type="range" id="z-slider" min="433" max="631" value="500" step="1" />
```

## 🔍 VALIDAÇÃO

### Regra Principal

Cada pistão deve ter: **500mm ≤ L ≤ 680mm**

### Porcentagem

- L = 500mm → 0% (retraído)
- L = 590mm → 50% (meio curso)
- L = 680mm → 100% (estendido)

Fórmula: `percentage = ((L - 500) / 180) * 100`

## 📊 TESTES DE VALIDAÇÃO

### ✅ Poses VÁLIDAS

- Z = 433mm → L ≈ [500.1 - 501.0]mm (0.4% - 0.6%)
- Z = 500mm → L ≈ [559.1 - 560.0]mm (32.8% - 33.3%)
- Z = 631mm → L ≈ [678.8 - 679.5]mm (99.3% - 99.7%)

### ❌ Poses INVÁLIDAS

- Z = 432mm → Alguns pistões < 500mm
- Z = 632mm → Alguns pistões > 680mm

## 🎯 RESUMO

1. **Slider Z**: Limitado a 433-631mm (impede poses inválidas)
2. **Validação backend**: Verifica se todos os pistões estão entre 500-680mm
3. **Porcentagem**: Baseada no curso de 180mm
4. **Logs debug**: Console mostra validação detalhada de cada pistão

## 🚀 COMO TESTAR

1. Recarregue a página (Ctrl+F5)
2. Abra o Console (F12)
3. Mova o slider Z:
   - Z=433 → Todos pistões ≈ 500mm (0.5%) ✅
   - Z=500 → Todos pistões ≈ 560mm (33%) ✅
   - Z=631 → Todos pistões ≈ 679mm (99.5%) ✅
4. Observe os logs no console mostrando validação detalhada
