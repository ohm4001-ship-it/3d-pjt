"""CPU marching cubes for the official TripoSR density field.

Only surface extraction is adapted. TripoSR's neural image reconstruction and
vertex color queries still execute through the upstream TSR class on CUDA.
scikit-image returns (x, y, z) in the volume's axis order, so the torchmcubes
(z, y, x) correction used by upstream must not be applied here.
"""
import torch
from skimage.measure import marching_cubes


class MarchingCubeHelper(torch.nn.Module):
    points_range = (0, 1)

    def __init__(self, resolution: int):
        super().__init__()
        self.resolution = resolution
        self._grid_vertices = None

    @property
    def grid_vertices(self):
        if self._grid_vertices is None:
            axis = torch.linspace(0, 1, self.resolution)
            self._grid_vertices = torch.stack(
                torch.meshgrid(axis, axis, axis, indexing="ij"), dim=-1
            ).reshape(-1, 3)
        return self._grid_vertices

    def forward(self, level):
        # Upstream passes -(density - threshold); extract density's zero surface.
        volume = -level.reshape((self.resolution,) * 3).detach().cpu().numpy()
        vertices, faces, _, _ = marching_cubes(volume, level=0.0, allow_degenerate=False)
        vertices = vertices.copy() / (self.resolution - 1)
        return (
            torch.from_numpy(vertices).to(level.device),
            torch.from_numpy(faces.copy()).long().to(level.device),
        )
