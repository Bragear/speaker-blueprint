# HULL MK I

A two-way speaker, taken apart as you scroll. Design learning day, 29 Oct 2026.

Model built in Blender via Claude, page in Three.js, hosted on GitHub Pages.

## How it is made

- `model/build_speaker.py` builds the eight parts in Blender from boxes, cylinders, cones and spheres, and exports `model/speaker.glb`. Run it inside Blender (Claude did, through the Blender MCP add-on) or headless: `blender --background --python model/build_speaker.py`.
- `main.js` loads the model with Three.js, draws every part as a translucent fill with white edge lines, pulls the parts apart as you scroll, lets you drag to spin, and shows a note when you tap a part. The eight names in `PARTS` must match the object names in Blender.
- `index.html` and `style.css` are the drawing sheet: grid, frame, title block, parts list, dimension lines.
