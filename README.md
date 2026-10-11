# PlacementOS

A full-stack campus placement management project I built to practice backend development, asynchronous processing, and role-based access control.

PlacementOS is designed for multiple institutions. Students can browse jobs and submit applications, recruiters/officers can create opportunities, and a background worker checks eligibility before updating an application's status.

## Tech stack

- **Frontend:** React, TypeScript, Vite, CSS
- **Backend:** Node.js, Express, TypeScript
- **Database:** PostgreSQL
- **Background jobs:** RabbitMQ
- **Caching:** Redis
- **Local environment:** Docker Compose

## What it currently does

- Sign in with JWT-based authentication
- Use roles for students, recruiters, and placement officers
- Create and browse job postings
- Check basic eligibility using CGPA and degree
- Submit applications and see their processing status
- Process applications in a RabbitMQ worker
- Retry failed worker messages and route exhausted messages to a dead-letter queue
- Cache the open-jobs response in Redis

This is a learning/portfolio MVP. It does not yet implement a full interview scheduler, assessment engine, recruiter email notifications, or a production-grade institution onboarding process.

## Project layout

```text
PlacementOS/
├── client/                 # React + TypeScript frontend
├── server/                 # Express API and PostgreSQL access
├── worker/                 # RabbitMQ application-processing worker
├── docker-compose.yml      # Local services
├── .env.example            # Environment variable template
└── README.md
```

## Run locally with Docker

### Requirements

- Docker Desktop
- Git (only needed to clone/push the repository)

### 1. Set up environment variables

Copy `.env.example` to `.env` in the project root. Change `JWT_SECRET` to a long random value before using the app beyond local testing.

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Start the services

From the project root:

```powershell
docker compose up --build
```

This starts the frontend, API, PostgreSQL, Redis, RabbitMQ, and worker.

- Frontend: http://localhost:5173
- API health check: http://localhost:4000/health
- RabbitMQ management: http://localhost:15672

### 3. Add sample data

Open another terminal in the project folder and run:

```powershell
docker compose exec api npm run seed
```

Demo student account:

- Email: `student@demo.edu`
- Password: `Password123!`

The seed script also creates demo recruiter/officer accounts with the same demo password. These credentials are for local development only.

## Application flow

1. A student signs in and opens the jobs list.
2. When the student applies, the API creates a `PENDING` application and publishes a message to RabbitMQ.
3. The worker loads the student and job details from PostgreSQL and checks the institution, deadline, CGPA, and eligible degree.
4. The worker changes the application to `APPLIED` or `REJECTED` and records an in-app notification.
5. If processing fails, the worker retries the message and eventually sends it to the dead-letter queue.

## API routes

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/health` | API health check |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/jobs` | List open jobs |
| POST | `/api/jobs` | Create a job (recruiter/officer/admin) |
| POST | `/api/applications` | Submit an application (student) |
| GET | `/api/applications/me` | View the signed-in student's applications |
| GET | `/api/applications` | View applications for placement staff |

Protected routes use `Authorization: Bearer <token>`. Application submission requires an `Idempotency-Key` header.

## Current limitations / next steps

- Add automated API and worker tests.
- Improve institution-level access checks for every staff workflow.
- Use a transactional outbox so an application record and its queue message cannot get out of sync.
- Add rate limiting, structured logging, and audit events.
- Integrate a real email provider and build interview/assessment scheduling.
- Replace demo account provisioning with an approved institution onboarding flow.
- Add production secrets management and deployment configuration.

## Notes

This repository is a project in progress. I am using it to understand how an API, relational database, cache, and message queue work together in a realistic placement workflow. The feature list above reflects the current starter implementation, not a claim that every placement workflow is complete.
