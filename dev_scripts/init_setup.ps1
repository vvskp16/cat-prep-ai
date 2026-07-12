Write-Host "Setting up..."

python -m venv venv 
.\venv\Scripts\Activate.ps1

pip install -r .\devops\requirements.txt

.\dev_scripts\set_envvar.ps1

Write-Host "Setup complete."