package worker

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/openvote/backend/internal/domain/entity"
	"github.com/openvote/backend/internal/platform/queue"
	"github.com/openvote/backend/internal/service"
)

type ReportConsumer struct {
	consumer             queue.Consumer
	triangulationService service.TriangulationService
}

func NewReportConsumer(consumer queue.Consumer, triangulationService service.TriangulationService) *ReportConsumer {
	return &ReportConsumer{
		consumer:             consumer,
		triangulationService: triangulationService,
	}
}

func (c *ReportConsumer) Start(ctx context.Context) error {
	log.Printf("[WORKER] Starting ReportConsumer on queue 'new_reports'...")

	handler := func(ctx context.Context, body []byte) error {
		var report entity.Report
		if err := json.Unmarshal(body, &report); err != nil {
			return fmt.Errorf("failed to unmarshal report: %w", err)
		}

		log.Printf("[WORKER] Processing report: %s", report.ID)

		// Appel au service de triangulation
		if err := c.triangulationService.CalculateTrustScore(ctx, report.ID); err != nil {
			return fmt.Errorf("triangulation failed for report %s: %w", report.ID, err)
		}

		return nil
	}

	return c.consumer.Consume(ctx, "new_reports", handler)
}
