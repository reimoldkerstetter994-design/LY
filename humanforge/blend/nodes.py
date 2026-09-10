"""Helpers for building shader node graphs.

Node graphs written straight against ``bpy`` become a wall of
``links.new(a.outputs[3], b.inputs[7])``: unreadable, and quietly wrong when a
release inserts a socket.  The helpers here take and return *sockets* rather than
nodes, so a graph reads as ordinary nested expressions, and they accept a plain
number wherever a socket would do.  Where Blender itself is ambiguous -- the Mix
node exposes four sockets called ``A`` -- the right one is pinned down by data
type instead of being guessed at each call site.
"""

from __future__ import annotations

from typing import Any

import bpy

Value = Any
"""A ``NodeSocket``, or a number/tuple to use as a constant."""

# ShaderNodeMix keeps one socket per data type under the same name, so the
# indices are spelled out once here.
_MIX_SOCKETS = {
    "FLOAT": {"a": 2, "b": 3, "result": 0},
    "VECTOR": {"a": 4, "b": 5, "result": 1},
    "RGBA": {"a": 6, "b": 7, "result": 2},
}


class Graph:
    """A node tree plus a cursor, so nodes lay themselves out left to right."""

    def __init__(self, tree: bpy.types.NodeTree) -> None:
        self.tree = tree
        self._x = -2000.0
        self._y = 0.0

    # -- plumbing ---------------------------------------------------------

    def add(self, kind: str, name: str = "", **settings: Any) -> bpy.types.Node:
        node = self.tree.nodes.new(kind)
        if name:
            node.name = node.label = name
        for key, value in settings.items():
            setattr(node, key, value)
        node.location = (self._x, self._y)
        self._x += 230.0
        if self._x > 500.0:
            self._x = -2000.0
            self._y -= 340.0
        return node

    def link(self, source: bpy.types.NodeSocket, target: bpy.types.NodeSocket) -> None:
        self.tree.links.new(source, target)

    def feed(self, node: bpy.types.Node, socket: Any, value: Value) -> None:
        """Set one input from either a socket or a constant."""
        target = node.inputs[socket]
        if isinstance(value, bpy.types.NodeSocket):
            self.link(value, target)
        elif isinstance(value, (tuple, list)):
            target.default_value = tuple(value)
        else:
            target.default_value = float(value)

    # -- expressions ------------------------------------------------------

    def math(
        self, operation: str, first: Value, second: Value = None, third: Value = None
    ) -> bpy.types.NodeSocket:
        node = self.add("ShaderNodeMath", operation=operation)
        for index, argument in enumerate((first, second, third)):
            if argument is not None:
                self.feed(node, index, argument)
        return node.outputs[0]

    def clamp(
        self, value: Value, low: float, high: float
    ) -> bpy.types.NodeSocket:
        return self.math("MINIMUM", self.math("MAXIMUM", value, low), high)

    def mix(
        self, data_type: str, factor: Value, a: Value, b: Value
    ) -> bpy.types.NodeSocket:
        """Mix ``a`` towards ``b`` by ``factor``."""
        node = self.add("ShaderNodeMix", data_type=data_type)
        sockets = _MIX_SOCKETS[data_type]
        self.feed(node, 0, factor)
        self.feed(node, sockets["a"], a)
        self.feed(node, sockets["b"], b)
        return node.outputs[sockets["result"]]

    def blend(
        self, blend_type: str, factor: Value, a: Value, b: Value
    ) -> bpy.types.NodeSocket:
        """Composite two colours with a blend mode (``MULTIPLY``, ``OVERLAY``...)."""
        node = self.add("ShaderNodeMix", data_type="RGBA", blend_type=blend_type)
        sockets = _MIX_SOCKETS["RGBA"]
        self.feed(node, 0, factor)
        self.feed(node, sockets["a"], a)
        self.feed(node, sockets["b"], b)
        return node.outputs[sockets["result"]]

    def ramp(
        self, factor: Value, *stops: tuple[float, tuple[float, ...]]
    ) -> bpy.types.NodeSocket:
        """A colour ramp over ``factor``, from ``(position, colour)`` pairs."""
        node = self.add("ShaderNodeValToRGB")
        elements = node.color_ramp.elements
        while len(elements) > 1:
            elements.remove(elements[-1])
        for index, (position, colour) in enumerate(stops):
            element = elements[0] if index == 0 else elements.new(position)
            element.position = position
            element.color = tuple(colour) + (1.0,) * (4 - len(colour))
        self.feed(node, "Fac", factor)
        return node.outputs["Color"]

    def attribute(self, name: str) -> bpy.types.NodeSocket:
        """The scalar value of a named vertex attribute."""
        node = self.add("ShaderNodeAttribute", f"attr_{name}", attribute_name=name)
        return node.outputs["Fac"]

    def noise(
        self,
        vector: Value,
        scale: float,
        detail: float = 4.0,
        roughness: float = 0.55,
        distortion: float = 0.0,
        name: str = "",
    ) -> bpy.types.NodeSocket:
        node = self.add("ShaderNodeTexNoise", name)
        self.feed(node, "Vector", vector)
        self.feed(node, "Scale", scale)
        self.feed(node, "Detail", detail)
        self.feed(node, "Roughness", roughness)
        self.feed(node, "Distortion", distortion)
        return node.outputs["Fac"]

    def voronoi(
        self,
        vector: Value,
        scale: float,
        randomness: float = 1.0,
        feature: str = "F1",
        name: str = "",
    ) -> bpy.types.NodeSocket:
        node = self.add("ShaderNodeTexVoronoi", name, feature=feature)
        self.feed(node, "Vector", vector)
        self.feed(node, "Scale", scale)
        self.feed(node, "Randomness", randomness)
        return node.outputs["Distance"]

    def bump(
        self,
        height: Value,
        strength: float,
        distance: float,
        normal: Value = None,
        name: str = "",
    ) -> bpy.types.NodeSocket:
        node = self.add("ShaderNodeBump", name)
        self.feed(node, "Height", height)
        self.feed(node, "Strength", strength)
        self.feed(node, "Distance", distance)
        if normal is not None:
            self.feed(node, "Normal", normal)
        return node.outputs["Normal"]

    def separate(self, vector: Value) -> tuple[bpy.types.NodeSocket, ...]:
        node = self.add("ShaderNodeSeparateXYZ")
        self.feed(node, "Vector", vector)
        return node.outputs["X"], node.outputs["Y"], node.outputs["Z"]

    def combine(self, x: Value, y: Value, z: Value = 0.0) -> bpy.types.NodeSocket:
        node = self.add("ShaderNodeCombineXYZ")
        for socket, value in (("X", x), ("Y", y), ("Z", z)):
            self.feed(node, socket, value)
        return node.outputs["Vector"]

    def principled(self, name: str, **settings: Any) -> bpy.types.Node:
        """A Principled BSDF already wired to the material output."""
        node = self.add("ShaderNodeBsdfPrincipled", name, **settings)
        output = self.add("ShaderNodeOutputMaterial")
        self.link(node.outputs["BSDF"], output.inputs["Surface"])
        return node


def new_material(name: str) -> tuple[bpy.types.Material, Graph]:
    """A fresh node-based material with the default nodes cleared out."""
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    material.node_tree.nodes.clear()
    return material, Graph(material.node_tree)


def srgb(*channels: float) -> tuple[float, float, float, float]:
    """Convert an sRGB colour to the linear values Blender's sockets expect.

    Skin references are always quoted as sRGB hex or 0-255 triples, and feeding
    those straight into a linear renderer washes out the midtones badly, so the
    transfer function is applied here rather than eyeballed away later.
    """
    linear = []
    for channel in channels:
        c = channel / 255.0 if channel > 1.0 else channel
        linear.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (*linear, 1.0)
