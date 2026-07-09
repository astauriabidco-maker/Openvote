// Tests pour les PingContext de la queue RabbitMQ.
// Note : on ne peut pas vraiment tester un ping réussi sans broker live,
// donc on vérifie surtout le comportement "conn nil" et "ctx cancelled".
package queue

import (
	"context"
	"errors"
	"testing"
)

// TestPublisherPingNilConn : un publisher dont la conn est nil doit
// retourner une erreur explicite (pas panic).
func TestPublisherPingNilConn(t *testing.T) {
	// On crée un rabbitPublisher{} SANS initialiser conn.
	p := &rabbitPublisher{}

	err := p.PingContext(context.Background())
	if err == nil {
		t.Fatal("PingContext sur conn nil devrait retourner une erreur")
	}
}

// TestPublisherPingCtxCancelled : ctx déjà annulé → ctx.Err() retourné.
func TestPublisherPingCtxCancelled(t *testing.T) {
	p := &rabbitPublisher{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // annule immédiatement

	err := p.PingContext(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("attendu context.Canceled, obtenu %v", err)
	}
}

// TestConsumerPingNilConn : idem publisher.
func TestConsumerPingNilConn(t *testing.T) {
	c := &rabbitConsumer{}
	err := c.PingContext(context.Background())
	if err == nil {
		t.Fatal("PingContext sur conn nil devrait retourner une erreur")
	}
}

// TestConsumerPingCtxCancelled : idem.
func TestConsumerPingCtxCancelled(t *testing.T) {
	c := &rabbitConsumer{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	err := c.PingContext(ctx)
	if !errors.Is(err, context.Canceled) {
		t.Errorf("attendu context.Canceled, obtenu %v", err)
	}
}