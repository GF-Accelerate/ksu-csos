.PHONY: help install dev test migrate deploy clean

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install all dependencies
	cd apps/web && npm install

dev: ## Start local development environment
	@echo "Starting Supabase..."
	supabase start &
	@echo "Starting frontend..."
	cd apps/web && npm run dev

test: ## Run all tests
	@echo "Running Edge Function tests..."
	cd supabase/functions && deno test --allow-all
	@echo "Running frontend tests..."
	cd apps/web && npm test

migrate: ## Apply database migrations
	supabase db reset

deploy-functions: ## Deploy Edge Functions to Supabase
	supabase functions deploy

deploy-web: ## Build and deploy frontend
	cd apps/web && npm run build

deploy: deploy-functions deploy-web ## Deploy everything to production

clean: ## Clean build artifacts
	rm -rf apps/web/dist
	rm -rf apps/web/node_modules
	rm -rf .supabase

seed: ## Seed database with test data
	supabase db reset --seed

logs: ## View Supabase logs
	supabase functions logs

status: ## Show Supabase status
	supabase status
