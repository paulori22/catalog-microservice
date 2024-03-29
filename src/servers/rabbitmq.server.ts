import {
  Application,
  Context,
  CoreBindings,
  MetadataInspector,
  Server,
  inject,
} from '@loopback/core';
import {repository} from '@loopback/repository';
import {
  AmqpConnectionManager,
  AmqpConnectionManagerOptions,
  ChannelWrapper,
  connect,
} from 'amqp-connection-manager';
import {Channel, ConfirmChannel, Message, Options} from 'amqplib';
import {
  RABBITMQ_SUBSCRIBE_DECORATOR,
  RabbitmqSubscribeMetadata,
} from '../decorators';
import {RabbitmqBindings} from '../keys';
import {CategoryRepository} from '../repositories';

export enum ResponseEnum {
  ACK = 0,
  REQUEUE = 1,
  NACK = 2,
}

export interface RabbitmqConfig {
  uri: string;
  connOptions?: AmqpConnectionManagerOptions;
  exchanges?: {name: string; type: string; options?: Options.AssertExchange}[];
  queues?: {
    name: string;
    options?: Options.AssertQueue;
    exchange?: {name: string; routingKey: string};
  }[];
  defaultHandlerError?: ResponseEnum;
}

export class RabbitmqServer extends Context implements Server {
  private _listening: boolean;
  private _conn: AmqpConnectionManager;
  private _channelManager: ChannelWrapper;
  private _maxMessageAttempts = 3;

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE) public app: Application,
    @repository(CategoryRepository) private categoryRepo: CategoryRepository,
    @inject(RabbitmqBindings.CONFIG) private config: RabbitmqConfig,
  ) {
    super(app);
  }

  async start(): Promise<void> {
    this._conn = connect([this.config.uri], this.config.connOptions);
    this._channelManager = this._conn.createChannel();
    this._channelManager.on('connect', () => {
      this._listening = true;
      console.log('Successfully connected to RabbitMQ channel');
    });
    this._channelManager.on('error', (error, {name}) => {
      this._listening = false;
      console.log(
        `Failed to setup a RabbitMQ channel - name: ${name} | error: ${error}`,
      );
    });
    await this.setupExchanges();
    await this.setupQueues();
    await this.bindSubscribers();

    return undefined;
  }

  private async setupExchanges() {
    return this.channelManager.addSetup(async (channel: ConfirmChannel) => {
      if (!this.config.exchanges) {
        return;
      }
      await Promise.all(
        this.config.exchanges.map(exchange =>
          channel.assertExchange(
            exchange.name,
            exchange.type,
            exchange.options,
          ),
        ),
      );
    });
  }

  private async setupQueues() {
    return this.channelManager.addSetup(async (channel: ConfirmChannel) => {
      if (!this.config.queues) {
        return;
      }
      await Promise.all(
        this.config.queues.map(async queue => {
          await channel.assertQueue(queue.name, queue.options);
          if (!queue.exchange) {
            return;
          }
          await channel.bindQueue(
            queue.name,
            queue.exchange.name,
            queue.exchange.routingKey,
          );
        }),
      );
    });
  }

  private async bindSubscribers() {
    this.getSubscribers().map(async item => {
      await this.channelManager.addSetup(async (channel: ConfirmChannel) => {
        const {exchange, queue, routingKey, queueOptions} = item.metadata;
        const assetQueue = await channel.assertQueue(
          queue ?? '',
          queueOptions ?? undefined,
        );
        const routingKeys = Array.isArray(routingKey)
          ? routingKey
          : [routingKey];

        await Promise.all(
          routingKeys.map(r =>
            channel.bindQueue(assetQueue.queue, exchange, r),
          ),
        );
        await this.consume({
          channel,
          queue: assetQueue.queue,
          method: item.method,
        });
      });
    });
  }

  private getSubscribers(): {
    method: Function;
    metadata: RabbitmqSubscribeMetadata;
  }[] {
    const bindings = this.find('services.*');

    return bindings
      .map(binding => {
        const metadata =
          MetadataInspector.getAllMethodMetadata<RabbitmqSubscribeMetadata>(
            RABBITMQ_SUBSCRIBE_DECORATOR,
            binding.valueConstructor?.prototype,
          );
        if (!metadata) {
          return [];
        }
        const methods = [];
        for (const methodName in metadata) {
          const service = this.getSync(binding.key) as any;

          methods.push({
            method: service[methodName].bind(service),
            metadata: metadata[methodName],
          });
        }

        return methods;
      })
      .reduce((collection, item) => {
        collection.push(...item);
        return collection;
      });

    /*         const service = this.getSync<CategorySyncService>(
          'services.CategorySyncService',
        );
        const metadata =
          MetadataInspector.getAllMethodMetadata<RabbitmqSubscribeMetadata>(
            RABBITMQ_SUBSCRIBE_DECORATOR,
            service,
          );
        console.log(metadata); */
  }

  private async consume({
    channel,
    queue,
    method,
  }: {
    channel: ConfirmChannel;
    queue: string;
    method: Function;
  }) {
    await channel.consume(queue, message => {
      try {
        if (!message) {
          throw new Error('Received null message');
        }
        const content = message.content;
        if (content) {
          let data;
          try {
            data = JSON.parse(content.toString());
          } catch (error) {
            data = null;
          }
          const responseType = method({data, message, channel});
          this.dispatchResponse(channel, message, responseType);
        }
      } catch (error) {
        console.error(error, {
          routingKey: message?.fields.routingKey,
          content: message?.content.toString(),
        });
        if (!message) {
          return;
        }
        this.dispatchResponse(
          channel,
          message,
          this.config?.defaultHandlerError,
        );
      }
    });
  }

  private dispatchResponse(
    channel: Channel,
    message: Message,
    responseType?: ResponseEnum,
  ) {
    switch (responseType) {
      case ResponseEnum.REQUEUE:
        channel.nack(message, false, true);
        break;
      case ResponseEnum.NACK: {
        const canDeadLetter = this.canDeadLetter({channel, message});
        if (canDeadLetter) {
          console.log('Nack in message', {content: message.content.toString()});
          channel.nack(message, false, false);
        } else {
          channel.ack(message);
        }

        break;
      }
      case ResponseEnum.ACK:
      default:
        channel.ack(message);
        break;
    }
  }

  canDeadLetter({channel, message}: {channel: Channel; message: Message}) {
    if (message.properties.headers && 'x-death' in message.properties.headers) {
      const count = message.properties.headers['x-death']![0].count;
      if (count >= this._maxMessageAttempts) {
        channel.ack(message);
        const queue = message.properties.headers['x-death']![0].queue;
        console.error(
          `Ack in ${queue} with error. Max attempts execeeded ${this._maxMessageAttempts}`,
        );
        return false;
      }
    }
    return true;
  }

  async stop(): Promise<void> {
    await this.conn.close();
    this._listening = false;
    return undefined;
  }

  get listening(): boolean {
    return this._listening;
  }

  get conn(): AmqpConnectionManager {
    return this._conn;
  }

  get channelManager(): ChannelWrapper {
    return this._channelManager;
  }
}
