#!/bin/bash
# Start both backend and frontend development servers

echo "Starting South Asian Health Platform..."

# Backend
echo "→ Starting FastAPI backend on http://localhost:8000"
cd "$(dirname "$0")/backend"
source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Frontend
echo "→ Starting Next.js frontend on http://localhost:3000"
cd "$(dirname "$0")/frontend"
PATH="/tmp:$PATH" npm run dev &
FRONTEND_PID=$!

echo ""
echo "Platform running:"
echo "  Frontend:  http://localhost:3000"
echo "  Backend:   http://localhost:8000"
echo "  API docs:  http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop both servers."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT
wait
