## Scan2go

- Frontend-React:  
  This project comprises the React-based frontend component of Scan2Go. It allows users to upload files, which are then accessible via generated QR code scans. Additionally, the application enables users to download files from the backend for local storage. This frontend facilitates user interaction with the Scan2Go file management system, providing both upload and download functionalities.

- Backend-Express:  
  This project provides the backend API for Scan2Go. It handles file uploads, generates corresponding QR codes, and stores data within a PostgreSQL database. Key functions include processing file submissions, creating unique QR code identifiers, and managing data persistence. This API serves as the core data processing component for the Scan2Go application.

## Docker-compoase.yaml

```bash
services:
  frontend:
    image: mpmk/scan2go:frontend-v1.0
    container_name: frontend
    ports:
      - "80:80"
    depends_on:
      - backend
    networks:
      - scan2go_network
    restart: unless-stopped
  backend:
    image: mpmk/scan2go:backend-v1.0
    container_name: backend
    environment:
      SERVER_IP_REACT: 10.0.0.0  # frontend ip change this one if you change the expose port you need to had it as well ex: 10.0.0.0:3000
      POSTGRES_HOST: db
      POSTGRES_USER: scan2go
      POSTGRES_PASSWORD: password
      POSTGRES_DB: scan2go
    depends_on:
      db:
        condition: service_healthy
    networks:
      - scan2go_network
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs
    restart: unless-stopped
  db:
    image: postgres:16
    container_name: db
    environment:
      POSTGRES_PASSWORD: password
      POSTGRES_USER: scan2go
      POSTGRES_DB: scan2go
    volumes:
      - db_data:/var/lib/postgresql/data
    networks:
      - scan2go_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s
    restart: unless-stopped
volumes:
  db_data:
networks:
  scan2go_network:
```
