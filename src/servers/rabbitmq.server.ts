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
  defaultHandlerError?: ResponseEnum;
}

export class RabbitmqServer extends Context implements Server {
  private _listening: boolean;
  private _conn: AmqpConnectionManager;
  private _channelManager: ChannelWrapper;
  channel: Channel;

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
    await channel.consume(queue, async message => {
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
          const responseType = await method({data, message, channel});
          this.dispatchResponse(channel, message, responseType);
        }
      } catch (error) {
        console.error(error);
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
      case ResponseEnum.NACK:
        channel.nack(message, false, false);
        break;
      case ResponseEnum.ACK:
      default:
        channel.ack(message);
        break;
    }
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
