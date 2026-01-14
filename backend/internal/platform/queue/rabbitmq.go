package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

type Publisher interface {
	Publish(ctx context.Context, queueName string, message interface{}) error
	Close()
}

type Consumer interface {
	Consume(ctx context.Context, queueName string, handler func(ctx context.Context, body []byte) error) error
	Close()
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

func (c *rabbitConsumer) Consume(ctx context.Context, queueName string, handler func(ctx context.Context, body []byte) error) error {
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
		return fmt.Errorf("failed to register a consumer: %w", err)
	}

	go func() {
		for d := range msgs {
			// Créer un contexte fils pour chaque message si nécessaire
			processCtx := context.Background()
			err := handler(processCtx, d.Body)
			if err != nil {
				fmt.Printf("Error processing message: %v\n", err)
				// En cas d'erreur, on peut choisir de requeue ou non
				// Ici on ne requeue pas par défaut pour éviter les boucles infinies sur messages malformés
				d.Nack(false, false)
			} else {
				d.Ack(false)
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
