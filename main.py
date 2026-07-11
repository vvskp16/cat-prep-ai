# main.py
import uvicorn

if __name__ == "__main__":
    print("🚀 Initializing CAT Prep AI Backend Server...")
    print("📡 Directing web traffic to http://127.0.0.1:8000")
    
    # This programmatically boots Uvicorn and points it to your api.py app object
    uvicorn.run(
        "api:app", 
        host="127.0.0.1", 
        port=8000, 
        reload=True
    )