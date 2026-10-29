import bpy, math

OUT_GLB = bpy.path.abspath("//../model/speaker.glb") if bpy.data.filepath else "/Users/brage.arntzen/repos/speaker-blueprint/model/speaker.glb"
OUT_GLB = "/Users/brage.arntzen/repos/speaker-blueprint/model/speaker.glb"

def clear():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    for m in list(bpy.data.meshes):
        if m.users == 0: bpy.data.meshes.remove(m)

def box(name, size, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True); return o

def cyl(name, r, depth, loc, axis='Y', r2=None, verts=48):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    else: bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=depth, location=loc)
    o = bpy.context.active_object; o.name = name
    if axis == 'Y': o.rotation_euler = (math.pi/2, 0, 0); bpy.ops.object.transform_apply(rotation=True)
    return o

def sphere(name, r, loc, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=r, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True); return o

def torus(name, R, r, loc):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, location=loc, major_segments=48, minor_segments=12)
    o = bpy.context.active_object; o.name = name; return o

def cut(target, tool):
    m = target.modifiers.new('cut', 'BOOLEAN'); m.operation = 'DIFFERENCE'; m.object = tool; m.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(tool, do_unlink=True)

def join(name, objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.active_object; o.name = name; return o

clear()
W, D, H = 0.18, 0.24, 0.30          # width, depth, height (m); front face at y = -0.12

# 8 cabinet: box with the front open
cabinet = box('cabinet', (W, D, H), (0, 0, 0))
cut(cabinet, box('cav', (W-0.036, 0.232, H-0.036), (0, -0.014, 0)))

# 2 front baffle with holes for the drivers
baffle = box('baffle', (W, 0.025, H), (0, -0.1325, 0))
cut(baffle, cyl('h1', 0.058, 0.05, (0, -0.1325, -0.05)))
cut(baffle, cyl('h2', 0.015, 0.05, (0, -0.1325, 0.095)))

# 3 woofer: flange ring, cone, dust cap, magnet
flange = cyl('w_flange', 0.066, 0.01, (0, -0.147, -0.05))
cut(flange, cyl('w_hole', 0.05, 0.03, (0, -0.147, -0.05)))
cone = cyl('w_cone', 0.02, 0.045, (0, -0.1245, -0.05), r2=0.052)
cap = sphere('w_cap', 0.016, (0, -0.104, -0.05), (1, 0.6, 1))
magnet = cyl('w_magnet', 0.035, 0.03, (0, -0.087, -0.05))
woofer = join('woofer', [flange, cone, cap, magnet])

# 4 tweeter: faceplate, dome, back can
tweeter = join('tweeter', [cyl('t_plate', 0.032, 0.006, (0, -0.148, 0.095)),
                           sphere('t_dome', 0.0125, (0, -0.149, 0.095), (1, 0.7, 1)),
                           cyl('t_can', 0.018, 0.025, (0, -0.1325, 0.095))])

# 5 bass port: tube with a flare, out the back
port = join('port', [cyl('p_tube', 0.02, 0.12, (0, 0.065, 0.085)), cyl('p_flare', 0.028, 0.006, (0, 0.122, 0.085))])
cut(port, cyl('p_bore', 0.016, 0.16, (0, 0.065, 0.085)))

# 6 crossover: PCB on the floor with two capacitors and a coil
crossover = join('crossover', [box('x_pcb', (0.09, 0.06, 0.004), (0, 0.02, -0.129)),
                               cyl('x_c1', 0.008, 0.022, (-0.025, 0.03, -0.116), axis='Z'),
                               cyl('x_c2', 0.007, 0.018, (0.03, 0.005, -0.118), axis='Z'),
                               torus('x_coil', 0.014, 0.006, (0.018, 0.033, -0.121))])

# 7 terminal cup: plate on the back with two binding posts
terminal = join('terminal', [box('k_plate', (0.06, 0.008, 0.09), (0, 0.124, -0.075)),
                             cyl('k_p1', 0.006, 0.03, (-0.015, 0.14, -0.075)),
                             cyl('k_p2', 0.006, 0.03, (0.015, 0.14, -0.075))])

# 1 grille: frame plus cloth
frame = box('g_frame', (W, 0.012, H), (0, -0.158, 0))
cut(frame, box('g_in', (W-0.022, 0.03, H-0.022), (0, -0.158, 0)))
grille = join('grille', [frame, box('g_cloth', (W-0.022, 0.002, H-0.022), (0, -0.158, 0))])

# origins at each part's centre, so labels attach to the middle of the part
for o in bpy.data.objects:
    if o.type == 'MESH':
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')

bpy.ops.object.select_all(action='DESELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', export_apply=True, export_yup=True,
                          export_materials='NONE', export_animations=False, export_cameras=False, export_lights=False)
result = {"objects": [o.name for o in bpy.data.objects], "glb": OUT_GLB}
print("RESULT", result)
