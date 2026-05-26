package main

import (
	"net/http"
	"strings"
)

type originPolicy struct {
	allowAll bool
	allowed  map[string]struct{}
}

func parseAllowedOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		origin := strings.TrimSpace(part)
		if origin != "" {
			origins = append(origins, origin)
		}
	}
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}

func newOriginPolicy(origins []string) *originPolicy {
	policy := &originPolicy{allowed: map[string]struct{}{}}
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}
		if origin == "*" {
			policy.allowAll = true
			continue
		}
		policy.allowed[origin] = struct{}{}
	}
	if policy.allowAll || len(policy.allowed) == 0 {
		policy.allowAll = true
	}
	return policy
}

func (p *originPolicy) allowRequest(req *http.Request) bool {
	return p.allowsOrigin(req.Header.Get("Origin"))
}

func (p *originPolicy) allowsOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	if p == nil || p.allowAll {
		return true
	}
	_, ok := p.allowed[origin]
	return ok
}

func (p *originPolicy) corsOrigin(origin string) (string, bool) {
	if p == nil || p.allowAll {
		return "*", true
	}
	if origin == "" {
		return "", true
	}
	if _, ok := p.allowed[origin]; ok {
		return origin, true
	}
	return "", false
}
