import math
import bpy
from mathutils import Euler, Vector

# parâmetros podem ser trocados por quem chama (substituição de texto simples)
CENTER = (20, 0, 190)
ROT_DEG = (68, 0, 38)
DIST = 820
SHOW = ['Stewart_Atuador']

for name in ('Stewart_Referencia', 'Stewart_Atuador', 'Stewart_Kardan'):
    c = bpy.data.collections.get(name)
    if c:
        lc = bpy.context.view_layer.layer_collection.children['Stewart'].children.get(name)
        if lc:
            lc.hide_viewport = name not in SHOW

for area in bpy.context.screen.areas:
    if area.type == 'VIEW_3D':
        space = area.spaces[0]
        space.shading.type = 'MATERIAL'
        space.overlay.show_floor = False
        space.overlay.show_axis_x = space.overlay.show_axis_y = False
        space.overlay.show_extras = False
        r3d = space.region_3d
        r3d.view_perspective = 'PERSP'
        r3d.view_location = Vector(CENTER)
        r3d.view_rotation = Euler(tuple(math.radians(a) for a in ROT_DEG)).to_quaternion()
        r3d.view_distance = DIST
        space.clip_start = 1
        space.clip_end = 100000
