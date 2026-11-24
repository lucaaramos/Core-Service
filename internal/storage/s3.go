package storage

import (
	"context"
	"fmt"
	"strings"
	"time"

	"core-service/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

const presignExpiration = 5 * time.Minute

// ObjectStorage define el contrato para generar URLs prefirmadas de subida de archivos.
type ObjectStorage interface {
	GenerateUploadURL(ctx context.Context, key, contentType string) (uploadURL string, publicURL string, err error)
}

// S3Storage implementa ObjectStorage sobre almacenamiento compatible con S3 (MinIO / AWS S3).
type S3Storage struct {
	presignClient  *s3.PresignClient
	publicEndpoint string
	bucket         string
}

// NewS3Storage construye un cliente S3 configurado con UsePathStyle y BaseEndpoint público
// para que la firma generada coincida con el Host al que el navegador envía el PUT directo.
func NewS3Storage(ctx context.Context, cfg config.Config) (*S3Storage, error) {
	awsCfg, err := awsconfig.LoadDefaultConfig(
		ctx,
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(cfg.S3AccessKey, cfg.S3SecretKey, ""),
		),
		awsconfig.WithRequestChecksumCalculation(aws.RequestChecksumCalculationWhenRequired),
	)
	if err != nil {
		return nil, fmt.Errorf("error cargando configuración S3: %w", err)
	}

	s3Client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
		o.BaseEndpoint = aws.String(cfg.S3PublicEndpoint)
	})

	return &S3Storage{
		presignClient:  s3.NewPresignClient(s3Client),
		publicEndpoint: strings.TrimRight(cfg.S3PublicEndpoint, "/"),
		bucket:         cfg.S3Bucket,
	}, nil
}

// GenerateUploadURL firma un PUT temporal (5 min) fijando el Content-Type y devuelve
// tanto la URL de subida como la URL pública final del objeto.
func (s *S3Storage) GenerateUploadURL(ctx context.Context, key, contentType string) (string, string, error) {
	cleanKey := strings.TrimLeft(key, "/")

	presignedReq, err := s.presignClient.PresignPutObject(
		ctx,
		&s3.PutObjectInput{
			Bucket:      aws.String(s.bucket),
			Key:         aws.String(cleanKey),
			ContentType: aws.String(contentType),
		},
		s3.WithPresignExpires(presignExpiration),
	)
	if err != nil {
		return "", "", fmt.Errorf("error generando presigned PUT URL: %w", err)
	}

	publicURL := fmt.Sprintf("%s/%s/%s", s.publicEndpoint, s.bucket, cleanKey)
	return presignedReq.URL, publicURL, nil
}
