# Body model

`fitness/body.bin` is built by `build_body.py` from the MakeHuman base mesh and shape targets,
which MakeHuman released under CC0 1.0 (public domain): https://github.com/makehumancommunity/makehuman
(`makehuman/data/3dobjs/base.obj` and `makehuman/data/targets/macrodetails/...`).

    python3 tools/build_body.py <folder with base.obj and the .target files>

`muscle_map.py` draws where each muscle sits on the body surface. Edit it and rebuild to adjust a muscle.
