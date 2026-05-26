package main

import (
	"fmt"
	"os"
	"strings"
	"time"
)

const defaultRoomTTL = 3 * time.Minute

type serverConfig struct {
	allowedOrigins []string
	certFile       string
	keyFile        string
	listenAddr     string
	roomTTL        time.Duration
	tlsEnabled     bool
}

func loadServerConfig(args []string) (serverConfig, error) {
	mode := "local"
	if len(args) > 1 {
		mode = strings.TrimSpace(args[1])
	}

	cfg := serverConfig{
		allowedOrigins: parseAllowedOrigins(os.Getenv("ALLOWED_ORIGINS")),
		roomTTL:        defaultRoomTTL,
	}

	switch mode {
	case "", "local":
		cfg.listenAddr = ":5001"
	case "debug":
		cfg.listenAddr = "127.0.0.1:5001"
	case "prod":
		cfg.listenAddr = ":8080"
	case "prod-tls":
		cfg.listenAddr = ":5000"
		cfg.tlsEnabled = true
	default:
		return serverConfig{}, fmt.Errorf("unknown env %q", mode)
	}

	if listenAddr := strings.TrimSpace(os.Getenv("LISTEN_ADDR")); listenAddr != "" {
		cfg.listenAddr = listenAddr
	} else if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
		cfg.listenAddr = formatListenPort(port)
	}

	if roomTTL := strings.TrimSpace(os.Getenv("ROOM_TTL")); roomTTL != "" {
		parsedTTL, err := time.ParseDuration(roomTTL)
		if err != nil {
			return serverConfig{}, fmt.Errorf("invalid ROOM_TTL: %w", err)
		}
		if parsedTTL <= 0 {
			return serverConfig{}, fmt.Errorf("ROOM_TTL must be greater than zero")
		}
		cfg.roomTTL = parsedTTL
	}

	if envTLSEnabled := strings.TrimSpace(os.Getenv("TLS_ENABLED")); envTLSEnabled != "" {
		cfg.tlsEnabled = parseBoolEnv(envTLSEnabled)
	}
	if cfg.tlsEnabled {
		cfg.certFile = firstNonEmpty(os.Getenv("CERT_FILE"), "/etc/letsencrypt/live/yourdomain.com/fullchain.pem")
		cfg.keyFile = firstNonEmpty(os.Getenv("KEY_FILE"), "/etc/letsencrypt/live/yourdomain.com/privkey.pem")
	}

	return cfg, nil
}

func formatListenPort(port string) string {
	if strings.Contains(port, ":") {
		return port
	}
	return ":" + port
}

func parseBoolEnv(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "y", "on":
		return true
	default:
		return false
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
