import os
import bpy

# REPO (raiz do repositório) é definido pelo bl.py antes de executar o script
REPO = globals().get('REPO') or os.environ.get('STEWART_REPO', '')
if not REPO:
    raise RuntimeError('Rode pelo bl.py ou defina STEWART_REPO com a raiz do repositório')

OUT = os.path.join(REPO, 'interface', 'web', 'public', 'models')
JOBS = {'Stewart_Atuador': 'actuator-housing', 'Stewart_Kardan': 'kardan-top', 'Stewart_Driver': 'driver-board', 'Stewart_Fonte': 'power-supply', 'Stewart_Disjuntor': 'breaker', 'Stewart_Bornes': 'terminal-strip', 'Stewart_BornesAzul': 'terminal-strip-blue', 'Stewart_DB37': 'db37-female', 'Stewart_Emergencia': 'estop'}

layer_root = bpy.context.view_layer.layer_collection.children['Stewart']
# deixa todas as coleções visíveis durante a exportação (objetos escondidos
# continuam selecionados e o select_all não os desmarca)
visibility = {lc.name: lc.hide_viewport for lc in layer_root.children}
for lc in layer_root.children:
    lc.hide_viewport = False
report = []
for col_name, file_name in JOBS.items():
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    col = bpy.data.collections[col_name]
    # só as peças visíveis (os cortadores dos booleanos ficam escondidos)
    meshes = [o for o in col.objects if o.type == 'MESH' and not o.hide_get()]
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    path = os.path.join(OUT, file_name + '.glb')
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_animations=False,
    )
    report.append(f'{file_name}: {len(meshes)} peças, {os.path.getsize(path) / 1024:.0f} KB')
bpy.ops.object.select_all(action="DESELECT")
for lc in layer_root.children:
    lc.hide_viewport = visibility[lc.name]
print('\n'.join(report))
