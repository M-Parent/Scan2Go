#!/bin/bash
set -e

# PostgreSQL data directory
PGDATA="/var/lib/postgresql/data"
PGBIN="/usr/lib/postgresql/18/bin"

# Create directories if needed
mkdir -p "$PGDATA"
mkdir -p /var/log/postgresql
mkdir -p /run/postgresql

# Fix permissions
chown -R postgres:postgres "$PGDATA"
chown -R postgres:postgres /var/log/postgresql
chown -R postgres:postgres /run/postgresql
chmod 700 "$PGDATA"

# Initialize PostgreSQL if needed
if [ ! -f "$PGDATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."
    su - postgres -c "$PGBIN/initdb -D $PGDATA --encoding=UTF8 --locale=C"

    # Configure PostgreSQL to accept connections
    echo "host all all 0.0.0.0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "host all all ::0/0 md5" >> "$PGDATA/pg_hba.conf"
    echo "listen_addresses = 'localhost'" >> "$PGDATA/postgresql.conf"
fi

# Start PostgreSQL
echo "Starting PostgreSQL..."
su - postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /var/log/postgresql/postgresql.log -w start" || {
    echo "PostgreSQL failed to start. Checking logs..."
    cat /var/log/postgresql/postgresql.log
    exit 1
}

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if su - postgres -c "$PGBIN/pg_isready -h localhost" > /dev/null 2>&1; then
        echo "PostgreSQL is ready!"
        break
    fi
    echo "Waiting... ($i/30)"
    sleep 1
done

# Create database and user if they don't exist
echo "Setting up database..."
su - postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='${POSTGRES_USER}'\" | grep -q 1 || psql -c \"CREATE USER ${POSTGRES_USER} WITH PASSWORD '${POSTGRES_PASSWORD}';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DB}'\" | grep -q 1 || psql -c \"CREATE DATABASE ${POSTGRES_DB} OWNER ${POSTGRES_USER};\""
su - postgres -c "psql -c \"GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB} TO ${POSTGRES_USER};\""

# Stop PostgreSQL (supervisor will restart it)
echo "Stopping PostgreSQL (supervisor will manage it)..."
su - postgres -c "$PGBIN/pg_ctl -D $PGDATA -w stop"

# Update backend environment
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=${POSTGRES_DB}
export DB_USER=${POSTGRES_USER}
export DB_PASSWORD=${POSTGRES_PASSWORD}

echo "Starting Scan2Go All-in-One..."
exec "$@"
