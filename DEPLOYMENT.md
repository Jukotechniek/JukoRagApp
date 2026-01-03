# Deployment Guide - Hostinger Server

Deze guide helpt je om de DocuBot Assistant te deployen op je Hostinger server met Docker.

## Vereisten

- Hostinger VPS of Dedicated Server met Docker en Docker Compose geïnstalleerd
- SSH toegang tot je server
- Domain naam geconfigureerd (optioneel maar aanbevolen)

## Stap 1: Server Setup

### Docker installeren (als nog niet geïnstalleerd)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Add user to docker group (vervang 'username' met je username)
sudo usermod -aG docker $USER

# Logout en login opnieuw, of:
newgrp docker

# Verify installation
docker --version
docker compose version
```

## Stap 2: Code uploaden naar server

### Optie A: Via Git (Aanbevolen)

```bash
# Op je server
cd /var/www  # of een andere directory
git clone <your-repository-url> docubot-assistant
cd docubot-assistant
```

### Optie B: Via SFTP/SCP

Upload alle bestanden naar je server via FileZilla of scp:

```bash
# Van je lokale machine
scp -r . user@your-server-ip:/var/www/docubot-assistant
```

## Stap 3: Environment Variables configureren

```bash
# Maak .env bestand
cd /var/www/docubot-assistant
cp .env.example .env
nano .env
```

Vul alle environment variables in:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key
SUPABASE_ANON_KEY=your-anon-key

# OpenAI
OPENAI_API_KEY=sk-...

# CORS - BELANGRIJK: Update met je productie domain
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Site URL - Update met je productie domain
NEXT_PUBLIC_SITE_URL=https://yourdomain.com

# Python API URL - Voor Docker gebruik je de service name
PYTHON_API_URL=http://python-api:8000
NEXT_PUBLIC_PYTHON_API_URL=http://python-api:8000
```

**BELANGRIJK:** 
- Update `ALLOWED_ORIGINS` met je echte domain
- Update `NEXT_PUBLIC_SITE_URL` met je echte domain
- Zorg dat je `.env` bestand NIET in Git komt (staat al in .gitignore)

## Stap 4: Build en Start Containers

```bash
# Build en start containers
docker compose up -d --build

# Bekijk logs
docker compose logs -f

# Check status
docker compose ps
```

## Stap 5: Nginx Reverse Proxy (Aanbevolen)

Als je een domain hebt, gebruik Nginx als reverse proxy:

### Install Nginx

```bash
sudo apt install nginx -y
```

### Nginx Config

Maak een config bestand:

```bash
sudo nano /etc/nginx/sites-available/docubot
```

Voeg toe:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Redirect HTTP to HTTPS (na SSL setup)
    # return 301 https://$server_name$request_uri;

    # Voor nu: HTTP config
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Proxy Python API (als je het extern beschikbaar wilt maken)
    location /api/python/ {
        proxy_pass http://localhost:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Activeer config:

```bash
sudo ln -s /etc/nginx/sites-available/docubot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### SSL Certificaat (Let's Encrypt)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Auto-renewal is automatisch geconfigureerd
```

## Stap 6: Firewall Configuratie

```bash
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow SSH (belangrijk!)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw enable
```

## Stap 7: Monitoring en Logs

### Logs bekijken

```bash
# Alle logs
docker compose logs -f

# Alleen Python API logs
docker compose logs -f python-api

# Alleen Next.js logs
docker compose logs -f nextjs-frontend
```

### Status checken

```bash
# Container status
docker compose ps

# Health checks
docker compose ps --format "table {{.Name}}\t{{.Status}}"
```

## Updates Deployen

```bash
# Pull laatste code
cd /var/www/docubot-assistant
git pull  # of upload nieuwe bestanden

# Rebuild en restart
docker compose up -d --build

# Of alleen restart (als alleen code veranderd, geen dependencies)
docker compose restart
```

## Troubleshooting

### Containers starten niet

```bash
# Check logs
docker compose logs

# Check environment variables
docker compose config

# Rebuild zonder cache
docker compose build --no-cache
docker compose up -d
```

### Port al in gebruik

```bash
# Check welke processen poorten gebruiken
sudo netstat -tulpn | grep :3000
sudo netstat -tulpn | grep :8000

# Stop andere services of verander poorten in docker-compose.yml
```

### Memory issues

```bash
# Check memory usage
docker stats

# Als nodig: verhoog swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Database connectie problemen

- Check of Supabase URL en keys correct zijn
- Check firewall regels op Supabase dashboard
- Verify network connectivity: `curl https://your-project.supabase.co`

## Automatische Restart bij Reboot

Docker Compose containers starten automatisch bij reboot als je `restart: unless-stopped` gebruikt (staat al in docker-compose.yml).

Voor extra zekerheid:

```bash
# Enable Docker service
sudo systemctl enable docker
```

## Backup Strategie

```bash
# Backup .env file
cp .env .env.backup

# Backup database (via Supabase dashboard of CLI)
# Backup uploaded documents (als je Supabase Storage gebruikt)
```

## Performance Optimalisatie

### Voor productie:

1. **Resource limits toevoegen** in `docker-compose.yml`:

```yaml
services:
  python-api:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '1'
          memory: 1G
```

2. **Caching optimaliseren** - gebruik een CDN voor statische assets
3. **Database connection pooling** - configureer Supabase connection pooling

## Support

Voor problemen:
1. Check logs: `docker compose logs -f`
2. Check container status: `docker compose ps`
3. Verify environment variables: `docker compose config`
4. Check Nginx logs: `sudo tail -f /var/log/nginx/error.log`




