import { /* inject, */ BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {ConsumeMessage} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {Category} from '../models';
import {CategoryRepository} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class CategorySyncService {
  constructor(
    @repository(CategoryRepository) private categoryRepo: CategoryRepository,
  ) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: 'micro-catalog/sync-videos/category',
    routingKey: 'model.category.*',
  })
  async handler({data, message}: {data: Category; message: ConsumeMessage}) {
    console.log({data, message});
    const [event] = message.fields.routingKey.split('.').slice(2);
    switch (event) {
      case 'created':
        await this.categoryRepo.create(data);
        break;
      case 'updated':
        await this.categoryRepo.updateById(data.id, data);
        break;
      case 'deleted':
        await this.categoryRepo.deleteById(data.id);
        break;
    }
  }
}
