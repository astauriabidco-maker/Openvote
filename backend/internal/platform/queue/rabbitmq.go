package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Publisher interface {
	Publish(ctx context.Context, queueName string, message interface{}) error
	Close()
	// PingContext : vérifie que la connexion AMQP est vivante. Utilisé par
	// l'endpoint /ready pour signaler aux load balancers de retirer le pod
	// si RabbitMQ est down. Retourne nil si OK, une erreur sinon.
	PingContext(ctx context.Context) error
}

// Consumer consomme des messages sur une queue.
//
// Consume spawn un goroutine interne et rend la main immédiatement (nil).
// Le canal `done` est fermé par l'implémentation EXACTEMENT UNE FOIS quand
// le goroutine interne sort — soit parce que ctx est annulé, soit parce
// que le canal msgs est fermé (via Close()), soit parce que l'enregistrement
// initial a échoué (channel.Consume). Cette garantie permet aux callers
// (ReportConsumer, main.go) d'attendre un vrai arrêt du worker au lieu
// d'utiliser un time.Sleep hardcodé.
type Consumer interface {
	Consume(ctx context.Context, queueName string, handler func(ctx context.Context, body []byte) error, done chan<- struct{}) error
	Close()
	// PingContext : idem Publisher, pour le checker du readiness probe.
	PingContext(ctx context.Context) error
}

type rabbitPublisher struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewRabbitPublisher(url string) (Publisher, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	// Déclarer la queue pour s'assurer qu'elle existe
	_, err = ch.QueueDeclare(
		"new_reports", // name
		true,          // durable
		false,         // delete when unused
		false,         // exclusive
		false,         // no-wait
		nil,           // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare queue: %w", err)
	}

	return &rabbitPublisher{
		conn:    conn,
		channel: ch,
	}, nil
}

func (p *rabbitPublisher) Publish(ctx context.Context, queueName string, message interface{}) error {
	body, err := json.Marshal(message)
	if err != nil {
		return fmt.Errorf("failed to marshal message: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	err = p.channel.PublishWithContext(ctx,
		"",        // exchange
		queueName, // routing key
		false,     // mandatory
		false,     // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        body,
			Timestamp:   time.Now(),
		})

	if err != nil {
		return fmt.Errorf("failed to publish message: %w", err)
	}

	return nil
}

func (p *rabbitPublisher) Close() {
	if p.channel != nil {
		p.channel.Close()
	}
	if p.conn != nil {
		p.conn.Close()
	}
}

// PingContext vérifie que la connexion AMQP est encore vivante.
// On respecte le ctx (timeout de 2s côté /ready) en premier — le transport
// est prioritaire sur l'état interne.
func (p *rabbitPublisher) PingContext(ctx context.Context) error {
	// Respecte le ctx d'abord (k8s load balancer veut une réponse rapide).
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if p == nil || p.conn == nil {
		return fmt.Errorf("publisher not initialized")
	}
	if p.conn.IsClosed() {
		return fmt.Errorf("rabbitmq connection is closed")
	}
	return nil
}

type rabbitConsumer struct {
	conn    *amqp.Connection
	channel *amqp.Channel
}

func NewRabbitConsumer(url string) (Consumer, error) {
	conn, err := amqp.Dial(url)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}

	ch, err := conn.Channel()
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("failed to open a channel: %w", err)
	}

	// Déclarer la queue pour s'assurer qu'elle existe
	_, err = ch.QueueDeclare(
		"new_reports", // name
		true,          // durable
		false,         // delete when unused
		false,         // exclusive
		false,         // no-wait
		nil,           // arguments
	)
	if err != nil {
		ch.Close()
		conn.Close()
		return nil, fmt.Errorf("failed to declare queue: %w", err)
	}

	return &rabbitConsumer{
		conn:    conn,
		channel: ch,
	}, nil
}

func (c *rabbitConsumer) Consume(ctx context.Context, queueName string, handler func(ctx context.Context, body []byte) error, done chan<- struct{}) error {
	msgs, err := c.channel.Consume(
		queueName,
		"",    // consumer
		false, // auto-ack - ON VEUT DES ACKS MANUELS
		false, // exclusive
		false, // no-local
		false, // no-wait
		nil,   // args
	)
	if err != nil {
		// Échec synchrone : aucun goroutine n'a été lancé pour fermer `done`.
		// On le ferme ici pour respecter le contrat (Done() doit se fermer
		// au plus une fois et au plus tard). Sans ça, un caller qui fait
		// `<-rc.Done()` après une erreur boot reste bloqué jusqu'au timeout.
		close(done)
		return fmt.Errorf("failed to register a consumer: %w", err)
	}

	go func() {
		// Le defer garantit que `done` est fermé exactement une fois, quelle
		// que soit la branche de sortie : ctx annulé, msgs fermé par Close(),
		// ou panic. Le caller peut alors attendre la fin du worker sans timer.
		defer close(done)
		for {
			select {
			case <-ctx.Done():
				// M3 audit : ctx annulé (SIGTERM via main) → on sort de
				// la boucle pour que le worker puisse s'arrêter proprement.
				log.Printf("[CONSUMER] ctx cancelled, stopping message loop")
				return
			case d, ok := <-msgs:
				if !ok {
					// Canal fermé (via Close()) — sortie propre.
					log.Printf("[CONSUMER] message channel closed, stopping")
					return
				}
				// Passe le ctx au handler pour qu'il puisse interrompre
				// un calcul long si on est en phase de shutdown.
				err := handler(ctx, d.Body)
				if err != nil {
					fmt.Printf("Error processing message: %v\n", err)
					// En cas d'erreur, on ne requeue pas par défaut pour
					// éviter les boucles infinies sur messages malformés.
					// (À durcir : dead-letter exchange + backoff exponentiel.)
					d.Nack(false, false)
				} else {
					d.Ack(false)
				}
			}
		}
	}()

	return nil
}

func (c *rabbitConsumer) Close() {
	if c.channel != nil {
		c.channel.Close()
	}
	if c.conn != nil {
		c.conn.Close()
	}
}

// PingContext : idem publisher — vérifie que la connexion AMQP est vivante.
// On ne teste QUE la connexion (pas le channel.Consume) parce que celui-ci
// est en mode bloquant : le ping doit rester rapide.
func (c *rabbitConsumer) PingContext(ctx context.Context) error {
	// Respecte le ctx en premier.
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	if c == nil || c.conn == nil {
		return fmt.Errorf("consumer not initialized")
	}
	if c.conn.IsClosed() {
		return fmt.Errorf("rabbitmq connection is closed")
	}
	return nil
}
