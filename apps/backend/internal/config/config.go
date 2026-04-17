package config

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// Load reads environment variables from optional .env files.
// When the API is started with cwd apps/backend (e.g. nx serve), loads ../../.env (repo root) first, then overloads apps/backend/.env so local values win.
// When only apps/backend/.env exists, the first load is a no-op and .env in cwd is loaded as before.
func Load() {
	if _, err := os.Stat("../../.env"); err == nil {
		if err := godotenv.Load("../../.env"); err != nil {
			log.Printf("config: error loading ../../.env: %v", err)
		}
	}
	if _, err := os.Stat(".env"); err == nil {
		if err := godotenv.Overload(".env"); err != nil {
			log.Printf("config: error loading .env: %v", err)
		}
	}
}
