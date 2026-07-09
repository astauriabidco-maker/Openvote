package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"
)

const (
	baseURL = "http://localhost:8095/api/v1"
)

// Helper to check errors
func check(err error) {
	if err != nil {
		log.Fatalf("Error: %v", err)
	}
}

func main() {
	log.Println("=== Starting E2E Integration Test (Simulating Mobile Client) ===")

	// 1. Authenticate
	log.Println("1. Register/Login to get Token...")
	// Register
	regPayload := map[string]string{
		"username": "e2e_user_" + fmt.Sprintf("%d", time.Now().Unix()),
		"password": "securepassword",
	}
	regBody, _ := json.Marshal(regPayload)
	regResp, err := http.Post(fmt.Sprintf("%s/auth/register", baseURL), "application/json", bytes.NewReader(regBody))
	check(err)
	if regResp.StatusCode != http.StatusCreated && regResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(regResp.Body)
		log.Printf("Register failed: %s - %s", regResp.Status, string(body))
	} else {
		log.Println("   -> Registered successfully.")
	}
	regResp.Body.Close()

	// Login
	loginResp, err := http.Post(fmt.Sprintf("%s/auth/login", baseURL), "application/json", bytes.NewReader(regBody))
	check(err)
	defer loginResp.Body.Close()

	if loginResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(loginResp.Body)
		log.Fatalf("Login failed: %s - %s", loginResp.Status, string(body))
	}

	var loginData map[string]string
	json.NewDecoder(loginResp.Body).Decode(&loginData)
	token := loginData["token"]
	log.Printf("   -> Authenticated! Token: %s...", token[:10])

	// Helper to make authenticated requests
	authRequest := func(method, url string, body io.Reader) *http.Response {
		req, _ := http.NewRequest(method, url, body)
		req.Header.Set("Authorization", "Bearer "+token)
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		resp, err := http.DefaultClient.Do(req)
		check(err)
		return resp
	}

	// 2. Get Presigned URL
	fileName := "proof_evidence.jpg"
	log.Printf("2. Requesting Presigned URL for %s...", fileName)
	resp := authRequest("GET", fmt.Sprintf("%s/reports/upload-url?file_name=%s", baseURL, fileName), nil)
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Fatalf("Failed to get upload URL: %s - %s", resp.Status, string(body))
	}

	var uploadInfo map[string]string
	json.NewDecoder(resp.Body).Decode(&uploadInfo)
	uploadUrl := uploadInfo["upload_url"]
	log.Println("   -> Presigned URL received!")

	// 3. Upload File to MinIO
	log.Println("3. Uploading file to MinIO...")
	dummyContent := []byte("This is a dummy image for E2E testing.")
	req, err := http.NewRequest(http.MethodPut, uploadUrl, bytes.NewReader(dummyContent))
	check(err)
	req.Header.Set("Content-Type", "image/jpeg")

	client := &http.Client{}
	uploadResp, err := client.Do(req)
	check(err)
	defer uploadResp.Body.Close()

	if uploadResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(uploadResp.Body)
		log.Fatalf("Failed to upload to MinIO: %s - %s", uploadResp.Status, string(body))
	}
	log.Println("   -> Upload successful!")

	// 4. Create Report
	log.Println("4. Creating Report with Evidence...")
	reportPayload := map[string]interface{}{
		//"id":            reportID, // Let backend generate it
		"observer_id":   "550e8400-e29b-41d4-a716-446655440001", // Existing observer from seed
		"incident_type": "Violence",
		"description":   "E2E Test: Violence reported via simulation script.",
		"latitude":      4.055,
		"longitude":     9.705,
		"proof_url":     fileName, // The key we uploaded
		"created_at":    time.Now().Format(time.RFC3339),
	}

	jsonBody, _ := json.Marshal(reportPayload)
	reportResp := authRequest("POST", fmt.Sprintf("%s/reports", baseURL), bytes.NewReader(jsonBody))
	defer reportResp.Body.Close()

	if reportResp.StatusCode != http.StatusCreated && reportResp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(reportResp.Body)
		log.Fatalf("Failed to create report: %s - %s", reportResp.Status, string(body))
	}

	var createResp map[string]interface{}
	json.NewDecoder(reportResp.Body).Decode(&createResp)
	reportID := createResp["id"].(string)
	log.Printf("   -> Report created successfully! ID: %s", reportID)

	// 5. Verify Report in List
	log.Println("5. Verifying Report in List...")
	listResp := authRequest("GET", fmt.Sprintf("%s/reports", baseURL), nil)
	defer listResp.Body.Close()

	var reports []map[string]interface{}
	json.NewDecoder(listResp.Body).Decode(&reports)

	found := false
	for _, r := range reports {
		if r["id"] == reportID {
			found = true
			log.Printf("   -> Found report: %s | Status: %s | Proof: %s", r["incident_type"], r["status"], r["proof_url"])
			break
		}
	}

	if found {
		log.Println("SUCCESS: E2E Integration Test Passed!")
	} else {
		log.Fatalf("FAILURE: Report %s not found in list.", reportID)
	}
}
