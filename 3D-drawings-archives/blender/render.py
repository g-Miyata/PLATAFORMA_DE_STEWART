"""Render Workbench de uma coleção (o viewport do MCP às vezes não atualiza).
Parâmetros trocados por sed: SHOW, TARGET, DIST, VIEWS, PREFIX."""
import os
import tempfile
import bpy
from mathutils import Vector

SHOW = 'Stewart_Driver'
TARGET = (0, 0, 5)
DIST = 140
VIEWS = {'iso': (0.6, -1.0, 1.1), 'top': (0.0, -0.001, 1.0)}
PREFIX = 'r'

OUT = os.path.join(tempfile.gettempdir(), 'stewart-renders')
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
prev = dict(cam=sc.camera, engine=sc.render.engine, x=sc.render.resolution_x, y=sc.render.resolution_y, path=sc.render.filepath,
            pct=sc.render.resolution_percentage, color=sc.display.shading.color_type)
col = bpy.data.collections[SHOW]
cam_data = bpy.data.cameras.new('TmpCam')
cam = bpy.data.objects.new('TmpCam', cam_data)
col.objects.link(cam)
sc.camera = cam
sc.render.engine = 'BLENDER_WORKBENCH'
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 900, 640, 100
sc.display.shading.light = 'STUDIO'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_cavity = True
cam_data.clip_start, cam_data.clip_end = 1, 100000
keep = set(col.objects)
hidden = []
for o in sc.objects:
    if o not in keep and not o.hide_render:
        o.hide_render = True
        hidden.append(o)
# as coleções escondidas no viewport também somem do render: libera só a mostrada
lc = bpy.context.view_layer.layer_collection.children['Stewart'].children[SHOW]
was_hidden = lc.hide_viewport
lc.hide_viewport = False
col_hide_render = col.hide_render
col.hide_render = False
target = Vector(TARGET)
for name, d in VIEWS.items():
    cam.location = target + Vector(d).normalized() * DIST
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, f'{PREFIX}_{name}.png')
    bpy.ops.render.render(write_still=True)
for o in hidden:
    o.hide_render = False
lc.hide_viewport = was_hidden
col.hide_render = col_hide_render
sc.camera = prev['cam']
sc.render.engine = prev['engine']
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = prev['x'], prev['y'], prev['pct']
sc.render.filepath = prev['path']
sc.display.shading.color_type = prev['color']
bpy.data.objects.remove(cam, do_unlink=True)
bpy.data.cameras.remove(cam_data)
print('ok')
