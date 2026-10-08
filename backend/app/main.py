import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .routers import auth, events, push_subs

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="Casal de Periquito", docs_url="/api/docs", openapi_url="/api/openapi.json")

UNSAFE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    # Junto com o cookie SameSite=Lax, este cabeçalho impede que outro site dispare ações em nome de vocês.
    if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
        if request.headers.get("x-requested-with") != "periquito":
            return JSONResponse({"detail": "Requisição recusada."}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/") and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    return {"ok": True}


app.include_router(auth.router)
app.include_router(events.router)
app.include_router(push_subs.router)
