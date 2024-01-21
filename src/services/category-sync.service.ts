import {/* inject, */ BindingScope, injectable, service} from '@loopback/core';
import {repository} from '@loopback/repository';
import {Message} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {CategoryRepository} from '../repositories';
import {BaseModelSyncService} from './base-model-sync.service';
import {ValidatorService} from './validator.service';

@injectable({scope: BindingScope.SINGLETON})
export class CategorySyncService extends BaseModelSyncService {
  constructor(
    @repository(CategoryRepository) private repo: CategoryRepository,
    @service(ValidatorService) private validatorService: ValidatorService,
  ) {
    super(validatorService);
  }

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/category',
    routingKey: 'model.category.*',
    queueOptions: {
      deadLetterExchange: 'dlx.amq.topic',
    },
  })
  async handler({data, message}: {data: any; message: Message}) {
    this.sync({
      repo: this.repo,
      data,
      message,
    });
  }
}
