import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .database import init_db
from .routers.layout import router as layout_router
from .routers.simulation import router as simulation_router

app = FastAPI(title="Sorting Center Simulator")

app.include_router(layout_router, prefix="/api")
app.include_router(simulation_router, prefix="/api")

frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


@app.on_event("startup")
def startup():
    init_db()
