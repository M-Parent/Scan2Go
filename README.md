# 🔍 Scan2Go

> **File Management System with QR Code Access**

[![Docker](https://img.shields.io/badge/Docker-Ready-blue?logo=docker)](https://hub.docker.com/r/mpmk/scan2go)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

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
- 📱 Generate QR codes for instant file access
- 📥 Download files individually or as ZIP archives
- 🏷️ Tag files for easy searching and filtering

---

## ✨ Features

| Feature                   | Description                                       |
| ------------------------- | ------------------------------------------------- |
| 📁 **Project Management** | Create and organize projects with custom images   |
| 📂 **Sections**           | Group files into logical sections within projects |
| 📱 **QR Code Generation** | Auto-generated QR codes for each uploaded file    |
| 🔍 **Search**             | Search files by name, section, or tags            |
| 📦 **Bulk Export**        | Export all QR codes or files as ZIP archives      |
| 🎨 **Modern UI**          | Glassmorphism design with responsive layout       |

---

## 🚀 Quick Start - All-in-One

> **Recommended for simple deployments** - Single container with all services included.

### Option 1: Using Docker Hub Image

```bash
# Pull the all-in-one image
docker pull mpmk/scan2go:v1.5

# Run the container
docker run -d \
  --name scan2go \
  -p 80:80 \
  -e POSTGRES_PASSWORD=YourSecurePassword123! \
  -v scan2go-uploads:/app/uploads \
  -v scan2go-db:/var/lib/postgresql/data \
  mpmk/scan2go:v1.5
```

### Option 2: Using Docker Compose

1. **Create a `.env` file:**

```env
# Database
POSTGRES_DB=scan2go
POSTGRES_USER=scan2go
POSTGRES_PASSWORD=YourSecurePassword123!

# Server
FRONTEND_URLS=http://localhost,http://your-server-ip
```

2. **Create a `docker-compose.yml` file:**

```yaml
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
  scan2go-logs:
  scan2go-db:
```

3. **Start the application:**

```bash
docker-compose up -d
```

4. **Access:** http://localhost

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

### Docker Compose for Microservices

1. **Create a `.env` file:**

```env
# Database Configuration
POSTGRES_DB=scan2go
POSTGRES_USER=scan2go
POSTGRES_PASSWORD=YourSecurePassword123!

# Backend Configuration
FRONTEND_URLS=http://localhost,http://your-server-ip
```

2. **Create a `docker-compose.yml` file:**

```yaml
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
      - scan2go_network

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
      - uploads_data:/app/uploads
      - logs_data:/app/logs
    depends_on:
      db:
        condition: service_healthy
    networks:
      - scan2go_network

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
      - db_data:/var/lib/postgresql/data
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
      - scan2go_network

volumes:
  db_data:
  uploads_data:
  logs_data:

networks:
  scan2go_network:
```

3. **Start the application:**

```bash
docker-compose up -d
```

4. **Access:**
   - 🌐 **Frontend:** http://localhost
   - 🔌 **API:** http://localhost:6301/api

---

## 🐳 Docker Hub Images

| Image          | Tag             | Description                         |
| -------------- | --------------- | ----------------------------------- |
| `mpmk/scan2go` | `v1.5`          | 📦 All-in-One (Frontend+Backend+DB) |
| `mpmk/scan2go` | `latest`        | 📦 Latest All-in-One (→ v1.5)       |
| `mpmk/scan2go` | `frontend-v1.5` | 🎨 Microservice: React + Nginx      |
| `mpmk/scan2go` | `backend-v1.5`  | 🖥️ Microservice: Express.js API     |

### Pull Commands

```bash
# All-in-One (recommended)
docker pull mpmk/scan2go:v1.5
docker pull mpmk/scan2go:latest

# Microservices
docker pull mpmk/scan2go:frontend-v1.5
docker pull mpmk/scan2go:backend-v1.5
```

---

## ⚙️ Environment Variables

### 🖥️ Backend (.env)

| Variable        | Description          | Example                                 |
| --------------- | -------------------- | --------------------------------------- |
| `SERVER_IP`     | IP to bind server    | `0.0.0.0`                               |
| `SERVER_PORT`   | API port             | `6301`                                  |
| `FRONTEND_URLS` | Allowed CORS origins | `http://localhost,http://192.168.1.100` |
| `DB_HOST`       | Database host        | `db` (Docker) or `localhost`            |
| `DB_PORT`       | Database port        | `5432` (internal) or `5433` (external)  |
| `DB_NAME`       | Database name        | `scan2go`                               |
| `DB_USER`       | Database user        | `scan2go`                               |
| `DB_PASSWORD`   | Database password    | `YourSecurePassword123!`                |

**📄 Example `s2g-express/.env`:**

```env
# Server
SERVER_IP=0.0.0.0
SERVER_PORT=6301

# CORS
FRONTEND_URLS=http://localhost:3000,http://10.0.20.11

# Database
DB_HOST=localhost
DB_PORT=5433
DB_NAME=scan2go
DB_USER=scan2go
DB_PASSWORD=MyStr0ng!Passw0rd#2024
```

---

### 🎨 Frontend (.env)

| Variable            | Description     | Example                 |
| ------------------- | --------------- | ----------------------- |
| `PORT`              | Dev server port | `3005`                  |
| `REACT_APP_API_URL` | Backend API URL | `http://localhost:6301` |

**📄 Example `s2g-react/.env`:**

```env
PORT=3005
REACT_APP_API_URL=http://localhost:6301
```

> 💡 **Tip:** For Docker, leave `REACT_APP_API_URL` empty to use Nginx proxy.

---

### 🗄️ Database (.env)

| Variable            | Description       | Example                  |
| ------------------- | ----------------- | ------------------------ |
| `POSTGRES_DB`       | Database name     | `scan2go`                |
| `POSTGRES_USER`     | Database user     | `scan2go`                |
| `POSTGRES_PASSWORD` | Database password | `YourSecurePassword123!` |

**📄 Example `s2g-DB/.env`:**

```env
POSTGRES_DB=scan2go
POSTGRES_USER=scan2go
POSTGRES_PASSWORD=MyStr0ng!Passw0rd#2024
```

---

## 💻 Development Setup

### Prerequisites

- 📦 Node.js 20+
- 🐘 PostgreSQL 18+
- 🐳 Docker & Docker Compose (optional)

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/scan2go.git
cd scan2go

# 2. Start Database
cd s2g-DB
docker-compose up -d

# 3. Start Backend
cd ../s2g-express
cp .env.example .env
npm install
npm run dev

# 4. Start Frontend
cd ../s2g-react
cp .env.example .env
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
| `GET`    | `/api/uploadFile/section/:id`       | Get files          |
| `POST`   | `/api/uploadFile/upload`            | Upload file        |
| `GET`    | `/api/uploadFile/download/:id`      | Download ZIP       |
| `GET`    | `/api/uploadFile/download-file/:id` | Download file (QR) |

---

## 📁 Project Structure

```
Scan2Go_v1.0/
├── 📁 s2g-express/          # 🖥️ Backend API
│   ├── routes/              # API routes
│   ├── uploads/             # Uploaded files
│   ├── docker-compose.yml   # Standalone compose
│   └── .env                 # Environment variables
│
├── 📁 s2g-react/            # 🎨 Frontend App
│   ├── src/                 # React source
│   ├── docker-compose.yml   # Standalone compose
│   └── .env                 # Environment variables
│
├── 📁 s2g-DB/               # 🗄️ Database
│   ├── docker-compose.yml   # Standalone compose
│   └── .env                 # Environment variables
│
├── 📁 nginx/                # 🔀 Nginx config
│   └── nginx.conf           # Reverse proxy config
│
├── docker-compose.yml       # 🐳 Build from source
├── docker-compose.hub.yml   # 🐳 Docker Hub images
└── README.md                # 📖 This file
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

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ by <strong>MPMK</strong>
</p>
