// Tests pour le contrat de signalisation d'arrêt du Consumer.
//
// Le vrai rabbitConsumer a besoin d'un broker AMQP live pour s'exécuter.
// On ne peut pas le tester ici (pas de docker daemon). À la place, on
// vérifie le CONTRAT via un fakeConsumer qui imite la sémantique attendue :
//   - Consume spawn un goroutine interne et rend la main (nil) immédiatement.
//   - Quand le ctx passé est annulé (ou que Close() est appelé), le
//     goroutine sort et ferme le canal `done` exactement une fois.
//   - Si Consume échoue synchrone, done est quand même fermé.
//
// C'est la sémantique que rabbitConsumer.Consume garantit (cf. son code),
// et que le worker.ReportConsumer / main.go exploitent pour remplacer le
// time.Sleep hardcodé par un vrai wait.
package queue

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

// fakeConsumer est un Consumer qui implémente fidèlement le contrat, sans
// broker. spawnLoop est appelé une fois et reçoit un canal à écouter : on
// sort quand ce canal se ferme.
type fakeConsumer struct {
	spawnLoop func(ctx context.Context, ch <-chan struct{}) // ch est fermé par Close()
	spawnErr  error                                          // si non-nil, Consume retourne cette erreur SANS fermer done
	closeCh   chan struct{}
	closed    atomic.Bool
}

func newFakeConsumer(loop func(ctx context.Context, ch <-chan struct{})) *fakeConsumer {
	return &fakeConsumer{
		spawnLoop: loop,
		closeCh:   make(chan struct{}),
	}
}

func (f *fakeConsumer) Consume(ctx context.Context, _ string, _ func(ctx context.Context, body []byte) error, done chan<- struct{}) error {
	if f.spawnErr != nil {
		// Contrat : en cas d'erreur synchrone, done se ferme tout de suite
		// pour que les callers qui font `<-rc.Done()` ne restent pas bloqués.
		close(done)
		return f.spawnErr
	}
	go func() {
		defer close(done)
		f.spawnLoop(ctx, f.closeCh)
	}()
	return nil
}

func (f *fakeConsumer) Close() {
	if f.closed.CompareAndSwap(false, true) {
		close(f.closeCh)
	}
}

func (f *fakeConsumer) PingContext(ctx context.Context) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if f.closed.Load() {
		return errors.New("fake consumer closed")
	}
	return nil
}

// TestFakeConsumerDoneClosesOnCtxCancel : Consume() rend la main tout de
// suite, et `done` se ferme rapidement après ctx.Done() (proxy du vrai
// comportement rabbitConsumer).
func TestFakeConsumerDoneClosesOnCtxCancel(t *testing.T) {
	fc := newFakeConsumer(func(ctx context.Context, _ <-chan struct{}) {
		// Attend ctx puis sort (mime le comportement de rabbitConsumer).
		<-ctx.Done()
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	if err := fc.Consume(ctx, "q", nil, done); err != nil {
		t.Fatalf("Consume returned error: %v", err)
	}

	// À ce stade, Consume a rendu la main mais `done` n'est pas encore fermé :
	// le goroutine est suspendu sur ctx.Done(). On l'annule et on attend la
	// fermeture du canal dans un délai court (1s, large pour CI lent).
	cancel()

	select {
	case <-done:
		// OK : goroutine a fermé done après ctx.Done().
	case <-time.After(1 * time.Second):
		t.Fatal("`done` channel n'a pas été fermé dans les 1s après ctx.Done()")
	}
}

// TestFakeConsumerDoneClosesOnClose : à la place d'annuler le ctx,
// on appelle Close() — doit aussi fermer `done`.
func TestFakeConsumerDoneClosesOnClose(t *testing.T) {
	fc := newFakeConsumer(func(_ context.Context, ch <-chan struct{}) {
		// Attend Close() puis sort.
		<-ch
	})

	done := make(chan struct{})
	if err := fc.Consume(context.Background(), "q", nil, done); err != nil {
		t.Fatalf("Consume returned error: %v", err)
	}

	// Petit délai pour s'assurer que le goroutine est bien suspendu sur ch
	// avant qu'on le ferme (sinon `done` se ferme quasi-immédiatement et
	// le test reste vert mais ne teste rien).
	time.Sleep(10 * time.Millisecond)
	fc.Close()

	select {
	case <-done:
		// OK
	case <-time.After(1 * time.Second):
		t.Fatal("`done` channel n'a pas été fermé dans les 1s après Close()")
	}
}

// TestFakeConsumerDoneClosesOnSyncError : Consume retourne une erreur
// synchrone (avant de spawn le goroutine). Le contrat dit que `done` se
// ferme quand même — sinon les callers qui bloquent sur `<-Done()` restent
// pendus jusqu'à leur propre timeout.
func TestFakeConsumerDoneClosesOnSyncError(t *testing.T) {
	fc := &fakeConsumer{
		spawnErr: errors.New("simulated boot error"),
	}
	done := make(chan struct{})

	err := fc.Consume(context.Background(), "q", nil, done)
	if err == nil {
		t.Fatal("Consume devrait retourner une erreur (spawnErr simulé)")
	}

	select {
	case <-done:
		// OK : contrat respecté même sur erreur synchrone.
	case <-time.After(200 * time.Millisecond):
		t.Fatal("`done` n'a pas été fermé après une erreur synchrone de Consume")
	}
}

// TestFakeConsumerDoneIsOneShot : appeler Close() après que le goroutine
// est déjà sorti ne doit PAS paniquer (defer close(done) est idempotent
// via le return du goroutine, pas via Close()). On vérifie surtout que
// la double-fermeture ne se produit pas.
func TestFakeConsumerDoneNoDoubleClose(t *testing.T) {
	fc := newFakeConsumer(func(ctx context.Context, _ <-chan struct{}) {
		<-ctx.Done()
	})

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})

	if err := fc.Consume(ctx, "q", nil, done); err != nil {
		t.Fatalf("Consume: %v", err)
	}
	cancel()

	// Attend la première fermeture.
	select {
	case <-done:
	case <-time.After(1 * time.Second):
		t.Fatal("done non fermé après ctx")
	}

	// Un second read sur le canal fermé retourne immédiatement sans bloquer.
	// (Si on avait fermé deux fois, on aurait un panic "close of closed
	// channel" — qu'on ne capture pas ici mais qui ferait échouer le test
	// via run-time panic.)
	select {
	case <-done:
		// OK, lecture idempotente.
	case <-time.After(100 * time.Millisecond):
		t.Fatal("lecture sur canal fermé n'a pas été instantanée")
	}

	// Appeler Close() après que le goroutine est déjà sorti est sûr : le
	// closeCh est fermé une seule fois via CompareAndSwap.
	fc.Close()
}
