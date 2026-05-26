set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

pnpm := "pnpm"
service_host := "http://127.0.0.1:5001"
smoke_host := env_var_or_default("BACKEND_PUBLIC_URL", service_host)

default:
    @just --list

setup:
    {{pnpm}} install
    cd apps/server && go mod download

setup-browser:
    {{pnpm}} exec playwright install chromium

dev:
    @node scripts/dev-workflow.mjs dev

watch:
    @node scripts/dev-workflow.mjs watch

browser:
    @node scripts/dev-workflow.mjs browser

audit-actions:
    {{pnpm}} audit:actions

audit-release:
    {{pnpm}} audit:release

configure-github-envs:
    {{pnpm}} configure:github-envs

configure-github-env-inputs:
    {{pnpm}} configure:github-env-inputs

run-release-workflow *steps:
    {{pnpm}} release:workflow {{steps}}

server:
    go run ./apps/server debug

extension:
    VITE_VIDEOTOGETHER_LITE_HOST={{service_host}} {{pnpm}} --filter @videotogetherlite/extension dev

check: lint typecheck test build validate-extension test-server

lint:
    {{pnpm}} lint

typecheck:
    {{pnpm}} typecheck

test:
    {{pnpm}} test

test-e2e:
    {{pnpm}} test:e2e

test-server:
    go test ./apps/server/...

smoke-backend:
    {{pnpm}} smoke:backend {{smoke_host}}

smoke-docker:
    {{pnpm}} smoke:docker

smoke-rollback:
    {{pnpm}} smoke:rollback

build:
    {{pnpm}} build

build-extension:
    {{pnpm}} build:extension

validate-extension:
    {{pnpm}} validate:extension
