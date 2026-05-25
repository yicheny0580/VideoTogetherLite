package main

import (
	"crypto/rand"
	"encoding/binary"
	"math"
)

func secureVersion() int {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		return 0
	}
	return int(binary.BigEndian.Uint64(b[:]) % math.MaxInt32)
}
