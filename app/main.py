from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routers import auth, doubts, documents, plans, quizzes, sessions


from app.core.config import get_settings

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
        allow_origins=[
            "http://localhost:5173",
            "http://localhost:5174",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Include routers
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(plans.router, prefix="/api/plans", tags=["plans"])
    app.include_router(sessions.router, prefix="/api/sessions", tags=["sessions"])
    app.include_router(quizzes.router, prefix="/api/quizzes", tags=["quizzes"])
    app.include_router(doubts.router, prefix="/api/doubts", tags=["doubts"])
    app.include_router(documents.router, prefix="/api/topics", tags=["documents"])

    # Validate critical settings
    settings = get_settings()
    if not settings.JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY must be provided in environment variables for security.")

    @app.get("/")
    async def root():
        """Root endpoint linking to API documentation and frontend."""
        return {
            "name": "AI Study Companion API",
            "status": "online",
            "docs": "http://localhost:8000/docs",
            "frontend": "http://localhost:5173",
        }

    @app.get("/health")
    async def health_check():
        """Health check endpoint."""
        return {"status": "ok"}

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """Global handler to prevent raw 500 responses."""
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal Server Error",
                "detail": str(exc) if app.debug else "An unexpected error occurred on the server."
            },
        )

    return app


# Create app instance for uvicorn
app = create_app()
