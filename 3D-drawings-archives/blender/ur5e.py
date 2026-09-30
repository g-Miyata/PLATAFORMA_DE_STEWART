"""UR5e (robô serial da aula de cinemática): OBJ do MuJoCo Menagerie → um .glb por elo.

Fonte: google-deepmind/mujoco_menagerie, pasta universal_robots_ur5e (BSD-3-Clause,
ROS-Industrial / Universal Robots). Baixe ur5e.xml, LICENSE e assets/*.obj numa pasta
e rode em modo CLI (cena vazia, sem mexer em nenhum .blend aberto):

    blender --background --factory-startup --python 3D-drawings-archives/blender/ur5e.py -- <pasta-da-fonte> <pasta-de-saída>

Cada elo sai no referencial do seu corpo no ur5e.xml, em metros e com Z para cima
(export_yup=False); a montagem da cadeia fica em interface/web/src/features/lesson/serial/.
Depois, otimize com:

    npx @gltf-transform/cli optimize ur5e-base.glb ur5e-base.glb --compress meshopt
"""
import os
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
if len(args) < 2:
    raise SystemExit('uso: blender --background --python ur5e.py -- <fonte> <saída>')
SRC, OUT = args[0], args[1]
os.makedirs(OUT, exist_ok=True)

# cores do ur5e.xml (rgba) — preto, cinza das juntas, cinza dos elos e o azul UR
MATERIALS = {
    'black': ((0.033, 0.033, 0.033, 1), 0.5),
    'jointgray': ((0.278, 0.278, 0.278, 1), 0.45),
    'linkgray': ((0.82, 0.82, 0.82, 1), 0.35),
    'urblue': ((0.49, 0.678, 0.8, 1), 0.4),
}
BODIES = {
    'base': [('base_0', 'black'), ('base_1', 'jointgray')],
    'shoulder': [('shoulder_0', 'urblue'), ('shoulder_1', 'black'), ('shoulder_2', 'jointgray')],
    'upperarm': [('upperarm_0', 'linkgray'), ('upperarm_1', 'black'), ('upperarm_2', 'jointgray'), ('upperarm_3', 'urblue')],
    'forearm': [('forearm_0', 'urblue'), ('forearm_1', 'linkgray'), ('forearm_2', 'black'), ('forearm_3', 'jointgray')],
    'wrist1': [('wrist1_0', 'black'), ('wrist1_1', 'urblue'), ('wrist1_2', 'jointgray')],
    'wrist2': [('wrist2_0', 'black'), ('wrist2_1', 'urblue'), ('wrist2_2', 'jointgray')],
    'wrist3': [('wrist3', 'linkgray')],
}
# alvo de triângulos por elo (o total fica em ~45 mil)
TARGET_TRIS = 6500

bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name):
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    (rgba, rough) = MATERIALS[name]
    m = bpy.data.materials.new('ur5e-' + name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = 0.0
    return m


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


report = []
for body, parts in BODIES.items():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    objs = []
    for mesh, mat in parts:
        bpy.ops.wm.obj_import(filepath=os.path.join(SRC, 'assets', mesh + '.obj'), forward_axis='Y', up_axis='Z')
        o = bpy.context.selected_objects[0]
        o.data.materials.clear()
        o.data.materials.append(material(mat))
        objs.append(o)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = 'ur5e-' + body
    before = tris(obj)
    if before > TARGET_TRIS:
        mod = obj.modifiers.new('decimate', 'DECIMATE')
        mod.ratio = TARGET_TRIS / before
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.shade_smooth_by_angle(angle=0.6)
    path = os.path.join(OUT, f'ur5e-{body}.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=False,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    report.append(f'{body}: {before} → {tris(obj)} triângulos, {os.path.getsize(path) / 1024:.0f} KB')
print('\n'.join(report))
