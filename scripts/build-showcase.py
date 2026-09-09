"""Blender 5.x: reproducible Alpine Monarch asset, meters, +Y up / -Z forward at runtime."""
import bpy, math, os, random
from mathutils import Vector
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
MATS = {}
def mat(name, color, metal=0, rough=.5):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color,1); m.use_nodes = True
    bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Metallic'].default_value=metal; bsdf.inputs['Roughness'].default_value=rough
    MATS[name]=m
for args in [('enamel',(.045,.22,.20),.55,.3),('iron',(.025,.033,.031),.65,.46),('brass',(.62,.43,.14),.75,.3),('steel',(.42,.47,.45),.8,.32),('glass',(.23,.38,.4),.35,.24),('coal',(.022,.021,.02),0,.95),('wood',(.28,.15,.07),0,.85)]: mat(*args)
def coord(v): return (v[0],-v[2],v[1])
def empty(name,p=(0,0,0),parent=None):
    o=bpy.data.objects.new(name,None); bpy.context.collection.objects.link(o); o.location=coord(p); o.parent=parent; return o
def finish(o,name,p,material,parent):
    o.name=name; o.location=coord(p); o.data.materials.append(MATS[material]); o.parent=parent; return o
def box(name,p,s,material,parent):
    bpy.ops.mesh.primitive_cube_add(size=1); o=finish(bpy.context.object,name,p,material,parent); o.scale=(s[0],s[2],s[1]); bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); return o
def cyl(name,p,r,d,material,parent,axis='y',segments=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=segments,radius=r,depth=d); o=finish(bpy.context.object,name,p,material,parent)
    if axis=='z': o.rotation_euler.x=math.pi/2
    if axis=='x': o.rotation_euler.y=math.pi/2
    for face in o.data.polygons: face.use_smooth=len(face.vertices)==4
    return o
def build(level,segments):
    collection=bpy.data.collections.new('LOD_'+str(level)); bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.active_layer_collection=bpy.context.view_layer.layer_collection.children[collection.name]
    engine=empty('engine'); tender=empty('tender')
    box('frame',(0,.52,0),(1.4,.25,3.85),'iron',engine)
    cyl('boiler',(0,1.22,-.38),.57,2.45,'enamel',engine,'z',segments)
    cyl('smokebox',(0,1.22,-1.6),.58,.35,'iron',engine,'z',segments)
    cyl('door',(0,1.22,-1.8),.47,.08,'iron',engine,'z',segments)
    cyl('door_handle',(0,1.22,-1.87),.09,.08,'brass',engine,'z',segments)
    for z in [-1.18,-.55,.17,.69]: cyl('boiler_band',(0,1.22,z),.58,.045,'brass',engine,'z',segments)
    cyl('chimney',(0,2.03,-1.18),.19,.85,'iron',engine,segments=segments)
    cyl('chimney_lip',(0,2.47,-1.18),.25,.12,'brass',engine,segments=segments)
    cyl('steam_dome',(0,1.83,-.2),.22,.38,'brass',engine,segments=segments)
    cyl('sand_dome',(0,1.85,.4),.23,.32,'enamel',engine,segments=segments)
    box('cab_back',(0,1.39,1.57),(1.48,1.45,.12),'enamel',engine)
    box('cab_floor',(0,.83,1.13),(1.48,.13,1.03),'iron',engine)
    box('cab_roof',(0,2.17,1.13),(1.72,.15,1.27),'iron',engine)
    for x in [-.71,.71]:
        box('cab_side',(x,1.1,1.12),(.09,.6,1.05),'enamel',engine)
        for z in [.63,1.59]: box('window_frame',(x,1.76,z),(.095,.63,.1),'brass',engine)
        box('cab_glass',(x,1.76,1.12),(.025,.54,.78),'glass',engine)
        box('running_board',(x,.83,-.3),(.24,.08,2.72),'iron',engine)
        cyl('cylinder',(x,.57,-1.51),.21,.52,'iron',engine,'z',segments)
        for z in [-1.05,-.4,.25,.9]:
            wheel=empty('wheel_drive_'+str(x)+'_'+str(z),(x,.45,z),engine)
            cyl('wheel_tyre',(0,0,0),.42,.14,'steel',wheel,'x',segments)
            cyl('wheel_face',(0,0,0),.35,.155,'enamel',wheel,'x',segments)
            if level<2:
                for a in range(8):
                    spoke=box('spoke',(0,0,0),(.17,.055,.68),'brass',wheel); spoke.rotation_euler.x=a*math.pi/4
            cyl('wheel_hub',(0,0,0),.09,.2,'steel',wheel,'x',segments)
        rod=box('rod_'+str(x),(x*1.22,.45,-.075),(.075,.09,2.17),'steel',engine)
        rod['crank_radius']=.12
        for z in [-1.66,-1.98,1.52]:
            wheel=empty('wheel_small_'+str(x)+'_'+str(z),(x*.8,.27,z),engine)
            cyl('pony_wheel',(0,0,0),.24,.12,'iron',wheel,'x',max(8,segments//2))
        if level<2:
            box('handrail',(x*.86,1.58,-.45),(.035,.035,2.35),'brass',engine)
            for y,z in [(.33,1.75),(.56,1.65)]: box('cab_step',(x,y,z),(.34,.07,.32),'steel',engine)
    for z in [-2.05,1.86]:
        box('buffer_beam',(0,.53,z),(1.58,.19,.14),'enamel',engine)
        box('coupler',(0,.48,z+(-.19 if z<0 else .19)),(.17,.12,.36),'iron',engine)
        empty('coupler_front' if z<0 else 'coupler_rear',(0,.48,z+(-.35 if z<0 else .35)),engine)
    cyl('headlamp',(0,1.69,-1.91),.17,.2,'brass',engine,'z',segments)
    box('tender_frame',(0,.43,0),(1.5,.19,2.65),'iron',tender)
    box('water_tank',(0,.93,.43),(1.44,.86,1.6),'enamel',tender)
    box('coal_bunker',(0,.96,-.74),(1.44,.92,.85),'enamel',tender)
    box('coal_bed',(0,1.44,-.62),(1.25,.14,.94),'coal',tender)
    if level==0:
        rand=random.Random(7)
        for i in range(20):
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.15)
            finish(bpy.context.object,'coal_chunk',(rand.uniform(-.52,.52),1.52,rand.uniform(-1.04,-.22)),'coal',tender)
    for x in [-.75,.75]:
        box('tender_stripe',(x,1.1,.25),(.018,.055,2.15),'brass',tender)
        for z in [-.85,.85]:
            wheel=empty('wheel_tender_'+str(x)+'_'+str(z),(x,.3,z),tender)
            cyl('tender_wheel',(0,0,0),.28,.14,'steel',wheel,'x',segments)
    for z in [-1.48,1.48]:
        box('tender_coupler',(0,.48,z),(.16,.13,.42),'iron',tender)
        empty('coupler_'+str(z),(0,.48,z),tender)
    empty('smoke_emitter',(0,2.55,-1.18),engine)
    empty('steam_emitter_left',(-.86,.54,-1.5),engine)
    empty('steam_emitter_right',(.86,.54,-1.5),engine)
    # Bake static detail into one mesh per material. Keep wheel pivots and rods editable.
    for parent in [engine,tender]+[o for o in collection.objects if o.type=='EMPTY' and o.name.startswith('wheel_')]:
        for material in MATS.values():
            meshes=[o for o in collection.objects if o.type=='MESH' and o.parent==parent and not o.name.startswith('rod_') and o.data.materials[0]==material]
            if len(meshes)>1:
                bpy.ops.object.select_all(action='DESELECT')
                for o in meshes: o.select_set(True)
                bpy.context.view_layer.objects.active=meshes[0]; bpy.ops.object.join()
    bpy.ops.object.select_all(action='DESELECT')
    for o in collection.objects: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT,'public/models/alpine-monarch-lod'+str(level)+'.glb'),export_format='GLB',use_selection=True,export_yup=True,export_extras=True)
    return collection
for level,segments in [(0,32),(1,16),(2,8)]: build(level,segments)
bpy.context.scene['asset_contract']='Meters; exported +Y up, -Z forward; X wheel axles; locomotive/tender origins at rail center; named couplers and emitters. LOD0/1/2.'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT,'assets/blender/alpine-monarch.blend'))
