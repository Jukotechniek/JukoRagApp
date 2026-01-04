# Quick Start - Hostinger Deployment

## Snelle Setup (5 minuten)

### 1. Upload code naar server
```bash
# Via Git (aanbevolen)
git clone <your-repo> /var/www/docubot-assistant
cd /var/www/docubot-assistant

# Of via SFTP upload alle bestanden
```

### 2. Maak .env bestand
```bash
cp .env.example .env
nano .env
```

**Vul minimaal in:**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `ALLOWED_ORIGINS` (je domain)
- `NEXT_PUBLIC_SITE_URL` (je domain)

### 3. Deploy
```bash
# Maak deploy script executable (op Linux)
chmod +x deploy.sh

# Run deployment
./deploy.sh

# Of handmatig:
docker compose up -d --build
```

### 4. Check status
```bash
docker compose ps
docker compose logs -f
```

### 5. Configureer Nginx (optioneel maar aanbevolen)

Zie `DEPLOYMENT.md` voor volledige Nginx configuratie.

## Belangrijke URLs

- Frontend: http://your-server-ip:3000
- Python API: http://your-server-ip:8000
- Health check: http://your-server-ip:8000/api/health

## Updates

```bash
git pull
./deploy.sh
# Of:
docker compose up -d --build
```

## Troubleshooting

```bash
# Logs bekijken
docker compose logs -f

# Containers herstarten
docker compose restart

# Volledig opnieuw opstarten
docker compose down
docker compose up -d --build
```






