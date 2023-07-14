import {/* inject, */ BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {Message} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {GenreRepository} from '../repositories';
import {BaseModelSyncService} from './base-model-sync.service';

@injectable({scope: BindingScope.SINGLETON})
export class GenreSyncService extends BaseModelSyncService {
  constructor(@repository(GenreRepository) private repo: GenreRepository) {
    super();
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/genre',
    routingKey: 'model.genre.*',
  })
  async handler({data, message}: {data: any; message: Message}) {
    this.sync({
      repo: this.repo,
      data,
      message,
    });
  }
}
