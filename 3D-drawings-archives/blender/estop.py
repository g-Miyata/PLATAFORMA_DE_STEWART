"""Botoeira de emergência (caixa preta com tampa amarela, cogumelo vermelho com
trava por giro), como a da bancada, sem as inscrições.
Blender: z = eixo do botão (para a frente), y = para cima da caixa (lado do
prensa-cabo), origem no centro da face de trás (z = 0). Os fios saem por trás.
"""
import math
import bmesh
import bpy
from mathutils import Vector

root = bpy.data.collections['Stewart']
col = bpy.data.collections.get('Stewart_Emergencia')
if col:
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new('Stewart_Emergencia')
    root.children.link(col)


def material(name, color, metallic=0.0, roughness=0.5, coat=0.0):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = coat
    return m


M = {
    'preto': material('Botoeira_Preto', (0.025, 0.026, 0.028), 0.0, 0.35, 0.3),
    'amarelo': material('Botoeira_Amarelo', (0.95, 0.72, 0.02), 0.0, 0.3, 0.4),
    'vermelho': material('Botoeira_Vermelho', (0.75, 0.04, 0.03), 0.0, 0.4),
    'fosco': material('Botoeira_Fosco', (0.04, 0.04, 0.045), 0.0, 0.7),
    'parafuso': material('Aco_Parafuso', (0.78, 0.79, 0.8), 1.0, 0.3),
    'furo': material('Furo', (0.01, 0.01, 0.01), 0.0, 0.9),
}


def mesh_obj(name, bm, mat, bevel=0.0, seg=3):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    col.objects.link(o)
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


def rrect(w, h, r, n=6):
    pts = []
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        x, y = sx * (w / 2 - r), sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    return pts


def prism(name, pts, z0, z1, mat, bevel=0.0, seg=3):
    bm = bmesh.new()
    vb = [bm.verts.new((x, y, z0)) for x, y in pts]
    vt = [bm.verts.new((x, y, z1)) for x, y in pts]
    bm.faces.new(vb[::-1])
    bm.faces.new(vt)
    for i in range(len(pts)):
        j = (i + 1) % len(pts)
        bm.faces.new((vb[i], vb[j], vt[j], vt[i]))
    return mesh_obj(name, bm, mat, bevel, seg)


def cone(name, r0, r1, z0, z1, mat, n=48, bevel=0.0, center=(0, 0), axis='Z'):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r0, radius2=r1, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0, 0, (z0 + z1) / 2)))
    if axis == 'Y':
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=__import__('mathutils').Matrix.Rotation(-math.pi / 2, 3, 'X'))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((center[0], center[1], 0)) if axis == 'Z' else Vector((center[0], 0, center[1])))
    return mesh_obj(name, bm, mat, bevel, 2)


def box(name, x, y, z, mat, bevel=0.0):
    (x0, x1), (y0, y1), (z0, z1) = x, y, z
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector(((x0 + x1) / 2 + v.co.x * (x1 - x0), (y0 + y1) / 2 + v.co.y * (y1 - y0), (z0 + z1) / 2 + v.co.z * (z1 - z0)))
    return mesh_obj(name, bm, mat, bevel, 2)


P = [
    prism('Caixa', rrect(68, 68, 7), 0, 40, M['preto'], bevel=1.5),
    prism('Tampa', rrect(71, 71, 8), 39, 62, M['amarelo'], bevel=2.5, seg=4),
    box('Placa', (-16, 16), (-6, 26), (62, 62.8), M['fosco'], bevel=0.3),
    cone('Colar', 15, 15, 62, 69, M['fosco'], bevel=0.8),
    cone('Colar_Anel', 13, 13, 69, 72, M['preto'], bevel=0.5),
    cone('Cogumelo', 20, 20.5, 72, 80, M['vermelho'], n=64, bevel=1.2),
    cone('Cogumelo_Topo', 19.5, 16, 80, 84, M['vermelho'], n=64, bevel=1.5),
]
# serrilhado da borda do cogumelo
for k in range(72):
    a = 2 * math.pi * k / 72
    r = box('Serrilha', (-0.45, 0.45), (-0.6, 0.6), (72.6, 79.6), M['vermelho'])
    r.rotation_euler = (0, 0, a)
    r.location = (20.4 * math.cos(a), 20.4 * math.sin(a), 0)
    P.append(r)
# nervuras em arco no topo (setas de destravar)
for a0 in (0.35, math.pi + 0.35):
    for k in range(10):
        a = a0 + k * 0.23
        r = box('Nervura', (-0.9, 0.9), (-0.6, 0.6), (83.6, 84.4), M['vermelho'])
        r.rotation_euler = (0, 0, a)
        r.location = (11 * math.cos(a), 11 * math.sin(a), 0)
        P.append(r)
# parafusos Phillips nos cantos da tampa
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * 27.5, sy * 27.5
        P.append(cone('Parafuso', 3.3, 3.0, 62, 63.2, M['parafuso'], n=20))
        P[-1].location = (x, y, 0)
        for rot in (0, math.pi / 2):
            c = box('Fenda', (-2.2, 2.2), (-0.35, 0.35), (63.0, 63.3), M['furo'])
            c.rotation_euler = (0, 0, rot + math.pi / 4)
            c.location = (x, y, 0)
            P.append(c)
# prensa-cabo de borracha no lado de cima e furo dos fios atrás
P.append(cone('Passa_Cabo', 9, 9, 33.5, 35.5, M['fosco'], n=32, center=(0, 20), axis='Y'))
P.append(cone('Passa_Cabo_Furo', 5, 5, 35.4, 35.7, M['furo'], n=24, center=(0, 20), axis='Y'))
P.append(cone('Saida_Fios', 4.5, 4.5, -0.3, 0.2, M['furo'], n=24))
P[-1].location = (10, -20, 0)

empty = bpy.data.objects.new('estop', None)
col.objects.link(empty)
for o in P:
    o.parent = empty
print('estop', len(P))
