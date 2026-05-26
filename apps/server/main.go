package main

import (
	"context"
	"crypto/tls"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"
)

type certManager struct {
	certFile string
	keyFile  string
	cert     *tls.Certificate
	mu       sync.RWMutex
}

func (cm *certManager) loadCert() {
	cert, err := tls.LoadX509KeyPair(cm.certFile, cm.keyFile)
	if err != nil {
		log.Printf("Error loading certificate: %v", err)
		return
	}

	cm.mu.Lock()
	cm.cert = &cert
	cm.mu.Unlock()
	log.Printf("Certificate reloaded successfully")
}

func (cm *certManager) getCert() (*tls.Certificate, error) {
	cm.mu.RLock()
	cert := cm.cert
	cm.mu.RUnlock()

	if cert == nil {
		return nil, errors.New("certificate not loaded")
	}
	return cert, nil
}

func (cm *certManager) start(ctx context.Context) {
	cm.loadCert()
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				cm.loadCert()
			case <-ctx.Done():
				return
			}
		}
	}()
}

func main() {
	if err := run(os.Args); err != nil {
		log.Fatal(err)
	}
}

func run(args []string) error {
	cfg, err := loadServerConfig(args)
	if err != nil {
		return err
	}

	Init()
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	liteService := NewVideoTogetherLiteService(cfg.roomTTL)
	server := newSlashFix(liteService, newOriginPolicy(cfg.allowedOrigins))

	var tlsConfig *tls.Config
	if cfg.tlsEnabled {
		cm := &certManager{
			certFile: cfg.certFile,
			keyFile:  cfg.keyFile,
		}
		cm.start(ctx)

		tlsConfig = &tls.Config{
			GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
				return cm.getCert()
			},
		}
	}

	httpServer := newHTTPServer(cfg.listenAddr, server, tlsConfig)
	errCh := make(chan error, 1)
	go func() {
		log.Printf("VideoTogether Lite server listening on %s", cfg.listenAddr)
		if cfg.tlsEnabled {
			errCh <- httpServer.ListenAndServeTLS("", "")
			return
		}
		errCh <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if errors.Is(err, http.ErrServerClosed) {
			return nil
		}
		return err
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			return err
		}
		return nil
	}
}

func newHTTPServer(addr string, handler http.Handler, tlsConfig *tls.Config) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           handler,
		IdleTimeout:       120 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		TLSConfig:         tlsConfig,
		WriteTimeout:      15 * time.Second,
	}
}
