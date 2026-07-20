# RESQ-Route

A comprehensive disaster response management system for efficient evacuation coordination, shelter management, and real-time incident tracking.

## Overview

RESQ-Route is a multi-platform disaster response system designed to coordinate rescue operations between citizens, rescuers, and central command during emergencies. The system provides real-time tracking, shelter management, hazard reporting, and inventory monitoring.

## Architecture

The system consists of four main components:

- **dashboard-web**: React Admin frontend for central command operations
- **mobile-app**: Flutter mobile application for citizens and rescuers
- **backend-api**: FastAPI asynchronous backend for data management
- **database**: PostgreSQL database with spatial extensions

## Project Structure

```
resq-route/
├── dashboard-web/                 # React Admin Frontend (Central Command)
│   ├── public/
│   ├── src/
│   │   ├── components/            # Reusable UI components
│   │   ├── hooks/                 # Custom React hooks
│   │   ├── views/                 # Main application views
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── mobile-app/                    # Flutter Mobile App (Citizen & Rescuer)
│   ├── lib/
│   │   ├── models/                # Data models
│   │   ├── screens/
│   │   │   ├── citizen/           # Citizen-facing screens
│   │   │   └── rescuer/           # Rescuer-facing screens
│   │   ├── services/              # BLE, GPS, WebSocket services
│   │   └── main.dart
│   └── pubspec.yaml
│
├── backend-api/                   # FastAPI Asynchronous Backend
│   ├── app/
│   │   ├── api/                   # API endpoints
│   │   │   ├── v1/                # Version 1 endpoints
│   │   │   └── websockets/        # WebSocket handlers
│   │   ├── core/                  # Core configuration
│   │   ├── db/                    # Database session management
│   │   ├── models/                # SQLModel database classes
│   │   └── main.py                # Application entry point
│   ├── requirements.txt
│   └── venv/
│
├── database/                      # Database assets
│   ├── migrations/                # Database migration files
│   └── seed_data_caloocan.sql     # Sample data for testing
│
└── README.md
```

## Features

### Central Command (Dashboard Web)
- Real-time shelter capacity monitoring
- Live incident tracking and triage
- Inventory management with depletion alerts
- Interactive map with shelter locations
- WebSocket-based live telemetry

### Citizen Mobile App
- Evacuation routing to nearest shelters
- Structural hazard reporting forms
- QR code-based evacuee tracking
- GPS-based location services
- Real-time shelter availability updates

### Rescuer Mobile App
- BLE-based proximity detection for nearby evacuees
- Manifest control and evacuee management
- Ad-Hoc Proximity BLE HUD
- GPS coordination and navigation
- Real-time task assignment

### Backend API
- RESTful API with FastAPI
- Asynchronous database operations
- WebSocket support for real-time updates
- JWT-based authentication
- Multi-tiered hazard validation filtering
- Spatial queries with PostGIS

## Prerequisites

- Node.js 18+ (for dashboard-web)
- Flutter 3.0+ (for mobile-app)
- Python 3.10+ (for backend-api)
- PostgreSQL 14+ with PostGIS extension (for database)

## Installation

### Backend API

```bash
cd backend-api

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
psql -U postgres -d resq_route -f database/migrations/001_initial_schema.sql
psql -U postgres -d resq_route -f database/migrations/002_add_users_table.sql

# Load seed data (optional)
psql -U postgres -d resq_route -f database/seed_data_caloocan.sql

# Start the server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Dashboard Web

```bash
cd dashboard-web

# Install dependencies
npm install

# Start development server
npm run dev
```

### Mobile App

```bash
cd mobile-app

# Install dependencies
flutter pub get

# Run on connected device/emulator
flutter run
```

## Configuration

### Backend Environment Variables

Create a `.env` file in `backend-api/`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/resq_route
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key
SECRET_KEY=your-secret-key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
CORS_ORIGINS=http://localhost:3000,http://localhost:8080
```

### Database Setup

```bash
# Create database
createdb resq_route

# Enable PostGIS extension
psql -U postgres -d resq_route -c "CREATE EXTENSION postgis;"
```

## API Documentation

Once the backend is running, access the interactive API documentation at:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## WebSocket Endpoints

- Live Telemetry: `ws://localhost:8000/ws`

## Default Credentials

- **Admin Dashboard**: Username: `admin`, Password: `admin123`

## Development

### Running All Services

For development, run all services:

```bash
# Terminal 1: Backend
cd backend-api
uvicorn app.main:app --reload

# Terminal 2: Dashboard
cd dashboard-web
npm run dev

# Terminal 3: Mobile
cd mobile-app
flutter run
```

## Testing

### Backend Tests

```bash
cd backend-api
pytest
```

### Frontend Tests

```bash
cd dashboard-web
npm test
```

### Mobile Tests

```bash
cd mobile-app
flutter test
```

## Deployment

### Backend Deployment

Deploy the FastAPI backend using Docker:

```bash
docker build -t resq-route-api backend-api/
docker run -p 8000:8000 resq-route-api
```

### Frontend Deployment

Build the React frontend for production:

```bash
cd dashboard-web
npm run build
```

### Mobile Deployment

Build the Flutter app for release:

```bash
cd mobile-app
flutter build apk  # Android
flutter build ios  # iOS
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For support and questions, please open an issue in the repository.

## Acknowledgments

- Built for disaster response coordination in Caloocan City
- Uses open-source mapping and geospatial technologies
- Designed with community resilience in mind
