package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"
)

const (
	profileMaxAge  = 24 * time.Hour
	requestTimeout = 15 * time.Second
)

var (
	launchIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{40,100}$`)
	outlookHosts    = map[string]bool{
		"outlook.office.com":      true,
		"outlook.office365.com":   true,
		"outlook.live.com":        true,
		"outlook.cloud.microsoft": true,
	}
)

type launcherConfig struct {
	BackendURL       string `json:"backendUrl"`
	PreferredBrowser string `json:"preferredBrowser,omitempty"`
	BrowserPath      string `json:"browserPath,omitempty"`
}

type browserChoice struct {
	Kind       string
	Executable string
}

type exchangeResponse struct {
	WebLink string `json:"webLink"`
	Error   string `json:"error"`
}

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(args []string) int {
	if contains(args, "--uninstall") {
		if err := unregisterProtocol(); err != nil {
			writeLog("protocol_unregister_failed", err.Error())
			return 1
		}
		writeLog("protocol_unregistered", "")
		return 0
	}

	protocolURL := firstProtocolURL(args)
	if contains(args, "--install") || protocolURL == "" {
		if err := registerProtocol(executablePath()); err != nil {
			writeLog("protocol_register_failed", err.Error())
			return 1
		}
		cleanupStaleProfiles(profileRoot())
		writeLog("protocol_registered", "")
		return 0
	}

	launchID, err := parseProtocolURL(protocolURL)
	if err != nil {
		writeLog("launch_failed", err.Error())
		return 1
	}
	config, err := loadConfig()
	if err != nil {
		writeLog("launch_failed", err.Error())
		return 1
	}
	writeLog("launch_exchange_started", "")
	webLink, err := exchangeLaunchID(launchID, config, http.DefaultClient)
	if err != nil {
		writeLog("launch_failed", err.Error())
		return 1
	}
	writeLog("launch_exchange_succeeded", "")
	if err := launchOutlook(webLink, config); err != nil {
		writeLog("launch_failed", err.Error())
		return 1
	}
	writeLog("browser_session_closed", "")
	return 0
}

func parseProtocolURL(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "companymail" || parsed.Host != "open" {
		return "", errors.New("unsupported Company Mail launch URL")
	}
	if parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("launch URL must contain only the launch ID")
	}
	launchID := strings.TrimPrefix(parsed.Path, "/")
	if !launchIDPattern.MatchString(launchID) {
		return "", errors.New("launch ID is missing or invalid")
	}
	return launchID, nil
}

func validateBackendURL(value string) (string, error) {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" {
		return "", errors.New("backend URL is invalid")
	}
	localHTTP := parsed.Scheme == "http" && (parsed.Hostname() == "localhost" || parsed.Hostname() == "127.0.0.1" || parsed.Hostname() == "::1")
	if parsed.Scheme != "https" && !localHTTP {
		return "", errors.New("remote backend URL must use HTTPS")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("backend URL cannot contain credentials, query parameters, or fragments")
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func isAllowedOutlookURL(value string) bool {
	parsed, err := url.Parse(value)
	return err == nil && parsed.Scheme == "https" && parsed.User == nil && outlookHosts[strings.ToLower(parsed.Hostname())]
}

func exchangeLaunchID(launchID string, config launcherConfig, client *http.Client) (string, error) {
	if !launchIDPattern.MatchString(launchID) {
		return "", errors.New("launch ID is invalid")
	}
	backend, err := validateBackendURL(config.BackendURL)
	if err != nil {
		return "", err
	}
	payload, _ := json.Marshal(map[string]string{"launchId": launchID})
	ctx, cancel := context.WithTimeout(context.Background(), requestTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, backend+"/api/v1/outlook-launch/exchange", bytes.NewReader(payload))
	if err != nil {
		return "", errors.New("could not create launch exchange request")
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return "", errors.New("launch exchange could not reach the backend")
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 64*1024))
	if err != nil {
		return "", errors.New("launch exchange response could not be read")
	}
	var result exchangeResponse
	if err := json.Unmarshal(body, &result); err != nil {
		return "", errors.New("launch exchange returned an invalid response")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 || result.WebLink == "" {
		if result.Error != "" {
			return "", errors.New(result.Error)
		}
		return "", fmt.Errorf("launch request was rejected (%d)", response.StatusCode)
	}
	if !isAllowedOutlookURL(result.WebLink) {
		return "", errors.New("backend returned a URL outside the approved Outlook hosts")
	}
	return result.WebLink, nil
}

func loadConfig() (launcherConfig, error) {
	config := launcherConfig{}
	for _, candidate := range configPaths() {
		data, err := os.ReadFile(candidate)
		if err != nil {
			continue
		}
		if json.Unmarshal(data, &config) == nil {
			break
		}
	}
	if value := os.Getenv("COMPANYMAIL_BACKEND_URL"); value != "" {
		config.BackendURL = value
	}
	if value := os.Getenv("COMPANYMAIL_BROWSER"); value != "" {
		config.PreferredBrowser = value
	}
	if value := os.Getenv("COMPANYMAIL_BROWSER_PATH"); value != "" {
		config.BrowserPath = value
	}
	if config.BackendURL == "" {
		config.BackendURL = "http://localhost:3000"
	}
	backend, err := validateBackendURL(config.BackendURL)
	if err != nil {
		return launcherConfig{}, err
	}
	config.BackendURL = backend
	switch config.PreferredBrowser {
	case "", "auto", "chrome", "edge", "default":
		if config.PreferredBrowser == "" {
			config.PreferredBrowser = "auto"
		}
	default:
		return launcherConfig{}, errors.New("unsupported browser preference")
	}
	if config.BrowserPath != "" {
		if info, err := os.Stat(config.BrowserPath); err != nil || info.IsDir() {
			return launcherConfig{}, errors.New("configured browser executable was not found")
		}
	}
	return config, nil
}

func chooseBrowser(config launcherConfig, fileExists func(string) bool) browserChoice {
	if config.BrowserPath != "" {
		if !fileExists(config.BrowserPath) {
			return browserChoice{Kind: "missing", Executable: config.BrowserPath}
		}
		return browserChoice{Kind: "custom", Executable: config.BrowserPath}
	}
	if config.PreferredBrowser == "default" {
		return browserChoice{Kind: "default", Executable: "explorer.exe"}
	}
	candidates := browserCandidates()
	if config.PreferredBrowser == "edge" {
		candidates = preferKind(candidates, "edge")
	} else {
		candidates = preferKind(candidates, "chrome")
	}
	for _, candidate := range candidates {
		if fileExists(candidate.Executable) {
			return candidate
		}
	}
	return browserChoice{Kind: "default", Executable: "explorer.exe"}
}

func browserCandidates() []browserChoice {
	programFiles := envOr("PROGRAMFILES", `C:\Program Files`)
	programFilesX86 := envOr("PROGRAMFILES(X86)", `C:\Program Files (x86)`)
	localAppData := os.Getenv("LOCALAPPDATA")
	candidates := []browserChoice{
		{Kind: "chrome", Executable: filepath.Join(programFiles, "Google", "Chrome", "Application", "chrome.exe")},
		{Kind: "chrome", Executable: filepath.Join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe")},
		{Kind: "edge", Executable: filepath.Join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe")},
		{Kind: "edge", Executable: filepath.Join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe")},
	}
	if localAppData != "" {
		candidates = append([]browserChoice{{Kind: "chrome", Executable: filepath.Join(localAppData, "Google", "Chrome", "Application", "chrome.exe")}}, candidates...)
		candidates = append(candidates, browserChoice{Kind: "edge", Executable: filepath.Join(localAppData, "Microsoft", "Edge", "Application", "msedge.exe")})
	}
	return candidates
}

func chromiumArguments(profileDirectory, outlookURL string) []string {
	return []string{
		"--user-data-dir=" + profileDirectory,
		"--no-first-run",
		"--no-default-browser-check",
		"--new-window",
		outlookURL,
	}
}

func launchOutlook(outlookURL string, config launcherConfig) error {
	if !isAllowedOutlookURL(outlookURL) {
		return errors.New("Outlook URL failed validation")
	}
	browser := chooseBrowser(config, fileExists)
	if browser.Kind == "missing" {
		return errors.New("configured browser executable was not found")
	}
	if browser.Kind == "default" {
		command := exec.Command(browser.Executable, outlookURL)
		return command.Start()
	}
	root := profileRoot()
	if err := os.MkdirAll(root, 0700); err != nil {
		return errors.New("temporary profile directory could not be created")
	}
	cleanupStaleProfiles(root)
	profile, err := os.MkdirTemp(root, "profile-")
	if err != nil {
		return errors.New("temporary browser profile could not be created")
	}
	defer os.RemoveAll(profile)
	command := exec.Command(browser.Executable, chromiumArguments(profile, outlookURL)...)
	command.Stdout = nil
	command.Stderr = nil
	command.Stdin = nil
	if err := command.Run(); err != nil {
		return errors.New("browser could not be started or exited unexpectedly")
	}
	return nil
}

func cleanupStaleProfiles(root string) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return
	}
	cutoff := time.Now().Add(-profileMaxAge)
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "profile-") {
			continue
		}
		candidate := filepath.Join(root, entry.Name())
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.RemoveAll(candidate)
		}
	}
}

func registerProtocol(executable string) error {
	if runtime.GOOS != "windows" {
		return errors.New("protocol registration is supported only on Windows")
	}
	root := `HKCU\Software\Classes\companymail`
	commands := [][]string{
		{"ADD", root, "/ve", "/d", "URL:Company Mail Launcher", "/f"},
		{"ADD", root, "/v", "URL Protocol", "/d", "", "/f"},
		{"ADD", root + `\DefaultIcon`, "/ve", "/d", executable + ",0", "/f"},
		{"ADD", root + `\shell\open\command`, "/ve", "/d", `"` + executable + `" "%1"`, "/f"},
	}
	for _, args := range commands {
		if err := exec.Command("reg.exe", args...).Run(); err != nil {
			return errors.New("Windows protocol registration failed")
		}
	}
	return nil
}

func unregisterProtocol() error {
	if runtime.GOOS != "windows" {
		return errors.New("protocol registration is supported only on Windows")
	}
	if err := exec.Command("reg.exe", "DELETE", `HKCU\Software\Classes\companymail`, "/f").Run(); err != nil {
		return errors.New("Windows protocol unregistration failed")
	}
	return nil
}

func writeLog(event, detail string) {
	directory := filepath.Join(dataDirectory(), "logs")
	if os.MkdirAll(directory, 0700) != nil {
		return
	}
	detail = redactLogDetail(detail)
	line := time.Now().UTC().Format(time.RFC3339) + " " + event
	if detail != "" {
		line += " " + detail
	}
	line += "\n"
	file, err := os.OpenFile(filepath.Join(directory, "launcher-"+time.Now().UTC().Format("2006-01-02")+".log"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0600)
	if err == nil {
		_, _ = file.WriteString(line)
		_ = file.Close()
	}
}

func redactLogDetail(value string) string {
	protocol := regexp.MustCompile(`(?i)companymail:[^\s]+`)
	webURL := regexp.MustCompile(`https://[^\s]+`)
	value = protocol.ReplaceAllString(value, "[launch-url-redacted]")
	value = webURL.ReplaceAllString(value, "[url-redacted]")
	if len(value) > 500 {
		value = value[:500]
	}
	return value
}

func configPaths() []string {
	paths := []string{}
	if configured := os.Getenv("COMPANYMAIL_CONFIG"); configured != "" {
		paths = append(paths, configured)
	}
	paths = append(paths, filepath.Join(dataDirectory(), "config.json"), filepath.Join(filepath.Dir(executablePath()), "config.json"))
	return paths
}

func dataDirectory() string {
	return filepath.Join(envOr("LOCALAPPDATA", filepath.Join(os.TempDir(), "CompanyMailLauncherData")), "CompanyMailLauncher")
}

func profileRoot() string {
	return filepath.Join(envOr("TEMP", os.TempDir()), "CompanyMailLauncher", "profiles")
}

func executablePath() string {
	value, err := os.Executable()
	if err != nil {
		return os.Args[0]
	}
	return value
}

func fileExists(value string) bool {
	info, err := os.Stat(value)
	return err == nil && !info.IsDir()
}

func preferKind(values []browserChoice, kind string) []browserChoice {
	result := make([]browserChoice, 0, len(values))
	for _, value := range values {
		if value.Kind == kind {
			result = append(result, value)
		}
	}
	for _, value := range values {
		if value.Kind != kind {
			result = append(result, value)
		}
	}
	return result
}

func firstProtocolURL(args []string) string {
	for _, value := range args {
		if strings.HasPrefix(strings.ToLower(value), "companymail:") {
			return value
		}
	}
	return ""
}

func contains(values []string, expected string) bool {
	for _, value := range values {
		if value == expected {
			return true
		}
	}
	return false
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
