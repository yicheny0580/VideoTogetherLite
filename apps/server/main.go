package main

import (
	"crypto/tls"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
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

func (cm *certManager) start() {
	cm.loadCert()
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			cm.loadCert()
		}
	}()
}

func main() {
	Init()
	liteService := NewVideoTogetherLiteService(time.Minute * 3)
	server := newSlashFix(liteService)
	if len(os.Args) <= 1 {
		panic(newHTTPServer(":5001", server, nil).ListenAndServe())
	}

	switch strings.TrimSpace(os.Args[1]) {
	case "debug":
		panic(newHTTPServer("127.0.0.1:5001", server, nil).ListenAndServe())
	case "prod":
		certFile := os.Getenv("CERT_FILE")
		keyFile := os.Getenv("KEY_FILE")
		if certFile == "" {
			certFile = "/etc/letsencrypt/live/yourdomain.com/fullchain.pem"
		}
		if keyFile == "" {
			keyFile = "/etc/letsencrypt/live/yourdomain.com/privkey.pem"
		}

		cm := &certManager{
			certFile: certFile,
			keyFile:  keyFile,
		}
		cm.start()

		tlsConfig := &tls.Config{
			GetCertificate: func(hello *tls.ClientHelloInfo) (*tls.Certificate, error) {
				return cm.getCert()
			},
		}

		httpServer := newHTTPServer(":5000", server, tlsConfig)

		panic(httpServer.ListenAndServeTLS("", ""))
	default:
		panic("unknown env")
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
