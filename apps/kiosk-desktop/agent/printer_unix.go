//go:build darwin || linux

package main

import (
	"bufio"
	"bytes"
	"fmt"
	"os/exec"
	"strings"
)

func listPrintersOS() ([]PrinterInfo, error) {
	defaultName := cupsDefaultDestination()
	out, err := exec.Command("lpstat", "-p").Output()
	if err != nil {
		return listPrintersLpstatA(defaultName)
	}
	list, err := parseLpstatP(out, defaultName)
	if err != nil {
		return listPrintersLpstatA(defaultName)
	}
	if len(list) == 0 {
		return listPrintersLpstatA(defaultName)
	}
	applyCupsPaperInfo(list)
	return list, nil
}

func applyCupsPaperInfo(list []PrinterInfo) {
	for i := range list {
		po, st := cupsPrinterPaperAndStatus(list[i].Name)
		if po != nil {
			list[i].PaperOut = po
		}
		if st != "" {
			list[i].Status = st
		}
	}
}

// cupsPrinterPaperAndStatus uses lpstat -l -p (CUPS) to detect media-empty / out-of-paper in reasons.
func cupsPrinterPaperAndStatus(printerName string) (paperOut *bool, status string) {
	if strings.TrimSpace(printerName) == "" {
		return nil, ""
	}
	out, err := exec.Command("lpstat", "-l", "-p", printerName).Output()
	if err != nil {
		return nil, ""
	}
	lower := strings.ToLower(string(out))
	paper := false
	if strings.Contains(lower, "media-empty") ||
		strings.Contains(lower, "out of paper") ||
		strings.Contains(lower, "out-of-paper") {
		paper = true
	}
	st := "ok"
	if paper {
		st = "out_of_paper"
	} else if strings.Contains(lower, "is stopped") {
		st = "stopped"
	} else if strings.Contains(lower, "is idle") {
		st = "idle"
	} else {
		st = "unknown"
	}
	return &paper, st
}

func cupsDefaultDestination() string {
	out, err := exec.Command("lpstat", "-d").Output()
	if err != nil {
		return ""
	}
	s := strings.TrimSpace(string(out))
	const pfx = "system default destination:"
	if strings.HasPrefix(strings.ToLower(s), pfx) {
		return strings.TrimSpace(s[len(pfx):])
	}
	return ""
}

func parseLpstatP(out []byte, defaultName string) ([]PrinterInfo, error) {
	sc := bufio.NewScanner(bytes.NewReader(out))
	var list []PrinterInfo
	for sc.Scan() {
		line := sc.Text()
		if !strings.HasPrefix(line, "printer ") {
			continue
		}
		rest := strings.TrimPrefix(line, "printer ")
		idx := strings.Index(rest, " is ")
		if idx <= 0 {
			continue
		}
		name := rest[:idx]
		list = append(list, PrinterInfo{
			Name:      name,
			IsDefault: defaultName != "" && name == defaultName,
		})
	}
	return list, sc.Err()
}

func listPrintersLpstatA(defaultName string) ([]PrinterInfo, error) {
	out, err := exec.Command("lpstat", "-a").Output()
	if err != nil {
		return nil, fmt.Errorf("lpstat: %w", err)
	}
	sc := bufio.NewScanner(bytes.NewReader(out))
	var list []PrinterInfo
	seen := make(map[string]struct{})
	for sc.Scan() {
		line := sc.Text()
		idx := strings.Index(line, " accepting requests")
		if idx <= 0 {
			continue
		}
		name := strings.TrimSpace(line[:idx])
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		list = append(list, PrinterInfo{
			Name:      name,
			IsDefault: defaultName != "" && name == defaultName,
		})
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	applyCupsPaperInfo(list)
	return list, nil
}

func printSystemOS(queue string, raw []byte) error {
	if queue == "" {
		return fmt.Errorf("empty printer queue name")
	}
	if len(raw) == 0 {
		return fmt.Errorf("empty payload")
	}
	cmd := exec.Command("lp", "-d", queue, "-o", "raw")
	cmd.Stdin = bytes.NewReader(raw)
	out, err := cmd.CombinedOutput()
	if err != nil {
		// Some CUPS setups want explicit MIME type instead of -o raw
		cmd2 := exec.Command("lp", "-d", queue, "-o", "document-format=application/octet-stream")
		cmd2.Stdin = bytes.NewReader(raw)
		out2, err2 := cmd2.CombinedOutput()
		if err2 != nil {
			return fmt.Errorf("lp: %w (%s); retry: %v (%s)", err, strings.TrimSpace(string(out)), err2, strings.TrimSpace(string(out2)))
		}
	}
	return nil
}
