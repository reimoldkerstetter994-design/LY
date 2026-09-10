"""访问 MPFB 内部服务的小工具。

MPFB 以 Blender 扩展形式安装后，包名是 ``bl_ext.<repo>.mpfb``，事先无法确定，
所以按官方脚本示例的做法：在 ``sys.modules`` 里按后缀查找。
"""

import importlib
import sys

import bpy


def ensure_mpfb_enabled():
    """确保 MPFB 扩展已启用（后台模式下有时需要手动 enable）。"""
    for addon in bpy.context.preferences.addons:
        if addon.module.endswith(".mpfb") or addon.module == "mpfb":
            return addon.module
    candidates = [m for m in sys.modules if m.endswith(".mpfb")]
    for repo in ("user_default", "blender_org"):
        module = f"bl_ext.{repo}.mpfb"
        try:
            bpy.ops.preferences.addon_enable(module=module)
            return module
        except Exception:  # pylint: disable=broad-except
            continue
    raise RuntimeError(f"MPFB 扩展未安装/无法启用。已加载模块: {candidates}。请先运行 setup/install.sh")


def dynamic_import(absolute_package_str, key):
    for module_name in list(sys.modules):
        if module_name.endswith(absolute_package_str):
            module = importlib.import_module(module_name)
            if not hasattr(module, key):
                raise AttributeError(f"模块 {module_name} 没有属性 {key}")
            return getattr(module, key)
    raise ValueError(f"找不到以 {absolute_package_str} 结尾的模块（MPFB 是否已启用？）")
