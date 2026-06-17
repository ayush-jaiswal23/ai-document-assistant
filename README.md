# AI Document Assistant

AI Document Assistant is a full-stack document question-answering application. Admin users can create a workspace, manage members and groups, upload group documents, and let authorized members chat with indexed document content.

**Live deployment:** https://ai-document-assistant-web.onrender.com/

## Features

- Admin signup and JWT-based authentication
- Profile management for admins and members
- Group-based access control
- Member creation and assignment to admin-managed groups
- Upload support for `.txt`, `.md`, and `.pdf` documents
- Text extraction, chunking, and vector indexing with Chroma
- Gemini embeddings and Gemini chat responses through Google GenAI
- Group-scoped chat history and source-grounded answers
- Render deployment configuration for frontend, backend, and PostgreSQL

## Tech Stack

- **Frontend:** React 19, Vite, CSS
- **Backend:** Django 6, Django REST Framework, Simple JWT
- **Database:** PostgreSQL in production, SQLite fallback for local development
- **Vector store:** Chroma
- **AI:** Google GenAI via LangChain
- **Deployment:** Render

## Project Structure

```text
.
├── backend/          # Django API, models, services, migrations
├── frontend/         # React/Vite application
├── render.yaml       # Render Blueprint configuration
└── runtime.txt       # Python runtime hint
```

## Local Development

### Prerequisites

- Python 3.12+
- Node.js and npm
- Google API key with access to Gemini models

### Backend Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

The backend runs at `http://localhost:8000`.

Required backend environment variables:

```bash
GOOGLE_API_KEY=your_google_api_key
DJANGO_SECRET_KEY=your_local_secret_key
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:5173
CSRF_TRUSTED_ORIGINS=http://localhost:5173
```

Optional backend environment variables:

```bash
DATABASE_URL=postgres_connection_string
DJANGO_SECURE_SSL_REDIRECT=false
DJANGO_SECURE_HSTS_SECONDS=0
```

If `DATABASE_URL` is not set, Django uses local SQLite.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173`.

Frontend environment variables:

```bash
VITE_API_MODE=backend
VITE_API_BASE_URL=http://localhost:8000
```

The frontend also includes a local demo mode. Set `VITE_API_MODE=demo` to use seeded browser storage instead of the Django API.

## Useful Commands

Backend:

```bash
cd backend
python manage.py migrate
python manage.py createsuperuser
python manage.py test
```

Frontend:

```bash
cd frontend
npm run dev
npm run build
npm run lint
npm run preview
```

## API Overview

Core API routes are exposed under `/api/`:

- `GET /api/health/`
- `POST /api/auth/signup/`
- `POST /api/auth/login/`
- `POST /api/auth/refresh/`
- `POST /api/auth/logout/`
- `GET/PATCH /api/profile/`
- `GET /api/groups/`
- `GET /api/groups/<group_id>/`
- `POST /api/groups/<group_id>/documents/upload/`
- `POST /api/groups/<group_id>/chat/`
- `POST /api/members/`

## Deployment

This repository includes a Render Blueprint in `render.yaml`.

The deployed services are configured as:

- Frontend static site: https://ai-document-assistant-web.onrender.com/
- Backend API: `https://ai-document-assistant-api.onrender.com`
- PostgreSQL database: `ai-document-assistant-db`

Production environment variables include:

- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`
- `DJANGO_ALLOWED_HOSTS`
- `CORS_ALLOWED_ORIGINS`
- `CSRF_TRUSTED_ORIGINS`
- `GOOGLE_API_KEY`
- `DATABASE_URL`
- `VITE_API_MODE=backend`
- `VITE_API_BASE_URL`

## Supported Uploads

Group admins can upload one or more `.txt`, `.md`, or `.pdf` files. Uploaded files are extracted, split into chunks, embedded with `models/gemini-embedding-001`, and stored in Chroma collections scoped to each group document.
