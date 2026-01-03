# 🔍 Scan2Go

> **File Management System with QR Code Access**

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://hub.docker.com/r/mpmk/scan2go)
[![Max File Size](https://img.shields.io/badge/Max%20File%20Size-10GB-brightgreen)]()

### 🚀 Supports files up to **10GB** per upload!

---

## 📋 Table of Contents

- [Overview](#-overview)
- [Features](#-features)
- [Quick Start - All-in-One](#-quick-start---all-in-one)
- [Microservices Deployment](#-microservices-deployment)
- [Docker Hub Images](#-docker-hub-images)
- [Environment Variables](#-environment-variables)
- [Development Setup](#-development-setup)
- [API Documentation](#-api-documentation)

---

## 🎯 Overview

**Scan2Go** is a modern file management system that allows users to:

- 📤 Upload files and organize them into projects and sections
- � **Support for large files up to 10GB**
- �📱 Generate QR codes for instant file access
- 📥 Download files individually or as ZIP archives
- 🏷️ Tag files for easy searching and filtering

---

## ✨ Features

| Feature                    | Description                                       |
| -------------------------- | ------------------------------------------------- |
| � **Large File Support**   | Upload files up to **10GB** per file              |
| �📁 **Project Management** | Create and organize projects with custom images   |
| 📂 **Sections**            | Group files into logical sections within projects |
| 📱 **QR Code Generation**  | Auto-generated QR codes for each uploaded file    |
| 🔍 **Search**              | Search files by name, section, or tags            |
| 📦 **Bulk Export**         | Export all QR codes or files as ZIP archives      |
| 🎨 **Modern UI**           | Glassmorphism design with responsive layout       |

---

## 🚀 Quick Start - All-in-One

> **Recommended for simple deployments** - Single container with all services included.

### Option 1: Docker Run

```bash
docker run -d \
  --name scan2go \
  -p 80:80 \
  -e POSTGRES_PASSWORD=YourSecurePassword123! \
  -e FRONTEND_URLS=http://YOUR_SERVER_IP \
  -v scan2go-uploads:/app/uploads \
  -v scan2go-db:/var/lib/postgresql/data \
  --restart unless-stopped \
  mpmk/scan2go:v1.5
```

### Option 2: Docker Compose

Create a file `docker-compose.yml`:

```yaml
# Scan2Go - All-in-One Docker Compose
# Single container with Frontend + Backend + Database

services:
  scan2go:
    image: mpmk/scan2go:v1.5
    container_name: scan2go
    restart: unless-stopped
    ports:
      - "80:80"
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-scan2go}
      POSTGRES_USER: ${POSTGRES_USER:-scan2go}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-Password123!}
      FRONTEND_URLS: ${FRONTEND_URLS:-http://localhost}
    volumes:
      - scan2go-uploads:/app/uploads
      - scan2go-logs:/app/logs
      - scan2go-db:/var/lib/postgresql/data

volumes:
  scan2go-uploads:
    name: scan2go-uploads
  scan2go-logs:
    name: scan2go-logs
  scan2go-db:
    name: scan2go-db
```

Create a file `.env`:

```env
# Database Configuration
POSTGRES_DB=scan2go
POSTGRES_USER=scan2go
POSTGRES_PASSWORD=YourSecurePassword123!

# Server Configuration (REQUIRED)
FRONTEND_URLS=http://YOUR_SERVER_IP
```

> ⚠️ **Required:** Replace `YOUR_SERVER_IP` with your server's IP address or domain name for QR codes to work correctly!

Start:

```bash
docker compose up -d
```

**Access:** http://YOUR_SERVER_IP

---

## 🔧 Microservices Deployment

> **Recommended for production** - Separate containers for better scalability and maintenance.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (Port 80)                       │
│                     mpmk/scan2go:frontend-v1.5               │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Backend (Port 6301)                        │
│                   mpmk/scan2go:backend-v1.5                  │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Database (Port 5432)                       │
│                   postgres:18                                │
└─────────────────────────────────────────────────────────────┘
```

### Docker Compose

Create a file `docker-compose.yml`:

```yaml
# Scan2Go - Microservices Deployment
# Separate containers for Frontend, Backend, and Database

services:
  # ============================================
  # Frontend - React with Nginx
  # ============================================
  frontend:
    image: mpmk/scan2go:frontend-v1.5
    container_name: s2g-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - scan2go-network

  # ============================================
  # Backend - Express.js API
  # ============================================
  backend:
    image: mpmk/scan2go:backend-v1.5
    container_name: s2g-backend
    restart: unless-stopped
    environment:
      SERVER_IP: 0.0.0.0
      SERVER_PORT: 6301
      FRONTEND_URLS: ${FRONTEND_URLS:-http://localhost}
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: ${POSTGRES_DB:-scan2go}
      DB_USER: ${POSTGRES_USER:-scan2go}
      DB_PASSWORD: ${POSTGRES_PASSWORD:-Password123!}
    volumes:
      - uploads-data:/app/uploads
      - logs-data:/app/logs
    depends_on:
      db:
        condition: service_healthy
    networks:
      - scan2go-network

  # ============================================
  # Database - PostgreSQL 18
  # ============================================
  db:
    image: postgres:18
    container_name: s2g-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-scan2go}
      POSTGRES_USER: ${POSTGRES_USER:-scan2go}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-Password123!}
    volumes:
      - db-data:/var/lib/postgresql
    healthcheck:
      test:
        [
          "CMD-SHELL",
          "pg_isready -U ${POSTGRES_USER:-scan2go} -d ${POSTGRES_DB:-scan2go}",
        ]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    networks:
      - scan2go-network

volumes:
  db-data:
  uploads-data:
  logs-data:

networks:
  scan2go-network:
```

Create a file `.env`:

```env
# Database Configuration
POSTGRES_DB=scan2go
POSTGRES_USER=scan2go
POSTGRES_PASSWORD=YourSecurePassword123!

# Server Configuration (REQUIRED)
FRONTEND_URLS=http://YOUR_SERVER_IP
```

> ⚠️ **Required:** Replace `YOUR_SERVER_IP` with your server's IP address or domain name for QR codes to work correctly!

Start:

```bash
docker compose up -d
```

**Access:** http://YOUR_SERVER_IP

---

## 🐳 Docker Hub Images

| Image          | Tag             | Description                         |
| -------------- | --------------- | ----------------------------------- |
| `mpmk/scan2go` | `v1.5`          | 📦 All-in-One (Frontend+Backend+DB) |
| `mpmk/scan2go` | `latest`        | 📦 Latest All-in-One                |
| `mpmk/scan2go` | `frontend-v1.5` | 🎨 Microservice: React + Nginx      |
| `mpmk/scan2go` | `backend-v1.5`  | 🖥️ Microservice: Express.js API     |

### Pull Commands

```bash
# All-in-One
docker pull mpmk/scan2go:v1.5

# Microservices
docker pull mpmk/scan2go:frontend-v1.5
docker pull mpmk/scan2go:backend-v1.5
```

---

## ⚙️ Environment Variables

### All-in-One Deployment

| Variable            | Description                       | Default            | Required |
| ------------------- | --------------------------------- | ------------------ | -------- |
| `POSTGRES_DB`       | Database name                     | `scan2go`          | ❌       |
| `POSTGRES_USER`     | Database user                     | `scan2go`          | ❌       |
| `POSTGRES_PASSWORD` | Database password                 | `Password123!`     | ✅       |
| `FRONTEND_URLS`     | Server URL for QR code generation | `http://localhost` | ✅       |

### Microservices Deployment

#### Backend Service

| Variable        | Description                                                                       | Default            | Required |
| --------------- | --------------------------------------------------------------------------------- | ------------------ | -------- |
| `SERVER_IP`     | IP address the server listens on. `0.0.0.0` = all interfaces (required in Docker) | `0.0.0.0`          | ❌       |
| `SERVER_PORT`   | Port the Express server runs on                                                   | `6301`             | ❌       |
| `FRONTEND_URLS` | Server URL for QR code generation (your server's public IP/domain)                | `http://localhost` | ✅       |
| `DB_HOST`       | PostgreSQL host (use `db` for Docker network)                                     | `localhost`        | ✅       |
| `DB_PORT`       | PostgreSQL port                                                                   | `5432`             | ❌       |
| `DB_NAME`       | Database name                                                                     | `scan2go`          | ❌       |
| `DB_USER`       | Database user                                                                     | `scan2go`          | ❌       |
| `DB_PASSWORD`   | Database password                                                                 | `Password123!`     | ✅       |

#### Database Service (PostgreSQL)

| Variable            | Description       | Default        | Required |
| ------------------- | ----------------- | -------------- | -------- |
| `POSTGRES_DB`       | Database name     | `scan2go`      | ❌       |
| `POSTGRES_USER`     | Database user     | `scan2go`      | ❌       |
| `POSTGRES_PASSWORD` | Database password | `Password123!` | ✅       |

### Variable Details

| Variable            | Explanation                                                                                                                                                                                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SERVER_IP=0.0.0.0` | Tells the Express server to listen on **all network interfaces**. Required in Docker so the container can receive requests from outside. If set to `127.0.0.1`, only connections from inside the container would work.                               |
| `FRONTEND_URLS`     | Used to generate QR code URLs. When a file is uploaded, the backend uses this URL to create the download link embedded in the QR code. **Must be your server's public IP or domain** (e.g., `http://192.168.1.100` or `http://scan2go.example.com`). |
| `DB_HOST=db`        | In Docker Compose, services can communicate using their service name. The backend connects to PostgreSQL using `db` as the hostname because that's the service name defined in the compose file.                                                     |

> ⚠️ **Important:** Set `FRONTEND_URLS` to your server's IP or domain for QR codes to work correctly!

---

## 💻 Development Setup

### Prerequisites

- 📦 Node.js 20+
- 🐘 PostgreSQL 18+
- 🐳 Docker (optional)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/MPMK39/Scan2Go.git
cd Scan2Go

# 2. Start Database (using Docker)
docker run -d --name s2g-db \
  -e POSTGRES_DB=scan2go \
  -e POSTGRES_USER=scan2go \
  -e POSTGRES_PASSWORD=Password123! \
  -p 5432:5432 \
  postgres:18

# 3. Start Backend
cd s2g-express
cp .env.example .env  # Edit with your settings
npm install
npm run dev

# 4. Start Frontend
cd ../s2g-react
npm install
npm start
```

---

## 📡 API Endpoints

| Method   | Endpoint                            | Description        |
| -------- | ----------------------------------- | ------------------ |
| `GET`    | `/api/projects`                     | Get all projects   |
| `POST`   | `/api/projects`                     | Create project     |
| `PUT`    | `/api/projects/:id`                 | Update project     |
| `DELETE` | `/api/projects/:id`                 | Delete project     |
| `GET`    | `/api/sections/project/:id`         | Get sections       |
| `POST`   | `/api/sections`                     | Create section     |
| `PUT`    | `/api/sections/:id`                 | Update section     |
| `DELETE` | `/api/sections/:id`                 | Delete section     |
| `GET`    | `/api/uploadFile/files/:sectionId`  | Get files          |
| `POST`   | `/api/uploadFile/upload`            | Upload file        |
| `GET`    | `/api/uploadFile/download/:id`      | Download ZIP       |
| `GET`    | `/api/uploadFile/download-file/:id` | Download file (QR) |

---

## 📁 Project Structure

```
Scan2Go/
├── 📁 s2g-express/              # 🖥️ Backend API
│   ├── routes/                  # API routes
│   ├── uploads/                 # Uploaded files
│   ├── server.js                # Entry point
│   └── .env.example             # Environment template
│
├── 📁 s2g-react/                # 🎨 Frontend App
│   ├── src/                     # React source
│   ├── build/                   # Production build
│   └── .env.example             # Environment template
│
├── 📁 nginx/                    # 🔀 Nginx configs
│   ├── nginx-allinone.conf      # All-in-one config
│   └── nginx-microservices.conf # Microservices config
│
├── 📁 supervisor/               # 🔄 Supervisor config
│   └── supervisord.conf         # Process manager
│
├── 🐳 Dockerfile.allinone       # All-in-one image
├── 🐳 Dockerfile.frontend       # Frontend microservice
├── 🐳 Dockerfile.backend        # Backend microservice
├── 📄 docker-compose.allinone.yml      # All-in-one deploy
├── 📄 docker-compose.microservices.yml # Microservices deploy
└── 📖 README.md
```

---

## 🔒 Security

> ⚠️ **Before deploying to production:**

- 🔑 Change all default passwords
- 🔐 Use strong passwords (16+ chars)
- 🚫 Never commit `.env` files
- 🛡️ Enable HTTPS in production
- 🔥 Configure firewall rules

---

<p align="center">
  Made with ❤️ by <strong>MPMK</strong>
</p>
