set shell := ["bash", "-eu", "-o", "pipefail", "-c"]

pnpm := "pnpm"
service_host := "http://127.0.0.1:5001"

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

server:
    go run ./apps/server debug

extension:
    VITE_VIDEOTOGETHER_LITE_HOST={{service_host}} {{pnpm}} --filter @videotogetherlite/extension dev

check: lint typecheck test build test-server

lint:
    {{pnpm}} lint

typecheck:
    {{pnpm}} typecheck

test:
    {{pnpm}} test

test-server:
    go test ./apps/server/...

build:
    {{pnpm}} build

build-extension:
    {{pnpm}} build:extension
