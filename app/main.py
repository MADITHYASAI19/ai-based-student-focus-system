from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import auth, plans, quizzes, sessions


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title="AI Study Companion",
        description="Adaptive study planning, focus tracking, AI quiz generation, and RAG doubt-solver",
        version="0.1.0",
    )

    # Configure CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(plans.router, prefix="/api/plans", tags=["plans"])
    app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
    app.include_router(quizzes.router, prefix="/api/quizzes", tags=["quizzes"])

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "ok"}

    return app
