import { /* inject, */ BindingScope, injectable} from '@loopback/core';
import {repository} from '@loopback/repository';
import {ConsumeMessage} from 'amqplib';
import {rabbitmqSubscribe} from '../decorators';
import {Genre} from '../models';
import {GenreRepository} from '../repositories';

@injectable({scope: BindingScope.TRANSIENT})
export class GenreSyncService {
  constructor(
    @repository(GenreRepository) private genreRepo: GenreRepository,
  ) {}

  @rabbitmqSubscribe({
    exchange: 'amq.topic',
    queue: '',
    routingKey: 'model.genre.*',
  })
  async handler({data, message}: {data: Genre; message: ConsumeMessage}) {
    console.log({data, message});
    const [event] = message.fields.routingKey.split('.').slice(2);
    switch (event) {
      case 'created':
        await this.genreRepo.create(data);
        break;
      case 'updated':
        await this.genreRepo.updateById(data.id, data);
        break;
      case 'deleted':
        await this.genreRepo.deleteById(data.id);
        break;
    }
  }
}
