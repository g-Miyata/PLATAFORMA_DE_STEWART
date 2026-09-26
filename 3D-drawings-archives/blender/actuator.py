"""Carcaça do atuador XINHUANGDUO BHTGA-DW-250-24-60 (tudo menos a haste),
para public/models/actuator-housing.glb.

Convenção (igual ao ModelSlot / PremiumParts.tsx):
  1 unidade = 1 mm; origem no centro da junta da base; eixo do atuador em +Z
  (vira +Y no glTF); motor do lado +X.
Forma tirada das fotos da bancada e do desenho da vista de cima: tubo em "D"
(lado curvo virado para o motor, lado de fora quase reto) com friso, tampa preta
grossa no topo, base retangular de cantos pouco arredondados sob o tubo e o
motor, com duas faixas vermelhas (juntas), motor curto paralelo ao tubo,
presilha preta, adesivo 24V e lingueta traseira.
"""
import math
import bmesh
import bpy

TUBE_X, TUBE_Y = 44, 42                  # perfil do tubo: profundidade (lado do motor) x largura
TUBE_R_NEAR, TUBE_R_FAR = 16, 4          # cantos: curvos do lado do motor, vivos do lado de fora
TUBE_Z0, TUBE_Z1 = 36, 336               # ACT.tubeStart .. tubeStart + tubeLength
MOTOR_R, MOTOR_X = 21, 46
HOUSE_X0, HOUSE_X1, HOUSE_D, HOUSE_R = -24, 69, 46, 6
LOW_Z0, HOUSE_Z1 = 20, 98
GASKETS = (48, 57)                       # faixas vermelhas (z de baixo de cada uma, 1,2 mm)
MOTOR_Z1 = 188

root = bpy.data.collections['Stewart']
col = bpy.data.collections.get('Stewart_Atuador')
if col:
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new('Stewart_Atuador')
    root.children.link(col)


def material(name, color, metallic, roughness, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    return m


M = {
    'tubo': material('Alu_Tubo', (0.80, 0.81, 0.83), 0.6, 0.36, 0.1),
    'caixa': material('Alu_Fosco', (0.74, 0.75, 0.78), 0.7, 0.4),
    'motor': material('Alu_Motor', (0.76, 0.78, 0.81), 0.85, 0.24),
    'tampa': material('Motor_Tampa', (0.66, 0.68, 0.71), 0.85, 0.32),
    'borracha': material('Borracha', (0.012, 0.012, 0.013), 0.0, 0.7),
    'aco': material('Aco_Escuro', (0.18, 0.19, 0.20), 0.9, 0.35),
    'vermelho': material('Adesivo_Vermelho', (0.75, 0.03, 0.03), 0.0, 0.5),
    'junta': material('Junta_Vermelha', (0.45, 0.05, 0.05), 0.0, 0.6),
}


def put(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    return o


def finish(o, mat, bevel=0.0, seg=3, axis=2):
    """Material, chanfro nas quinas vivas e sombreado suave só nas laterais (tampas planas)."""
    o.data.materials.clear()
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = abs(p.normal[axis]) < 0.9
    if bevel:
        m = o.modifiers.new('Bevel', 'BEVEL')
        m.width = bevel
        m.segments = seg
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(50)
        m.harden_normals = True
    return o


def rrect(w, d, r, cx=0.0, cy=0.0, n=8, r_neg_x=None):
    """Retângulo de cantos arredondados; r_neg_x muda o raio dos dois cantos do lado -X."""
    rn = r if r_neg_x is None else r_neg_x
    pts = []
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        rc = r if sx > 0 else rn
        x, y = sx * (w / 2 - rc), sy * (d / 2 - rc)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + x + rc * math.cos(a), cy + y + rc * math.sin(a)))
    return pts


def tube_profile(inflate=0.0):
    return rrect(TUBE_X + 2 * inflate, TUBE_Y + 2 * inflate, TUBE_R_NEAR + inflate, r_neg_x=TUBE_R_FAR + inflate)


def prism(name, pts, z0, z1, mat, bevel=0.0, seg=3):
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, z0)) for x, y in pts]
    vt = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
    return finish(o, mat, bevel, seg)


def cyl(name, r, z0, z1, mat, x=0.0, y=0.0, verts=64, bevel=0.0, rot=None):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=z1 - z0, location=(x, y, (z0 + z1) / 2), vertices=verts)
    o = put(bpy.context.active_object)
    o.name = name
    if rot:
        # gira em torno do próprio centro (z0/z1 viram a posição ao longo do novo eixo)
        o.rotation_euler = rot
    return finish(o, mat, bevel, 2)


parts = []

# ---- tubo de alumínio com um friso em cada face larga (±Y) ----
tube = prism('Tubo', tube_profile(), TUBE_Z0, TUBE_Z1 - 8, M['tubo'])
cutters = []
for s in (1, -1):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(-10, s * TUBE_Y / 2, (TUBE_Z0 + TUBE_Z1) / 2))
    c = bpy.context.active_object
    c.scale = (1.6, 1.4, TUBE_Z1 - TUBE_Z0 + 20)
    cutters.append(c)
for c in cutters:
    b = tube.modifiers.new('Friso', 'BOOLEAN')
    b.operation = 'DIFFERENCE'
    b.object = c
    b.solver = 'EXACT'
bpy.context.view_layer.objects.active = tube
for m in [m for m in tube.modifiers if m.type == 'BOOLEAN']:
    bpy.ops.object.modifier_apply(modifier=m.name)
for c in cutters:
    bpy.data.objects.remove(c, do_unlink=True)
finish(tube, M['tubo'], bevel=0.45, seg=2)
parts.append(tube)

# tampa preta grossa no topo, com o colar por onde sai a haste
parts.append(prism('Tampa_Tubo', tube_profile(1.5), TUBE_Z1 - 12, TUBE_Z1 + 6, M['borracha'], bevel=2.2, seg=4))
parts.append(cyl('Colar_Haste', 13, TUBE_Z1 + 6, TUBE_Z1 + 8, M['borracha'], bevel=0.8))

# ---- base retangular sob o tubo e o motor, com duas juntas vermelhas ----
hx = (HOUSE_X0 + HOUSE_X1) / 2
hw = HOUSE_X1 - HOUSE_X0
g0, g1 = GASKETS
parts.append(prism('Caixa_Inferior', rrect(hw, HOUSE_D, HOUSE_R, cx=hx), LOW_Z0, g0, M['caixa'], bevel=2.5, seg=3))
parts.append(prism('Caixa_Meio', rrect(hw, HOUSE_D, HOUSE_R, cx=hx), g0 + 1.2, g1, M['caixa'], bevel=0.6, seg=2))
parts.append(prism('Caixa_Superior', rrect(hw, HOUSE_D, HOUSE_R, cx=hx), g1 + 1.2, HOUSE_Z1, M['caixa'], bevel=2.5, seg=3))
for z in GASKETS:
    parts.append(prism('Junta', rrect(hw - 0.6, HOUSE_D - 0.6, HOUSE_R - 0.3, cx=hx), z - 0.2, z + 1.4, M['junta']))
# parafusos nas laterais da metade de cima
for x in (HOUSE_X0 + 10, HOUSE_X1 - 10):
    for s in (1, -1):
        parts.append(cyl('Parafuso_Lateral', 2.4, -0.7, 0.7, M['aco'], x=x, y=s * (HOUSE_D / 2), verts=20, bevel=0.3, rot=(math.pi / 2, 0, 0)))
        parts[-1].location.z = HOUSE_Z1 - 12

# ---- motor curto ao lado do tubo ----
parts.append(cyl('Motor_Colar', MOTOR_R + 1.2, HOUSE_Z1 - 1, HOUSE_Z1 + 4, M['caixa'], x=MOTOR_X, bevel=0.8))
parts.append(cyl('Motor', MOTOR_R, HOUSE_Z1 + 4, MOTOR_Z1, M['motor'], x=MOTOR_X, bevel=0.5))
parts.append(cyl('Motor_Tampa', MOTOR_R + 0.3, MOTOR_Z1, MOTOR_Z1 + 5, M['tampa'], x=MOTOR_X, bevel=1.6))
parts.append(cyl('Motor_Degrau', MOTOR_R - 5, MOTOR_Z1 + 5, MOTOR_Z1 + 6.5, M['tampa'], x=MOTOR_X, bevel=0.6))
parts.append(cyl('Motor_Ressalto', 6.5, MOTOR_Z1 + 6.5, MOTOR_Z1 + 10, M['tampa'], x=MOTOR_X, verts=40, bevel=0.9))
for a in (math.radians(40), math.radians(220)):
    parts.append(cyl('Motor_Parafuso', 2.2, MOTOR_Z1 + 6.5, MOTOR_Z1 + 7.8, M['aco'], x=MOTOR_X + 11.5 * math.cos(a), y=11.5 * math.sin(a), verts=20, bevel=0.3))

# ---- presilha preta entre tubo e motor, adesivo 24V ----
parts.append(prism('Presilha', rrect(12, 7, 2.5, cx=TUBE_X / 2 + 1, cy=-(TUBE_Y / 2 + 2.5)), HOUSE_Z1, HOUSE_Z1 + 13, M['borracha'], bevel=1))
parts.append(cyl('Presilha_Parafuso', 2.4, -0.7, 0.7, M['aco'], x=TUBE_X / 2 + 1, y=-(TUBE_Y / 2 + 6.2), verts=20, bevel=0.3, rot=(math.pi / 2, 0, 0)))
parts[-1].location.z = HOUSE_Z1 + 7
parts.append(cyl('Adesivo_24V', 4.5, -0.2, 0.2, M['vermelho'], x=-6, y=-(TUBE_Y / 2 + 0.05), verts=32, rot=(math.pi / 2, 0, 0)))
parts[-1].location.z = HOUSE_Z1 + 30

# ---- saída do cabo e lingueta traseira até a junta ----
parts.append(cyl('PrensaCabo', 5, -5, 5, M['borracha'], verts=24, bevel=0.8, rot=(0, math.pi / 2, 0)))
parts[-1].location = (HOUSE_X1 + 3, 6, LOW_Z0 + 12)
parts.append(prism('Lingueta', rrect(20, 16, 6), 6, LOW_Z0 + 2, M['caixa'], bevel=1.2))

empty = bpy.data.objects.new('actuator-housing', None)
col.objects.link(empty)
for o in parts:
    o.parent = empty
print('pecas', len(parts))
