import os

import bpy

# REPO (raiz do repositório) é definido pelo bl.py antes de executar o script
REPO = globals().get('REPO') or os.environ.get('STEWART_REPO', '')
if not REPO:
    raise RuntimeError('Rode pelo bl.py ou defina STEWART_REPO com a raiz do repositório')

scene = bpy.context.scene
# 1 unidade do Blender = 1 mm (só a exibição muda; o glTF exporta os números como estão)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 0.001
scene.unit_settings.length_unit = 'MILLIMETERS'

root = bpy.data.collections.get('Stewart') or bpy.data.collections.new('Stewart')
if root.name not in scene.collection.children:
    scene.collection.children.link(root)
ref = bpy.data.collections.get('Stewart_Referencia') or bpy.data.collections.new('Stewart_Referencia')
if ref.name not in root.children:
    root.children.link(ref)

# esconde a cena padrão só no viewport (não apaga nada)
for name in ('Cube',):
    o = bpy.data.objects.get(name)
    if o:
        o.hide_set(True)

path = os.path.join(REPO, '3D-drawings-archives', 'kardan-joint', 'kardan-joint.stl')
before = set(bpy.data.objects)
bpy.ops.wm.stl_import(filepath=path)
new = [o for o in bpy.data.objects if o not in before]
for o in new:
    for c in list(o.users_collection):
        c.objects.unlink(o)
    ref.objects.link(o)
    o.name = 'Ref_BlocoAzul_STL'
    print(o.name, 'dims', tuple(round(d, 2) for d in o.dimensions), 'verts', len(o.data.vertices))

# enquadra no viewport
for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        with bpy.context.temp_override(area=area, region=area.regions[-1]):
            bpy.ops.object.select_all(action='DESELECT')
            for o in new:
                o.select_set(True)
            bpy.context.view_layer.objects.active = new[0]
            bpy.ops.view3d.view_selected()
        area.spaces[0].shading.type = 'SOLID'
        area.spaces[0].clip_end = 100000
