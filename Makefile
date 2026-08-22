SHELL := bash

.PHONY: help install \
	dev dev-frontend dev-backend \
	db-up db-down db-logs \
	prisma-generate prisma-migrate prisma-deploy prisma-studio prisma-reset \
	lint format

help:
	@echo "Digital Wealth Partners"
	@echo ""
	@echo "  make install          install workspace deps (pnpm)"
	@echo ""
	@echo "  make dev              run frontend + backend dev servers in parallel"
	@echo "  make dev-frontend     run frontend dev server only"
	@echo "  make dev-backend      run backend dev server only"
	@echo ""
	@echo "  make db-up            start Postgres container (docker compose)"
	@echo "  make db-down          stop Postgres container"
	@echo "  make db-logs          tail Postgres container logs"
	@echo ""
	@echo "  make prisma-generate  regenerate the Prisma client"
	@echo "  make prisma-migrate   create + apply a dev migration (prompts for a name)"
	@echo "  make prisma-deploy    apply pending migrations without prompting (CI/prod-style)"
	@echo "  make prisma-studio    open Prisma Studio"
	@echo "  make prisma-reset     drop + recreate the dev database from migrations"
	@echo ""
	@echo "  make lint             lint both packages"
	@echo "  make format           prettier --write across the repo"

install:
	pnpm install

# --- Dev servers ---------------------------------------------------------

dev:
	pnpm --parallel --filter frontend --filter backend run dev

dev-frontend:
	pnpm --filter frontend dev

dev-backend:
	pnpm --filter backend dev

# --- Docker / Postgres ----------------------------------------------------

db-up:
	docker compose up -d db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

# --- Prisma (backend) ------------------------------------------------------

prisma-generate:
	pnpm --filter backend prisma:generate

prisma-migrate:
	pnpm --filter backend prisma:migrate

prisma-deploy:
	pnpm --filter backend exec prisma migrate deploy

prisma-studio:
	pnpm --filter backend prisma:studio

prisma-reset:
	pnpm --filter backend exec prisma migrate reset

# --- Repo-wide -------------------------------------------------------------

lint:
	pnpm lint

format:
	pnpm format
