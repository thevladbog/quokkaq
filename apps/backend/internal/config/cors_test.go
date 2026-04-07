package config

import (
	"reflect"
	"testing"
)

func TestParseCORSAllowedOrigins(t *testing.T) {
	got := ParseCORSAllowedOrigins(" http://localhost:3000 , https://app.example.com ")
	want := []string{"http://localhost:3000", "https://app.example.com"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("ParseCORSAllowedOrigins() = %v, want %v", got, want)
	}
	if ParseCORSAllowedOrigins("") != nil {
		t.Fatal("empty input should return nil")
	}
	if len(ParseCORSAllowedOrigins("   ,  ")) != 0 {
		t.Fatal("only separators should yield empty slice")
	}
}
