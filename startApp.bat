@echo off
echo ===================================================
echo       Starting CAT Prep AI Application...
echo ===================================================

:: 0. install all requirements
CALL .\dev_scripts\init_setup.ps1

:: 1. Set your required Environment Variables here
set OPENAI_API_KEY=your_actual_openai_api_key_here

:: 2. Start the Python FastAPI Backend in a new dedicated window
:: (This assumes you have a virtual environment named 'venv'. If not, remove "venv\Scripts\activate &&")
echo [1/2] Booting FastAPI Backend on Port 8000...
start "CAT Backend Server" cmd /k "venv\Scripts\activate && python main.py"

:: Wait 3 seconds to let the backend initialize ChromaDB before frontend hits it
timeout /t 3 /nobreak >nul

:: 3. Start the Next.js Frontend in a new dedicated window
echo [2/2] Booting Next.js Frontend on Port 3000...
start "CAT Frontend UI" cmd /k "cd cat-frontend && npm run dev"

echo.
echo Launch sequence complete! Your app should be live momentarily.
echo - Backend API Docs: http://localhost:8000/docs
echo - Frontend App: http://localhost:3000
echo ===================================================
pause