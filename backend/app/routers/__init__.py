from .auth import router as auth_router
from .catalog import router as catalog_router
from .vods import router as vods_router

__all__ = ["auth_router", "catalog_router", "vods_router"]
