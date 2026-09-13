package main

import (
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

const testLaunchID = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func TestProtocolCarriesOnlyLaunchID(t *testing.T) {
	value, err := parseProtocolURL("companymail://open/" + testLaunchID)
	if err != nil || value != testLaunchID {
		t.Fatalf("valid launch URL rejected: %v", err)
	}
	invalid := []string{
		"companymail://open?token=" + testLaunchID,
		"companymail://open/not-random",
		"companymail://settings/" + testLaunchID,
		"companymail://open/" + testLaunchID + "?url=https://outlook.office.com",
	}
	for _, candidate := range invalid {
		if _, err := parseProtocolURL(candidate); err == nil {
			t.Fatalf("unsafe launch URL accepted: %s", candidate)
		}
	}
}

func TestBackendRequiresHTTPSExceptLocalhost(t *testing.T) {
	if value, err := validateBackendURL("https://mail-admin.example.com/path"); err != nil || value != "https://mail-admin.example.com" {
		t.Fatalf("HTTPS backend rejected: %v", err)
	}
	if _, err := validateBackendURL("http://localhost:3000"); err != nil {
		t.Fatalf("localhost rejected: %v", err)
	}
	if _, err := validateBackendURL("http://mail-admin.example.com"); err == nil {
		t.Fatal("insecure remote backend accepted")
	}
	if _, err := validateBackendURL("https://user:secret@mail-admin.example.com"); err == nil {
		t.Fatal("URL credentials accepted")
	}
}

func TestOutlookURLAllowList(t *testing.T) {
	valid := []string{
		"https://outlook.office.com/mail/inbox/id/AAQk",
		"https://outlook.office365.com/owa/id",
		"https://outlook.cloud.microsoft/mail/id",
	}
	for _, candidate := range valid {
		if !isAllowedOutlookURL(candidate) {
			t.Fatalf("valid Outlook URL rejected: %s", candidate)
		}
	}
	invalid := []string{
		"https://outlook.office.com.evil.example/mail",
		"http://outlook.office.com/mail",
		"javascript:alert(1)",
	}
	for _, candidate := range invalid {
		if isAllowedOutlookURL(candidate) {
			t.Fatalf("unsafe Outlook URL accepted: %s", candidate)
		}
	}
}

func TestBrowserPreferenceAndFallback(t *testing.T) {
	candidates := browserCandidates()
	var chrome, edge browserChoice
	for _, candidate := range candidates {
		if candidate.Kind == "chrome" && chrome.Executable == "" {
			chrome = candidate
		}
		if candidate.Kind == "edge" && edge.Executable == "" {
			edge = candidate
		}
	}
	exists := func(value string) bool { return value == chrome.Executable || value == edge.Executable }
	if selected := chooseBrowser(launcherConfig{PreferredBrowser: "auto"}, exists); selected.Kind != "chrome" {
		t.Fatalf("auto did not prefer Chrome: %+v", selected)
	}
	if selected := chooseBrowser(launcherConfig{PreferredBrowser: "edge"}, exists); selected.Kind != "edge" {
		t.Fatalf("Edge preference ignored: %+v", selected)
	}
	if selected := chooseBrowser(launcherConfig{PreferredBrowser: "auto"}, func(string) bool { return false }); selected.Kind != "default" {
		t.Fatalf("system fallback not selected: %+v", selected)
	}
}

func TestChromiumAlwaysUsesFreshProfileArgument(t *testing.T) {
	args := chromiumArguments(`C:\Temp\CompanyMailLauncher\profile-random`, "https://outlook.office.com/mail/id")
	if args[0] != `--user-data-dir=C:\Temp\CompanyMailLauncher\profile-random` {
		t.Fatalf("fresh profile argument missing: %#v", args)
	}
	if args[len(args)-1] != "https://outlook.office.com/mail/id" {
		t.Fatalf("Outlook URL is not final argument: %#v", args)
	}
}

func TestExchangeSendsOnlyLaunchID(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		body, _ := io.ReadAll(request.Body)
		if string(body) != `{"launchId":"`+testLaunchID+`"}` {
			t.Fatalf("unexpected exchange body: %s", body)
		}
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"webLink":"https://outlook.office.com/mail/inbox/id/AAQk"}`)),
		}, nil
	})}
	value, err := exchangeLaunchID(testLaunchID, launcherConfig{BackendURL: "https://mail-admin.example.com"}, client)
	if err != nil || !strings.Contains(value, "outlook.office.com") {
		t.Fatalf("exchange failed: %v", err)
	}
}

func TestExchangeRejectsLookalikeHost(t *testing.T) {
	client := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"webLink":"https://outlook.office.com.evil.example/mail"}`)),
		}, nil
	})}
	if _, err := exchangeLaunchID(testLaunchID, launcherConfig{BackendURL: "https://mail-admin.example.com"}, client); err == nil {
		t.Fatal("lookalike Outlook host accepted")
	}
}

func TestStaleProfileCleanupPreservesCurrentProfiles(t *testing.T) {
	root := t.TempDir()
	stale := filepath.Join(root, "profile-stale")
	current := filepath.Join(root, "profile-current")
	if err := os.Mkdir(stale, 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(current, 0700); err != nil {
		t.Fatal(err)
	}
	old := time.Now().Add(-profileMaxAge - time.Hour)
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}
	cleanupStaleProfiles(root)
	if _, err := os.Stat(stale); !os.IsNotExist(err) {
		t.Fatal("stale profile was not deleted")
	}
	if _, err := os.Stat(current); err != nil {
		t.Fatal("current profile was incorrectly deleted")
	}
}

func TestLogRedactionRemovesLaunchAndWebURLs(t *testing.T) {
	value := redactLogDetail("failed companymail://open/" + testLaunchID + " at https://outlook.office.com/mail/id")
	if strings.Contains(value, testLaunchID) || strings.Contains(value, "outlook.office.com") {
		t.Fatalf("sensitive log detail was not redacted: %s", value)
	}
}
