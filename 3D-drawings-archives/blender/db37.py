"""Conector D-sub 37 vias fêmea (copo de solda), medidas do desenho Winford CNS37F:
flange C = 69,4 x 12,55 x 1, furos 3,05 a B = 63,5, carcaça em D E = 54,84 x 7,9 com
lados a 10°, corpo traseiro D = 57,7 x 10,72, copos de solda de 3,3.
Blender: x ao longo do conector, y na altura, z para a frente (face de encaixe);
origem no centro do flange, z = 0 na face de trás do flange.
"""
import math
import bmesh
import bpy
from mathutils import Vector

root = bpy.data.collections['Stewart']
col = bpy.data.collections.get('Stewart_DB37')
if col:
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new('Stewart_DB37')
    root.children.link(col)


def material(name, color, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    m.diffuse_color = (*color, 1)
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*color, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = roughness
    return m


M = {
    'estanho': material('DB_Estanho', (0.8, 0.81, 0.83), 1.0, 0.28),
    'isolante': material('DB_Isolante', (0.05, 0.05, 0.06), 0.0, 0.6),
    'furo': material('Furo', (0.01, 0.01, 0.01), 0.0, 0.9),
    'ouro': material('DB_Ouro', (0.95, 0.72, 0.3), 1.0, 0.25),
}


def mesh_obj(name, bm, mat, bevel=0.0):
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
        m.segments = 2
        m.limit_method = 'ANGLE'
        m.angle_limit = math.radians(50)
        m.harden_normals = True
    return o


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


def cyl(name, r, z0, z1, x, y, mat, n=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=n, radius1=r, radius2=r, depth=z1 - z0)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((x, y, (z0 + z1) / 2)))
    return mesh_obj(name, bm, mat)


def rrect(w, h, r, n=4):
    pts = []
    for sx, sy, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        x, y = sx * (w / 2 - r), sy * (h / 2 - r)
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    return pts


def dshape(top, h, r=1.2, n=4, ang=10):
    """Contorno em D: largura top em cima, lados inclinados de ang graus."""
    bot = top - 2 * h * math.tan(math.radians(ang))
    corners = [(top / 2, h / 2), (-top / 2, h / 2), (-bot / 2, -h / 2), (bot / 2, -h / 2)]
    pts = []
    for i, (x, y) in enumerate(corners):
        # arredonda cada canto puxando o centro para dentro
        cxp = x - math.copysign(r * 1.1, x)
        cyp = y - math.copysign(r, y)
        a_mid = math.atan2(y - cyp, x - cxp)
        for k in range(n + 1):
            a = a_mid - math.pi / 4 + (math.pi / 2) * k / n
            pts.append((cxp + r * math.cos(a), cyp + r * math.sin(a)))
    return pts


parts = [
    prism('Flange', rrect(69.4, 12.55, 1.0), 0, 1, M['estanho'], bevel=0.15),
    prism('Carcaca_D', dshape(54.84, 7.9), 1, 6, M['estanho'], bevel=0.2),
    prism('Isolante', dshape(53.4, 6.6, r=0.9), 1, 6.05, M['isolante']),
    prism('Corpo_Traseiro', dshape(57.7, 10.72, r=1.4), -5.7, 0, M['isolante'], bevel=0.3),
]
for s in (1, -1):
    x = s * 63.5 / 2
    # espaçador sextavado (jack screw) na frente e furo passante
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=6, radius1=2.75, radius2=2.75, depth=4.5)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((x, 0, 1 + 2.25)))
    parts.append(mesh_obj('Espacador', bm, M['estanho']))
    parts.append(cyl('Espacador_Rosca', 1.25, 5.5, 5.56, x, 0, M['furo'], n=12))
# 37 contatos: 19 em cima e 18 embaixo, passo 2,77
for row, count, y in ((0, 19, 1.42), (1, 18, -1.42)):
    for i in range(count):
        x = (i - (count - 1) / 2) * 2.77
        parts.append(cyl('Contato_Furo', 0.62, 6.05, 6.1, x, y, M['furo'], n=10))
        parts.append(cyl('Contato', 0.32, 6.05, 6.12, x, y, M['ouro'], n=8))
        parts.append(cyl('Copo_Solda', 0.6, -9.0, -5.7, x, y, M['ouro'], n=8))

empty = bpy.data.objects.new('db37-female', None)
col.objects.link(empty)
for o in parts:
    o.parent = empty
print('db37', len(parts))
