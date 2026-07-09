// Tests pour la plomberie d'arrêt propre du ReportConsumer.
//
// On ne peut pas tester le vrai rabbitConsumer (broker AMQP requis, pas de
// docker daemon). À la place on utilise un mockConsumer qui implémente
// queue.Consumer en respectant fidèlement le contrat (notamment la fermeture
// du canal `done` quand le goroutine interne sort).
//
// Ce qu'on vérifie ici :
//   - Une fois Start(ctx) lancé, Done() n'est PAS encore fermé.
//   - Quand le ctx est annulé, Done() se ferme rapidement (< 1s).
//   - Done() est idempotent : lectures répétées après la fermeture OK.
//   - Le mock minimal vérifie aussi qu'on respecte le contrat symétrique :
//     Consume ferme done si elle rencontre une erreur synchrone.
package worker

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/openvote/backend/internal/platform/queue"
)

// mockConsumer satisfait queue.Consumer en respectant le contrat done-channel.
// Il NE fait PAS de travail réel : il suspend dans une goroutine qui attend
// la cancellation du ctx, puis ferme `done` via defer.
type mockConsumer struct {
	syncErr      error // si non-nil, Consume retourne cette erreur synchrone
	consumeCalls atomic.Int32

	// Champs observés après l'appel à Consume. Protégés par `mu` car ils
	// sont écrits depuis la goroutine de Start et lus depuis la goroutine
	// de test — le détecteur de race flaguerait sinon (et à raison).
	mu             sync.Mutex
	lastHandler    func(ctx context.Context, body []byte) error
	lastQueueName  string
	lastDoneChannel chan<- struct{}
}

func (m *mockConsumer) Consume(ctx context.Context, queueName string, handler func(ctx context.Context, body []byte) error, done chan<- struct{}) error {
	m.mu.Lock()
	m.lastHandler = handler
	m.lastQueueName = queueName
	m.lastDoneChannel = done
	m.mu.Unlock()
	m.consumeCalls.Add(1)

	if m.syncErr != nil {
		// Contrat : erreur synchrone → on ferme done pour ne pas bloquer
		// les callers qui font `<-rc.Done()`.
		close(done)
		return m.syncErr
	}

	go func() {
		defer close(done)
		// Attend l'annulation du ctx — mime le comportement de rabbitConsumer.
		<-ctx.Done()
	}()

	return nil
}

func (m *mockConsumer) Close()         {}
func (m *mockConsumer) PingContext(_ context.Context) error { return nil }

// snapshotLastConsumeArgs capture les arguments du dernier Consume sous le
// mutex, pour des assertions thread-safe (sinon le détecteur de race se
// déclenche dès que les champs sont accédés depuis une autre goroutine).
func (m *mockConsumer) snapshotLastConsumeArgs() (queueName string, handler func(ctx context.Context, body []byte) error, done chan<- struct{}) {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.lastQueueName, m.lastHandler, m.lastDoneChannel
}

// stubTriangulationService satisfait service.TriangulationService.
type stubTriangulationService struct {
	calls atomic.Int32
	err   error
}

func (s *stubTriangulationService) CalculateTrustScore(_ context.Context, _ string) error {
	s.calls.Add(1)
	return s.err
}

// Compile-time check : les mocks satisfont les interfaces attendues.
var (
	_ queue.Consumer                       = (*mockConsumer)(nil)
	_ (interface {
		CalculateTrustScore(ctx context.Context, reportID string) error
	}) = (*stubTriangulationService)(nil)
)

// TestReportConsumerDoneClosesAfterCtxCancel : scénario nominal du shutdown.
// Start(ctx) est lancé en background, on annule ctx, et on vérifie que
// Done() se ferme dans un délai court.
func TestReportConsumerDoneClosesAfterCtxCancel(t *testing.T) {
	mc := &mockConsumer{}
	tri := &stubTriangulationService{}

	rc := NewReportConsumer(mc, tri)

	// Avant Start(), Done() doit exister (non-nil) mais pas encore fermé.
	if rc.Done() == nil {
		t.Fatal("Done() doit retourner un canal non-nil dès NewReportConsumer")
	}
	select {
	case <-rc.Done():
		t.Fatal("Done() ne devrait PAS être fermé avant Start")
	default:
	}

	ctx, cancel := context.WithCancel(context.Background())
	go func() {
		if err := rc.Start(ctx); err != nil && !errors.Is(err, context.Canceled) {
			t.Errorf("Start: %v", err)
		}
	}()

	// Laisse le goroutine interne le temps de se mettre en attente sur ctx.
	time.Sleep(50 * time.Millisecond)

	if mc.consumeCalls.Load() != 1 {
		t.Fatalf("Consume doit avoir été appelé 1 fois, vu %d", mc.consumeCalls.Load())
	}

	// Sanity : la queueName et le handler ont été passés correctement.
	// Snapshot thread-safe pour éviter les races avec la goroutine Start.
	queueName, handler, doneCh := mc.snapshotLastConsumeArgs()
	if queueName != "new_reports" {
		t.Errorf("queueName attendu 'new_reports', vu %q", queueName)
	}
	if handler == nil {
		t.Fatal("handler non propagé au Consumer.Consume")
	}
	if doneCh == nil {
		t.Fatal("ReportConsumer doit passer un canal done à Consume (got nil)")
	}

	// Cancel → le mockConsumer goroutine interne sort, defer close(done),
	// ReportConsumer.Done() se ferme.
	cancel()

	select {
	case <-rc.Done():
		// OK, shutdown propre.
	case <-time.After(1 * time.Second):
		t.Fatal("Done() n'a pas été fermé dans les 1s après ctx.Done()")
	}
}

// TestReportConsumerDoneAfterSyncError : si Consume échoue synchrone,
// Done() doit quand même se fermer (contrat respecté). Le caller peut alors
// continuer son shutdown sans attendre un timeout externe.
func TestReportConsumerDoneAfterSyncError(t *testing.T) {
	mc := &mockConsumer{syncErr: errors.New("boot fail")}
	tri := &stubTriangulationService{}

	rc := NewReportConsumer(mc, tri)

	err := rc.Start(context.Background())
	if err == nil {
		t.Fatal("Start devrait propager l'erreur du Consumer")
	}
	if !contains(err.Error(), "boot fail") {
		t.Errorf("erreur inattendue: %v", err)
	}

	select {
	case <-rc.Done():
		// OK : contrat respecté.
	case <-time.After(200 * time.Millisecond):
		t.Fatal("Done() n'a pas été fermé après une erreur synchrone de Consume")
	}
}

// TestReportConsumerDoneIsIdempotent : un canal fermé peut être lu
// indéfiniment sans bloquer. C'est la propriété qu'exploite main.go dans
// le `case <-reportConsumer.Done():` — une deuxième lecture lors d'un
// retry ne paniquerait pas.
func TestReportConsumerDoneIsIdempotent(t *testing.T) {
	mc := &mockConsumer{}
	tri := &stubTriangulationService{}

	rc := NewReportConsumer(mc, tri)

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = rc.Start(ctx) }()
	time.Sleep(20 * time.Millisecond)
	cancel()

	// Première lecture : ferme après cancellation.
	select {
	case <-rc.Done():
	case <-time.After(1 * time.Second):
		t.Fatal("Done() non fermé")
	}

	// Lectures suivantes : instantanées (canal fermé = toujours lisible).
	for i := 0; i < 3; i++ {
		select {
		case <-rc.Done():
		case <-time.After(100 * time.Millisecond):
			t.Fatalf("lecture #%d sur Done() bloquée — devrait être instantanée", i)
		}
	}
}

// TestReportConsumerHanderInvokesTriangulation : passe le handler et que
// celui-ci appelle bien TriangulationService quand on lui file un payload
// JSON valide. Petite intégration sans broker live.
func TestReportConsumerHandlerInvokesTriangulation(t *testing.T) {
	mc := &mockConsumer{}
	tri := &stubTriangulationService{}

	rc := NewReportConsumer(mc, tri)

	ctx, cancel := context.WithCancel(context.Background())
	go func() { _ = rc.Start(ctx) }()
	time.Sleep(20 * time.Millisecond)

	// Snapshot thread-safe pour lire les champs depuis la goroutine de test
	// sans course avec la goroutine de Start. (Pas de lecture directe de
	// mc.lastHandler — ce serait une race même pour une simple comparaison
	// à nil, le détecteur Go étant intra-thread-precise.)
	_, handler, _ := mc.snapshotLastConsumeArgs()
	if handler == nil {
		t.Fatal("handler non capturé par le mock")
	}

	// Corps JSON minimal qui ressemble à un Report (les champs requis ne sont
	// pas validés par le handler ici — il fait juste json.Unmarshal puis
	// appelle le service, qui est le stub). ReportID="r-1" pour le traçage.
	body := []byte(`{"id":"r-1","description":"test"}`)
	_ = handler(ctx, body)

	if got := tri.calls.Load(); got != 1 {
		t.Fatalf("triangulationService doit avoir été appelé 1 fois, vu %d", got)
	}

	cancel()
	<-rc.Done()
}

// contains est un mini helper pour vérifier un sous-string d'erreur sans
// importer strings juste pour ça.
func contains(haystack, needle string) bool {
	if len(needle) == 0 {
		return true
	}
	for i := 0; i+len(needle) <= len(haystack); i++ {
		if haystack[i:i+len(needle)] == needle {
			return true
		}
	}
	return false
}
