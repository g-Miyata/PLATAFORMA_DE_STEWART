"""Junta universal (cardã) cromada, para public/models/kardan-top.glb.

Origem no centro da cruzeta; eixo da perna em +Z (vira +Y no glTF).
Garfo inferior (ligado à haste) com orelhas em ±X; garfo superior (ligado ao tampo)
girado 90°, com orelhas em ±Y. Tamanho igual ao UJoint procedural (~±15 mm).
"""
import math
import bpy

root = bpy.data.collections['Stewart']
col = bpy.data.collections.get('Stewart_Kardan')
if col:
    for o in list(col.objects):
        bpy.data.objects.remove(o, do_unlink=True)
else:
    col = bpy.data.collections.new('Stewart_Kardan')
    root.children.link(col)

chrome = bpy.data.materials.get('Cromo') or bpy.data.materials.new('Cromo')
chrome.use_nodes = True
b = chrome.node_tree.nodes.get('Principled BSDF')
b.inputs['Base Color'].default_value = (0.92, 0.93, 0.95, 1)
b.inputs['Metallic'].default_value = 1.0
b.inputs['Roughness'].default_value = 0.12

steel = bpy.data.materials.get('Aco_Escuro')


def link(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    col.objects.link(o)
    return o


def bevel(o, width, seg=3):
    m = o.modifiers.new('Bevel', 'BEVEL')
    m.width = width
    m.segments = seg
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(40)


def smooth(o):
    for p in o.data.polygons:
        p.use_smooth = True


def cyl(name, r, depth, loc, rot=(0, 0, 0), verts=40, mat=None, chamfer=0.6):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = link(bpy.context.active_object)
    o.name = name
    if chamfer:
        bevel(o, chamfer, 2)
    o.data.materials.append(mat or chrome)
    smooth(o)
    return o


def box(name, size, loc, mat=None, radius=1.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = link(bpy.context.active_object)
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    bevel(o, radius, 3)
    o.data.materials.append(mat or chrome)
    smooth(o)
    return o


def yoke(prefix, flip):
    """Garfo: cubo (hub) + duas orelhas com ponta arredondada. flip=True: aponta para baixo e gira 90°."""
    parts = []
    sgn = -1 if flip else 1
    hub_z = -sgn * 17
    parts.append(cyl(f'{prefix}_Cubo', 9.5, 12, (0, 0, hub_z)))
    parts.append(cyl(f'{prefix}_Pescoco', 7, 10, (0, 0, hub_z - sgn * 9)))
    for s in (1, -1):
        # orelha: placa + ponta cilíndrica no eixo da cruzeta
        parts.append(box(f'{prefix}_Orelha{s}', (5.5, 16, 15), (s * 11.5, 0, -sgn * 7.5), radius=1.2))
        parts.append(cyl(f'{prefix}_Ponta{s}', 8, 5.5, (s * 11.5, 0, 0), rot=(0, math.pi / 2, 0)))
        # tampa do rolamento da cruzeta
        parts.append(cyl(f'{prefix}_Rolamento{s}', 4.6, 2.2, (s * 15.2, 0, 0), rot=(0, math.pi / 2, 0), mat=steel, chamfer=0.4))
    if flip:
        for o in parts:
            o.rotation_euler.rotate_axis('Z', math.pi / 2)
            o.location.rotate(__import__('mathutils').Euler((0, 0, math.pi / 2)))
    return parts


parts = yoke('GarfoInf', False) + yoke('GarfoSup', True)
# cruzeta
parts.append(box('Cruzeta_Centro', (9, 9, 9), (0, 0, 0), radius=1.5))
parts.append(cyl('Cruzeta_X', 3.4, 30, (0, 0, 0), rot=(0, math.pi / 2, 0), verts=24, chamfer=0.3))
parts.append(cyl('Cruzeta_Y', 3.4, 30, (0, 0, 0), rot=(math.pi / 2, 0, 0), verts=24, chamfer=0.3))

empty = bpy.data.objects.new('kardan-top', None)
col.objects.link(empty)
for o in parts:
    o.parent = empty
print('peças', len(parts))
