// Serial barcode scanner (COM) helpers for the QuokkaQ local agent.
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"strings"
	"time"

	"go.bug.st/serial"
)

type serialPortItem struct {
	Path  string `json:"path"`
	Label string `json:"label,omitempty"`
}

type serialListResponse struct {
	Ports []serialPortItem `json:"ports"`
	Error string            `json:"error,omitempty"`
}

type serialTestRequest struct {
	Port       string `json:"port"`
	Baud       int    `json:"baud"`
	Challenge  string `json:"challenge"`
	TimeoutSec int    `json:"timeoutSec"`
}

type serialTestResponse struct {
	OK        bool   `json:"ok"`
	Challenge string `json:"challenge,omitempty"`
	Read      string `json:"read,omitempty"`
	Message   string `json:"message,omitempty"`
}

func handleListSerial(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ports, err := serial.GetPortsList()
	if err != nil {
		b, _ := json.Marshal(serialListResponse{Error: err.Error()})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
		return
	}
	out := make([]serialPortItem, 0, len(ports))
	for _, p := range ports {
		if strings.TrimSpace(p) == "" {
			continue
		}
		out = append(out, serialPortItem{Path: p, Label: p})
	}
	b, _ := json.Marshal(serialListResponse{Ports: out})
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(b)
}

func openSerialForPath(path string, baud int) (serial.Port, error) {
	if baud <= 0 {
		baud = 9600
	}
	m := &serial.Mode{
		BaudRate: baud,
		DataBits: 8,
		Parity:   serial.NoParity,
		StopBits: serial.OneStopBit,
	}
	return serial.Open(path, m)
}

var errSerialReadTimeout = errors.New("serial read timeout")

// readLineWithTimeout reads one line. On timeout the port is closed to unblock the reader; caller should not use p after this returns.
func readLineWithTimeout(p serial.Port, maxWait time.Duration) (string, error) {
	type result struct {
		b []byte
		e error
	}
	ch := make(chan result, 1)
	go func() {
		br := bufio.NewReader(p)
		line, e := br.ReadBytes('\n')
		ch <- result{line, e}
	}()
	select {
	case r := <-ch:
		if r.e == io.EOF {
			return strings.TrimSpace(string(r.b)), nil
		}
		if r.e != nil {
			return "", r.e
		}
		return strings.TrimSpace(strings.TrimRight(string(r.b), "\r\n")), nil
	case <-time.After(maxWait):
		_ = p.Close()
		return "", errSerialReadTimeout
	}
}

func randomChallenge() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1_000_000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func handleSerialTest(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req serialTestRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}
	path := strings.TrimSpace(req.Port)
	if path == "" {
		http.Error(w, "port required", http.StatusBadRequest)
		return
	}
	to := 30
	if req.TimeoutSec > 0 {
		to = req.TimeoutSec
	}
	if to > 120 {
		to = 120
	}
	chal := strings.TrimSpace(req.Challenge)
	if chal == "" {
		c, err := randomChallenge()
		if err != nil {
			http.Error(w, "rng error", http.StatusInternalServerError)
			return
		}
		chal = c
	}

	p, err := openSerialForPath(path, req.Baud)
	if err != nil {
		b, _ := json.Marshal(serialTestResponse{OK: false, Message: err.Error()})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
		return
	}
	line, err := readLineWithTimeout(p, time.Duration(to)*time.Second)
	if err != errSerialReadTimeout {
		_ = p.Close()
	}
	if err != nil {
		b, _ := json.Marshal(serialTestResponse{OK: false, Challenge: chal, Message: err.Error()})
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(b)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if line == chal {
		b, _ := json.Marshal(serialTestResponse{OK: true, Challenge: chal, Read: line})
		_, _ = w.Write(b)
		return
	}
	b, _ := json.Marshal(serialTestResponse{OK: false, Challenge: chal, Read: line, Message: "read does not match challenge"})
	_, _ = w.Write(b)
}

func handleSerialStream(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	q := r.URL.Query()
	path := strings.TrimSpace(q.Get("path"))
	if path == "" {
		http.Error(w, "path required", http.StatusBadRequest)
		return
	}
	baud := 9600
	_, _ = fmt.Sscan(q.Get("baud"), &baud) //nolint:errcheck

	p, err := openSerialForPath(path, baud)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer p.Close()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	fl, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "no flush", http.StatusInternalServerError)
		return
	}
	br := bufio.NewReader(p)
	for {
		if r.Context().Err() != nil {
			return
		}
		s, err := br.ReadString('\n')
		if err != nil {
			return
		}
		line := strings.TrimSpace(strings.TrimRight(s, "\r\n"))
		if line == "" {
			continue
		}
		// One JSON value per line so the browser can JSON.parse(EventSource#data)
		enc, _ := json.Marshal(line)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", string(enc))
		fl.Flush()
	}
}
