"""Parte elétrica da bandeja (fotos da bancada), um .glb por peça:
  driver-board        driver ponte H JZ-3615-A (9-36 V, 12 A)
  power-supply        fonte chaveada 24 V 360 W (215 x 115 x 50)
  breaker             disjuntor bipolar C10 no trilho DIN
  terminal-strip      régua de bornes cinza de dois andares (52 vias) no trilho DIN
  terminal-strip-blue régua de bornes azul (12 vias)

Convenção: 1 unidade = 1 mm, Z para cima (vira +Y no glTF; o app gira de volta),
origem no centro da peça, apoiada em z = 0 (placa, fundo da fonte, fundo do trilho).
"""
import math
import bmesh
import bpy
from mathutils import Matrix, Vector

root = bpy.data.collections['Stewart']


def collection(name):
    col = bpy.data.collections.get(name)
    if col:
        for o in list(col.objects):
            bpy.data.objects.remove(o, do_unlink=True)
    else:
        col = bpy.data.collections.new(name)
        root.children.link(col)
    return col


def material(name, color, metallic=0.0, roughness=0.5, coat=0.0, emission=None):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1)
        b.inputs['Emission Strength'].default_value = 4.0
    return m


M = {
    'pcb': material('PCB_Vermelho', (0.62, 0.03, 0.03), 0.0, 0.32, 0.6),
    'estanho': material('Estanho', (0.85, 0.86, 0.88), 1.0, 0.25),
    'furo': material('Furo', (0.01, 0.01, 0.01), 0.0, 0.9),
    'laranja': material('Borne_Laranja', (1.0, 0.42, 0.04), 0.0, 0.45),
    'verde': material('Borne_Verde', (0.35, 0.8, 0.08), 0.0, 0.45),
    'preto': material('Plastico_Preto', (0.02, 0.02, 0.022), 0.0, 0.55),
    'parafuso': material('Aco_Parafuso', (0.78, 0.79, 0.8), 1.0, 0.3),
    'cap_verde': material('Capacitor_Verde', (0.03, 0.2, 0.09), 0.0, 0.3, 0.4),
    'cap_topo': material('Capacitor_Topo', (0.72, 0.74, 0.76), 1.0, 0.35),
    'ci': material('CI_Preto', (0.03, 0.03, 0.035), 0.0, 0.6),
    'ferrite': material('Ferrite', (0.08, 0.08, 0.085), 0.2, 0.7),
    'vidro': material('Diodo_Vidro', (0.75, 0.3, 0.1), 0.0, 0.2, 0.8),
    'led': material('LED_Verde', (0.2, 0.9, 0.3), 0.0, 0.3, emission=(0.1, 1.0, 0.25)),
    'chapa': material('Alu_Chapa', (0.8, 0.81, 0.82), 0.9, 0.34),
    'grade': material('Grade_Ventoinha', (0.7, 0.71, 0.72), 1.0, 0.3),
    'ventoinha': material('Ventoinha', (0.05, 0.05, 0.055), 0.0, 0.6),
    'trimpot': material('Trimpot', (0.15, 0.35, 0.85), 0.0, 0.4),
    'branco': material('Plastico_Branco', (0.88, 0.88, 0.86), 0.0, 0.5),
    'cinza_esc': material('Plastico_Cinza', (0.18, 0.19, 0.2), 0.0, 0.5),
    'etiqueta': material('Etiqueta_Cinza', (0.6, 0.62, 0.64), 0.0, 0.6),
    'borne': material('Borne_Cinza', (0.56, 0.58, 0.6), 0.0, 0.55),
    'borne_azul': material('Borne_Azul', (0.1, 0.35, 0.85), 0.0, 0.5),
    'trilho': material('Trilho_DIN', (0.74, 0.75, 0.77), 1.0, 0.3),
}

COL = None


def mesh_obj(name, bm, mat, bevel=0.0, seg=2):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    COL.objects.link(o)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        n = p.normal
        p.use_smooth = max(abs(n.x), abs(n.y), abs(n.z)) < 0.97
    if bevel:
        m = o.modifiers.new('Bevel', 'BEVEL')
        m.width = bevel
        m.segments = seg
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(50)
        m.harden_normals = True
    return o


def box(name, x, y, z, mat, bevel=0.0, seg=2):
    (x0, x1), (y0, y1), (z0, z1) = x, y, z
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    return mesh_obj(name, bm, mat, bevel, seg)


def cyl(name, r, h, c, mat, axis='Z', n=32, bevel=0.0, r2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r if r2 is None else r2, depth=h)
    if axis == 'X':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
    elif axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(c))
    return mesh_obj(name, bm, mat, bevel, 2)


def rrect(w, d, r, cx=0.0, cy=0.0, n=6):
    pts = []
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        x, y = sx * (w / 2 - r), sy * (d / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + x + r * math.cos(a), cy + y + r * math.sin(a)))
    return pts


def prism(name, pts, z0, z1, mat, bevel=0.0):
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, z0)) for x, y in pts]
    vt = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    return mesh_obj(name, bm, mat, bevel)


def prism_x(name, pts_yz, x0, x1, mat, bevel=0.0):
    """Perfil no plano YZ (anti-horário visto de +X) extrudado ao longo de X."""
    bm = bmesh.new()
    va = [bm.verts.new((x0, y, z)) for y, z in pts_yz]
    vb = [bm.verts.new((x1, y, z)) for y, z in pts_yz]
    bm.faces.new(va[::-1])
    bm.faces.new(vb)
    for i in range(len(pts_yz)):
        j = (i + 1) % len(pts_yz)
        bm.faces.new((va[i], va[j], vb[j], vb[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return mesh_obj(name, bm, mat, bevel)


def screw(x, y, z, r, slot_along_x=True):
    """Cabeça de parafuso (topo em z + 0,8) com fenda."""
    parts = [cyl('Parafuso', r, 0.8, (x, y, z + 0.4), M['parafuso'], n=20, bevel=0.2)]
    sx, sy = (r * 1.7, r * 0.35) if slot_along_x else (r * 0.35, r * 1.7)
    parts.append(box('Fenda', (x - sx / 2, x + sx / 2), (y - sy / 2, y + sy / 2), (z + 0.7, z + 0.85), M['furo']))
    return parts


def finish(name, parts):
    empty = bpy.data.objects.new(name, None)
    COL.objects.link(empty)
    for o in parts:
        o.parent = empty
    return len(parts)


# =====================================================================
# driver JZ-3615-A: x = lado dos bornes (-) para a saída (+), y como na foto do produto
# =====================================================================
COL = collection('Stewart_Driver')
T = 1.6
P = [prism('PCB', rrect(63, 58, 2), 0, T, M['pcb'], bevel=0.3)]
for sx in (-1, 1):
    for sy in (-1, 1):
        P.append(cyl('Furo_Pad', 2.9, 0.1, (sx * 28, sy * 25.5, T + 0.05), M['estanho'], n=24))
        P.append(cyl('Furo', 1.6, 0.14, (sx * 28, sy * 25.5, T + 0.07), M['furo'], n=20))


def pluggable(y0, n, mat):
    """Borne plugável de passo 5,08 na borda esquerda: base soldada + plugue com parafusos."""
    y1 = y0 + n * 5.08
    out = [
        box('Borne_Base', (-29, -22), (y0, y1), (T, T + 9), mat, bevel=0.4),
        box('Borne_Plug', (-35, -23.5), (y0 + 0.3, y1 - 0.3), (T + 2, T + 15), mat, bevel=0.6),
        box('Borne_Trava', (-24, -22), (y0 + 0.3, y1 - 0.3), (T + 9, T + 17), mat, bevel=0.4),
    ]
    for i in range(n):
        y = y0 + 2.54 + 5.08 * i
        out += screw(-31, y, T + 15, 1.6, slot_along_x=False)
        out.append(box('Entrada_Fio', (-35.1, -34.9), (y - 1.5, y + 1.5), (T + 5, T + 9), M['furo']))
    return out


P += pluggable(3, 5, M['laranja'])       # sinais (PWM, direção, GND...)
P += pluggable(-20.5, 2, M['verde'])     # alimentação 9-36 V

# capacitores
P.append(cyl('Cap_1000uF', 6.3, 25, (-11, -16.5, T + 6.3), M['cap_verde'], axis='Y', n=40, bevel=0.6))
P.append(cyl('Cap_1000uF_Fundo', 5.8, 0.3, (-11, -29.1, T + 6.3), M['cap_topo'], axis='Y', n=32))
P.append(cyl('Cap_470uF', 4, 11, (1.5, -22, T + 5.5), M['cap_verde'], n=32, bevel=0.5))
P.append(cyl('Cap_470uF_Topo', 3.6, 0.2, (1.5, -22, T + 11.05), M['cap_topo'], n=28))
for x, y in ((15, -14), (23.5, -16)):
    P.append(box('SMD_Base', (x - 3.3, x + 3.3), (y - 3.3, y + 3.3), (T, T + 1), M['ci'], bevel=0.2))
    P.append(cyl('SMD_Cap', 3.15, 5, (x, y, T + 3.5), M['cap_topo'], n=32, bevel=0.3))
    P.append(box('SMD_Marca', (x - 2, x + 2), (y + 1, y + 2.4), (T + 6, T + 6.08), M['ci']))
P.append(box('Indutor', (8, 14), (-29.5, -23.5), (T, T + 3.5), M['ferrite'], bevel=0.5))
P.append(cyl('Indutor_Topo', 2.2, 0.1, (11, -26.5, T + 3.55), M['cap_topo'], n=20))


def ic(x, y, w, l, h=1.2):
    """CI SMD: corpo preto sobre uma faixa de terminais estanhados (w = largura com pinos em ±x)."""
    return [
        box('CI_Pinos', (x - w / 2 - 0.7, x + w / 2 + 0.7), (y - l / 2 + 0.3, y + l / 2 - 0.3), (T, T + 0.3), M['estanho']),
        box('CI', (x - w / 2, x + w / 2), (y - l / 2, y + l / 2), (T, T + h), M['ci'], bevel=0.15),
    ]


for x, y, w, l, h in ((15, 13, 4.4, 5, 1.1), (4, 14, 4.4, 5, 1.1), (5, 4, 3.9, 4.9, 1.5), (15, 3, 3.9, 4.9, 1.5),
                      (6, -8, 3.9, 4.9, 1.5), (-6, -12, 1.6, 2.9, 1.1), (-9, 24, 1.6, 2.9, 1.1)):
    P += ic(x, y, w, l, h)
P.append(box('Diodo_SMA', (-3, 1.3), (25.2, 27.8), (T, T + 2), M['ci'], bevel=0.2))
P.append(box('Fusivel', (-21, -16), (-5, -1), (T, T + 2.8), M['ferrite'], bevel=0.3))

# diodos de vidro (MELF) e resistores/capacitores 0805
for i in range(6):
    P.append(cyl('Diodo', 0.8, 3.6, (-17 + i * 3.4, -3, T + 0.8), M['vidro'], axis='Y', n=12))
for i in range(4):
    P.append(cyl('Diodo', 0.8, 3.6, (9 + i * 3.4, -1.5, T + 0.8), M['vidro'], axis='Y', n=12))
smd = [(-15 + 4 * i, 20) for i in range(5)] + [(-16, 8), (-12, 8), (-8, 8), (-12, 15), (-12, 17.5)]
smd += [(11, -20.5), (14.5, -21.5), (25, 20), (25, 23), (28, 20), (21, 8), (21, 11), (11, 8), (-1, -15), (26, -8), (26, -11)]
for x, y in smd:
    P.append(box('SMD_Pads', (x - 1, x + 1), (y - 0.62, y + 0.62), (T, T + 0.35), M['estanho']))
    P.append(box('SMD', (x - 0.6, x + 0.6), (y - 0.64, y + 0.64), (T, T + 0.55), M['ci']))

# borne de saída para o motor
P.append(box('Saida_Base', (20, 25), (0.5, 19.5), (T, T + 9), M['preto'], bevel=0.4))
P.append(box('Saida', (24, 35.5), (0, 20), (T, T + 13), M['preto'], bevel=0.7))
for y in (5, 15):
    P += screw(30, y, T + 13, 2.2)
    P.append(box('Saida_Fio', (35.5, 35.6), (y - 2.5, y + 2.5), (T + 3, T + 8), M['furo']))
P.append(box('LED', (24, 26), (-27, -26), (T, T + 0.7), M['led']))
print('driver-board', finish('driver-board', P))

# =====================================================================
# fonte 24 V 360 W: x = comprimento (bornes em -x, ventoinha em +x)
# =====================================================================
COL = collection('Stewart_Fonte')
P = [
    box('Carcaca', (-90, 107.5), (-57.5, 57.5), (0, 50), M['chapa'], bevel=1.2),
    box('Degrau_Bornes', (-107.5, -90), (-57.5, 57.5), (0, 20), M['chapa'], bevel=1.0),
    box('Barra_Bornes', (-106, -92), (-47, 47), (20, 31), M['preto'], bevel=0.5),
]
for i in range(9):
    y = -38 + 9.5 * i
    P += screw(-99, y, 31, 2.6)
    if i < 8:
        P.append(box('Separador', (-106, -92), (y + 4.15, y + 5.35), (31, 35), M['preto']))
P.append(box('LED_Fonte', (-104, -101), (49, 52), (20, 21.5), M['led']))
P.append(cyl('Trimpot', 2.5, 2, (-98, -52, 21), M['trimpot'], n=20))
for cx in (-62, -14):
    for y in (14, 22, 30, -14, -22, -30):
        P.append(box('Ventilacao', (cx - 20, cx + 20), (y - 1.75, y + 1.75), (49.96, 50.08), M['furo'], bevel=0.0))
# ventoinha sob a grade
FX = 64
P.append(cyl('Ventoinha_Abertura', 30, 0.2, (FX, 0, 50.05), M['furo'], n=48))
for k in range(7):
    a = 2 * math.pi * k / 7
    b = box('Pa', (-9, 9), (-4.5, 4.5), (50.1, 50.3), M['ventoinha'])
    b.rotation_euler = (0, 0, a + 0.5)
    b.location = (FX + 18 * math.cos(a), 18 * math.sin(a), 0)
    P.append(b)
P.append(cyl('Ventoinha_Cubo', 10, 0.5, (FX, 0, 50.35), M['ventoinha'], n=32))
for r in (11, 19, 27):
    bpy.ops.mesh.primitive_torus_add(major_radius=r, minor_radius=0.6, location=(FX, 0, 50.7), major_segments=48, minor_segments=6)
    o = bpy.context.active_object
    for c in list(o.users_collection):
        c.objects.unlink(o)
    COL.objects.link(o)
    o.name = 'Grade'
    o.data.materials.append(M['grade'])
    for p in o.data.polygons:
        p.use_smooth = True
    P.append(o)
for k in range(4):
    a = math.pi / 4 + k * math.pi / 2
    b = box('Grade_Raio', (-9.5, 9.5), (-0.6, 0.6), (50.1, 51.3), M['grade'])
    b.rotation_euler = (0, 0, a)
    b.location = (FX + 20 * math.cos(a), 20 * math.sin(a), 0)
    P.append(b)
for x, y in ((100, 50), (100, -50), (-84, 50), (-84, -50)):
    P += screw(x, y, 50, 2.4)
print('power-supply', finish('power-supply', P))

# =====================================================================
# disjuntor bipolar (DIN): x ao longo do trilho, y na altura do painel, z profundidade
# =====================================================================
COL = collection('Stewart_Disjuntor')
P = []
for i in range(2):
    x0 = -18 + 18 * i
    P.append(box('Polo_Base', (x0 + 0.2, x0 + 17.8), (-42.5, 42.5), (0, 44), M['branco'], bevel=1.0))
    P.append(box('Polo_Frente', (x0 + 0.2, x0 + 17.8), (-22.5, 22.5), (44, 68), M['branco'], bevel=1.5))
    for s in (1, -1):
        P.append(cyl('Borne_Furo', 3.2, 0.2, (x0 + 9, s * 33, 44.05), M['furo'], n=24))
        P.append(cyl('Borne_Parafuso', 2.2, 0.3, (x0 + 9, s * 33, 44.2), M['parafuso'], n=20))
        P.append(box('Entrada_Fio', (x0 + 4, x0 + 14), (s * 42.5 - 0.05, s * 42.5 + 0.05), (8, 18), M['furo']))
    P.append(box('Rotulo', (x0 + 3, x0 + 15), (-18, -6), (68, 68.1), M['etiqueta']))
P.append(box('Alavanca_Rebaixo', (-16, 16), (-2, 16), (68, 68.2), M['furo']))
P.append(box('Alavanca', (-15, 15), (4, 13), (68, 79), M['cinza_esc'], bevel=1.5))
print('breaker', finish('breaker', P))

# =====================================================================
# réguas de bornes (dois andares) no trilho DIN: x ao longo do trilho
# =====================================================================
RAIL_H = 7.5
PROFILE = [(-31, 0), (31, 0), (31, 24), (27, 30), (18, 30), (14, 42), (6, 46), (-6, 46), (-14, 42), (-18, 30), (-27, 30), (-31, 24)]
PROFILE = [(y, z + RAIL_H) for y, z in PROFILE]
RAIL = [(-17.5, RAIL_H - 1), (-12.5, RAIL_H - 1), (-12.5, 0), (12.5, 0), (12.5, RAIL_H - 1), (17.5, RAIL_H - 1), (17.5, RAIL_H), (-17.5, RAIL_H)]


def array(o, n, pitch):
    m = o.modifiers.new('Array', 'ARRAY')
    m.count = n
    m.use_relative_offset = False
    m.use_constant_offset = True
    m.constant_offset_displace = (pitch, 0, 0)
    # o array vem antes do chanfro
    if 'Bevel' in o.modifiers:
        o.modifiers.move(o.modifiers.find('Array'), 0)
    return o


def strip(name, n, pitch, mat):
    length = n * pitch
    x0 = -length / 2
    w = pitch - 0.35
    xc = x0 + w / 2
    P = [prism_x('Trilho', RAIL, x0 - 26, x0 + length + 26, M['trilho'])]
    slice_parts = [prism_x('Borne', PROFILE, x0, x0 + w, mat)]
    for s in (1, -1):
        slice_parts.append(cyl('Borne_Furo', 1.9, 0.12, (xc, s * 22.5, 30 + RAIL_H + 0.06), M['furo'], n=12))
        slice_parts.append(cyl('Borne_Parafuso', 1.25, 0.1, (xc, s * 22.5, 30 + RAIL_H + 0.14), M['parafuso'], n=10))
        slice_parts.append(box('Borne_Entrada', (xc - 1.5, xc + 1.5), (s * 31 - 0.06, s * 31 + 0.06), (RAIL_H + 10, RAIL_H + 17), M['furo']))
    for o in slice_parts:
        array(o, n, pitch)
    P += slice_parts
    # tampa final e batentes
    P.append(prism_x('Tampa_Final', PROFILE, x0 + length - 0.35, x0 + length + 1.6, mat, bevel=0.25))
    for xa, xb in ((x0 - 11, x0 - 1), (x0 + length + 2.5, x0 + length + 12.5)):
        P.append(box('Batente', (xa, xb), (-21, 21), (RAIL_H, RAIL_H + 30), M['cinza_esc'], bevel=1.0))
        P += screw((xa + xb) / 2, 0, RAIL_H + 30, 2.2, slot_along_x=False)
    return finish(name, P)


COL = collection('Stewart_Bornes')
print('terminal-strip', strip('terminal-strip', 52, 5.2, M['borne']))
COL = collection('Stewart_BornesAzul')
print('terminal-strip-blue', strip('terminal-strip-blue', 12, 6.2, M['borne_azul']))
