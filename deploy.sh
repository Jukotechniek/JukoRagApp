#!/bin/bash

# Deployment script voor Hostinger server
# Usage: ./deploy.sh

set -e  # Exit on error

echo "🚀 Starting deployment..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "Please copy .env.example to .env and fill in your values"
    exit 1
fi

# Pull latest code (if using git)
if [ -d .git ]; then
    echo "📥 Pulling latest code..."
    git pull || echo "⚠️  Git pull failed, continuing with current code..."
fi

# Build and start containers
echo "🔨 Building containers..."
docker compose build

echo "🚀 Starting containers..."
docker compose up -d

# Wait for containers to be healthy
echo "⏳ Waiting for containers to be healthy..."
sleep 10

# Check container status
echo "📊 Container status:"
docker compose ps

# Show logs
echo ""
echo "📋 Recent logs:"
docker compose logs --tail=50

echo ""
echo "✅ Deployment complete!"
echo ""
echo "To view logs: docker compose logs -f"
echo "To stop: docker compose down"
echo "To restart: docker compose restart"


