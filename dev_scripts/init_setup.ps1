Write-Host "Setting up..."

python -m venv venv 
.\venv\Scripts\Activate.ps1

pip install -r .\devops\requirements.txt

Write-Host "Setup complete."