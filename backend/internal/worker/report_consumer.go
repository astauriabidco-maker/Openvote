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
	// done est fermé par le goroutine interne de queue.Consumer lorsque
	// sa boucle de messages se termine (ctx annulé, canal msgs fermé, ou
	// échec synchrone de channel.Consume). Voir consumer.Consume pour
	// la garantie exacte. C'est un canal 1-shot : fermé au plus une fois.
	done chan struct{}
}

func NewReportConsumer(consumer queue.Consumer, triangulationService service.TriangulationService) *ReportConsumer {
	return &ReportConsumer{
		consumer:             consumer,
		triangulationService: triangulationService,
		done:                 make(chan struct{}),
	}
}

// Done retourne un canal en lecture seule qui se ferme quand le goroutine
// interne du ReportConsumer a fini de traiter tous les messages en cours
// (typiquement après propagation de ctx.Done()). C'est le mécanisme
// recommandé pour attendre un arrêt propre du worker, à la place d'un
// time.Sleep hardcodé qui ne reflète pas l'état réel.
//
// Si Start n'a jamais été appelé, le canal ne se fermera jamais — le caller
// doit alors utiliser un timeout externe (ex. time.After) comme garde-fou.
func (c *ReportConsumer) Done() <-chan struct{} {
	return c.done
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

	// Le consumer (rabbitConsumer dans notre cas) ferme `done` quand son
	// goroutine interne termine — cf. commentaire sur le champ done.
	return c.consumer.Consume(ctx, "new_reports", handler, c.done)
}
