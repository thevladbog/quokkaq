package experience

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"testing"
)

func TestValidateDefinitionMatchesTask5DifferentialCorpus(t *testing.T) {
	t.Parallel()

	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("locate corpus test")
	}
	corpusPath := filepath.Join(filepath.Dir(filename), "../../../../packages/shared-types/fixtures/experience-publish-corpus.json")
	contents, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatalf("read corpus: %v", err)
	}
	var corpus struct {
		Cases []struct {
			Name       string          `json:"name"`
			Definition json.RawMessage `json:"definition"`
			Expected   struct {
				CanPublish bool     `json:"canPublish"`
				ErrorCodes []string `json:"errorCodes"`
			} `json:"expected"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(contents, &corpus); err != nil {
		t.Fatalf("decode corpus: %v", err)
	}

	for _, testCase := range corpus.Cases {
		t.Run(testCase.Name, func(t *testing.T) {
			var envelope struct {
				Surface string `json:"surface"`
			}
			if err := json.Unmarshal(testCase.Definition, &envelope); err != nil {
				t.Fatalf("decode corpus surface: %v", err)
			}
			err := ValidateDefinition(testCase.Definition, envelope.Surface)
			codes := validationErrorCodes(err)
			sort.Strings(codes)
			if gotCanPublish := err == nil; gotCanPublish != testCase.Expected.CanPublish {
				t.Errorf("canPublish = %v, want %v (codes %v)", gotCanPublish, testCase.Expected.CanPublish, codes)
			}
			if !equalStrings(codes, testCase.Expected.ErrorCodes) {
				t.Errorf("error codes = %v, want %v", codes, testCase.Expected.ErrorCodes)
			}
		})
	}
}

func validationErrorCodes(err error) []string {
	validationErr, ok := err.(*ValidationError)
	if !ok {
		if err == nil {
			return []string{}
		}
		return []string{"unexpected.error"}
	}
	seen := make(map[string]struct{}, len(validationErr.Issues))
	for _, issue := range validationErr.Issues {
		seen[issue.Code] = struct{}{}
	}
	codes := make([]string, 0, len(seen))
	for code := range seen {
		codes = append(codes, code)
	}
	return codes
}

func equalStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
