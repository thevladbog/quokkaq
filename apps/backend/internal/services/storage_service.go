package services

import (
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

type StorageService interface {
	UploadFile(ctx context.Context, fileBytes []byte, fileName string, folder string, contentType string) (string, string, error)
	DeleteFile(ctx context.Context, key string) error
}

type storageService struct {
	client     *s3.Client
	bucketName string
}

func NewStorageService() StorageService {
	bucketName := os.Getenv("AWS_S3_BUCKET")
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "us-east-1"
	}
	endpoint := os.Getenv("AWS_ENDPOINT")

	// Load default config
	cfg, err := config.LoadDefaultConfig(context.Background(),
		config.WithRegion(region),
	)
	if err != nil {
		log.Printf("unable to load SDK config, %v", err)
		return &storageService{}
	}

	// Custom endpoint resolver for MinIO or other S3 compatible services
	if endpoint != "" {
		accessKey := os.Getenv("AWS_ACCESS_KEY_ID")
		secretKey := os.Getenv("AWS_SECRET_ACCESS_KEY")

		cfg, err = config.LoadDefaultConfig(context.Background(),
			config.WithRegion(region),
			config.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(accessKey, secretKey, "")),
		)
		if err != nil {
			log.Printf("unable to load SDK config with custom endpoint, %v", err)
			return &storageService{}
		}
	}

	client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		if endpoint != "" {
			o.BaseEndpoint = &endpoint
			o.UsePathStyle = true // Required for MinIO
		}
	})

	return &storageService{
		client:     client,
		bucketName: bucketName,
	}
}

func (s *storageService) UploadFile(ctx context.Context, fileBytes []byte, fileName string, folder string, contentType string) (string, string, error) {
	if s.client == nil {
		return "", "", fmt.Errorf("storage client not initialized")
	}

	ext := filepath.Ext(fileName)
	id := uuid.New().String()
	// Objects served anonymously (prod MinIO policy) must live under public/.
	// Private uploads stay outside this prefix.
	publicFolders := map[string]struct{}{
		"logos":         {},
		"printer-logos": {},
		"materials":     {},
		"tts":           {},
	}
	var key string
	if _, ok := publicFolders[folder]; ok {
		key = fmt.Sprintf("public/%s/%s%s", folder, id, ext)
	} else {
		key = fmt.Sprintf("%s/%s%s", folder, id, ext)
	}

	_, err := s.client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(s.bucketName),
		Key:         aws.String(key),
		Body:        bytes.NewReader(fileBytes),
		ContentType: aws.String(contentType),
	})

	if err != nil {
		log.Printf("Failed to upload file to S3: %v", err)
		return "", "", err
	}

	// Construct URL for frontend consumption
	// Priority: AWS_PUBLIC_ENDPOINT > AWS_ENDPOINT > AWS S3 default
	url := ""
	publicEndpoint := os.Getenv("AWS_PUBLIC_ENDPOINT")
	endpoint := os.Getenv("AWS_ENDPOINT")

	if publicEndpoint != "" {
		// Use public-facing domain (e.g., https://s3.quokkaq.v-b.tech)
		url = fmt.Sprintf("%s/%s/%s", publicEndpoint, s.bucketName, key)
	} else if endpoint != "" {
		// Fallback to internal endpoint for backward compatibility
		url = fmt.Sprintf("%s/%s/%s", endpoint, s.bucketName, key)
	} else {
		// Default to AWS S3 URL format
		url = fmt.Sprintf("https://%s.s3.%s.amazonaws.com/%s", s.bucketName, os.Getenv("AWS_REGION"), key)
	}

	return url, key, nil
}

func (s *storageService) DeleteFile(ctx context.Context, key string) error {
	if s.client == nil {
		return fmt.Errorf("storage client not initialized")
	}

	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucketName),
		Key:    aws.String(key),
	})

	if err != nil {
		log.Printf("Failed to delete file from S3: %v", err)
		return err
	}

	return nil
}
